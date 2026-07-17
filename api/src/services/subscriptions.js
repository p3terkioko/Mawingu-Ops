'use strict';

/**
 * Subscription service — SMS/email advisory subscriptions and the admin
 * overview. Writes come from the USSD subscribe menu and the web form; the
 * pipeline's broadcast step reads active subscriptions directly.
 */

const { query } = require('../db');

/**
 * Create or re-activate a subscription. Idempotent on (contact, channel).
 * @param {string} contact  phone number (sms) or email address (email)
 * @param {string} channel  'sms' | 'email'
 * @param {{location?:string, crop?:string, language?:string}} [opts]
 * @returns {Promise<object>} the subscription row
 */
async function upsertSubscription(contact, channel, opts = {}) {
  const { location = 'machakos', crop = 'maize', language = 'sw' } = opts;
  const result = await query(
    `INSERT INTO subscriptions (contact, channel, location, crop, language)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (contact, channel) DO UPDATE
       SET active = TRUE,
           language = EXCLUDED.language,
           location = EXCLUDED.location,
           crop = EXCLUDED.crop,
           consent_at = NOW(),
           unsubscribed_at = NULL
     RETURNING *`,
    [contact, channel, location, crop, language]
  );
  return result.rows[0];
}

/**
 * Deactivate a subscription (soft delete — keeps the consent trail).
 * @param {string} contact
 * @param {string} channel
 * @returns {Promise<object|null>} the updated row, or null if not found
 */
async function unsubscribe(contact, channel) {
  const result = await query(
    `UPDATE subscriptions
     SET active = FALSE, unsubscribed_at = NOW()
     WHERE contact = $1 AND channel = $2
     RETURNING *`,
    [contact, channel]
  );
  return result.rows[0] || null;
}

/**
 * Admin overview: subscriber counts, recent deliveries, trigger history.
 * @returns {Promise<{subscribers:Array, deliveries:Array, triggers:Array}>}
 */
async function adminOverview() {
  const [subscribers, deliveries, triggers] = await Promise.all([
    query(
      `SELECT channel, language, COUNT(*)::int AS count
       FROM subscriptions
       WHERE active = TRUE
       GROUP BY channel, language
       ORDER BY channel, language`
    ),
    query(
      `SELECT d.channel, d.status, d.trigger_reason, d.advisory_text,
              d.error_message, d.sent_at, s.contact, s.language
       FROM delivery_logs d
       LEFT JOIN subscriptions s ON s.id = d.subscription_id
       ORDER BY d.sent_at DESC
       LIMIT 25`
    ),
    query(
      `SELECT alert_level, trigger_category, spi, computed_at
       FROM alert_levels
       ORDER BY computed_at DESC
       LIMIT 12`
    ),
  ]);
  return {
    subscribers: subscribers.rows,
    deliveries: deliveries.rows,
    triggers: triggers.rows,
  };
}

module.exports = { upsertSubscription, unsubscribe, adminOverview };
