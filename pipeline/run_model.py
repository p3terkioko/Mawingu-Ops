#!/usr/bin/env python3
"""Engineer current features from the DB and run the planting model.

Loads ml/models/planting_model.pkl (and label_encoder.pkl), builds the 10
feature vector from the most recent data in the database, runs predict() and
predict_proba(), and stores the result in planting_recommendations with the
feature snapshot as JSONB.

Feature order (must match training in ml/features.py):
  onset_week, cumulative_rainfall_30d, dry_spell_max, rainfall_variability,
  anomaly_pct, forecast_7d_total, forecast_14d_total, forecast_dry_spell,
  season, week_of_season
"""

import json
import os
import sys
from datetime import datetime, timedelta, timezone

import joblib
import numpy as np
import pandas as pd
import psycopg2
from dotenv import load_dotenv

from season import season_phase

load_dotenv()

LOCATION = "machakos"
CROP = "maize"              # MawinguOps MVP crop (explicit, see ml/labels.py)
WINDOW_DAYS = 30
DRY_DAY_THRESHOLD_MM = 1.0  # a day with < 1mm counts as dry

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(SCRIPT_DIR, "..", "ml", "models", "planting_model.pkl")
ENCODER_PATH = os.path.join(SCRIPT_DIR, "..", "ml", "models", "label_encoder.pkl")

FEATURE_NAMES = [
    "onset_week",
    "cumulative_rainfall_30d",
    "dry_spell_max",
    "rainfall_variability",
    "anomaly_pct",
    "forecast_7d_total",
    "forecast_14d_total",
    "forecast_dry_spell",
    "season",
    "week_of_season",
]


def log(message):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {message}", flush=True)


def get_connection():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        log("ERROR: DATABASE_URL is not set")
        sys.exit(1)
    return psycopg2.connect(database_url)


def longest_dry_spell(values):
    """Longest run of consecutive days below the dry threshold."""
    longest = 0
    current = 0
    for v in values:
        if v < DRY_DAY_THRESHOLD_MM:
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return longest


def season_for_date(date):
    """Return (season_code, week_of_season, season_start) for the Kenyan
    bimodal rainfall calendar.

    MAM (long rains): Mar 1 - May 31  -> season 0
    OND (short rains): Oct 1 - Dec 31 -> season 1
    Outside those windows we attach to the nearest upcoming/current season.

    NOTE: this snapping exists ONLY to build a valid feature vector matching
    the training data (ml/features.py). Whether a planting decision is actually
    live comes from season.season_phase(), stored in the `phase` column —
    downstream readers must branch on that, not on these features.
    """
    year = date.year
    mam_start = datetime(year, 3, 1).date()
    ond_start = datetime(year, 10, 1).date()

    if datetime(year, 3, 1).date() <= date <= datetime(year, 5, 31).date():
        season = 0
        start = mam_start
    elif datetime(year, 10, 1).date() <= date <= datetime(year, 12, 31).date():
        season = 1
        start = ond_start
    elif date < mam_start:
        # Before long rains begin — treat as week 0 of MAM.
        season = 0
        start = mam_start
    elif date < ond_start:
        # Between seasons — treat as week 0 of OND.
        season = 1
        start = ond_start
    else:
        season = 1
        start = ond_start

    week_of_season = max(0, (date - start).days // 7)
    return season, week_of_season, start


def get_anchor_date(conn):
    """Most recent actual date, capped at today.

    Features are engineered relative to the latest AVAILABLE data, not wall-clock
    today, so the model's "current conditions" stay valid when the CHIRPS archive
    lags real time (matches compute_anomaly.py / validate_onset.py). When data is
    fresh, the anchor equals today and behaviour is unchanged.
    """
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


def get_recent_actuals(conn, end_date, start_date):
    """Return list of (date, rainfall_mm) ordered by date for the window."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT date, rainfall_mm
            FROM rainfall_actuals
            WHERE location = %s AND date > %s AND date <= %s
            ORDER BY date ASC
            """,
            (LOCATION, start_date, end_date),
        )
        return [(row[0], float(row[1])) for row in cur.fetchall()]


