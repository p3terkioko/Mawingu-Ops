"""Derive plain-language "reasoning facts" for the weekly advisory.

Takes the raw pipeline outputs (trigger category, feature snapshot, onset
validation) and returns only the facts whose threshold was actually crossed
this cycle, phrased the way a farmer would say them — no numbers, no %, no
"SPI", no "mm". The LLM prompt and the deterministic fallback both build their
REASON section exclusively from these facts, so the advisory is explainable:
every sentence traces back to a specific crossed threshold.

Thresholds are imported from ml/labels.py (FAO-derived) — the same numbers the
model was trained on — so the explanation can never drift from the decision.
"""

import os
import sys

# ml/ is a sibling of pipeline/; make its thresholds importable.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ml"))

from labels import (  # noqa: E402
    EARLY_2WEEK_MIN_MM,
    GERMINATION_MAX_DRY_DAYS,
    HARD_FAIL_DRY_DAYS,
)

# Each fact is phrased in both languages: English feeds the LLM prompt, and
# both feed the deterministic fallback templates.
TRIGGER_FACTS = {
    "mild": {
        "en": "rain has been a little below normal for this time of year",
        "sw": "mvua imekuwa chini kidogo ya kawaida kwa wakati huu wa mwaka",
    },
    "moderate": {
        "en": "rain has been well below normal for this time of year",
        "sw": "mvua imekuwa chini sana ya kawaida kwa wakati huu wa mwaka",
    },
    "severe": {
        "en": "rain has been far below normal for this time of year",
        "sw": "mvua imekuwa pungufu mno kuliko kawaida kwa wakati huu wa mwaka",
    },
    "extreme": {
        "en": "rain has been far below normal for this time of year",
        "sw": "mvua imekuwa pungufu mno kuliko kawaida kwa wakati huu wa mwaka",
    },
}

TRIGGER_NORMAL = {
    "en": "rain has been about normal for this time of year",
    "sw": "mvua imekuwa ya kawaida kwa wakati huu wa mwaka",
}

FORECAST_TOO_DRY = {
    "en": "the rain expected over the next two weeks is not enough for seeds to sprout safely",
    "sw": "mvua inayotarajiwa wiki mbili zijazo haitoshi kuotesha mbegu salama",
}

FORECAST_GOOD = {
    "en": "good rain is expected over the next two weeks",
    "sw": "mvua nzuri inatarajiwa wiki mbili zijazo",
}

FORECAST_LONG_DRY_SPELL = {
    "en": "a long dry spell is possible in the coming weeks",
    "sw": "kipindi kirefu bila mvua kinaweza kutokea wiki zijazo",
}

OBSERVED_DRY_STRETCH = {
    "en": "there has already been a dry stretch of more than a week",
    "sw": "tayari kumekuwa na zaidi ya wiki moja bila mvua",
}

ONSET_FACTS = {
    "onset_on_time": {
        "en": "the season's rains have started",
        "sw": "mvua za msimu zimeanza",
    },
    "onset_not_settled": {
        "en": "the rains have started, but conditions are not fully settled yet",
        "sw": "mvua zimeanza, lakini hali bado haijatulia kikamilifu",
    },
    "awaiting_onset": {
        "en": "the season's rains have not properly started yet",
        "sw": "mvua za msimu bado hazijaanza kikamilifu",
    },
    "season_delayed": {
        "en": "the rains are late this season",
        "sw": "mvua za msimu zimechelewa mwaka huu",
    },
}


def derive_facts(trigger_category, features, onset_status, agreement, recommendation):
    """Ordered list of the 1-3 facts that crossed a threshold this cycle.

    Parameters mirror what the pipeline already stores: trigger_category from
    alert_levels, the features_snapshot dict from planting_recommendations,
    onset_status/agreement from onset_validation, and the model recommendation.

    Returns a list of {"en": ..., "sw": ...} dicts, most decision-relevant
    first. Never empty: when nothing negative crossed, the positive/normal
    facts explain a PLANT_NOW (or a cautious WAIT).
    """
    features = features or {}
    forecast_14d = float(features.get("forecast_14d_total", 0.0))
    forecast_dry_spell = int(features.get("forecast_dry_spell", 0))
    dry_spell_max = int(features.get("dry_spell_max", 0))

    negative = []
    if forecast_14d < EARLY_2WEEK_MIN_MM:
        negative.append(FORECAST_TOO_DRY)
    if forecast_dry_spell > HARD_FAIL_DRY_DAYS:
        negative.append(FORECAST_LONG_DRY_SPELL)
    if dry_spell_max > GERMINATION_MAX_DRY_DAYS:
        negative.append(OBSERVED_DRY_STRETCH)
    if trigger_category in TRIGGER_FACTS:
        negative.append(TRIGGER_FACTS[trigger_category])
    if onset_status == "awaiting_onset":
        negative.append(ONSET_FACTS["awaiting_onset"])
    elif onset_status == "season_delayed":
        negative.append(ONSET_FACTS["season_delayed"])

    positive = []
    if onset_status == "onset_detected":
        if agreement == "conservative":
            positive.append(ONSET_FACTS["onset_not_settled"])
        else:
            positive.append(ONSET_FACTS["onset_on_time"])
    if forecast_14d >= EARLY_2WEEK_MIN_MM:
        positive.append(FORECAST_GOOD)
    if trigger_category == "none":
        positive.append(TRIGGER_NORMAL)

    if recommendation == "PLANT_NOW":
        # Lead with what makes planting safe; append the one negative (if any)
        # the farmer should still watch.
        facts = positive + negative
    else:
        # WAIT / DO_NOT_PLANT: lead with what blocks planting.
        facts = negative + positive

    return facts[:3] if facts else [TRIGGER_NORMAL]
