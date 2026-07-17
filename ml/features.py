"""Feature engineering for the MawinguOps planting model.

Turns a daily CHIRPS rainfall series into one feature row per growing season.
The Kenyan maize calendar is bimodal:

    MAM (long rains):  March 1 - May 31
    OND (short rains): October 1 - December 31

For each season in the archive we engineer the 10 features the model expects.
The notebook copies these definitions inline so it can run standalone; keep the
two in sync if you change the logic here.

Feature order (must match training and pipeline/run_model.py):
  onset_week, cumulative_rainfall_30d, dry_spell_max, rainfall_variability,
  anomaly_pct, forecast_7d_total, forecast_14d_total, forecast_dry_spell,
  season, week_of_season
"""

import numpy as np
import pandas as pd

DRY_DAY_THRESHOLD_MM = 1.0
ONSET_WINDOW_MM = 20.0  # 7-day total that marks the start of the rains

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

# (season_code, start_month, start_day, end_month, end_day)
SEASONS = [
    (0, 3, 1, 5, 31),    # MAM
    (1, 10, 1, 12, 31),  # OND
]


def longest_dry_spell(values):
    """Longest run of consecutive days below the dry threshold."""
    longest = current = 0
    for v in values:
        if v < DRY_DAY_THRESHOLD_MM:
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return int(longest)


def compute_onset_week(season_df):
    """First week (1-based) whose 7-day rainfall total reaches the onset threshold."""
    values = season_df["rainfall_mm"].to_numpy()
    n_weeks = len(values) // 7
    for week in range(n_weeks):
        window = values[week * 7:(week + 1) * 7]
        if window.sum() >= ONSET_WINDOW_MM:
            return week + 1
    return 0


def build_baseline(df):
    """Day-of-year mean rainfall across all years in df."""
    tmp = df.copy()
    tmp["day_of_year"] = pd.to_datetime(tmp["date"]).dt.dayofyear
    return tmp.groupby("day_of_year")["rainfall_mm"].mean()


def _season_bounds(year, spec):
    _, sm, sd, em, ed = spec
    start = pd.Timestamp(year=year, month=sm, day=sd)
    end = pd.Timestamp(year=year, month=em, day=ed)
    return start, end


def engineer_season_features(df, baseline=None):
    """Build one feature row per (year, season) in the CHIRPS dataframe.

    Parameters
    ----------
    df : DataFrame with columns ['date', 'rainfall_mm']
    baseline : optional Series indexed by day_of_year. Computed from df if None.

    Returns
    -------
    DataFrame with FEATURE_NAMES columns plus 'year' and 'season_label'.
    """
    df = df.copy()
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)

    if baseline is None:
        baseline = build_baseline(df)

    rows = []
    years = sorted(df["date"].dt.year.unique())

    for year in years:
        for spec in SEASONS:
            season_code = spec[0]
            start, end = _season_bounds(year, spec)
            season_df = df[(df["date"] >= start) & (df["date"] <= end)]
            if len(season_df) < 30:
                continue  # incomplete season — skip

            values = season_df["rainfall_mm"].to_numpy()

            # First-30-day window of the season approximates "current conditions".
            first_30 = values[:30]
            cumulative_rainfall_30d = float(first_30.sum())
            dry_spell_max = longest_dry_spell(first_30)
            rainfall_variability = float(np.std(first_30))

            # Anomaly: season's first-30-day total vs the matching baseline window.
            season_doys = season_df["date"].dt.dayofyear.to_numpy()[:30]
            baseline_sum = float(baseline.reindex(season_doys).fillna(0).sum())
            anomaly_pct = (
                (cumulative_rainfall_30d / baseline_sum) * 100 if baseline_sum > 0 else 0.0
            )

            # "Forecast" proxy from the historical record: the 7/14 days that
            # immediately follow the first-30-day window.
            next_14 = values[30:44]
            forecast_7d_total = float(next_14[:7].sum())
            forecast_14d_total = float(next_14[:14].sum())
            forecast_dry_spell = longest_dry_spell(next_14)

            onset_week = compute_onset_week(season_df)

            # week_of_season measured at the assessment point (end of first 30 days).
            week_of_season = 4

            rows.append(
                {
                    "year": int(year),
                    "season_label": "MAM" if season_code == 0 else "OND",
                    "onset_week": int(onset_week),
                    "cumulative_rainfall_30d": round(cumulative_rainfall_30d, 2),
                    "dry_spell_max": int(dry_spell_max),
                    "rainfall_variability": round(rainfall_variability, 2),
                    "anomaly_pct": round(anomaly_pct, 2),
                    "forecast_7d_total": round(forecast_7d_total, 2),
                    "forecast_14d_total": round(forecast_14d_total, 2),
                    "forecast_dry_spell": int(forecast_dry_spell),
                    "season": int(season_code),
                    "week_of_season": int(week_of_season),
                }
            )

    return pd.DataFrame(rows)
