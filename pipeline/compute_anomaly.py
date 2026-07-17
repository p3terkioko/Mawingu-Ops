#!/usr/bin/env python3
"""Compute the drought signal: SPI + anomaly + alert level + trigger category.

Primary index is the SPI (Standardized Precipitation Index) over the trailing
30-day rainfall accumulation — the same index ICPAC's East Africa Drought Watch
uses. SPI is derived from the per-day-of-year gamma calibration produced by
calibrate_spi.py:

    H(x) = zero_prob + (1 - zero_prob) * GammaCDF(x; shape, scale)
    SPI  = Phi^-1(H(x))

SPI is mapped to an ICPAC-style anticipatory-action trigger category and to the
farmer-facing 4-level alert:

    SPI > -0.5            none      -> GREEN   (normal)
    -1.0 < SPI <= -0.5    mild      -> YELLOW  (watch)
    -1.5 < SPI <= -1.0    moderate  -> ORANGE  (moderate drought trigger)
    -2.0 < SPI <= -1.5    severe    -> RED     (severe drought trigger)
    SPI <= -2.0           extreme   -> RED     (extreme drought trigger)

The legacy anomaly_pct = (actual_30d / baseline_30d) * 100 is still computed and
stored for continuity, and is used as a fallback classifier if the SPI
calibration is unavailable.

The window is anchored to the most recent available actual date (capped at
today), so this works with both live data and a historical archive.
"""

import os
import sys
from datetime import datetime, timedelta, timezone

import psycopg2
from dotenv import load_dotenv
from scipy.stats import gamma as gamma_dist, norm

load_dotenv()

LOCATION = "machakos"
WINDOW_DAYS = 30
_EPS = 1e-6  # keep H(x) inside (0, 1) so Phi^-1 stays finite


def log(message):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {message}", flush=True)


def get_connection():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        log("ERROR: DATABASE_URL is not set")
        sys.exit(1)
    return psycopg2.connect(database_url)


def get_anchor_date(conn):
    """Most recent actual date, capped at today (handles archive vs live data)."""
    today = datetime.now(timezone.utc).date()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT MAX(date) FROM rainfall_actuals WHERE location = %s",
            (LOCATION,),
        )
        row = cur.fetchone()
    latest = row[0] if row and row[0] else None
    if latest is None:
        log("ERROR: rainfall_actuals is empty — run fetch_chirps first")
        sys.exit(1)
    return min(latest, today)


def get_actual_30d_sum(conn, end_date, start_date):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT COALESCE(SUM(rainfall_mm), 0)
            FROM rainfall_actuals
            WHERE location = %s AND date > %s AND date <= %s
            """,
            (LOCATION, start_date, end_date),
        )
        return float(cur.fetchone()[0])


def get_baseline_30d_sum(conn, end_date):
    """Sum the day-of-year baseline means for the 30-day window ending end_date."""
    days_of_year = [
        (end_date - timedelta(days=offset)).timetuple().tm_yday
        for offset in range(WINDOW_DAYS)
    ]
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT COALESCE(SUM(mean_rainfall_mm), 0)
            FROM rainfall_baseline
            WHERE location = %s AND day_of_year = ANY(%s)
            """,
            (LOCATION, days_of_year),
        )
        return float(cur.fetchone()[0])


