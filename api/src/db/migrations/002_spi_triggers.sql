-- MawinguOps — SPI (Standardized Precipitation Index) + anticipatory-action triggers.
--
-- Aligns the drought signal with ICPAC's East Africa Drought Watch methodology,
-- which monitors drought using the SPI computed from CHIRPS. We:
--   * add SPI + an ICPAC-style trigger category to alert_levels, and
--   * add a per-day-of-year SPI calibration table (gamma distribution fitted to
--     the historical 30-day rainfall accumulations), so the weekly job only
--     needs the current window + the calibration to derive SPI.
--
-- Idempotent: safe to re-run.

-- 1. SPI value + anticipatory-action trigger category on each alert.
ALTER TABLE alert_levels
  ADD COLUMN IF NOT EXISTS spi DECIMAL(5,2);

ALTER TABLE alert_levels
  ADD COLUMN IF NOT EXISTS trigger_category VARCHAR(20);
  -- one of: none | mild | moderate | severe | extreme

-- 2. SPI calibration: gamma parameters per day-of-year for the N-day accumulation.
--    H(x) = zero_prob + (1 - zero_prob) * GammaCDF(x; shape, scale)
--    SPI  = Phi^-1(H(x))
CREATE TABLE IF NOT EXISTS spi_calibration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location VARCHAR(50) NOT NULL DEFAULT 'machakos',
  day_of_year INTEGER NOT NULL,
  accum_days INTEGER NOT NULL DEFAULT 30,
  gamma_shape DECIMAL(12,6) NOT NULL,
  gamma_scale DECIMAL(12,6) NOT NULL,
  zero_prob DECIMAL(6,5) NOT NULL DEFAULT 0,
  sample_size INTEGER NOT NULL,
  calibrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(location, day_of_year, accum_days)
);

CREATE INDEX IF NOT EXISTS idx_spi_calibration_lookup
  ON spi_calibration(location, accum_days, day_of_year);
