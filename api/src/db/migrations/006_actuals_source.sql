-- MawinguOps — track the source of each rainfall actual.
--
-- The canonical actuals source is CHIRPS (via Earth Engine), the same dataset
-- ICPAC's Drought Watch uses. To keep the system current WITHOUT requiring
-- interactive Earth Engine auth, recent days can be gap-filled from Open-Meteo's
-- historical archive (ERA5). This column records which source each day came from
-- so the provenance is explicit and the gap-fill can later be overwritten by
-- authoritative CHIRPS when a fetch_chirps run happens.
--
-- Idempotent: safe to re-run.

ALTER TABLE rainfall_actuals
  ADD COLUMN IF NOT EXISTS source VARCHAR(24) NOT NULL DEFAULT 'chirps';
