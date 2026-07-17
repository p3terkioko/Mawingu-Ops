-- MawinguOps — initial schema
-- USSD-based early warning and planting advisory system for Machakos County, Kenya.
--
-- Conventions:
--   * UUID primary keys via pgcrypto's gen_random_uuid()
--   * TIMESTAMPTZ for all timestamps
--   * Upsert-friendly UNIQUE constraints on natural keys

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Registered farmers and their language preference.
CREATE TABLE IF NOT EXISTS farmers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100),
  language VARCHAR(5) NOT NULL DEFAULT 'sw',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily observed rainfall (CHIRPS actuals).
CREATE TABLE IF NOT EXISTS rainfall_actuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location VARCHAR(50) NOT NULL DEFAULT 'machakos',
  date DATE NOT NULL,
  rainfall_mm DECIMAL(8,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(location, date)
);

-- Historical day-of-year mean rainfall (1998-2020 climatological baseline).
CREATE TABLE IF NOT EXISTS rainfall_baseline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location VARCHAR(50) NOT NULL DEFAULT 'machakos',
  day_of_year INTEGER NOT NULL,
  mean_rainfall_mm DECIMAL(8,2) NOT NULL,
  UNIQUE(location, day_of_year)
);

-- Open-Meteo daily forecast (14-day horizon).
CREATE TABLE IF NOT EXISTS forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location VARCHAR(50) NOT NULL DEFAULT 'machakos',
  forecast_date DATE NOT NULL,
  predicted_rainfall_mm DECIMAL(8,2) NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(location, forecast_date)
);

-- Computed drought alert levels (GREEN/YELLOW/ORANGE/RED).
CREATE TABLE IF NOT EXISTS alert_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location VARCHAR(50) NOT NULL DEFAULT 'machakos',
  alert_level VARCHAR(10) NOT NULL,
  anomaly_pct DECIMAL(6,2) NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ NOT NULL
);

-- ML planting recommendations (PLANT_NOW/WAIT/DO_NOT_PLANT).
CREATE TABLE IF NOT EXISTS planting_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location VARCHAR(50) NOT NULL DEFAULT 'machakos',
  recommendation VARCHAR(20) NOT NULL,
  confidence_score DECIMAL(4,2) NOT NULL,
  features_snapshot JSONB,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ NOT NULL
);

-- Llama-generated plain-language advisories (Swahili + English).
CREATE TABLE IF NOT EXISTS advisories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location VARCHAR(50) NOT NULL DEFAULT 'machakos',
  language VARCHAR(5) NOT NULL DEFAULT 'sw',
  alert_level VARCHAR(10) NOT NULL,
  recommendation VARCHAR(20) NOT NULL,
  advisory_text TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ NOT NULL
);

-- USSD session state machine storage.
CREATE TABLE IF NOT EXISTS ussd_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(100) UNIQUE NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  state VARCHAR(50) NOT NULL DEFAULT 'INITIAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log of advisories delivered to farmers.
CREATE TABLE IF NOT EXISTS advisory_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) NOT NULL,
  channel VARCHAR(10) NOT NULL,
  advisory_text TEXT NOT NULL,
  alert_level VARCHAR(10),
  recommendation VARCHAR(20),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for the read paths used by the USSD handler and dashboard.
CREATE INDEX IF NOT EXISTS idx_rainfall_actuals_location_date
  ON rainfall_actuals(location, date);
CREATE INDEX IF NOT EXISTS idx_forecasts_location_date
  ON forecasts(location, forecast_date);
CREATE INDEX IF NOT EXISTS idx_alert_levels_location
  ON alert_levels(location, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_planting_recommendations_location
  ON planting_recommendations(location, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_advisories_location_language
  ON advisories(location, language, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ussd_sessions_phone
  ON ussd_sessions(phone_number);
CREATE INDEX IF NOT EXISTS idx_advisory_logs_phone
  ON advisory_logs(phone_number, sent_at DESC);
