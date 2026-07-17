#!/usr/bin/env python3
"""Generate plain-language planting advisories with Llama via Groq.

Reads the latest alert level, planting recommendation, forecast summary and
onset validation, derives the plain-language reasoning facts whose thresholds
were actually crossed this cycle (advisory_facts.py), then asks a Llama model
(hosted on Groq's OpenAI-compatible API) for a Swahili and an English advisory.
Both are written to the advisories table with valid_until = NOW() + 7 days.

Every advisory has the same 4-part structure, one canonical version for all
channels (USSD paginates it, SMS/email/web show it whole):

    [ACTION]      lead verb (Panda / Subiri / Usipande / Andaa)
    [REASON]      built ONLY from the derived facts
    [CONSEQUENCE] what happens if the farmer ignores this
    [NEXT STEP]   what to do meanwhile / when to check again

A guardrail rejects any output containing %, mm, SPI or similar jargon, and
enforces the canonical length band. If GROQ_API_KEY is missing, the API fails,
or no attempt validates, a deterministic template fallback with the SAME 4-part
structure is stored, so the safety net is not a regression.
"""

import os
import re
import sys
from datetime import datetime, timezone

import requests
import psycopg2
from dotenv import load_dotenv

from advisory_facts import derive_facts
from season import season_phase

load_dotenv()

LOCATION = "machakos"
CROP = "maize"            # MawinguOps MVP crop
CROP_SW = "mahindi"      # how the crop is named to the farmer (Swahili)
CROP_EN = "maize"

# Canonical advisory length band. One version for every channel; the USSD
# handler splits it across two 182-char screens at a sentence boundary.
MIN_CHARS = 260
MAX_CHARS = 320

# Jargon guardrail: none of these may reach a farmer. Mechanical check, not
# just a prompt instruction. (asilimia/milimita = percent/millimetre in
# Swahili.)
JARGON_RE = re.compile(
    r"%|\bmm\b|\bspi\b|\bmilimita\b|\basilimia\b|\bindex\b|\banomaly\b",
    re.IGNORECASE,
)

# Per-recommendation action: the advisory MUST lead with this verb. `kw` is the
# lowercase keyword we validate the model output against.
ACTIONS = {
    "PLANT_NOW": {
        "sw": "Panda mahindi sasa", "sw_kw": "panda",
        "en": "Plant maize now",    "en_kw": "plant",
    },
    "WAIT": {
        "sw": "Subiri kupanda",  "sw_kw": "subiri",
        "en": "Wait to plant",   "en_kw": "wait",
    },
    "DO_NOT_PLANT": {
        "sw": "Usipande sasa",    "sw_kw": "usipande",
        "en": "Do not plant now", "en_kw": "do not plant",
    },
    # Off-season: there is no planting decision, so the advisory pivots to
    # preparing for the next window. Leads with "prepare".
    "PREPARE": {
        "sw": "Andaa shamba",      "sw_kw": "andaa",
        "en": "Prepare your land", "en_kw": "prepare",
    },
}

# Groq exposes an OpenAI-compatible chat completions endpoint.
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_ENDPOINT = os.getenv(
    "GROQ_ENDPOINT", "https://api.groq.com/openai/v1/chat/completions"
)
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

SYSTEM_PROMPT = (
    "You are an agricultural extension advisor for smallholder maize farmers "
    "in Machakos County, Kenya. You write short, plain-language planting "
    "advisories that a farmer with basic literacy can act on immediately. "
    "Always name the crop (maize / mahindi). Lead with the action. Never use "
    "percentages, millimetres, index names or any technical vocabulary. Never "
    "use English loan-words when writing in Swahili."
)


def log(message):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {message}", flush=True)


def get_connection():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        log("ERROR: DATABASE_URL is not set")
        sys.exit(1)
    return psycopg2.connect(database_url)


def get_latest_alert(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT alert_level, anomaly_pct, trigger_category
            FROM alert_levels
            WHERE location = %s
            ORDER BY computed_at DESC
            LIMIT 1
            """,
            (LOCATION,),
        )
        row = cur.fetchone()
    if not row:
        return None
    return {
        "alert_level": row[0],
        "anomaly_pct": float(row[1]),
        "trigger_category": row[2],
    }


def get_latest_recommendation(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT recommendation, confidence_score, features_snapshot
            FROM planting_recommendations
            WHERE location = %s
            ORDER BY computed_at DESC
            LIMIT 1
            """,
            (LOCATION,),
        )
        row = cur.fetchone()
    if not row:
        return None
    return {
        "recommendation": row[0],
        "confidence_score": float(row[1]),
        "features": row[2] or {},
    }