def get_spi_calibration(conn, day_of_year):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT gamma_shape, gamma_scale, zero_prob
            FROM spi_calibration
            WHERE location = %s AND accum_days = %s AND day_of_year = %s
            """,
            (LOCATION, WINDOW_DAYS, day_of_year),
        )
        row = cur.fetchone()
    if not row:
        return None
    return {"shape": float(row[0]), "scale": float(row[1]), "zero_prob": float(row[2])}


def get_monthly_calibration(conn, month):
    """Gamma fit for the calendar-month SPI-1 (ICPAC Drought Watch parity)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT gamma_shape, gamma_scale, zero_prob, ref_start_year, ref_end_year
            FROM spi_monthly_calibration
            WHERE location = %s AND month = %s
            """,
            (LOCATION, month),
        )
        row = cur.fetchone()
    if not row:
        return None
    ref = (
        f"{int(row[3])}-{int(row[4])}" if row[3] and row[4] else "all-years"
    )
    return {
        "shape": float(row[0]), "scale": float(row[1]), "zero_prob": float(row[2]),
        "ref": ref,
    }


def get_calendar_month_total(conn, anchor):
    """Month-to-date rainfall total for the anchor's calendar month."""
    month_start = anchor.replace(day=1)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT COALESCE(SUM(rainfall_mm), 0)
            FROM rainfall_actuals
            WHERE location = %s AND date >= %s AND date <= %s
            """,
            (LOCATION, month_start, anchor),
        )
        return float(cur.fetchone()[0])


def compute_spi(actual_sum, calib):
    """SPI of the accumulation using the fitted gamma + zero-probability mix."""
    q = calib["zero_prob"]
    if actual_sum <= 0:
        h = q
    else:
        g = gamma_dist.cdf(actual_sum, a=calib["shape"], scale=calib["scale"])
        h = q + (1.0 - q) * g
    h = min(max(h, _EPS), 1.0 - _EPS)
    return float(norm.ppf(h))


def classify_trigger(spi):
    """Map SPI to an ICPAC-style anticipatory-action drought category."""
    if spi > -0.5:
        return "none"
    if spi > -1.0:
        return "mild"
    if spi > -1.5:
        return "moderate"
    if spi > -2.0:
        return "severe"
    return "extreme"


TRIGGER_TO_ALERT = {
    "none": "GREEN",
    "mild": "YELLOW",
    "moderate": "ORANGE",
    "severe": "RED",
    "extreme": "RED",
}


def classify_anomaly(anomaly_pct):
    """Legacy fallback classifier when SPI calibration is unavailable."""
    if anomaly_pct > 80:
        return "GREEN"
    if anomaly_pct >= 60:
        return "YELLOW"
    if anomaly_pct >= 40:
        return "ORANGE"
    return "RED"


def store_alert(conn, alert_level, anomaly_pct, spi, trigger_category,
                spi_1month, spi_1month_ref):
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO alert_levels
                (location, alert_level, anomaly_pct, spi, trigger_category,
                 spi_1month, spi_1month_ref, valid_until)
            VALUES (%s, %s, %s, %s, %s, %s, %s, NOW() + INTERVAL '7 days')
            """,
            (
                LOCATION,
                alert_level,
                round(anomaly_pct, 2),
                None if spi is None else round(spi, 2),
                trigger_category,
                None if spi_1month is None else round(spi_1month, 2),
                spi_1month_ref,
            ),
        )
    conn.commit()


def main():
    log("Starting drought-signal computation (SPI + anomaly)")
    conn = get_connection()
    try:
        end_date = get_anchor_date(conn)
        start_date = end_date - timedelta(days=WINDOW_DAYS)
        log(f"Anchor date: {end_date} (30-day window {start_date}..{end_date})")

        actual_sum = get_actual_30d_sum(conn, end_date, start_date)
        baseline_sum = get_baseline_30d_sum(conn, end_date)
        anomaly_pct = (actual_sum / baseline_sum * 100) if baseline_sum > 0 else 0.0

        calib = get_spi_calibration(conn, end_date.timetuple().tm_yday)

        if calib:
            spi = compute_spi(actual_sum, calib)
            trigger_category = classify_trigger(spi)
            alert_level = TRIGGER_TO_ALERT[trigger_category]
            log(
                f"Actual 30d: {actual_sum:.1f}mm | Baseline: {baseline_sum:.1f}mm | "
                f"Anomaly: {anomaly_pct:.1f}% | SPI: {spi:+.2f} "
                f"-> trigger={trigger_category} alert={alert_level}"
            )
        else:
            spi = None
            trigger_category = None
            alert_level = classify_anomaly(anomaly_pct)
            log(
                "SPI calibration not found — falling back to anomaly-based alert. "
                "Run calibrate_spi.py to enable SPI."
            )
            log(
                f"Actual 30d: {actual_sum:.1f}mm | Baseline: {baseline_sum:.1f}mm | "
                f"Anomaly: {anomaly_pct:.1f}% -> alert={alert_level}"
            )

        # ICPAC Drought Watch parity metric: calendar-month SPI-1.
        spi_1month = None
        spi_1month_ref = None
        month_calib = get_monthly_calibration(conn, end_date.month)
        if month_calib:
            month_total = get_calendar_month_total(conn, end_date)
            spi_1month = compute_spi(month_total, month_calib)
            spi_1month_ref = month_calib["ref"]
            log(
                f"Calendar-month SPI-1 ({end_date:%B}, ref {spi_1month_ref}): "
                f"{month_total:.1f}mm -> SPI-1 {spi_1month:+.2f} "
                f"[{classify_trigger(spi_1month)}]"
            )
        else:
            log("Monthly SPI-1 calibration not found — run calibrate_spi.py to enable it.")

        store_alert(conn, alert_level, anomaly_pct, spi, trigger_category,
                    spi_1month, spi_1month_ref)
        log("Alert stored (valid for 7 days)")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
