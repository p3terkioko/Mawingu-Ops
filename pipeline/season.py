"""Single source of truth for the Machakos planting-season calendar.

Every farmer-facing component (run_model.py, validate_onset.py,
generate_advisory.py, broadcast_advisory.py) must derive "are we in a planting
season, and if not, when is the next one?" from season_phase() below — never
from its own month arithmetic. Before this module existed the boundaries were
defined four different ways in four files and the channels contradicted each
other (USSD said WAIT while the advisory said prepare).

Canonical windows (bimodal Kenyan calendar, Machakos):

    long rains  (MAM, "masika"): Mar 1 - Jun 15
    short rains (OND, "vuli"):   Oct 1 - Dec 31

The MAM end of Jun 15 matches validate_onset.py's realistic growing-season
window. ml/features.py intentionally keeps a tighter Mar 1 - May 31 window for
TRAINING rows only (each row needs a complete 30-day assessment window inside
the season); that is a data-engineering choice, not a farmer-facing one.
"""

from datetime import date

SEASON_WINDOWS = {
    "long_rains": {
        "start": (3, 1),
        "end": (6, 15),
        "code": 0,
        "en": "long rains (MAM)",
        "sw": "masika",
        "label": "long-rains planting season (March-June, 'masika')",
    },
    "short_rains": {
        "start": (10, 1),
        "end": (12, 31),
        "code": 1,
        "en": "short rains (OND)",
        "sw": "vuli",
        "label": "short-rains planting season (October-December, 'vuli')",
    },
}


def season_bounds(name, year):
    """(start, end) dates of a named season in a given year."""
    spec = SEASON_WINDOWS[name]
    return date(year, *spec["start"]), date(year, *spec["end"])


def season_phase(anchor):
    """Classify a date against the canonical planting calendar.

    Returns a dict:
      phase            'in_season' | 'off_season'
      season           'long_rains' | 'short_rains' | None (off-season)
      label            human-readable phase description
      season_start     date the current season began (None off-season)
      next_window      next season name when off-season, else None
      next_window_en   e.g. "short rains (OND)"
      next_window_sw   e.g. "vuli"
      weeks_to_window  whole weeks until the next window opens (off-season only)
    """
    for name, spec in SEASON_WINDOWS.items():
        start, end = season_bounds(name, anchor.year)
        if start <= anchor <= end:
            return {
                "phase": "in_season",
                "season": name,
                "label": spec["label"],
                "season_start": start,
                "next_window": None,
                "next_window_en": None,
                "next_window_sw": None,
                "weeks_to_window": None,
            }

    # Off-season: the next window is MAM (Jan-Feb), OND (mid-Jun-Sep), or —
    # defensively — next year's MAM.
    mam_start = date(anchor.year, 3, 1)
    ond_start = date(anchor.year, 10, 1)
    if anchor < mam_start:
        nxt, target = "long_rains", mam_start
    elif anchor < ond_start:
        nxt, target = "short_rains", ond_start
    else:
        nxt, target = "long_rains", date(anchor.year + 1, 3, 1)

    spec = SEASON_WINDOWS[nxt]
    weeks = max(0, (target - anchor).days // 7)
    return {
        "phase": "off_season",
        "season": None,
        "label": f"between seasons — next window is the {spec['en']}",
        "season_start": None,
        "next_window": nxt,
        "next_window_en": spec["en"],
        "next_window_sw": spec["sw"],
        "weeks_to_window": weeks,
    }