def get_latest_onset(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT onset_status, agreement
            FROM onset_validation
            WHERE location = %s
            ORDER BY computed_at DESC
            LIMIT 1
            """,
            (LOCATION,),
        )
        row = cur.fetchone()
    if not row:
        return {"onset_status": None, "agreement": None}
    return {"onset_status": row[0], "agreement": row[1]}


def get_anchor_date(conn):
    """Most recent actual date, capped at today — keeps the advisory's season
    anchored to the latest available data, consistent with the other steps."""
    today = datetime.now(timezone.utc).date()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT MAX(date) FROM rainfall_actuals WHERE location = %s", (LOCATION,)
        )
        row = cur.fetchone()
    latest = row[0] if row and row[0] else None
    return min(latest, today) if latest else today


def action_for(season, rec):
    """Off-season pivots to PREPARE; in-season uses the model recommendation."""
    if season["phase"] == "off_season":
        return ACTIONS["PREPARE"]
    return ACTIONS.get(rec["recommendation"], ACTIONS["WAIT"])


def build_prompt(language, rec, season, facts):
    lang_word = "Swahili" if language == "sw" else "English"
    crop_word = CROP_SW if language == "sw" else CROP_EN
    action = action_for(season, rec)
    lead = action["sw"] if language == "sw" else action["en"]

    lang_rule = (
        "Write ONLY in Swahili — no English words at all."
        if language == "sw"
        else "Write ONLY in simple English."
    )

    if season["phase"] == "off_season":
        window_name = (
            season["next_window_sw"] if language == "sw" else season["next_window_en"]
        )
        return f"""It is BETWEEN planting seasons for a {crop_word} farmer in Machakos.
The next planting season is "{window_name}", about {season['weeks_to_window']} weeks away.
Do NOT tell the farmer to plant now.

Write ONE paragraph in {lang_word} of 48 to 55 words (do NOT write fewer than
48 words), with these 4 parts in order:
1. ACTION - the very first words must be: "{lead}".
2. REASON - why now is the time to prepare: the "{window_name}" season is coming and a farm prepared early does better.
3. CONCRETE TASK - one specific preparation the farmer should do now (till the land, clear the plot, buy early-maturing {crop_word} seed).
4. NEXT STEP - the "{window_name}" season is about {season['weeks_to_window']} weeks away; dial *384# weekly for the latest advisory.

Rules: {lang_rule} Name the crop ({crop_word}). No percentages, no millimetres,
no technical words, no lists or numbering in the output — one flowing paragraph.
Return only the advisory text, nothing else."""

    facts_lines = "\n".join(f"- {f['en']}" for f in facts)
    return f"""Facts about current conditions for {crop_word} in Machakos (already in
plain language — your REASON must use ONLY these facts, no other data):
{facts_lines}

The decision for the farmer is: {rec['recommendation']}.

Write ONE paragraph in {lang_word} of 48 to 55 words (do NOT write fewer than
48 words), with these 4 parts in order:
1. ACTION - the very first words must be: "{lead}".
2. REASON - one or two short sentences expressing the facts above in {lang_word}.
3. CONSEQUENCE - one concrete thing that happens if the farmer ignores this advice (seeds failing to sprout, seed money wasted, or missing the best rains and harvesting less).
4. NEXT STEP - what to do with their seed/farm meanwhile, and dial *384# next week for the new advisory.

Rules: {lang_rule} Name the crop ({crop_word}). No percentages, no millimetres,
no technical words, no lists or numbering in the output — one flowing paragraph.
Return only the advisory text, nothing else."""


def call_groq(prompt, retries=2):
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY not set")
    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.4,
        "max_tokens": 220,
    }
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    last_exc = None
    for attempt in range(1, retries + 1):
        try:
            response = requests.post(
                GROQ_ENDPOINT, headers=headers, json=payload, timeout=30
            )
            # Retry transient server/rate-limit errors; fail fast on 4xx auth.
            if response.status_code in (429, 500, 502, 503, 504):
                raise requests.HTTPError(f"transient {response.status_code}")
            response.raise_for_status()
            data = response.json()
            text = data["choices"][0]["message"]["content"].strip()
            # Collapse whitespace/newlines into one flowing paragraph.
            return " ".join(text.split())
        except (requests.RequestException, KeyError, ValueError) as exc:
            last_exc = exc
            log(f"  groq attempt {attempt}/{retries} failed: {exc}")
    raise RuntimeError(f"groq call failed after {retries} attempts: {last_exc}")


def validate_advisory(text, language, rec, season):
    """Guardrail: a bad LLM response must never reach a farmer.

    Returns (ok, reason). Checks non-empty, the canonical length band, leads
    with the correct action verb, names the crop, and contains no jargon
    (%, mm, SPI, ...).
    """
    if not text:
        return False, "empty"
    if len(text) > MAX_CHARS:
        return False, f"too long ({len(text)} > {MAX_CHARS})"
    if len(text) < MIN_CHARS:
        return False, f"too short ({len(text)} < {MIN_CHARS})"
    match = JARGON_RE.search(text)
    if match:
        return False, f"contains jargon '{match.group(0)}'"
    action = action_for(season, rec)
    kw = action["sw_kw"] if language == "sw" else action["en_kw"]
    low = text.lower()
    # Action verb must appear at the very start (first ~15 chars) so the farmer
    # reads what to do first.
    if kw not in low[:15]:
        return False, f"missing/late action verb '{kw}'"
    crop_kw = CROP_SW if language == "sw" else CROP_EN
    if crop_kw not in low:
        return False, f"does not name the crop '{crop_kw}'"
    return True, "ok"


# --- Deterministic fallback --------------------------------------------------
# Same 4-part structure as the LLM path, assembled from the same facts, so the
# safety net is equally good when Groq is unavailable.

CONSEQUENCES = {
    "PLANT_NOW": {
        "en": "If you delay planting, you may miss the best of the rains and harvest much less at the end of the season.",
        "sw": "Ukichelewa kupanda, unaweza kukosa mvua nzuri na mavuno yako yatapungua sana mwishoni mwa msimu.",
    },
    "WAIT": {
        "en": "If you plant now, the seeds may fail to sprout and the money you spent on them will be wasted.",
        "sw": "Ukipanda sasa, mbegu zinaweza kushindwa kuota na pesa ulizotumia kununua mbegu zitapotea bure.",
    },
    "DO_NOT_PLANT": {
        "en": "If you plant now, the crop is very likely to dry up and die, wasting your seed and your labour.",
        "sw": "Ukipanda sasa, mimea ina uwezekano mkubwa wa kukauka na kufa, na mbegu na nguvu zako zitapotea bure.",
    },
}

NEXT_STEPS = {
    "PLANT_NOW": {
        "en": "Finish planting your maize within the next few days and dial *384# next week for the new advisory.",
        "sw": "Maliza kupanda mahindi yako ndani ya siku chache zijazo na upige *384# wiki ijayo kupata ushauri mpya.",
    },
    "WAIT": {
        "en": "Keep your maize seed stored safely and dial *384# next week for the new advisory.",
        "sw": "Endelea kutunza mbegu zako za mahindi vizuri na upige *384# wiki ijayo kupata ushauri mpya.",
    },
    "DO_NOT_PLANT": {
        "en": "Hold on to your maize seed and dial *384# next week for the new advisory.",
        "sw": "Hifadhi mbegu zako za mahindi na upige *384# wiki ijayo kupata ushauri mpya.",
    },
}

ACTION_SENTENCES = {
    "PLANT_NOW": {"en": "Plant maize now.", "sw": "Panda mahindi sasa."},
    "WAIT": {"en": "Wait to plant your maize.", "sw": "Subiri kupanda mahindi yako."},
    "DO_NOT_PLANT": {"en": "Do not plant maize now.", "sw": "Usipande mahindi sasa."},
}

FILLERS = {
    "en": [
        "Rain can change quickly at this time of year, so checking every week protects your crop.",
        "Talk to your neighbours so they check the advisory too.",
    ],
    "sw": [
        "Mvua hubadilika haraka wakati huu wa mwaka, hivyo kuangalia kila wiki kunalinda shamba lako.",
        "Ambia majirani zako nao waangalie ushauri huu.",
    ],
}

JOIN_WORD = {"en": ", and ", "sw": ", na "}


def _cap(sentence_fragment):
    return sentence_fragment[0].upper() + sentence_fragment[1:]


def _pad_to_band(text, language):
    """Append neutral filler sentences until the text reaches MIN_CHARS."""
    for filler in FILLERS[language]:
        if len(text) >= MIN_CHARS:
            break
        text = f"{text} {filler}"
    return text


def fallback_advisory(language, rec, season, facts):
    """Deterministic, always-valid advisory used when Groq is unavailable or
    every LLM attempt fails validation. Same 4-part structure as the LLM path,
    guaranteed inside the [MIN_CHARS, MAX_CHARS] band."""
    if season["phase"] == "off_season":
        weeks = max(1, season["weeks_to_window"] or 1)
        window = season["next_window_sw"] if language == "sw" else season["next_window_en"]
        if language == "sw":
            text = (
                f"Andaa shamba lako la mahindi sasa. Msimu wa {window} unakaribia, "
                f"na shamba lililoandaliwa mapema huleta mavuno bora. Lima na "
                f"safisha shamba, na ununue mbegu za mahindi zinazokomaa mapema. "
                f"Msimu wa {window} ni kama wiki {weeks} kutoka sasa; piga *384# "
                f"kila wiki kupata ushauri mpya."
            )
        else:
            text = (
                f"Prepare your maize land now. The {window} season is coming, and "
                f"a farm prepared early gives a better harvest. Clear and till "
                f"your plot and buy early-maturing maize seed in good time. The "
                f"{window} are about {weeks} weeks away; dial *384# each week for "
                f"the latest advisory."
            )
        return _pad_to_band(text, language)[:MAX_CHARS]

    key = rec["recommendation"] if rec["recommendation"] in ACTION_SENTENCES else "WAIT"
    action = ACTION_SENTENCES[key][language]
    consequence = CONSEQUENCES[key][language]
    next_step = NEXT_STEPS[key][language]

    # Try two facts in the reason; drop to one if the paragraph overshoots.
    for n_facts in (2, 1):
        chosen = [f[language] for f in facts[:n_facts]]
        reason = _cap(JOIN_WORD[language].join(chosen)) + "."
        text = f"{action} {reason} {consequence} {next_step}"
        text = _pad_to_band(text, language)
        if len(text) <= MAX_CHARS:
            return text
    # Still over: hard-trim at the last sentence boundary inside the band.
    cut = text[:MAX_CHARS]
    dot = cut.rfind(". ")
    return cut[: dot + 1] if dot >= MIN_CHARS - 1 else cut


def store_advisory(conn, language, alert, rec, text):
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO advisories
                (location, crop, language, alert_level, recommendation, advisory_text, valid_until)
            VALUES (%s, %s, %s, %s, %s, %s, NOW() + INTERVAL '7 days')
            """,
            (LOCATION, CROP, language, alert["alert_level"], rec["recommendation"], text),
        )
    conn.commit()


