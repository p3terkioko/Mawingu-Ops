'use strict';

/**
 * USSD session service — persists the per-session state machine position.
 */

const { query } = require('../db');

/**
 * Fetch a session by its Africa's Talking session id.
 * @param {string} sessionId
 * @returns {Promise<object|null>}
 */
async function getSession(sessionId) {
  const result = await query(
    'SELECT * FROM ussd_sessions WHERE session_id = $1',
    [sessionId]
  );
  return result.rows[0] || null;
}

/**
 * Create a new session in the INITIAL state. Idempotent: if the session id
 * already exists (retried webhook), the existing row is returned untouched.
 * @param {string} sessionId
 * @param {string} phoneNumber
 * @returns {Promise<object>}
 */
async function createSession(sessionId, phoneNumber) {
  const result = await query(
    `INSERT INTO ussd_sessions (session_id, phone_number, state)
     VALUES ($1, $2, 'INITIAL')
     ON CONFLICT (session_id) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [sessionId, phoneNumber]
  );
  return result.rows[0];
}

/**
 * Move a session to a new state.
 * @param {string} sessionId
 * @param {string} state
 * @returns {Promise<object|null>}
 */
async function updateSessionState(sessionId, state) {
  const result = await query(
    `UPDATE ussd_sessions
     SET state = $2, updated_at = NOW()
     WHERE session_id = $1
     RETURNING *`,
    [sessionId, state]
  );
  return result.rows[0] || null;
}

/**
 * Remove a finished session.
 * @param {string} sessionId
 * @returns {Promise<void>}
 */
async function deleteSession(sessionId) {
  await query('DELETE FROM ussd_sessions WHERE session_id = $1', [sessionId]);
}

module.exports = {
  getSession,
  createSession,
  updateSessionState,
  deleteSession,
};
