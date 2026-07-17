"""Label generation for the MawinguOps planting model.

Labels are derived programmatically from FAO maize water-requirement thresholds
(FAO Irrigation and Drainage Paper 56), NOT from observed yield data. Each
engineered season row is mapped to one of three classes using a three-tier rule
tuned for semi-arid Machakos (where short dry spells inside the first 30 days
are normal, not a planting failure):

  DO_NOT_PLANT - clearly unsuitable: almost no germination rain, OR a very long
                 (>12 day) dry spell now or in the next two weeks.
  WAIT         - marginal: germination rain below target, a >7 day current dry
                 spell, a moderate (6-12 day) forecast dry spell, or a dry
                 2-week outlook. Reassess next week.
  PLANT_NOW    - germination + early-stage needs met and the next 2 weeks look
                 adequately wet with no notable dry spell.

FAO maize thresholds used:
  Germination (week 1-2):   >= 25mm total, no dry spell > 7 days
  Vegetative  (week 3-8):   >= 25mm per 2-week window
  Tasseling/grain fill (week 9-12): >= 30mm per 2-week window (most sensitive)

Note on tiering: a >7 day current dry spell pushes a season to WAIT (not
DO_NOT_PLANT). Over a 30-day window in Machakos a 7+ day gap is common, so
treating it as an outright failure mislabels most seasons. Only the severe
(>12 day) case is a hard failure.
"""

import pandas as pd

# FAO-derived thresholds (mm and days).
GERMINATION_MIN_MM = 25.0
GERMINATION_BORDERLINE_MM = 30.0  # below this (but above min) is "borderline"
GERMINATION_MAX_DRY_DAYS = 7
EARLY_2WEEK_MIN_MM = 25.0

# Hard-failure thresholds (clearly unsuitable conditions).
HARD_FAIL_MIN_MM = 15.0       # almost no germination rain
HARD_FAIL_DRY_DAYS = 12       # severe current or forecast dry spell


def label_row(row):
    """Return PLANT_NOW / WAIT / DO_NOT_PLANT for one engineered feature row."""
    germination_mm = row["cumulative_rainfall_30d"]
    dry_spell_max = row["dry_spell_max"]
    forecast_14d = row["forecast_14d_total"]
    forecast_dry_spell = row["forecast_dry_spell"]

    # --- DO_NOT_PLANT: clearly unsuitable ---------------------------------------
    if (
        germination_mm < HARD_FAIL_MIN_MM
        or dry_spell_max > HARD_FAIL_DRY_DAYS
        or forecast_dry_spell > HARD_FAIL_DRY_DAYS
    ):
        return "DO_NOT_PLANT"

    # --- WAIT: marginal, reassess next week -------------------------------------
    if (
        germination_mm < GERMINATION_MIN_MM
        or dry_spell_max > GERMINATION_MAX_DRY_DAYS
        or 6 <= forecast_dry_spell <= HARD_FAIL_DRY_DAYS
        or germination_mm < GERMINATION_BORDERLINE_MM
        or forecast_14d < EARLY_2WEEK_MIN_MM
    ):
        return "WAIT"

    # --- PLANT_NOW: needs met and a wet, stable 2-week outlook -------------------
    if forecast_14d >= EARLY_2WEEK_MIN_MM and forecast_dry_spell < 6:
        return "PLANT_NOW"

    return "WAIT"


def generate_labels(features_df):
    """Return a Series of labels aligned to features_df rows."""
    return features_df.apply(label_row, axis=1).rename("label")


def label_distribution(labels):
    """Convenience: value counts of the label Series as a dict."""
    return labels.value_counts().to_dict()
