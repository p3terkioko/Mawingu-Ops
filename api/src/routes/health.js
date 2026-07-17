'use strict';

/**
 * Health and status routes.
 *   GET /health      - liveness + DB connectivity
 *   GET /api/status  - latest pipeline outputs for the dashboard
 */

const express = require('express');
const { query } = require('../db');
const {
  getLatestAdvisory,
  getLatestRecommendation,
  getLatestAlert,
  getLatestOnsetValidation,
} = require('../services/advisory');

const router = express.Router();
const LOCATION = 'machakos';

// GET /health
router.get('/health', async (req, res) => {
  let dbConnected = false;
  try {
    await query('SELECT 1');
    dbConnected = true;
  } catch (err) {
    console.error('[health] DB check failed:', err.message);
  }

  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    database: dbConnected ? 'connected' : 'disconnected',
  });
});

// GET /api/status — consumed by the React dashboard.
router.get('/api/status', async (req, res) => {
  try {
    const [alert, recommendation, swAdvisory, enAdvisory, onset] = await Promise.all([
      getLatestAlert(LOCATION),
      getLatestRecommendation(LOCATION),
      getLatestAdvisory(LOCATION, 'sw'),
      getLatestAdvisory(LOCATION, 'en'),
      getLatestOnsetValidation(LOCATION),
    ]);

    // Recent rainfall actuals + matching baseline for the chart (last 30 days).
    const actuals = await query(
      `SELECT date, rainfall_mm
       FROM rainfall_actuals
       WHERE location = $1
       ORDER BY date DESC
       LIMIT 30`,
      [LOCATION]
    );
    const baseline = await query(
      `SELECT day_of_year, mean_rainfall_mm
       FROM rainfall_baseline
       WHERE location = $1`,
      [LOCATION]
    );

    // Freshness: the most recent actual and where it came from.
    const dataAsOfRow = await query(
      `SELECT date, source
       FROM rainfall_actuals
       WHERE location = $1
       ORDER BY date DESC
       LIMIT 1`,
      [LOCATION]
    );
    const dataAsOf = dataAsOfRow.rows[0] || null;
    const baselineByDoy = new Map(
      baseline.rows.map((r) => [Number(r.day_of_year), Number(r.mean_rainfall_mm)])
    );

    const rainfall = actuals.rows
      .reverse()
      .map((r) => {
        const d = new Date(r.date);
        const doy = Math.floor(
          (d - new Date(Date.UTC(d.getUTCFullYear(), 0, 0))) / 86400000
        );
        return {
          date: d.toISOString().slice(0, 10),
          actual: Number(r.rainfall_mm),
          baseline: baselineByDoy.get(doy) ?? null,
        };
      });

    // The most recent computed_at across outputs approximates last pipeline run.
    const lastRunCandidates = [
      alert?.computed_at,
      recommendation?.computed_at,
    ].filter(Boolean);
    const lastPipelineRun = lastRunCandidates.length
      ? new Date(Math.max(...lastRunCandidates.map((d) => new Date(d).getTime()))).toISOString()
      : null;

    res.json({
      location: LOCATION,
      alert: alert
        ? {
            level: alert.alert_level,
            anomalyPct: Number(alert.anomaly_pct),
            spi: alert.spi != null ? Number(alert.spi) : null,
            triggerCategory: alert.trigger_category || null,
            spi1Month: alert.spi_1month != null ? Number(alert.spi_1month) : null,
            spi1MonthRef: alert.spi_1month_ref || null,
          }
        : null,
      recommendation: recommendation
        ? {
            recommendation: recommendation.recommendation,
            confidence: Number(recommendation.confidence_score),
            crop: recommendation.crop || 'maize',
            phase: recommendation.phase || 'in_season',
            computedAt: recommendation.computed_at,
          }
        : null,
      advisory: {
        sw: swAdvisory ? swAdvisory.advisory_text : null,
        en: enAdvisory ? enAdvisory.advisory_text : null,
      },
      onset: onset
        ? {
            season: onset.season,
            onsetDate: onset.onset_date,
            status: onset.onset_status,
            climatologyOnset: onset.climatology_onset,
            referenceSource: onset.reference_source,
            daysVsClimatology: onset.days_vs_climatology,
            agreement: onset.agreement,
            message: onset.message,
          }
        : null,
      rainfall,
      dataAsOf: dataAsOf ? dataAsOf.date : null,
      dataSource: dataAsOf ? dataAsOf.source : null,
      lastPipelineRun,
    });
  } catch (err) {
    console.error('[status] Failed to build status:', err.message);
    res.status(500).json({ error: 'Failed to load status' });
  }
});

module.exports = router;
