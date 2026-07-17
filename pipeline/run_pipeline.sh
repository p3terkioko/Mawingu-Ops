#!/usr/bin/env bash
#
# MawinguOps weekly pipeline.
#
# Runs every data step in order. If any step fails, the error is logged and the
# script exits non-zero so cron surfaces the failure.
#
# Steps:
#   1. fetch_chirps.py          - CHIRPS actuals + baseline (Earth Engine; optional)
#   2. fetch_actuals_archive.py - no-auth gap-fill of recent actuals (Open-Meteo)
#   3. fetch_forecast.py        - 14-day forecast (Open-Meteo)
#   4. compute_anomaly.py       - SPI + 30-day anomaly + alert level + trigger
#   5. run_model.py             - Random Forest planting recommendation
#   6. validate_onset.py        - cross-check recommendation vs growing-season onset
#   7. generate_advisory.py     - Llama (Groq) plain-language advisories (sw + en)
#   8. broadcast_advisory.py    - SMS/email fan-out to subscribers (+ escalation alerts)
#
# One-time setup (like the CHIRPS baseline): after the first fetch_chirps run,
# calibrate the SPI gamma parameters once. compute_anomaly.py needs it for SPI:
#   python calibrate_spi.py
#
# --- WSL / cron setup -------------------------------------------------------
# WSL does not start cron automatically. Start it once per WSL session with:
#   sudo service cron start
#
# Install the weekly job (Mondays at 06:00) with `crontab -e`:
#   0 6 * * 1 /path/to/mawinguops/pipeline/run_pipeline.sh >> /var/log/mawinguops_pipeline.log 2>&1
#
# Use absolute paths in cron; cron runs with a minimal environment.
# ---------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Prefer the project virtualenv's Python if present, else system python3.
if [ -x "$SCRIPT_DIR/../.venv/bin/python" ]; then
  PYTHON="$SCRIPT_DIR/../.venv/bin/python"
else
  PYTHON="python3"
fi

log() {
  echo "[$(date -u +'%Y-%m-%d %H:%M:%S')] $*"
}

run_step() {
  local script="$1"
  log "=== Running ${script} ==="
  if "$PYTHON" "$script"; then
    log "=== ${script} succeeded ==="
  else
    local code=$?
    log "!!! ${script} FAILED with exit code ${code} — aborting pipeline"
    exit "$code"
  fi
}

# Optional step: log failure but keep going. Used for fetch_chirps, which needs
# Earth Engine auth — when it's unavailable, fetch_actuals_archive.py keeps the
# actuals current from Open-Meteo so the pipeline still produces an advisory.
run_step_optional() {
  local script="$1"
  log "=== Running ${script} (optional) ==="
  if "$PYTHON" "$script"; then
    log "=== ${script} succeeded ==="
  else
    log "--- ${script} failed (optional) — continuing ---"
  fi
}

log "########## MawinguOps pipeline starting ##########"

run_step_optional fetch_chirps.py       # canonical CHIRPS actuals (needs Earth Engine)
run_step fetch_actuals_archive.py       # no-auth gap-fill so actuals stay current
run_step fetch_forecast.py
run_step compute_anomaly.py
run_step run_model.py
run_step validate_onset.py
run_step generate_advisory.py
run_step broadcast_advisory.py

log "########## MawinguOps pipeline complete ##########"