def get_latest_anomaly(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT anomaly_pct
            FROM alert_levels
            WHERE location = %s
            ORDER BY computed_at DESC
            LIMIT 1
            """,
            (LOCATION,),
        )
        row = cur.fetchone()
    return float(row[0]) if row else 0.0


def get_forecast(conn, today):
    """Return ordered list of (date, predicted_rainfall_mm) for the horizon."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT forecast_date, predicted_rainfall_mm
            FROM forecasts
            WHERE location = %s AND forecast_date >= %s
            ORDER BY forecast_date ASC
            """,
            (LOCATION, today),
        )
        return [(row[0], float(row[1])) for row in cur.fetchall()]


def compute_onset_week(actuals, season_start):
    """Week of season in which rains began.

    Onset = first 7-day window after season start whose total reaches 20mm.
    Returns 0 if no onset detected within the available data.
    """
    if not actuals:
        return 0
    by_date = {d: r for d, r in actuals}
    for week in range(0, 16):
        window_total = 0.0
        for offset in range(7):
            day = season_start + timedelta(days=week * 7 + offset)
            window_total += by_date.get(day, 0.0)
        if window_total >= 20.0:
            return week + 1
    return 0


def engineer_features(conn):
    anchor = get_anchor_date(conn)
    start_date = anchor - timedelta(days=WINDOW_DAYS)

    actuals = get_recent_actuals(conn, anchor, start_date)
    rainfall_values = [r for _, r in actuals]

    cumulative_rainfall_30d = float(np.sum(rainfall_values)) if rainfall_values else 0.0
    dry_spell_max = longest_dry_spell(rainfall_values) if rainfall_values else WINDOW_DAYS
    rainfall_variability = (
        float(np.std(rainfall_values)) if len(rainfall_values) > 1 else 0.0
    )

    anomaly_pct = get_latest_anomaly(conn)

    forecast = get_forecast(conn, anchor)
    forecast_values = [r for _, r in forecast]
    forecast_7d_total = float(np.sum(forecast_values[:7]))
    forecast_14d_total = float(np.sum(forecast_values[:14]))
    forecast_dry_spell = longest_dry_spell(forecast_values[:14]) if forecast_values else 14

    season, week_of_season, season_start = season_for_date(anchor)
    onset_week = compute_onset_week(actuals, season_start)

    features = {
        "onset_week": int(onset_week),
        "cumulative_rainfall_30d": round(cumulative_rainfall_30d, 2),
        "dry_spell_max": int(dry_spell_max),
        "rainfall_variability": round(rainfall_variability, 2),
        "anomaly_pct": round(anomaly_pct, 2),
        "forecast_7d_total": round(forecast_7d_total, 2),
        "forecast_14d_total": round(forecast_14d_total, 2),
        "forecast_dry_spell": int(forecast_dry_spell),
        "season": int(season),
        "week_of_season": int(week_of_season),
    }
    return features


def load_model():
    if not os.path.exists(MODEL_PATH):
        log(f"ERROR: model not found at {MODEL_PATH}")
        log("Train the model in the Colab notebook and place the .pkl files in ml/models/")
        sys.exit(1)
    model = joblib.load(MODEL_PATH)
    encoder = joblib.load(ENCODER_PATH) if os.path.exists(ENCODER_PATH) else None
    return model, encoder


def store_recommendation(conn, recommendation, confidence, features, phase):
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO planting_recommendations
                (location, crop, recommendation, confidence_score, features_snapshot, phase, valid_until)
            VALUES (%s, %s, %s, %s, %s, %s, NOW() + INTERVAL '7 days')
            """,
            (LOCATION, CROP, recommendation, round(confidence, 2), json.dumps(features), phase),
        )
    conn.commit()


def main():
    log("Starting model run")
    model, encoder = load_model()
    conn = get_connection()
    try:
        anchor = get_anchor_date(conn)
        phase_info = season_phase(anchor)
        phase = phase_info["phase"]
        log(f"Anchor date: {anchor} | phase: {phase} ({phase_info['label']})")

        features = engineer_features(conn)
        log(f"Engineered features: {json.dumps(features)}")

        # Build a single-row DataFrame with named columns so the model aligns
        # features by name (the model was trained on a named DataFrame).
        x = pd.DataFrame([[features[name] for name in FEATURE_NAMES]], columns=FEATURE_NAMES)

        pred = model.predict(x)[0]
        proba = model.predict_proba(x)[0]
        # confidence_score is DECIMAL(4,2) (max 99.99), so cap a perfect 1.0.
        confidence = min(float(np.max(proba)) * 100.0, 99.99)

        if encoder is not None:
            recommendation = encoder.inverse_transform([pred])[0]
        else:
            recommendation = str(pred)

        if phase == "off_season":
            log(
                f"Off-season: model signal is {recommendation} "
                f"({confidence:.2f}%) but no planting decision is live — "
                "readers must render PREPARE guidance from the phase column"
            )
        log(f"Recommendation: {recommendation} (confidence {confidence:.2f}%, phase {phase})")
        store_recommendation(conn, recommendation, confidence, features, phase)
        log("Recommendation stored (valid for 7 days)")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
