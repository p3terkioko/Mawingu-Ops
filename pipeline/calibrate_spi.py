#!/usr/bin/env python3
"""Calibrate the SPI (Standardized Precipitation Index) per day-of-year.

ICPAC's East Africa Drought Watch monitors drought using the SPI computed from
CHIRPS. The SPI of an N-day rainfall accumulation is obtained by fitting a gamma
distribution to the historical accumulations for the same period, then mapping
the current value's cumulative probability onto the standard normal:

    H(x) = q + (1 - q) * GammaCDF(x; shape, scale)      # q = P(accumulation = 0)
    SPI  = Phi^-1(H(x))

This script fits, for each day-of-year, the gamma parameters of the trailing
N-day (default 30) accumulation across the historical CHIRPS archive and stores
them in spi_calibration. Run it once (like the baseline), then the weekly
compute_anomaly.py step only needs the current window + the calibration row.

Gamma shape/scale use the closed-form Thom maximum-likelihood estimator, which
is robust on the ~28-year sample available here.

Reads the historical daily series from rainfall_actuals (full CHIRPS archive).
"""

import os
import sys
from datetime import datetime, timezone

import numpy as np
import psycopg2
from dotenv import load_dotenv

load_dotenv()

LOCATION = "machakos"
ACCUM_DAYS = 30
MIN_SAMPLE = 10  # need enough years to fit a distribution

# Reference period for the gamma fit. ICPAC's East Africa Drought Watch fits SPI
# on 1981-2010. Set SPI_REF_START_YEAR / SPI_REF_END_YEAR to match it exactly
# once the full CHIRPS archive (from 1981) is loaded; unset = use all available
# years (the current 1998-2025 archive).
REF_START_YEAR = os.getenv("SPI_REF_START_YEAR")
REF_END_YEAR = os.getenv("SPI_REF_END_YEAR")
REF_START_YEAR = int(REF_START_YEAR) if REF_START_YEAR else None
REF_END_YEAR = int(REF_END_YEAR) if REF_END_YEAR else None


def ref_label():
    if REF_START_YEAR and REF_END_YEAR:
        return f"{REF_START_YEAR}-{REF_END_YEAR}"
    return "all-years"


def in_reference(year):
    if REF_START_YEAR and year < REF_START_YEAR:
        return False
    if REF_END_YEAR and year > REF_END_YEAR:
        return False
    return True


def log(message):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {message}", flush=True)


def get_connection():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        log("ERROR: DATABASE_URL is not set")
        sys.exit(1)
    return psycopg2.connect(database_url)


def thom_gamma_params(values):
    """Closed-form Thom MLE for gamma shape (alpha) and scale (beta).

    `values` are strictly positive accumulations. Returns (shape, scale).
    """
    values = np.asarray([v for v in values if v > 0], dtype=float)
    if len(values) < MIN_SAMPLE:
        return None
    mean = values.mean()
    a = np.log(mean) - np.log(values).mean()
    if a <= 0:
        # Degenerate (near-constant) sample; fall back to method of moments.
        var = values.var(ddof=1)
        if var <= 0:
            return None
        shape = mean * mean / var
        scale = var / mean
        return float(shape), float(scale)
    shape = (1.0 / (4.0 * a)) * (1.0 + np.sqrt(1.0 + (4.0 * a) / 3.0))
    scale = mean / shape
    return float(shape), float(scale)


def load_daily_series(conn):
    """Return (dates, values) numpy arrays of the full daily archive, sorted."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT date, rainfall_mm
            FROM rainfall_actuals
            WHERE location = %s
            ORDER BY date ASC
            """,
            (LOCATION,),
        )
        rows = cur.fetchall()
    if not rows:
        log("ERROR: rainfall_actuals is empty — load the CHIRPS archive first")
        sys.exit(1)
    dates = np.array([r[0] for r in rows])
    values = np.array([float(r[1]) for r in rows])
    return dates, values


def rolling_accumulations(dates, values, accum_days):
    """Trailing `accum_days` sum ending on each date; grouped by end day-of-year.

    Returns dict: day_of_year -> list of accumulations (one per qualifying date).
    """
    n = len(values)
    # Prefix sums for O(1) window totals.
    prefix = np.concatenate([[0.0], np.cumsum(values)])
    by_doy = {}
    for i in range(accum_days - 1, n):
        if not in_reference(dates[i].year):
            continue
        total = prefix[i + 1] - prefix[i + 1 - accum_days]
        doy = dates[i].timetuple().tm_yday
        by_doy.setdefault(doy, []).append(float(total))
    return by_doy


