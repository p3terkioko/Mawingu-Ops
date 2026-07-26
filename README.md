# MawinguOps

**Anticipatory drought early-warning delivered to feature phones over USSD — turning ICPAC-aligned drought signals into a plant / wait / don't-plant decision for smallholder maize farmers in Machakos County, Kenya.**

Hackathon submission — **IGAD Husika Hackathon 2026** (Early Warning & Early Action for climate resilience in the Horn of Africa).

---

## What this is

An **early-warning-to-early-action last mile.** MawinguOps takes the same drought
signal ICPAC's East Africa Drought Watch monitors — the **SPI** computed from
**CHIRPS** — and turns it into a single, timely, act-now decision that reaches a
farmer on a **basic feature phone over USSD**: no smartphone, no data bundle, no
app, in Swahili or English. When conditions worsen week over week it **pushes an
escalation alert ahead of the impact** — anticipatory action, not a post-hoc
report.

Three things make it distinct, in the order that matters for this hackathon:

1. **Last-mile delivery that actually reaches the at-risk user.** The decision
   arrives over USSD (`*384#`) on phones smallholders already have, plus an
   optional weekly SMS. Most climate tools stop at a dashboard the farmer never
   sees; this one meets them on a basic handset.
2. **ICPAC-aligned drought science.** The drought signal is the **SPI** — a
   gamma-fit, per-day-of-year Standardized Precipitation Index over CHIRPS, the
   same dataset and index ICPAC's Drought Watch uses — plus a calendar-month
   **SPI-1** computed with Drought Watch's exact method for direct parity. The
   planting signal is independently cross-checked against the ICPAC-aligned
   growing-season **onset**.
3. **Anticipatory triggers, not just advice.** SPI maps to ICPAC-style
   `moderate / severe / extreme` anticipatory-action triggers. A **week-over-week
   escalation** surfaces on the main USSD menu *and* pushes an SMS to subscribers
   — so a worsening drought reaches the farmer *before* the loss.

## The decision

A smallholder maize farmer in Machakos has one decision that makes or breaks the
season: **"Should I plant now, wait, or not plant?"** Plant too early before
reliable rains and the seed fails; plant too late and the crop misses the
critical grain-filling window. Extension coverage is thin and forecasts rarely
arrive in a language and channel the farmer can use. MawinguOps answers that one
question — and, between seasons, tells the farmer how to **prepare** for the next
window.

A **plain-language advisory** (Swahili + English) makes the signal readable at
basic literacy. That final rewrite step uses a Llama model, but it is one
guardrailed link in the pipeline — the decision, its reasoning, and a
deterministic fallback all stand without it (see *Recommendations* below). The
innovation is the delivery and the drought science, not the wording step.

---

## How it works

```
                         WEEKLY CRON PIPELINE (writes to Postgres)
  ┌─────────────┐   ┌──────────────┐   ┌────────────────┐   ┌───────────┐   ┌──────────────────┐
  │ CHIRPS via  │   │ Open-Meteo   │   │ compute_anomaly│   │ run_model │   │ generate_advisory│
  │ Earth Engine│──▶│ 14-day fcst  │──▶│  alert level   │──▶│ RandomFor.│──▶│  Llama via Groq  │
  └─────────────┘   └──────────────┘   └────────────────┘   └───────────┘   └──────────────────┘
        │                  │                   │                  │                   │
        ▼                  ▼                   ▼                  ▼                   ▼
  rainfall_actuals    forecasts          alert_levels    planting_recommend.     advisories
  rainfall_baseline
                                   ┌──────────────────────────┐
                                   │       PostgreSQL          │
                                   └────────────┬─────────────┘
                                                │ (reads only)
                ┌───────────────────────────────┼───────────────────────────────┐
                ▼                                                                ▼
        ┌───────────────┐                                              ┌──────────────────┐
        │ Node USSD API │◀──── Africa's Talking ◀──── *384# ◀── Farmer │ React dashboard  │
        │  POST /ussd   │                                              │  (demo / review) │
        └───────────────┘                                              └──────────────────┘
```

