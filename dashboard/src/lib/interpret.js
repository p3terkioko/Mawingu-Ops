/**
 * Plain-language translation of the technical signals. The dashboard's job is
 * early warning for people who don't read indices — so every number is turned
 * into a verdict a farmer/officer understands, with the raw figure kept only as
 * small print for credibility. All bands are standard (WMO/McKee SPI drought
 * classes); nothing here invents data.
 */

/** Standard precipitation index → plain rainfall verdict + traffic-light tone. */
export function spiVerdict(spi) {
  if (spi == null) return { label: 'No data', tone: 'neutral', detail: '' };
  if (spi <= -1.5) return { label: 'Severely dry', tone: 'red', detail: 'Well below normal rainfall' };
  if (spi <= -1) return { label: 'Moderately dry', tone: 'amber', detail: 'Below normal rainfall' };
  if (spi <= -0.5) return { label: 'Slightly dry', tone: 'amber', detail: 'A little below normal' };
  if (spi < 0.5) return { label: 'Normal', tone: 'green', detail: 'About average for now' };
  if (spi < 1.5) return { label: 'Above normal', tone: 'green', detail: 'Wetter than usual' };
  return { label: 'Very wet', tone: 'amber', detail: 'Much wetter than usual' };
}

/** 30-day anomaly (% of the climatological normal) → plain verdict. */
export function anomalyVerdict(pct) {
  if (pct == null) return { label: 'No data', tone: 'neutral', detail: '' };
  const diff = Math.round(pct - 100);
  if (Math.abs(diff) < 10) return { label: 'About average', tone: 'green', detail: `${diff >= 0 ? '+' : ''}${diff}% vs the usual` };
  if (diff >= 10) return { label: 'Above average', tone: pct > 150 ? 'amber' : 'green', detail: `+${diff}% vs the usual` };
  return { label: 'Below average', tone: diff <= -30 ? 'red' : 'amber', detail: `${diff}% vs the usual` };
}

/** Drought trigger category → plain risk level. */
export function droughtRisk(triggerCategory) {
  switch ((triggerCategory || 'none').toLowerCase()) {
    case 'extreme':
      return { label: 'Severe', tone: 'red', detail: 'Extreme dry-spell signal' };
    case 'severe':
      return { label: 'High', tone: 'red', detail: 'Severe dry-spell signal' };
    case 'moderate':
      return { label: 'Moderate', tone: 'amber', detail: 'Dry-spell building' };
    case 'mild':
      return { label: 'Low', tone: 'amber', detail: 'Early dry-spell signal' };
    default:
      return { label: 'None', tone: 'green', detail: 'No dry-spell trigger this week' };
  }
}

/** Alert level → plain early-warning status. */
export function warningLevel(alertLevel) {
  switch ((alertLevel || '').toUpperCase()) {
    case 'GREEN':
      return { label: 'No active warning', short: 'All clear', tone: 'green' };
    case 'YELLOW':
      return { label: 'Watch', short: 'Watch', tone: 'amber' };
    case 'ORANGE':
      return { label: 'Warning', short: 'Warning', tone: 'amber' };
    case 'RED':
      return { label: 'Alert', short: 'Alert', tone: 'red' };
    default:
      return { label: 'Status unknown', short: 'Unknown', tone: 'neutral' };
  }
}

/** Model confidence (%) → plain wording. */
export function confidenceWord(pct) {
  if (pct == null) return null;
  if (pct >= 75) return 'High confidence';
  if (pct >= 50) return 'Moderate confidence';
  return 'Low confidence';
}
