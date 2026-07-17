-- MawinguOps — growing-season onset validation.
--
-- Cross-checks MawinguOps's planting signal against an agronomic growing-season
-- ONSET date, the same concept ICPAC publishes (growing-season onset/cessation
-- dates in the ICPAC Data Library, digilib.icpac.net). Onset is detected with a
-- standard agronomic criterion (>=20mm over 3 days, no long false-start dry
-- spell) from the CHIRPS archive, and compared to the long-term CHIRPS
-- climatology (or ICPAC's official onset when configured/reachable).
--
-- This gives an independent, ICPAC-aligned check on whether a PLANT_NOW signal
-- lines up with when the season actually opens.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS onset_validation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location VARCHAR(50) NOT NULL DEFAULT 'machakos',
  season VARCHAR(20) NOT NULL,            -- long_rains | short_rains | off_season
  year INTEGER NOT NULL,
  onset_date DATE,                        -- detected onset this season (NULL = not yet)
  onset_status VARCHAR(20) NOT NULL,      -- onset_detected | awaiting_onset | season_delayed | off_season
  climatology_onset DATE,                 -- long-term mean onset for this season
  reference_source VARCHAR(20) NOT NULL,  -- chirps_climatology | icpac_digilib
  days_vs_climatology INTEGER,            -- onset minus climatology (negative = early)
  recommendation VARCHAR(20),             -- latest planting recommendation compared
  agreement VARCHAR(20) NOT NULL,         -- agrees | conservative | diverges | n/a
  message TEXT NOT NULL,                  -- human-readable summary
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_onset_validation_lookup
  ON onset_validation(location, computed_at DESC);
