#!/usr/bin/env python3
"""Fetch a 14-day rainfall forecast for Machakos from Open-Meteo.

Open-Meteo requires no API key. We request daily precipitation_sum for the
next 14 days in the Africa/Nairobi timezone and upsert each day into the
forecasts table.
"""

import os
import sys
from datetime import datetime, timezone

import requests
import psycopg2
from dotenv import load_dotenv

load_dotenv()

LOCATION = "machakos"
MACHAKOS_LAT = float(os.getenv("MACHAKOS_LAT", "-1.5177"))
MACHAKOS_LON = float(os.getenv("MACHAKOS_LON", "37.2634"))
OPEN_METEO_BASE_URL = os.getenv(
    "OPEN_METEO_BASE_URL", "https://api.open-meteo.com/v1/forecast"
)
FORECAST_DAYS = 14


def log(message):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {message}", flush=True)


def get_connection():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        log("ERROR: DATABASE_URL is not set")
        sys.exit(1)
    return psycopg2.connect(database_url)


def fetch_forecast():
    params = {
        "latitude": MACHAKOS_LAT,
        "longitude": MACHAKOS_LON,
        "daily": "precipitation_sum",
        "timezone": "Africa/Nairobi",
        "forecast_days": FORECAST_DAYS,
    }
    log(f"Requesting {FORECAST_DAYS}-day forecast from {OPEN_METEO_BASE_URL}")
    response = requests.get(OPEN_METEO_BASE_URL, params=params, timeout=30)
    response.raise_for_status()
    data = response.json()

    daily = data.get("daily", {})
    dates = daily.get("time", [])
    sums = daily.get("precipitation_sum", [])
    if not dates or len(dates) != len(sums):
        raise ValueError("Unexpected Open-Meteo response shape")

    rows = []
    for date_str, precip in zip(dates, sums):
        rows.append((date_str, float(precip) if precip is not None else 0.0))
    log(f"Parsed {len(rows)} forecast days")
    return rows


def upsert_forecast(conn, rows):
    sql = """
        INSERT INTO forecasts (location, forecast_date, predicted_rainfall_mm, fetched_at)
        VALUES (%s, %s, %s, NOW())
        ON CONFLICT (location, forecast_date)
        DO UPDATE SET
            predicted_rainfall_mm = EXCLUDED.predicted_rainfall_mm,
            fetched_at = NOW()
    """
    with conn.cursor() as cur:
        for date_str, precip in rows:
            cur.execute(sql, (LOCATION, date_str, round(precip, 2)))
    conn.commit()
    log(f"Upserted {len(rows)} rows into forecasts")


def main():
    log("Starting forecast fetch")
    conn = get_connection()
    try:
        rows = fetch_forecast()
        upsert_forecast(conn, rows)
        log("Forecast fetch complete")
    except Exception as exc:  # noqa: BLE001
        log(f"ERROR: forecast fetch failed: {exc}")
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
