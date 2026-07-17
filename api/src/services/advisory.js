'use strict';

/**
 * Advisory service — reads pre-computed advisories/recommendations and logs
 * deliveries. The USSD handler only ever reads; the weekly pipeline writes.
 */

const { query } = require('../db');

/**
 * Latest still-valid advisory for a location in the requested language.
 * Falls back to English if no Swahili advisory is available.
 * @param {string} location
 * @param {string} language
 * @returns {Promise<{advisory_text:string, alert_level:string, recommendation:string, language:string}|null>}
 */
async function getLatestAdvisory(location, language) {
  const primary = await query(
    `SELECT advisory_text, alert_level, recommendation, language
     FROM advisories
     WHERE location = $1 AND language = $2 AND valid_until > NOW()
     ORDER BY generated_at DESC
     LIMIT 1`,
    [location, language]
  );
  if (primary.rows.length > 0) {
    return primary.rows[0];
  }

  // Fall back to English if the requested language is unavailable.
  if (language !== 'en') {
    const fallback = await query(
      `SELECT advisory_text, alert_level, recommendation, language
       FROM advisories
       WHERE location = $1 AND language = 'en' AND valid_until > NOW()
       ORDER BY generated_at DESC
       LIMIT 1`,
      [location]
    );
    if (fallback.rows.length > 0) {
      return fallback.rows[0];
    }
  }

  return null;
}

/**
 * Latest still-valid planting recommendation for a location.
 * @param {string} location
 * @returns {Promise<{recommendation:string, confidence_score:string, phase:string, computed_at:Date}|null>}
 */
async function getLatestRecommendation(location) {
  const result = await query(
    `SELECT recommendation, confidence_score, crop, phase, computed_at
     FROM planting_recommendations
     WHERE location = $1 AND valid_until > NOW()
     ORDER BY computed_at DESC
     LIMIT 1`,
    [location]
  );
  return result.rows[0] || null;
}

/**
 * Latest still-valid alert level for a location.
 * @param {string} location
 * @returns {Promise<{alert_level:string, anomaly_pct:string, computed_at:Date}|null>}
 */
async function getLatestAlert(location) {
  const result = await query(
    `SELECT alert_level, anomaly_pct, spi, trigger_category,
            spi_1month, spi_1month_ref, computed_at
     FROM alert_levels
     WHERE location = $1 AND valid_until > NOW()
     ORDER BY computed_at DESC
     LIMIT 1`,
    [location]
  );
  return result.rows[0] || null;
}

/**
 * Latest still-valid growing-season onset validation for a location.
 * @param {string} location
 * @returns {Promise<object|null>}
 */
async function getLatestOnsetValidation(location) {
  const result = await query(
    `SELECT season, onset_date, onset_status, climatology_onset,
            reference_source, days_vs_climatology, recommendation,
            agreement, message, computed_at
     FROM onset_validation
     WHERE location = $1 AND valid_until > NOW()
     ORDER BY computed_at DESC
     LIMIT 1`,
    [location]
  );
  return result.rows[0] || null;
}

/**
 * Anticipatory escalation status for a location, from the latest two alert rows.
 *
 * This is the same week-over-week worsening signal the SMS broadcast uses
 * (pipeline/broadcast_advisory.py), exposed to the pull channels (USSD menu,
 * dashboard) so a farmer who never subscribed still sees it by dialling in.
 *
 * @param {string} location
 * @returns {Promise<{active:boolean, escalated:boolean, triggerCategory:string|null,
 *   previousCategory:string|null, alertLevel:string|null, spi:number|null}>}
 */
async function getEscalationStatus(location) {
  const RANK = { none: 0, mild: 1, moderate: 2, severe: 3, extreme: 4 };
  const result = await query(
    `SELECT alert_level, trigger_category, spi, computed_at
     FROM alert_levels
     WHERE location = $1
     ORDER BY computed_at DESC
     LIMIT 2`,
    [location]
  );
  const rows = result.rows;
  if (rows.length === 0) {
    return {
      active: false, escalated: false, triggerCategory: null,
      previousCategory: null, alertLevel: null, spi: null,
    };
  }
  const current = rows[0];
  const previous = rows[1] || null;
  const curRank = RANK[current.trigger_category] ?? 0;
  const prevRank = previous ? RANK[previous.trigger_category] ?? 0 : null;
  const escalated = prevRank !== null && curRank > prevRank;
  // Surface on the menu when it is anticipatory-relevant: a moderate-or-worse
  // trigger, or any week-over-week worsening (even mild -> moderate).
  const active = curRank >= 2 || escalated;
  return {
    active,
    escalated,
    triggerCategory: current.trigger_category || null,
    previousCategory: previous ? previous.trigger_category || null : null,
    alertLevel: current.alert_level || null,
    spi: current.spi != null ? Number(current.spi) : null,
  };
}

/**
 * Record that an advisory was delivered to a farmer.
 * @param {string} phoneNumber
 * @param {string} channel       e.g. 'ussd'
 * @param {string} advisoryText
 * @param {string} alertLevel
 * @param {string} recommendation
 * @returns {Promise<void>}
 */
async function logAdvisoryDelivery(phoneNumber, channel, advisoryText, alertLevel, recommendation) {
  await query(
    `INSERT INTO advisory_logs
       (phone_number, channel, advisory_text, alert_level, recommendation)
     VALUES ($1, $2, $3, $4, $5)`,
    [phoneNumber, channel, advisoryText, alertLevel || null, recommendation || null]
  );
}

module.exports = {
  getLatestAdvisory,
  getLatestRecommendation,
  getLatestAlert,
  getLatestOnsetValidation,
  getEscalationStatus,
  logAdvisoryDelivery,
};
