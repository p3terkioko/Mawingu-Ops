#!/usr/bin/env python3
"""Fetch CHIRPS daily rainfall for Machakos from Google Earth Engine.

Pulls two things and writes them to PostgreSQL:
  1. The last 90 days of daily rainfall  -> rainfall_actuals
  2. The full 1998-2020 archive, reduced to per-day-of-year means -> rainfall_baseline
     (the baseline is expensive to compute, so it is skipped if already populated)

Earth Engine auth:
  * Interactive:      run `earthengine authenticate` once, then set
                      EE_PROJECT in the environment.
  * Service account:  set EE_SERVICE_ACCOUNT and EE_PRIVATE_KEY_FILE.

Dataset: UCSB-CHC/CHIRPS/V3/DAILY_SAT
"""

import os
import sys
from datetime import datetime, timedelta, timezone

import ee
import psycopg2
from dotenv import load_dotenv

load_dotenv()

CHIRPS_COLLECTION = "UCSB-CHC/CHIRPS/V3/DAILY_SAT"
LOCATION = "machakos"
MACHAKOS_LAT = float(os.getenv("MACHAKOS_LAT", "-1.5177"))
MACHAKOS_LON = float(os.getenv("MACHAKOS_LON", "37.2634"))

# CHIRPS V3 DAILY_SAT begins in 1998 for the Machakos point.
BASELINE_START = "1998-01-01"
BASELINE_END = "2020-12-31"
ACTUALS_DAYS = 90


def log(message):
    """Print a timestamped log line to stdout."""
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {message}", flush=True)


def get_connection():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        log("ERROR: DATABASE_URL is not set")
        sys.exit(1)
    return psycopg2.connect(database_url)


def init_earth_engine():
    """Initialise Earth Engine via service account or cached user credentials."""
    project = os.getenv("EE_PROJECT")
    service_account = os.getenv("EE_SERVICE_ACCOUNT")
    key_file = os.getenv("EE_PRIVATE_KEY_FILE")

    try:
        if service_account and key_file:
            log(f"Authenticating Earth Engine with service account {service_account}")
            credentials = ee.ServiceAccountCredentials(service_account, key_file)
            ee.Initialize(credentials, project=project)
        else:
            log("Initialising Earth Engine with cached user credentials")
            if project:
                ee.Initialize(project=project)
            else:
                ee.Initialize()
        log("Earth Engine initialised")
    except Exception as exc:  # noqa: BLE001 - surface any auth failure clearly
        log(f"ERROR: Earth Engine initialisation failed: {exc}")
        log("Run `earthengine authenticate` and set EE_PROJECT, or configure a service account.")
        sys.exit(1)


def fetch_daily_series(start_date, end_date):
    """Return a list of (date_str, rainfall_mm) for the given inclusive range.

    Uses reduceRegion(mean) at the Machakos point for each daily image and
    pulls the whole series back in one getInfo() call via a FeatureCollection.
    """
    point = ee.Geometry.Point([MACHAKOS_LON, MACHAKOS_LAT])
    collection = (
        ee.ImageCollection(CHIRPS_COLLECTION)
        .filterDate(start_date, end_date)
        .select("precipitation")
    )

    def to_feature(image):
        value = image.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=point,
            scale=5566,  # CHIRPS native resolution ~0.05 deg
        ).get("precipitation")
        return ee.Feature(
            None,
            {
                "date": image.date().format("YYYY-MM-dd"),
                "rainfall_mm": value,
            },
        )

    features = collection.map(to_feature).getInfo()["features"]
    series = []
    for feat in features:
        props = feat["properties"]
        rainfall = props.get("rainfall_mm")
        if rainfall is None:
            continue
        series.append((props["date"], float(rainfall)))
    return series


def upsert_actuals(conn, series):
    """Upsert daily actuals into rainfall_actuals as authoritative CHIRPS.

    CHIRPS is the canonical source, so this overwrites any Open-Meteo gap-fill
    for the same days and (re)labels them source='chirps'.
    """
    sql = """
        INSERT INTO rainfall_actuals (location, date, rainfall_mm, source)
        VALUES (%s, %s, %s, 'chirps')
        ON CONFLICT (location, date)
        DO UPDATE SET rainfall_mm = EXCLUDED.rainfall_mm, source = 'chirps'
    """
    with conn.cursor() as cur:
        for date_str, rainfall in series:
            cur.execute(sql, (LOCATION, date_str, round(rainfall, 2)))
    conn.commit()
    log(f"Upserted {len(series)} rows into rainfall_actuals (source=chirps)")


def baseline_is_populated(conn):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM rainfall_baseline WHERE location = %s",
            (LOCATION,),
        )
        count = cur.fetchone()[0]
    return count >= 365


def compute_and_store_baseline(conn):
    """Compute day-of-year mean rainfall over the archive and store it."""
    log(f"Fetching CHIRPS archive {BASELINE_START}..{BASELINE_END} for baseline")
    series = fetch_daily_series(BASELINE_START, BASELINE_END)
    log(f"Fetched {len(series)} archive days; aggregating by day-of-year")

    # Accumulate sum and count per day-of-year (1..366).
    sums = {}
    counts = {}
    for date_str, rainfall in series:
        doy = datetime.strptime(date_str, "%Y-%m-%d").timetuple().tm_yday
        sums[doy] = sums.get(doy, 0.0) + rainfall
        counts[doy] = counts.get(doy, 0) + 1

    sql = """
        INSERT INTO rainfall_baseline (location, day_of_year, mean_rainfall_mm)
        VALUES (%s, %s, %s)
        ON CONFLICT (location, day_of_year)
        DO UPDATE SET mean_rainfall_mm = EXCLUDED.mean_rainfall_mm
    """
    rows = 0
    with conn.cursor() as cur:
        for doy in sorted(sums.keys()):
            mean = sums[doy] / counts[doy]
            cur.execute(sql, (LOCATION, doy, round(mean, 2)))
            rows += 1
    conn.commit()
    log(f"Stored {rows} day-of-year baseline values")


def fetch_recent_actuals(conn):
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=ACTUALS_DAYS)
    log(f"Fetching last {ACTUALS_DAYS} days of actuals ({start}..{end})")
    series = fetch_daily_series(start.isoformat(), end.isoformat())
    log(f"Fetched {len(series)} recent actual days")
    upsert_actuals(conn, series)


def main():
    log("Starting CHIRPS fetch")
    init_earth_engine()
    conn = get_connection()
    try:
        fetch_recent_actuals(conn)

        if baseline_is_populated(conn):
            log("Baseline already populated; skipping archive download")
        else:
            compute_and_store_baseline(conn)

        log("CHIRPS fetch complete")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
