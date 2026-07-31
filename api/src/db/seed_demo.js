'use strict';

/**
 * Seed the in-season DEMO scenarios (and a production off-season baseline).
 *
 * Why this exists
 * ---------------
 * The plant/wait/don't-plant decision is only live during the two Kenyan rain
 * windows (pipeline/season.py). Off-season — including the submission window —
 * a real farmer correctly gets the PREPARE message, so the headline decision
 * cannot be demonstrated live from real data. This script seeds three dedicated
 * demo locations, each holding a fresh, in-season scenario, that the `demo=`
 * selector routes to (see services/demo.js). Nothing here changes what a real
 * farmer on 'machakos' sees.
 *
 *   demo_plant_now     PLANT_NOW,   calm conditions
 *   demo_wait          WAIT,        mildly below-normal rain
 *   demo_do_not_plant  DO_NOT_PLANT, severe drought AND a week-over-week
 *                      escalation (moderate -> severe), so it also demonstrates
 *                      the anticipatory drought banner on the USSD menu.
 *
 * It also ensures 'machakos' has a *currently valid* off-season advisory, so a
 * cold deployment (no Python pipeline) still shows correct real behaviour. That
 * baseline is only inserted when no valid machakos advisory already exists, so
 * it never clobbers real pipeline output.
 *
 * Idempotent: demo_* rows are deleted and re-inserted on every run.
 */

const path = require('path');
// Load DATABASE_URL from the repo-root .env (as the server does), so
// `npm run seed:demo` works standalone. Real env vars win.
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
require('dotenv').config();
const { Pool } = require('pg');

const VALID_DAYS = 7;

// Each demo scenario: the alert signal, the decision, and the advisory text
// (styled exactly like pipeline/generate_advisory.py's 4-part output).
const SCENARIOS = [
  {
    location: 'demo_plant_now',
    alert: { level: 'GREEN', anomalyPct: 108, spi: 0.35, trigger: 'none' },
    recommendation: 'PLANT_NOW',
    confidence: 82,
    advisories: {
      sw: 'Panda mahindi sasa. Mvua za msimu zimeanza na mvua nzuri inatarajiwa wiki mbili zijazo. Ukichelewa kupanda, unaweza kukosa mvua nzuri na mavuno yako yatapungua. Maliza kupanda mahindi ndani ya siku chache na upige *384# wiki ijayo kupata ushauri mpya.',
      en: "Plant maize now. The season's rains have started and good rain is expected over the next two weeks. If you delay planting, you may miss the best of the rains and harvest much less. Finish planting your maize within a few days and dial *384# next week for the new advisory.",
    },
  },
  {
    location: 'demo_wait',
    alert: { level: 'YELLOW', anomalyPct: 74, spi: -0.62, trigger: 'mild' },
    recommendation: 'WAIT',
    confidence: 68,
    advisories: {
      sw: 'Subiri kupanda mahindi. Mvua imekuwa chini kidogo ya kawaida na mvua inayotarajiwa wiki mbili zijazo haitoshi kuotesha mbegu salama. Ukipanda sasa, mbegu zinaweza kushindwa kuota na pesa zako zitapotea. Hifadhi mbegu zako vizuri na upige *384# wiki ijayo.',
      en: 'Wait to plant your maize. Rain has been a little below normal and the rain expected over the next two weeks is not enough for seeds to sprout safely. If you plant now, the seeds may fail to sprout and your seed money is wasted. Keep your seed stored safely and dial *384# next week.',
    },
  },
  {
    location: 'demo_do_not_plant',
    alert: { level: 'RED', anomalyPct: 41, spi: -1.7, trigger: 'severe' },
    // Prior alert row so the latest-two comparison detects an escalation
    // (moderate -> severe) and the USSD menu shows the worsening banner.
    priorAlert: { level: 'ORANGE', anomalyPct: 58, spi: -1.2, trigger: 'moderate' },
    recommendation: 'DO_NOT_PLANT',
    confidence: 90,
    advisories: {
      sw: 'Usipande mahindi sasa. Mvua imekuwa pungufu mno kuliko kawaida na kipindi kirefu bila mvua kinatarajiwa. Ukipanda sasa, mimea ina uwezekano mkubwa wa kukauka na kufa, na mbegu zako zitapotea. Hifadhi mbegu zako na upige *384# wiki ijayo kupata ushauri mpya.',
      en: 'Do not plant maize now. Rain has been far below normal and a long dry spell is expected in the coming weeks. If you plant now, the crop is very likely to dry up and die and your seed is lost. Hold on to your maize seed and dial *384# next week for the new advisory.',
    },
  },
];

