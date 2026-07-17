# MawinguOps — Phase 2 Handoff

> **Audience:** the agent/developer picking up Phase 2.
> **Phase 2 focus:** (1) **improve the advisories**, and (2) **formalize maize as the MVP crop** the system advises for.
> This document records **what is already implemented** (and verified) and **what is still to come**.

---

## 1. What MawinguOps is

A USSD-based early-warning and planting-advisory system for smallholder **maize** farmers in **Machakos County, Kenya**. It answers one question: *"Should I plant now, wait, or not plant this season?"*

Pipeline (runs weekly, writes to PostgreSQL) → USSD handler (reads only):

```
CHIRPS (Earth Engine) ─┐
Open-Meteo forecast ───┼─▶ compute_anomaly ─▶ run_model (RandomForest) ─▶ generate_advisory (Llama/Groq) ─▶ Postgres
                       │                                                                                    │
                       └────────────────────────────────────────────────────────────────── USSD API (read-only) + Dashboard
```

The USSD session **never runs ML or calls the LLM live** — it only reads pre-computed rows. Hackathon: IGAD Husika Hackathon 2026.

---

## 2. What is IMPLEMENTED (and verified working)

### Database — ✅ complete
- `api/src/db/migrations/001_init.sql` — 9 tables (farmers, rainfall_actuals, rainfall_baseline, forecasts, alert_levels, planting_recommendations, advisories, ussd_sessions, advisory_logs). Migrated and live (Postgres on **localhost:5433**, db `mawinguops`).