def generate_for_language(conn, language, alert, rec, season, facts, attempts=3):
    """Generate, validate, and store one advisory.

    Tries the LLM up to `attempts` times (each output must pass the guardrail).
    If the call errors or no attempt validates, stores the deterministic
    fallback so every channel always has safe, action-first, 4-part text.
    """
    prompt = build_prompt(language, rec, season, facts)
    for attempt in range(1, attempts + 1):
        try:
            text = call_groq(prompt)
        except Exception as exc:  # noqa: BLE001 - fall back gracefully
            log(f"[{language}] Groq unavailable ({exc}); using fallback")
            break
        ok, reason = validate_advisory(text, language, rec, season)
        if not ok and reason.startswith("too short"):
            # Deterministic repair: models under-count characters, so a good
            # but short output is padded with the fallback's neutral filler
            # sentences instead of being thrown away. Try the padding options
            # smallest-first and keep the first that lands inside the band.
            short_f, long_f = FILLERS[language][1], FILLERS[language][0]
            for extra in (short_f, long_f, f"{short_f} {long_f}"):
                candidate = f"{text} {extra}"
                ok, reason = validate_advisory(candidate, language, rec, season)
                if ok:
                    text = candidate
                    break
        if ok:
            log(f"[{language}] Llama ({GROQ_MODEL}) advisory ({len(text)} chars): {text}")
            store_advisory(conn, language, alert, rec, text)
            return
        log(f"[{language}] attempt {attempt}/{attempts} rejected ({reason}): {text}")

    text = fallback_advisory(language, rec, season, facts)
    log(f"[{language}] Fallback advisory ({len(text)} chars): {text}")
    store_advisory(conn, language, alert, rec, text)


def main():
    log("Starting advisory generation")
    conn = get_connection()
    try:
        alert = get_latest_alert(conn)
        rec = get_latest_recommendation(conn)
        if not alert or not rec:
            log("ERROR: missing alert level or recommendation — run earlier pipeline steps first")
            sys.exit(1)

        onset = get_latest_onset(conn)
        anchor = get_anchor_date(conn)
        season = season_phase(anchor)
        facts = derive_facts(
            alert.get("trigger_category"),
            rec.get("features"),
            onset.get("onset_status"),
            onset.get("agreement"),
            rec.get("recommendation"),
        )
        log(f"Anchor date: {anchor} | Season: {season['label']} ({season['phase']})")
        log("Facts: " + " | ".join(f["en"] for f in facts))

        generate_for_language(conn, "sw", alert, rec, season, facts)
        generate_for_language(conn, "en", alert, rec, season, facts)

        log("Advisory generation complete")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