The **USSD handler never runs ML inference or calls the LLM live** — it only reads
pre-computed rows. All the heavy lifting happens once a week in the pipeline, so
USSD sessions stay fast and cheap, and the weekly advisory is stable.

### Drought signal — SPI + anticipatory-action triggers

The drought signal is the **SPI (Standardized Precipitation Index)** over the
trailing 30-day rainfall accumulation — the same index **ICPAC's East Africa
Drought Watch** uses (see *ICPAC alignment* below). SPI is derived from a gamma
distribution fitted per day-of-year to the historical CHIRPS archive
(`calibrate_spi.py`), so it accounts for how variable rainfall actually is at
that time of year — unlike a raw ratio.

```
H(x) = zero_prob + (1 - zero_prob) * GammaCDF(x; shape, scale)
SPI  = Phi^-1(H(x))
```

SPI maps to an ICPAC-style anticipatory-action trigger and the farmer-facing alert:

| SPI            | Trigger    | Alert    | Meaning                       |
|----------------|------------|----------|-------------------------------|
| > −0.5         | `none`     | `GREEN`  | Normal, no action needed      |
| −1.0 … −0.5    | `mild`     | `YELLOW` | Watch, mildly below normal    |
| −1.5 … −1.0    | `moderate` | `ORANGE` | Moderate drought trigger      |
| −2.0 … −1.5    | `severe`   | `RED`    | Severe drought trigger        |
| ≤ −2.0         | `extreme`  | `RED`    | Extreme drought trigger       |

