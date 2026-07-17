-- MawinguOps — calendar-month SPI-1, for direct parity with ICPAC Drought Watch.
--
-- ICPAC's East Africa Drought Watch reports SPI over calendar-month
-- accumulations (SPI-1, SPI-3, …) fitted on a 1981–2010 reference period.
-- MawinguOps's primary signal is a trailing-30-day SPI on the 1998–2025 archive
-- (finer, fresher). This migration adds a SECOND, clearly-labelled metric — the
-- calendar-month SPI-1 computed with ICPAC's exact method — so the two are
-- directly comparable and the reference period is explicit and configurable.
--
-- Idempotent: safe to re-run.

-- 1. Calendar-month SPI-1 value + the reference period it was fitted on.
ALTER TABLE alert_levels
  ADD COLUMN IF NOT EXISTS spi_1month DECIMAL(5,2);

ALTER TABLE alert_levels
  ADD COLUMN IF NOT EXISTS spi_1month_ref VARCHAR(20);
  -- e.g. '1981-2010' or '1998-2025' — the reference period used for SPI-1.

-- 2. Per-calendar-month gamma calibration (gamma fit of full-month totals).
CREATE TABLE IF NOT EXISTS spi_monthly_calibration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location VARCHAR(50) NOT NULL DEFAULT 'machakos',
  month INTEGER NOT NULL,                 -- 1..12
  gamma_shape DECIMAL(12,6) NOT NULL,
  gamma_scale DECIMAL(12,6) NOT NULL,
  zero_prob DECIMAL(6,5) NOT NULL DEFAULT 0,
  sample_size INTEGER NOT NULL,
  ref_start_year INTEGER,                 -- reference period start (NULL = all)
  ref_end_year INTEGER,                   -- reference period end   (NULL = all)
  calibrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(location, month)
);
