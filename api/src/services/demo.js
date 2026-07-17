'use strict';

/**
 * Demo-scenario resolution.
 *
 * The live plant/wait/don't-plant decision is only "in season" during the two
 * Kenyan rain windows (see pipeline/season.py). Outside them — including the
 * submission window — a real farmer correctly gets the off-season PREPARE
 * message. To let a judge or demo video walk the full decision path at any time
 * of year WITHOUT changing what a real farmer sees, a request may carry a
 * `demo` selector. It maps to a dedicated, pre-seeded location holding a fresh,
 * in-season scenario (see api/src/db/seed_demo.js). Everything downstream still
 * only ever *reads* pre-computed rows — the override just picks which rows.
 *
 * Production location is 'machakos'; nothing here touches it. An absent, empty,
 * or unknown selector resolves to production, so real behaviour is the default.
 */

const PRODUCTION_LOCATION = 'machakos';

// selector (from ?demo= / the `demo` USSD field) -> seeded demo location.
const DEMO_SCENARIOS = {
  plant_now: 'demo_plant_now',
  wait: 'demo_wait',
  do_not_plant: 'demo_do_not_plant',
};

/** Normalise a raw selector to a known key, or '' if it isn't a demo. */
function normaliseScenario(raw) {
  const key = String(raw || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(DEMO_SCENARIOS, key) ? key : '';
}

/**
 * Resolve the location to read from.
 * @param {string} scenario  a value from normaliseScenario (or anything; it is
 *                           re-normalised defensively)
 * @returns {string} the seeded demo location, or 'machakos' for production.
 */
function resolveLocation(scenario) {
  const key = normaliseScenario(scenario);
  return key ? DEMO_SCENARIOS[key] : PRODUCTION_LOCATION;
}

module.exports = {
  PRODUCTION_LOCATION,
  DEMO_SCENARIOS,
  normaliseScenario,
  resolveLocation,
};
