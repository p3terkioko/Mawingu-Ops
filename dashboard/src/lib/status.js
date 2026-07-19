/**
 * Status vocabulary — the product's core signal. One place maps the pipeline's
 * recommendation / phase into a traffic-light tone, the uppercase action word
 * (both languages), and a plain-language summary. Traffic-light tones are the
 * ONLY place these colors are used in the UI.
 *
 * Tones: green | amber | red | accent. PREPARE is pre-season prep, not a
 * traffic-light state, so it takes the neutral accent — never a status color.
 */

// Action word by recommendation key, per language. PREPARE is the off-season
// key. These match the USSD/SMS vocabulary exactly (do not reword).
const WORDS = {
  sw: { PLANT_NOW: 'PANDA SASA', WAIT: 'SUBIRI', DO_NOT_PLANT: 'USIPANDE', PREPARE: 'ANDAA SHAMBA' },
  en: { PLANT_NOW: 'PLANT NOW', WAIT: 'WAIT', DO_NOT_PLANT: 'DO NOT PLANT', PREPARE: 'PREPARE' },
};

const TONE_BY_KEY = {
  PLANT_NOW: 'green',
  WAIT: 'amber',
  DO_NOT_PLANT: 'red',
  PREPARE: 'accent',
};

// One-line plain-language summary of what the signal means, per language.
const SUMMARY = {
  sw: {
    PLANT_NOW: 'Hali ni nzuri kwa kupanda mahindi wiki hii.',
    WAIT: 'Subiri mvua ithibitike kabla ya kupanda.',
    DO_NOT_PLANT: 'Usipande sasa — hali ya mvua si ya kutosha.',
    PREPARE: 'Andaa shamba sasa; msimu wa kupanda unakaribia.',
  },
  en: {
    PLANT_NOW: 'Conditions favour planting maize this week.',
    WAIT: 'Hold for rains to establish before planting.',
    DO_NOT_PLANT: 'Do not plant now — rainfall is insufficient.',
    PREPARE: 'Prepare land now; the planting season is approaching.',
  },
};

/**
 * @param {object} args
 * @param {string} [args.recommendation] PLANT_NOW | WAIT | DO_NOT_PLANT
 * @param {string} [args.phase]          'off_season' switches to PREPARE
 * @param {string} [args.language]       'sw' | 'en'
 * @returns {{ key:string, tone:string, word:string, wordEn:string, summary:string }}
 */
export function getStatus({ recommendation, phase, language = 'sw' } = {}) {
  const offSeason = phase === 'off_season';
  const key = offSeason ? 'PREPARE' : recommendation || 'PREPARE';
  const lang = WORDS[language] ? language : 'sw';
  return {
    key,
    tone: TONE_BY_KEY[key] || 'accent',
    word: (WORDS[lang][key] || WORDS.en[key] || key),
    wordEn: WORDS.en[key] || key,
    summary: (SUMMARY[lang] && SUMMARY[lang][key]) || SUMMARY.en[key] || '',
  };
}

/**
 * Maps an alert level (GREEN/YELLOW/ORANGE/RED) to a traffic-light tone. Used
 * for the small severity chip; the hero uses the action-word tone above.
 */
export function toneForAlert(alertLevel) {
  switch ((alertLevel || '').toUpperCase()) {
    case 'GREEN':
      return 'green';
    case 'YELLOW':
    case 'ORANGE':
      return 'amber';
    case 'RED':
      return 'red';
    default:
      return 'neutral';
  }
}

/** Tailwind class fragments per tone — text, tint background, and border. */
export const TONE_CLASSES = {
  green: { text: 'text-status-green', bg: 'bg-status-green-bg', dot: 'bg-status-green' },
  amber: { text: 'text-status-amber', bg: 'bg-status-amber-bg', dot: 'bg-status-amber' },
  red: { text: 'text-status-red', bg: 'bg-status-red-bg', dot: 'bg-status-red' },
  accent: { text: 'text-accent', bg: 'bg-surface-2', dot: 'bg-accent' },
  neutral: { text: 'text-secondary', bg: 'bg-surface-2', dot: 'bg-[color:var(--text-muted)]' },
};

/** CSS variable name for a tone's core color — for inline styles (glow, SVG). */
export const TONE_VAR = {
  green: 'var(--status-green)',
  amber: 'var(--status-amber)',
  red: 'var(--status-red)',
  accent: 'var(--accent)',
  neutral: 'var(--text-muted)',
};