// Production off-season baseline (PREPARE), inserted only if machakos has no
// currently-valid advisory. Mirrors pipeline/generate_advisory.py's off-season
// fallback so a cold deployment shows correct real behaviour.
const MACHAKOS_BASELINE = {
  alert: { level: 'GREEN', anomalyPct: 105, spi: 0.33, trigger: 'none' },
  recommendation: 'WAIT', // raw model signal; phase=off_season -> shown as PREPARE
  confidence: 61,
  advisories: {
    sw: 'Andaa shamba lako la mahindi sasa. Msimu wa vuli unakaribia, na shamba lililoandaliwa mapema huleta mavuno bora. Lima na safisha shamba, na ununue mbegu za mahindi zinazokomaa mapema. Msimu wa vuli ni kama wiki 10 kutoka sasa; piga *384# kila wiki kupata ushauri mpya.',
    en: 'Prepare your maize land now. The short rains (OND) season is coming, and a farm prepared early gives a better harvest. Clear and till your plot and buy early-maturing maize seed in good time. The short rains are about 10 weeks away; dial *384# each week for the latest advisory.',
  },
};

// Real 30-day Machakos rainfall (CHIRPS actuals + climatological baseline),
// captured from the pipeline output. Seeded only on a cold DB so the dashboard
// rainfall chart renders without the Python pipeline deployed. Never clobbers
// real pipeline data (guarded on existence below).
const MACHAKOS_RAINFALL = [
  { date: '2026-05-27', actual: 0, baseline: 1.85 },
  { date: '2026-05-28', actual: 0.06, baseline: 2.76 },
  { date: '2026-05-29', actual: 0, baseline: 1.04 },
  { date: '2026-05-30', actual: 1.45, baseline: 1.14 },
  { date: '2026-05-31', actual: 1.9, baseline: 0.54 },
  { date: '2026-06-01', actual: 0.7, baseline: 0.82 },
  { date: '2026-06-02', actual: 2, baseline: 0.91 },
  { date: '2026-06-03', actual: 0.9, baseline: 0.54 },
  { date: '2026-06-04', actual: 0.2, baseline: 1.5 },
  { date: '2026-06-05', actual: 0.2, baseline: 1.34 },
  { date: '2026-06-06', actual: 0, baseline: 2.74 },
  { date: '2026-06-07', actual: 0.4, baseline: 0.53 },
  { date: '2026-06-08', actual: 0, baseline: 1.1 },
  { date: '2026-06-09', actual: 0.6, baseline: 1.83 },
  { date: '2026-06-10', actual: 0.4, baseline: 0.52 },
  { date: '2026-06-11', actual: 1.6, baseline: 0.43 },
  { date: '2026-06-12', actual: 0.3, baseline: 0.22 },
  { date: '2026-06-13', actual: 0.5, baseline: 0.25 },
  { date: '2026-06-14', actual: 0, baseline: 0.29 },
  { date: '2026-06-15', actual: 0.3, baseline: 0.2 },
  { date: '2026-06-16', actual: 0.3, baseline: 0.13 },
  { date: '2026-06-17', actual: 0.6, baseline: 0.17 },
  { date: '2026-06-18', actual: 1.7, baseline: 0.1 },
  { date: '2026-06-19', actual: 1.5, baseline: 0.14 },
  { date: '2026-06-20', actual: 0.3, baseline: 0.08 },
  { date: '2026-06-21', actual: 0.3, baseline: 0.15 },
  { date: '2026-06-22', actual: 0, baseline: 0.21 },
  { date: '2026-06-23', actual: 2.8, baseline: 0.2 },
  { date: '2026-06-24', actual: 1.9, baseline: 0.27 },
  { date: '2026-06-25', actual: 0.4, baseline: 0.1 },
];

// Day-of-year, matching the calculation in routes/health.js.
function dayOfYear(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d - start) / 86400000);
}

