-- MawinguOps — make the season phase explicit on every recommendation.
--
-- run_model.py previously snapped off-season dates to the nearest season and
-- stored a bare WAIT, which the USSD handler then showed as a real in-season
-- decision (contradicting the advisory text, which correctly said "prepare").
-- The pipeline now stores the canonical phase (pipeline/season.py) alongside
-- each recommendation, and every reader (USSD, web, SMS, email) branches on
-- this column instead of re-deriving the phase itself.
--
-- Idempotent: safe to re-run.

ALTER TABLE planting_recommendations
  ADD COLUMN IF NOT EXISTS phase VARCHAR(20) NOT NULL DEFAULT 'in_season';
  -- one of: in_season | off_season
