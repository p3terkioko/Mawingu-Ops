/**
 * Season windows for Machakos, matching the fixed calendar MawinguOps already
 * aligns to (see the ICPAC growing-season layers in IcpacMap): long rains
 * (MAM) open ~15 Mar, short rains (OND) open ~14 Oct. This is presentation
 * logic over existing constants — no invented data.
 */
const SEASONS = [
  { key: 'long_rains', label: 'Long rains', labelSw: 'Msimu wa mvua ndefu', month: 2, day: 15 }, // 15 Mar
  { key: 'short_rains', label: 'Short rains', labelSw: 'Msimu wa mvua fupi', month: 9, day: 14 }, // 14 Oct
];

/**
 * The next upcoming season onset from `now`, with a whole-week countdown.
 * @param {Date} now
 * @returns {{ key:string, label:string, labelSw:string, date:Date, weeks:number, days:number }}
 */
export function nextSeasonOnset(now = new Date()) {
  const year = now.getFullYear();
  const candidates = [];
  for (const s of SEASONS) {
    for (const y of [year, year + 1]) {
      candidates.push({ ...s, date: new Date(y, s.month, s.day) });
    }
  }
  const upcoming = candidates
    .filter((c) => c.date >= now)
    .sort((a, b) => a.date - b.date)[0];
  const days = Math.max(0, Math.round((upcoming.date - now) / 86400000));
  return { ...upcoming, days, weeks: Math.round(days / 7) };
}