The legacy `anomaly_pct = (current_30d / baseline_30d) * 100` is still computed
and stored for continuity (and as a fallback classifier if SPI isn't calibrated).

**Drought Watch parity (SPI-1).** Alongside the trailing-30-day SPI, MawinguOps
computes a **calendar-month SPI-1** with ICPAC Drought Watch's exact method
(gamma fit of full-month CHIRPS totals). The reference period is configurable
(`SPI_REF_START_YEAR`/`SPI_REF_END_YEAR`) so it matches Drought Watch's
**1981–2010** reference once the full CHIRPS archive is loaded. Both values are
stored and shown on the dashboard.

### Growing-season onset validation

ICPAC publishes growing-season **onset** dates in its Data Library — in effect
the official answer to "has the planting window opened?". `validate_onset.py`
detects this season's onset from CHIRPS with a standard agronomic criterion
(≥20mm over 3 days, no false-start dry spell), compares it to the long-term
CHIRPS climatology (or ICPAC's official onset via `ICPAC_ONSET_URL` when
configured), and reports whether the planting recommendation **agrees with**, is
**more conservative than**, or **diverges from** the onset signal — an
independent, ICPAC-aligned credibility check surfaced on the dashboard.

### Recommendations (Random Forest, guarded by the FAO rule)

`PLANT_NOW` · `WAIT` · `DO_NOT_PLANT`, with a confidence score.

The Random Forest is trained on labels derived from **FAO Irrigation & Drainage
Paper 56** maize water-requirement thresholds (`ml/labels.py`) — so the model
*operationalizes* those agronomic thresholds rather than learning from observed
yield. To make that an explicit, safe design choice rather than a hidden risk,
`run_model.py` recomputes the same FAO rule for the live features and, if the
model ever disagrees, **defers to the transparent rule** (and logs the
divergence). The advisory's plain-language *reason* is built from the very same
crossed thresholds (`advisory_facts.py`), so the decision and its explanation can
never point in opposite directions.

### ICPAC alignment

MawinguOps deliberately aligns with the systems of **ICPAC** (the hackathon
organizer) so its outputs are comparable to official regional products:

- **Drought Watch** ([droughtwatch.icpac.net](https://droughtwatch.icpac.net/)) monitors East Africa drought from **CHIRPS** using the **SPI** — MawinguOps uses the **same dataset and the same index**, and computes a calendar-month **SPI-1** with Drought Watch's method for direct parity.
- **Thresholds & Triggers** ([eatriggersthresholds.icpac.net](https://eatriggersthresholds.icpac.net/)) frames drought response as pre-agreed, subnational triggers for **anticipatory action** — MawinguOps emits the same `moderate / severe / extreme` trigger categories and turns each into early *action* (plant / wait / don't).
- **HUSIKA** ([husika.icpac.net](https://husika.icpac.net/)) is ICPAC's early-warning communication platform — MawinguOps extends that last mile to **basic phones over USSD**, with no smartphone or data required.
- **ICPAC Data Library** ([digilib.icpac.net](http://digilib.icpac.net/)) — growing-season **onset/cessation** dates + SPI. MawinguOps validates its planting signal against the season onset (`validate_onset.py`).
- **ICPAC Geoportal** ([geoportal.icpac.net](https://geoportal.icpac.net/)) — live **WMS** layers (maize area, growing-season windows, drought hazard, admin boundaries) rendered as regional context on the dashboard.

---

## Live demo & deployment

The project deploys to [Render](https://render.com) (managed Postgres + Node API
+ static dashboard) via [`render.yaml`](render.yaml); the API also ships a
[`Dockerfile`](api/Dockerfile) for any container host. After the first deploy,
seed the in-season demo scenarios once with `cd api && npm run seed:demo`, then
point an Africa's Talking sandbox USSD channel at the API's `/ussd` endpoint.

### Demoing the plant / wait / don't-plant path off-season

The live decision is only in-season during the two rain windows, so outside them
(including the submission window) a real farmer correctly gets the **PREPARE**
message. To walk the full decision path at any time of year **without changing
what real farmers see**, a request carries a `demo` selector that reads a
pre-seeded in-season scenario:

- **Dashboard:** open `…/?demo=plant_now`, `?demo=wait`, or `?demo=do_not_plant`
  (the `do_not_plant` scenario also shows the anticipatory drought banner).
- **USSD:** POST `/ussd` with a `demo=<scenario>` field on the first request; it
  is remembered for the whole session.
- **Seed it once:** `cd api && npm run seed:demo`.

Real behaviour is the default: no `demo` selector → production `machakos` → the
correct off-season advisory.

---

## Repository layout

```
mawinguops/
├── api/         Node.js USSD API (Express + pg + Africa's Talking)
├── ml/          Model training/evaluation (scikit-learn) + features/labels
├── pipeline/    Weekly data pipeline (CHIRPS, Open-Meteo, anomaly+SPI/SPI-1,
│                model, onset validation, advisory)
├── notebook/    Colab notebook to train the model end-to-end
└── dashboard/   React (Vite) demo dashboard (incl. ICPAC WMS map + onset card)
```

---

## Prerequisites

- **Node.js 20+**
- **Python 3.11+**
- **PostgreSQL 14+**
- **WSL** if you are on Windows (this project was built and tested in WSL)
- A **Google Cloud project** with the Earth Engine API enabled (for CHIRPS)
- A **Groq API key** (Llama advisory text) and **Africa's Talking** account (USSD)

> **WSL note:** install Python dependencies *inside WSL*, not Windows, and keep
> the virtualenv on the WSL filesystem (e.g. `~/mawinguops/.venv`), not on a
> mounted `/mnt/c` drive — that is dramatically faster.

---

## Setup

### 1. Clone and configure

```bash
git clone <your-repo-url> mawinguops
cd mawinguops
cp .env.example .env
# Edit .env with your real DATABASE_URL, AT_*, and GROQ_API_KEY values.
```

> **Port note:** some WSL PostgreSQL installs listen on a non-default port
> (check with `pg_lsclusters`). If yours is on `5433`, set
> `DATABASE_URL=postgresql://postgres:password@localhost:5433/mawinguops`.

### 2. Create the database and run the migration

```bash
createdb mawinguops
# Apply every migration in order. All migrations are idempotent, so this is safe
# to re-run. Uses DATABASE_URL from your .env — no psql loop needed.
cd api && npm run migrate && cd ..

# Optional: seed the in-season demo scenarios for the walkthrough.
cd api && npm run seed:demo && cd ..
```

### 3. Install Node dependencies

```bash
cd api && npm install && cd ..
```

### 4. Install Python dependencies (inside WSL)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r pipeline/requirements.txt
pip install -r ml/requirements.txt
```

### 5. Train the model (Google Colab)

1. Upload `notebook/mawinguops_training.ipynb` to [Google Colab](https://colab.research.google.com/).
2. Set your Google Cloud project ID in the Earth Engine cell.
3. Run all cells. This fetches CHIRPS, engineers features, trains the Random
   Forest, and produces downloads.
4. Download `planting_model.pkl`, `label_encoder.pkl`, `feature_importance.json`
   and place them in **`ml/models/`**.
5. Download `chirps_machakos.csv`, `baseline_machakos.csv` and place them in
   **`pipeline/data/`**.

> You can alternatively train locally once you have `pipeline/data/chirps_machakos.csv`:
> `cd ml && python train.py`.

### 6. Populate the database (run the pipeline once)

```bash
# Authenticate Earth Engine once (interactive):
earthengine authenticate
export EE_PROJECT=your-google-cloud-project-id

cd pipeline && bash run_pipeline.sh
```

### 7. Start the API

```bash
cd api && npm start
# -> [api] MawinguOps API listening on port 3000
```

Check it: `curl http://localhost:3000/health`

### 8. Schedule the weekly pipeline (WSL cron)

WSL does not auto-start cron. Start it, then install the job:

```bash
sudo service cron start
crontab -e
# Add (Mondays 06:00):
0 6 * * 1 /home/<you>/mawinguops/pipeline/run_pipeline.sh >> /var/log/mawinguops_pipeline.log 2>&1
```

---

## USSD testing (Africa's Talking sandbox)

1. Log into the [Africa's Talking sandbox](https://account.africastalking.com/).
2. Create a USSD channel (e.g. `*384#`) and point its callback URL at your API's
   `POST /ussd` endpoint. Expose your local server with a tunnel (e.g. `ngrok http 3000`)
   and use `https://<tunnel>/ussd`.
3. Use the sandbox **simulator** to dial the code and walk the menus:
   - First-time caller: language → name → main menu.
   - `1` Weather Alert · `2` Planting Advisory · `0` Exit.

You can also test the webhook directly:

```bash
curl -X POST http://localhost:3000/ussd \
  -d 'sessionId=test1&phoneNumber=+254700000000&serviceCode=*384#&text='
```

---

## Dashboard (demo)

```bash
cd dashboard
npm install
npm run dev
# -> http://localhost:5173  (proxies /health and /api to the API on :3000)
```

The dashboard reads `GET /api/status` and renders the alert badge, the
recommendation card, and an actual-vs-baseline rainfall chart. It is for the
demo video and review only.

---

## Data sources & attribution

- **CHIRPS** — Climate Hazards Group InfraRed Precipitation with Station data
  (`UCSB-CHC/CHIRPS/V3/DAILY_SAT`), accessed via Google Earth Engine.
- **Open-Meteo** — free 14-day precipitation forecast API (no key required).
- **FAO Irrigation and Drainage Paper 56** — maize water-requirement thresholds
  used to derive training labels.
- **Llama (via Groq)** — plain-language Swahili/English advisory text.
- **Africa's Talking** — USSD delivery channel.
- **ICPAC Geoportal** — live WMS layers (`geoportal.icpac.net/geoserver/ows`):
  Kenya maize area, growing-season windows, drought hazard, admin boundaries.
- **ICPAC Data Library** ([digilib.icpac.net](http://digilib.icpac.net/)) — growing-season onset reference for `validate_onset.py`.
- **OpenStreetMap** — basemap tiles for the dashboard map.

> Training labels are derived **programmatically from agronomic thresholds, not
> from observed yield data**. The model produces an agronomically-grounded,
> stable weekly signal — not a yield prediction.

---

## Hackathon submission

- **Event:** IGAD Husika Hackathon 2026
- **Theme:** Early Warning & Early Action for climate resilience in the Horn of Africa
- **Location focus:** Machakos County, Kenya (maize, bimodal MAM/OND rainfall)
- **Channel:** USSD (`*384#`) for maximum reach on basic phones
