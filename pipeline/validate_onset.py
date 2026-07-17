#!/usr/bin/env python3
"""Validate MawinguOps's planting signal against the growing-season ONSET.

ICPAC publishes growing-season onset (and cessation) dates for the region in the
ICPAC Data Library (digilib.icpac.net). The onset date is, in effect, the
official answer to the same question MawinguOps answers — "has the planting
window opened?". This step gives an independent, ICPAC-aligned cross-check:

  1. Detect this season's onset from the CHIRPS archive using a standard
     agronomic criterion (>= ONSET_RAIN_MM over ONSET_WINDOW days, with no
     false-start dry spell longer than MAX_DRY_SPELL in the following
     CHECK_DAYS days).
  2. Build a reference onset:
       - ICPAC's official onset for Machakos if ICPAC_ONSET_URL is set and
         reachable (the digilib Ingrid URL that returns CSV), else
       - the long-term CHIRPS climatological onset (median over all years).
  3. Compare the latest planting recommendation to the onset and report whether
     it AGREES, is CONSERVATIVE, or DIVERGES.

Result is stored in onset_validation and surfaced on the dashboard.

Machakos is bimodal: long rains (MAM) and short rains (OND). The current season
is chosen from the anchor date (latest available actual, capped at today).
"""

import csv
import io
import os
import sys
from datetime import datetime, date, timedelta, timezone

import psycopg2
import requests
from dotenv import load_dotenv

from season import season_phase, season_bounds as canonical_season_bounds

load_dotenv()

LOCATION = "machakos"

# --- Agronomic onset criterion (AGRHYMET / Sivakumar style) ----------------
ONSET_WINDOW = 3        # days over which the trigger rainfall must fall
ONSET_RAIN_MM = 20.0    # trigger rainfall total over ONSET_WINDOW days
CHECK_DAYS = 21         # days after onset checked for a false start
MAX_DRY_SPELL = 9       # a longer dry spell within CHECK_DAYS = false start
DRY_DAY_MM = 1.0        # a day below this is "dry"

# Season windows come from the shared calendar (pipeline/season.py) so every
# component agrees on when a season is open.

# Optional: ICPAC official onset. A digilib Ingrid URL returning CSV with onset
# day-of-year (or date) for Machakos. Unset -> climatology reference is used.
ICPAC_ONSET_URL = os.getenv("ICPAC_ONSET_URL")


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
    today = datetime.now(timezone.utc).date()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT MAX(date) FROM rainfall_actuals WHERE location = %s", (LOCATION,)
        )
        row = cur.fetchone()
    if not row or not row[0]:
        log("ERROR: rainfall_actuals is empty — run fetch_chirps first")
        sys.exit(1)
    return min(row[0], today)


def current_season(anchor):
    """Which planting season (if any) the anchor date falls in."""
    phase = season_phase(anchor)
    return phase["season"] if phase["phase"] == "in_season" else "off_season"


def daily_series(conn, start, end):
    """Ordered (date, rainfall_mm) for [start, end], gap-filled with 0.0."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT date, rainfall_mm FROM rainfall_actuals
            WHERE location = %s AND date >= %s AND date <= %s
            ORDER BY date ASC
            """,
            (LOCATION, start, end),
        )
        have = {r[0]: float(r[1]) for r in cur.fetchall()}
    out, d = [], start
    while d <= end:
        out.append((d, have.get(d, 0.0)))
        d += timedelta(days=1)
    return out


def detect_onset(series):
    """First day in `series` meeting the onset criterion. Returns date or None."""
    n = len(series)
    for i in range(n - ONSET_WINDOW + 1):
        window_sum = sum(series[i + k][1] for k in range(ONSET_WINDOW))
        if window_sum < ONSET_RAIN_MM:
            continue
        # Check for a false start: a long dry spell in the next CHECK_DAYS.
        tail = series[i + ONSET_WINDOW : i + ONSET_WINDOW + CHECK_DAYS]
        longest = run = 0
        for _, mm in tail:
            run = run + 1 if mm < DRY_DAY_MM else 0
            longest = max(longest, run)
        if longest <= MAX_DRY_SPELL:
            return series[i][0]
    return None


def season_bounds(name, year):
    return canonical_season_bounds(name, year)


def climatological_onset(conn, season, anchor_year):
    """Median onset date across all complete historical years for this season."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT MIN(date), MAX(date) FROM rainfall_actuals WHERE location = %s",
            (LOCATION,),
        )
        dmin, dmax = cur.fetchone()
    onset_doys = []
    for yr in range(dmin.year, anchor_year):  # exclude current (possibly partial) year
        start, end = season_bounds(season, yr)
        if end > dmax:
            continue
        onset = detect_onset(daily_series(conn, start, end))
        if onset:
            onset_doys.append(onset.timetuple().tm_yday)
    if not onset_doys:
        return None, 0
    onset_doys.sort()
    median_doy = onset_doys[len(onset_doys) // 2]
    # Express the climatological onset as a date in the anchor year.
    return date(anchor_year, 1, 1) + timedelta(days=median_doy - 1), len(onset_doys)


def fetch_icpac_onset(season, year):
    """ICPAC official onset from digilib (CSV via Ingrid URL). None on any error.

    Expects a CSV whose last numeric column is the onset day-of-year (or an ISO
    date). Best-effort: the moment digilib is unreachable or the format differs,
    we return None and fall back to the CHIRPS climatology.
    """
    if not ICPAC_ONSET_URL:
        return None
    try:
        resp = requests.get(ICPAC_ONSET_URL, timeout=30)
        resp.raise_for_status()
        reader = csv.reader(io.StringIO(resp.text))
        rows = [r for r in reader if r]
        for r in reversed(rows):
            cell = r[-1].strip()
            # ISO date?
            try:
                return datetime.strptime(cell[:10], "%Y-%m-%d").date()
            except ValueError:
                pass
            # day-of-year?
            try:
                doy = int(float(cell))
                if 1 <= doy <= 366:
                    return date(year, 1, 1) + timedelta(days=doy - 1)
            except ValueError:
                continue
    except Exception as exc:  # noqa: BLE001 - graceful fallback is the point
        log(f"  ICPAC onset fetch failed ({exc}); using CHIRPS climatology")
    return None


def get_latest_recommendation(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT recommendation FROM planting_recommendations
            WHERE location = %s ORDER BY computed_at DESC LIMIT 1
            """,
            (LOCATION,),
        )
        row = cur.fetchone()
    return row[0] if row else None


