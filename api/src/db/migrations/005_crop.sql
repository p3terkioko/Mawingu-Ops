-- MawinguOps — make the crop a first-class field.
--
-- Maize is the MVP crop. It was previously implicit (encoded only in the FAO
-- thresholds in ml/labels.py). This adds an explicit `crop` column to the
-- recommendation and advisory outputs, defaulting to 'maize', so the crop is
-- named in the data — and adding a second crop later is a config + label change,
-- not a schema rewrite.
--
-- Idempotent: safe to re-run.

ALTER TABLE planting_recommendations
  ADD COLUMN IF NOT EXISTS crop VARCHAR(20) NOT NULL DEFAULT 'maize';

ALTER TABLE advisories
  ADD COLUMN IF NOT EXISTS crop VARCHAR(20) NOT NULL DEFAULT 'maize';