async function insertAlert(pool, location, a, computedOffsetSec = 0) {
  await pool.query(
    `INSERT INTO alert_levels
       (location, alert_level, anomaly_pct, spi, trigger_category,
        computed_at, valid_until)
     VALUES ($1, $2, $3, $4, $5,
             NOW() - ($6 || ' seconds')::interval,
             NOW() + INTERVAL '${VALID_DAYS} days')`,
    [location, a.level, a.anomalyPct, a.spi, a.trigger, computedOffsetSec]
  );
}

async function insertRecommendation(pool, location, rec, confidence, phase) {
  await pool.query(
    `INSERT INTO planting_recommendations
       (location, crop, recommendation, confidence_score, features_snapshot,
        phase, computed_at, valid_until)
     VALUES ($1, 'maize', $2, $3, $4, $5,
             NOW(), NOW() + INTERVAL '${VALID_DAYS} days')`,
    [location, rec, confidence, JSON.stringify({ seeded: true }), phase]
  );
}

async function insertAdvisories(pool, location, rec, alertLevel, advisories) {
  for (const lang of ['sw', 'en']) {
    await pool.query(
      `INSERT INTO advisories
         (location, crop, language, alert_level, recommendation,
          advisory_text, generated_at, valid_until)
       VALUES ($1, 'maize', $2, $3, $4, $5,
               NOW(), NOW() + INTERVAL '${VALID_DAYS} days')`,
      [location, lang, alertLevel, rec, advisories[lang]]
    );
  }
}

async function seedScenario(pool, s) {
  await pool.query('DELETE FROM advisories WHERE location = $1', [s.location]);
  await pool.query('DELETE FROM planting_recommendations WHERE location = $1', [s.location]);
  await pool.query('DELETE FROM alert_levels WHERE location = $1', [s.location]);

  if (s.priorAlert) {
    // Older row first (computed 1 hour ago) so "latest two" sees the worsening.
    await insertAlert(pool, s.location, s.priorAlert, 3600);
  }
  await insertAlert(pool, s.location, s.alert, 0);
  await insertRecommendation(pool, s.location, s.recommendation, s.confidence, 'in_season');
  await insertAdvisories(pool, s.location, s.recommendation, s.alert.level, s.advisories);
  console.log(`[seed] ${s.location}: ${s.recommendation}` + (s.priorAlert ? ' (+escalation)' : ''));
}

async function ensureMachakosBaseline(pool) {
  const { rows } = await pool.query(
    `SELECT 1 FROM advisories
     WHERE location = 'machakos' AND valid_until > NOW() LIMIT 1`
  );
  if (rows.length > 0) {
    console.log('[seed] machakos already has a valid advisory — baseline skipped');
    return;
  }
  const b = MACHAKOS_BASELINE;
  await insertAlert(pool, 'machakos', b.alert, 0);
  await insertRecommendation(pool, 'machakos', b.recommendation, b.confidence, 'off_season');
  await insertAdvisories(pool, 'machakos', b.recommendation, b.alert.level, b.advisories);
  console.log('[seed] machakos off-season baseline inserted (PREPARE)');
}

async function ensureMachakosRainfall(pool) {
  const { rows } = await pool.query(
    `SELECT 1 FROM rainfall_actuals WHERE location = 'machakos' LIMIT 1`
  );
  if (rows.length > 0) {
    console.log('[seed] machakos rainfall present — skipped');
    return;
  }
  for (const p of MACHAKOS_RAINFALL) {
    await pool.query(
      `INSERT INTO rainfall_actuals (location, date, rainfall_mm, source)
       VALUES ('machakos', $1, $2, 'seed')
       ON CONFLICT (location, date) DO NOTHING`,
      [p.date, p.actual]
    );
    if (p.baseline != null) {
      await pool.query(
        `INSERT INTO rainfall_baseline (location, day_of_year, mean_rainfall_mm)
         VALUES ('machakos', $1, $2)
         ON CONFLICT (location, day_of_year) DO NOTHING`,
        [dayOfYear(p.date), p.baseline]
      );
    }
  }
  console.log(`[seed] machakos ${MACHAKOS_RAINFALL.length}-day rainfall + baseline inserted`);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[seed] FATAL: DATABASE_URL is not set');
    process.exit(1);
  }
  const pool = new Pool({ connectionString });
  try {
    for (const s of SCENARIOS) {
      await seedScenario(pool, s);
    }
    await ensureMachakosBaseline(pool);
    await ensureMachakosRainfall(pool);
    console.log('[seed] demo scenarios ready');
  } catch (err) {
    console.error(`[seed] FAILED: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
