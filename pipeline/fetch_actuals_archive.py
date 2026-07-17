#!/usr/bin/env python3
"""Keep rainfall_actuals current WITHOUT Earth Engine — gap-fill from Open-Meteo.

The canonical actuals source is CHIRPS (fetch_chirps.py via Earth Engine), the
same dataset ICPAC's Drought Watch uses. But fetch_chirps needs interactive EE
auth, so on a fresh machine the archive can lag. This script fills the gap from
the most recent actual up to ~today using Open-Meteo's historical archive API
(ERA5, no API key, ~3-5 day latency), tagging those days `source =
'open-meteo-archive'` so provenance stays explicit. A later CHIRPS fetch will
overwrite them with the authoritative values.

This makes the app self-sufficient: it can always offer an up-to-date advisory
even where Earth Engine isn't configured.
"""

import os
import sys
from datetime import datetime, timedelta, timezone

import requests
import psycopg2
from dotenv import load_dotenv

load_dotenv()

LOCATION = "machakos"
SOURCE = "open-meteo-archive"
MACHAKOS_LAT = float(os.getenv("MACHAKOS_LAT", "-1.5177"))
MACHAKOS_LON = float(os.getenv("MACHAKOS_LON", "37.2634"))
ARCHIVE_URL = os.getenv(
    "OPEN_METEO_ARCHIVE_URL", "https://archive-api.open-meteo.com/v1/archive"
)
# Don't request days the archive almost certainly doesn't have yet.
ARCHIVE_LATENCY_DAYS = 3


def log(message):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {message}", flush=True)


def get_connection():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        log("ERROR: DATABASE_URL is not set")
        sys.exit(1)
    return psycopg2.connect(database_url)


def latest_actual_date(conn):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT MAX(date) FROM rainfall_actuals WHERE location = %s", (LOCATION,)
        )
        row = cur.fetchone()
    return row[0] if row and row[0] else None


def fetch_archive(start_date, end_date):
    params = {
        "latitude": MACHAKOS_LAT,
        "longitude": MACHAKOS_LON,
        "daily": "precipitation_sum",
        "timezone": "Africa/Nairobi",
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
    }
    log(f"Requesting Open-Meteo archive {start_date}..{end_date}")
    resp = requests.get(ARCHIVE_URL, params=params, timeout=30)
    resp.raise_for_status()
    daily = resp.json().get("daily", {})
    dates = daily.get("time", [])
    sums = daily.get("precipitation_sum", [])
    if not dates or len(dates) != len(sums):
        raise ValueError("Unexpected Open-Meteo archive response shape")
    return [
        (d, float(p) if p is not None else 0.0) for d, p in zip(dates, sums)
    ]


def upsert(conn, series):
    """Insert gap-fill days. Never downgrade an existing CHIRPS day to archive:
    only overwrite a day if it is missing or already came from this archive."""
    sql = """
        INSERT INTO rainfall_actuals (location, date, rainfall_mm, source)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (location, date)
        DO UPDATE SET rainfall_mm = EXCLUDED.rainfall_mm, source = EXCLUDED.source
        WHERE rainfall_actuals.source = %s
    """
    written = 0
    with conn.cursor() as cur:
        for date_str, mm in series:
            cur.execute(sql, (LOCATION, date_str, round(mm, 2), SOURCE, SOURCE))
            written += cur.rowcount
    conn.commit()
    return written


def main():
    log("Starting Open-Meteo archive gap-fill")
    conn = get_connection()
    try:
        today = datetime.now(timezone.utc).date()
        target_end = today - timedelta(days=ARCHIVE_LATENCY_DAYS)
        latest = latest_actual_date(conn)
        if latest is None:
            log("ERROR: rainfall_actuals empty — load the CHIRPS archive first")
            sys.exit(1)

        start = latest + timedelta(days=1)
        if start > target_end:
            log(f"Actuals already current (latest {latest}); nothing to fill.")
            return

        series = fetch_archive(start, target_end)
        # Guard: gamma SPI calibration is CHIRPS-based; ERA5 is a close but
        # distinct estimate. We still gap-fill so the signal stays current.
        written = upsert(conn, series)
        log(f"Gap-filled {written} day(s) from {SOURCE} ({start}..{target_end})")
        log(f"Latest actual is now {latest_actual_date(conn)}")
        log("Open-Meteo archive gap-fill complete")
    except Exception as exc:  # noqa: BLE001
        log(f"ERROR: archive gap-fill failed: {exc}")
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
