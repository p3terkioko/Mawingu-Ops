'use strict';

/**
 * Farmer service — registration and profile updates.
 */

const { query } = require('../db');

/**
 * Find a farmer by phone number without creating one.
 * @param {string} phoneNumber
 * @returns {Promise<object|null>}
 */
async function findFarmer(phoneNumber) {
  const result = await query(
    'SELECT * FROM farmers WHERE phone_number = $1',
    [phoneNumber]
  );
  return result.rows[0] || null;
}

/**
 * Find a farmer by phone number, creating one if it does not exist.
 * New farmers default to Swahili ('sw').
 * @param {string} phoneNumber
 * @returns {Promise<object>} the farmer row
 */
async function findOrCreateFarmer(phoneNumber) {
  const existing = await query(
    'SELECT * FROM farmers WHERE phone_number = $1',
    [phoneNumber]
  );
  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const created = await query(
    `INSERT INTO farmers (phone_number)
     VALUES ($1)
     ON CONFLICT (phone_number) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [phoneNumber]
  );
  return created.rows[0];
}

/**
 * Update a farmer's preferred language ('sw' or 'en').
 * @param {string} phoneNumber
 * @param {string} language
 * @returns {Promise<object|null>}
 */
async function updateFarmerLanguage(phoneNumber, language) {
  const result = await query(
    `UPDATE farmers
     SET language = $2, updated_at = NOW()
     WHERE phone_number = $1
     RETURNING *`,
    [phoneNumber, language]
  );
  return result.rows[0] || null;
}

/**
 * Update a farmer's display name.
 * @param {string} phoneNumber
 * @param {string} name
 * @returns {Promise<object|null>}
 */
async function updateFarmerName(phoneNumber, name) {
  const result = await query(
    `UPDATE farmers
     SET name = $2, updated_at = NOW()
     WHERE phone_number = $1
     RETURNING *`,
    [phoneNumber, name]
  );
  return result.rows[0] || null;
}

module.exports = {
  findFarmer,
  findOrCreateFarmer,
  updateFarmerLanguage,
  updateFarmerName,
};