### Data pipeline — ✅ implemented
- `pipeline/fetch_chirps.py` — CHIRPS daily actuals + 1998–2020 baseline via Earth Engine. **Needs interactive EE auth to run** (`earthengine authenticate`, `EE_PROJECT=fitcheck-489316`).
- `pipeline/fetch_forecast.py` — 14-day Open-Meteo forecast. **No key needed; verified pulling real data.**
- `pipeline/compute_anomaly.py` — 30-day anomaly → alert level (GREEN/YELLOW/ORANGE/RED). Verified.
- `pipeline/run_model.py` — engineers 10 features from DB, runs the model, stores recommendation + JSONB feature snapshot. Verified.
- `pipeline/generate_advisory.py` — Llama advisory (via Groq's OpenAI-compatible API) in Swahili + English, **with a deterministic template fallback** when `GROQ_API_KEY` is unset. Verified (currently using the fallback).
- `pipeline/run_pipeline.sh` — orchestrates all five steps; documents the WSL cron setup.

### ML — ✅ trained & runtime-compatible
- `ml/features.py` — engineers 10 features per season (MAM & OND). `FEATURE_NAMES` is the canonical order, shared with `run_model.py`.
- `ml/labels.py` — **three-tier FAO-maize labeling** (current production logic, see §4). Produces a balanced **WAIT 23 / DO_NOT_PLANT 18 / PLANT_NOW 15** on the 56-season archive.
- `ml/train.py`, `ml/evaluate.py` — train/evaluate with crash-safe reporting.
- `ml/models/` — `planting_model.pkl`, `label_encoder.pkl`, `feature_importance.json` (trained locally on numpy 1.26 so the pipeline can deserialize them — **do not replace with a Colab numpy-2.x pickle**, it won't load).
- `notebook/mawinguops_training.ipynb` — canonical Colab notebook, in sync with `features.py`/`labels.py`.

### API — ✅ implemented & verified live
- `api/src/index.js` — Express app; loads `.env` from repo root.
- `api/src/routes/ussd.js` — full USSD state machine: INITIAL → LANGUAGE_SELECT → NAME_INPUT → MAIN_MENU → (Weather Alert | Planting Advisory | Exit). Plain-text `CON`/`END` responses, 182-char clamp. **Tested live through the Africa's Talking sandbox** (`*384*2772#`).
- `api/src/routes/health.js` — `GET /health` and `GET /api/status` (the dashboard's data source).
- `api/src/services/{farmer,session,advisory}.js` — DB access for the handler.

### Dashboard — ✅ builds & runs
- `dashboard/` — Vite + React + Tailwind + Recharts. `AlertBadge`, `RainfallChart`, `RecommendationCard`. Proxy target configurable via `VITE_API_PROXY` (default `:3000`).

### Current live data state (as of handoff)
- `rainfall_actuals` — **real CHIRPS** 1998-01-01 … **2025-12-30** (loaded from `pipeline/data/chirps_machakos.csv`).
- `rainfall_baseline` — **real** day-of-year climatology (`pipeline/data/baseline_machakos.csv`).
- `forecasts` — **real** Open-Meteo 14-day.
- `alert_levels` / `planting_recommendations` / `advisories` — recomputed from the latest real CHIRPS window (Nov–Dec 2025): **ORANGE / WAIT (47%) / template advisory**.

---

## 3. Known limitations / tech debt (read before Phase 2)

| Area | Limitation |
|---|---|
| **Advisories** | Currently **template-generated**, not LLM — `GROQ_API_KEY` is unset in `.env`. Text is generic ("Subiri kidogo. Mvua ya siku 14 ni 69mm."). |
| **Data freshness** | Actuals end **Dec 2025** (CSV load). Current (live) actuals require the Earth Engine fetch, which needs interactive auth. |
| **Crop** | Maize is **implicit** — encoded only as FAO thresholds in `labels.py`. There is **no crop entity, no crop config, no crop column** anywhere. Single hard-wired crop. |
| **Location** | Machakos is hard-wired (`location='machakos'`, lat/lon in `.env`). |
| **Dead feature** | `week_of_season` has **0.0 importance** (hardcoded constant `4` in features). `season` is near-zero. |
| **Model skew** | `dry_spell_max` dominates importance (~0.43). |
| **Advisory length** | Constrained by USSD (≤182 chars). |
| **Ports** | API documented on 3000, but **port 3000 is taken by another app (Umami)** on this machine — run the API on **3100** (`PORT=3100 npm start`) and set `VITE_API_PROXY=http://localhost:3100` for the dashboard. |

---

## 4. Current maize labeling logic (the baseline to improve)

`ml/labels.py` — derived from **FAO Irrigation & Drainage Paper 56** maize water requirements. Thresholds (mm/days):

```
GERMINATION_MIN_MM        = 25.0    # germination needs >= 25mm
GERMINATION_BORDERLINE_MM = 30.0
GERMINATION_MAX_DRY_DAYS  = 7       # no dry spell > 7 days during germination
EARLY_2WEEK_MIN_MM        = 25.0
HARD_FAIL_MIN_MM          = 15.0    # near-zero rain -> DO_NOT_PLANT
HARD_FAIL_DRY_DAYS        = 12      # severe dry spell -> DO_NOT_PLANT
```

Three tiers:
1. **DO_NOT_PLANT** — clearly unsuitable: `<15mm`, or a `>12`-day current/forecast dry spell.
2. **WAIT** — marginal: below 25–30mm germination target, a `>7`-day current dry spell, a 6–12 day forecast dry spell, or a dry 2-week outlook.
3. **PLANT_NOW** — needs met + wet, stable 2-week outlook (`>=25mm` and forecast dry spell `<6`).

> Important context: a `>7`-day dry spell routes to **WAIT** (not DO_NOT_PLANT) on purpose — over a 30-day window in semi-arid Machakos a 7+ day gap is normal, so treating it as a hard failure mislabeled ~64% of seasons. This was the key tuning that balanced the classes. **Keep this rationale if you re-tune.**

Maize growth stages used (FAO):
- Germination (wk 1–2): ≥25mm, no dry spell >7d
- Vegetative (wk 3–8): ≥25mm / 2-week window
- Tasseling/grain-fill (wk 9–12): ≥30mm / 2-week window — most sensitive
- Maturation (wk 13–16): tolerates up to 14 dry days

---

## 5. PHASE 2 — what is to come

### Goal A — Improve the advisories

**Intent:** move from generic template text to genuinely useful, trustworthy, plain-language guidance for a low-literacy maize farmer.

Suggested work:
1. **Wire Llama/Groq for real.** Set `GROQ_API_KEY` (and optionally `GROQ_MODEL`, default `llama-3.3-70b-versatile`) and validate `generate_advisory.py` end-to-end (it already builds the prompt and inserts sw+en rows via Groq's OpenAI-compatible chat API; the fallback should become the exception, not the default). Add retry/timeout/logging.
2. **Prompt engineering** for `generate_advisory.py`:
   - Lead with the **action verb** (Panda / Subiri / Usipande) — already required; enforce/validate it.
   - Make the *reason* concrete and local (rainfall vs normal, dry-spell risk) without jargon.
   - Respect the 120-char target / 182-char USSD ceiling; validate output length and regenerate/trim if over.
   - Keep Swahili natural and simple; consider Kamba-language support (Machakos is Kamba-speaking) as a stretch.
3. **Growth-stage awareness.** The advisory currently only reflects the planting decision. Phase 2 should tailor wording to the relevant maize stage (germination vs grain-fill sensitivity) and the recommendation.
4. **Actionable next step.** For WAIT/DO_NOT_PLANT, suggest *what to do* (e.g. reassess next week, consider a shorter-maturity variety, drought-tolerant options) — within USSD limits, possibly across menu pages.
5. **Confidence communication.** Translate the model confidence into farmer-friendly certainty language rather than a raw `%`.
6. **Quality guardrails.** Add a validation/fallback layer so a bad LLM response (too long, wrong language, missing action) never reaches a farmer.

Relevant files: `pipeline/generate_advisory.py` (`SYSTEM_PROMPT` + `build_prompt` + `call_groq` + fallback), `api/src/routes/ussd.js` (how advisory text is rendered/clamped), `api/src/services/advisory.js` (read path + language fallback).

### Goal B — Maize as the MVP crop (make the crop a first-class concept)

**Intent:** maize is currently *implicit*. Phase 2 should make it **explicit and the official MVP crop**, structured so additional crops can be added later without rewrites.

Suggested work:
1. **Crop profile / config.** Introduce a maize crop profile capturing: season windows (MAM/OND), growth-stage water requirements, dry-spell tolerances, maturity period (short ~90d vs medium ~120d varieties). Start as a config/constant module; optionally a `crops` table later.
2. **Parameterize the thresholds** in `ml/labels.py` by the maize profile instead of bare module constants, so the agronomic numbers live in one named place.
3. **Surface the crop in outputs.** Advisories and recommendations should explicitly reference maize ("mahindi"), and the schema/feature snapshot could carry a `crop` field (default `maize`) to be future-proof.
4. **Variety awareness (stretch).** Let the recommendation account for maize maturity class — e.g. a late-onset season may still suit a short-maturity variety. This is high-value for Machakos where short rains are unreliable.
5. **Keep it MVP.** One crop (maize), one location (Machakos). Don't generalize prematurely — just make maize explicit and the abstraction seams clean.

Relevant files: `ml/labels.py`, `ml/features.py`, `pipeline/run_model.py`, `pipeline/generate_advisory.py`, plus the `advisories`/`planting_recommendations` schema if a crop column is added.

---

## 6. Environment notes for the next agent

- **Repo:** `/home/pmk/hack/mawinguops`
- **DB:** `postgresql://postgres:<pw>@localhost:5433/mawinguops` (note port **5433**). Credentials live in `.env` (gitignored).
- **Python:** use the venv at `.venv` (`source .venv/bin/activate`); `numpy==1.26.0` is pinned so the model pickle loads — don't bump it without re-training the model.
- **Run API:** `cd api && PORT=3100 npm start` (3000 is occupied on this box).
- **Run dashboard:** `cd dashboard && VITE_API_PROXY=http://localhost:3100 npm run dev` → http://localhost:5173.
- **USSD live test:** Africa's Talking sandbox channel, dial `*384*2772#`; callback URL is an ngrok tunnel to the API (`/ussd`). ngrok URL is ephemeral — re-tunnel and update the AT callback each session.
- **Earth Engine:** `EE_PROJECT=fitcheck-489316`; run `earthengine authenticate` once for real current actuals.
- **Llama/Groq:** set `GROQ_API_KEY` in `.env` (model defaults to `llama-3.3-70b-versatile` via `GROQ_MODEL`) to enable real advisories (Goal A).

---

## 7. Definition of done for Phase 2

- Advisories are Llama-generated (via Groq), maize- and growth-stage-aware, validated for length/language/action, with a safe fallback.
- Maize is an explicit, named crop profile that the labeling, model, and advisory all reference; adding a second crop later is a config change, not a rewrite.
- End-to-end still verified: pipeline run → DB → USSD (`*384*2772#`) and dashboard show real, maize-specific, improved advisories.