def assess(onset, onset_status, clim_onset, anchor, rec):
    """Compare the recommendation to the onset signal -> (agreement, message)."""
    if rec is None:
        return "n/a", "No planting recommendation to compare yet."

    # Plant-window logic: PLANT_NOW is expected once onset has occurred; WAIT is
    # expected before onset; DO_NOT_PLANT is expected when the season is delayed.
    if onset_status == "onset_detected":
        if rec == "PLANT_NOW":
            return "agrees", f"Onset on {onset} confirms the planting window is open — PLANT_NOW agrees with ICPAC-style onset."
        if rec == "WAIT":
            return "conservative", f"Onset on {onset} has occurred but the model says WAIT — likely a forecast dry-spell risk; more cautious than onset alone."
        return "diverges", f"Onset on {onset} occurred yet the model says {rec}."
    if onset_status == "awaiting_onset":
        if rec in ("WAIT", "DO_NOT_PLANT"):
            return "agrees", f"Onset not yet reached (climatology ~{clim_onset}); holding off agrees with the onset signal."
        return "diverges", f"Model says PLANT_NOW but onset has not been reached (climatology ~{clim_onset})."
    if onset_status == "season_delayed":
        if rec in ("WAIT", "DO_NOT_PLANT"):
            return "agrees", f"Season is delayed past the usual onset (~{clim_onset}); {rec} agrees."
        return "diverges", f"Season delayed past usual onset (~{clim_onset}) but model says PLANT_NOW."
    return "n/a", "No active planting season right now (between seasons)."


def store(conn, payload):
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO onset_validation
                (location, season, year, onset_date, onset_status, climatology_onset,
                 reference_source, days_vs_climatology, recommendation, agreement,
                 message, valid_until)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, NOW() + INTERVAL '7 days')
            """,
            (
                LOCATION, payload["season"], payload["year"], payload["onset_date"],
                payload["onset_status"], payload["climatology_onset"],
                payload["reference_source"], payload["days_vs_climatology"],
                payload["recommendation"], payload["agreement"], payload["message"],
            ),
        )
    conn.commit()


def main():
    log("Starting growing-season onset validation")
    conn = get_connection()
    try:
        anchor = get_anchor_date(conn)
        season = current_season(anchor)
        log(f"Anchor date: {anchor} | season: {season}")

        rec = get_latest_recommendation(conn)

        if season == "off_season":
            payload = {
                "season": season, "year": anchor.year, "onset_date": None,
                "onset_status": "off_season", "climatology_onset": None,
                "reference_source": "chirps_climatology", "days_vs_climatology": None,
                "recommendation": rec, "agreement": "n/a",
                "message": "No main planting season open at this date (between MAM and OND).",
            }
            store(conn, payload)
            log("Stored: off-season (no onset window open).")
            return

        # Reference onset: ICPAC official if configured/reachable, else climatology.
        icpac_onset = fetch_icpac_onset(season, anchor.year)
        clim_onset, n_years = climatological_onset(conn, season, anchor.year)
        if icpac_onset is not None:
            reference_source = "icpac_digilib"
            ref_onset = icpac_onset
            log(f"ICPAC official onset: {icpac_onset}")
        else:
            reference_source = "chirps_climatology"
            ref_onset = clim_onset
            log(f"CHIRPS climatological onset: {clim_onset} (from {n_years} years)")

        # Detect this season's onset so far (season start .. anchor).
        start, _ = season_bounds(season, anchor.year)
        this_season = detect_onset(daily_series(conn, start, anchor))

        if this_season is not None:
            onset_status = "onset_detected"
            days_vs = (this_season - ref_onset).days if ref_onset else None
        elif ref_onset and anchor > ref_onset + timedelta(days=CHECK_DAYS):
            onset_status = "season_delayed"
            days_vs = (anchor - ref_onset).days
        else:
            onset_status = "awaiting_onset"
            days_vs = (anchor - ref_onset).days if ref_onset else None

        agreement, message = assess(this_season, onset_status, ref_onset, anchor, rec)
        log(f"Onset status: {onset_status} | detected: {this_season} | "
            f"recommendation: {rec} | agreement: {agreement}")
        log(f"  {message}")

        store(conn, {
            "season": season, "year": anchor.year, "onset_date": this_season,
            "onset_status": onset_status, "climatology_onset": ref_onset,
            "reference_source": reference_source, "days_vs_climatology": days_vs,
            "recommendation": rec, "agreement": agreement, "message": message,
        })
        log("Onset validation stored (valid for 7 days)")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