def monthly_totals(dates, values):
    """Full calendar-month rainfall totals, grouped by month (1..12).

    Used for the ICPAC-style calendar-month SPI-1. Only months falling inside
    the reference period are included; partial months at the archive edges are
    dropped so the gamma is fitted on complete months.
    """
    sums = {}        # (year, month) -> total
    counts = {}      # (year, month) -> days seen
    for d, v in zip(dates, values):
        key = (d.year, d.month)
        sums[key] = sums.get(key, 0.0) + float(v)
        counts[key] = counts.get(key, 0) + 1

    from calendar import monthrange
    by_month = {}
    for (year, month), total in sums.items():
        if not in_reference(year):
            continue
        # Require a (near) complete month so totals are comparable.
        if counts[(year, month)] < monthrange(year, month)[1] - 2:
            continue
        by_month.setdefault(month, []).append(total)
    return by_month


def calibrate_monthly(conn, dates, values):
    """Fit and store per-calendar-month gamma params for the SPI-1 parity metric."""
    by_month = monthly_totals(dates, values)
    upsert = """
        INSERT INTO spi_monthly_calibration
            (location, month, gamma_shape, gamma_scale, zero_prob, sample_size,
             ref_start_year, ref_end_year, calibrated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
        ON CONFLICT (location, month)
        DO UPDATE SET
            gamma_shape = EXCLUDED.gamma_shape,
            gamma_scale = EXCLUDED.gamma_scale,
            zero_prob = EXCLUDED.zero_prob,
            sample_size = EXCLUDED.sample_size,
            ref_start_year = EXCLUDED.ref_start_year,
            ref_end_year = EXCLUDED.ref_end_year,
            calibrated_at = NOW()
    """
    stored = skipped = 0
    with conn.cursor() as cur:
        for month in range(1, 13):
            totals = by_month.get(month, [])
            n = len(totals)
            if n < MIN_SAMPLE:
                skipped += 1
                continue
            zero_prob = sum(1 for t in totals if t <= 0) / n
            params = thom_gamma_params(totals)
            if params is None:
                skipped += 1
                continue
            shape, scale = params
            cur.execute(
                upsert,
                (LOCATION, month, round(shape, 6), round(scale, 6),
                 round(zero_prob, 5), n, REF_START_YEAR, REF_END_YEAR),
            )
            stored += 1
    conn.commit()
    log(f"Stored monthly SPI-1 calibration for {stored} months "
        f"(skipped {skipped} low-sample) on reference {ref_label()}")


def calibrate(conn):
    dates, values = load_daily_series(conn)
    log(f"Loaded {len(values)} daily values ({dates[0]} .. {dates[-1]})")
    log(f"SPI reference period: {ref_label()}")

    by_doy = rolling_accumulations(dates, values, ACCUM_DAYS)
    log(f"Computed {ACCUM_DAYS}-day accumulations across {len(by_doy)} days-of-year")

    upsert = """
        INSERT INTO spi_calibration
            (location, day_of_year, accum_days, gamma_shape, gamma_scale, zero_prob, sample_size, calibrated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
        ON CONFLICT (location, day_of_year, accum_days)
        DO UPDATE SET
            gamma_shape = EXCLUDED.gamma_shape,
            gamma_scale = EXCLUDED.gamma_scale,
            zero_prob = EXCLUDED.zero_prob,
            sample_size = EXCLUDED.sample_size,
            calibrated_at = NOW()
    """

    stored = 0
    skipped = 0
    with conn.cursor() as cur:
        for doy in sorted(by_doy.keys()):
            accums = by_doy[doy]
            n = len(accums)
            zeros = sum(1 for a in accums if a <= 0)
            zero_prob = zeros / n if n else 0.0

            params = thom_gamma_params(accums)
            if params is None:
                skipped += 1
                continue
            shape, scale = params
            cur.execute(
                upsert,
                (LOCATION, doy, ACCUM_DAYS, round(shape, 6), round(scale, 6),
                 round(zero_prob, 5), n),
            )
            stored += 1
    conn.commit()
    log(f"Stored gamma calibration for {stored} days-of-year (skipped {skipped} low-sample)")

    # Calendar-month SPI-1 (ICPAC Drought Watch parity metric).
    calibrate_monthly(conn, dates, values)


def main():
    log("Starting SPI calibration")
    conn = get_connection()
    try:
        calibrate(conn)
        log("SPI calibration complete")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
