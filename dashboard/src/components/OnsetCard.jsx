import React from 'react';

/**
 * Growing-season onset validation card.
 *
 * Shows whether MawinguOps's planting signal lines up with when the season
 * actually opens — cross-checked against the CHIRPS climatology (or ICPAC's
 * official onset from the ICPAC Data Library when configured). This is the
 * ICPAC-aligned credibility check for the recommendation.
 *
 * Props: onset (the `onset` object from /api/status) or null.
 */
const AGREEMENT = {
  agrees: { label: 'Agrees with onset', cls: 'bg-green-100 text-green-700' },
  conservative: { label: 'More cautious than onset', cls: 'bg-yellow-100 text-yellow-700' },
  diverges: { label: 'Diverges from onset', cls: 'bg-red-100 text-red-700' },
  'n/a': { label: 'No active season', cls: 'bg-slate-100 text-slate-500' },
};

const SEASON_LABEL = {
  long_rains: 'Long rains (MAM)',
  short_rains: 'Short rains (OND)',
  off_season: 'Between seasons',
};

const REF_LABEL = {
  icpac_digilib: 'ICPAC Data Library',
  chirps_climatology: 'CHIRPS climatology',
};

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return String(d);
  }
}

export default function OnsetCard({ onset }) {
  if (!onset) {
    return (
      <div className="rounded-2xl bg-white shadow-md p-6">
        <h2 className="font-semibold text-slate-700">Growing-season onset</h2>
        <p className="text-sm text-slate-400 mt-2">No onset validation yet.</p>
      </div>
    );
  }

  const agree = AGREEMENT[onset.agreement] || AGREEMENT['n/a'];
  const dvc = onset.daysVsClimatology;
  const dvcText =
    dvc == null
      ? null
      : dvc === 0
      ? 'on time'
      : dvc < 0
      ? `${Math.abs(dvc)} days early`
      : `${dvc} days late`;

  return (
    <div className="rounded-2xl bg-white shadow-md p-6 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Growing-season onset</p>
          <h2 className="font-semibold text-slate-700">
            {SEASON_LABEL[onset.season] || onset.season}
          </h2>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${agree.cls}`}>
          {agree.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-400">Onset detected</p>
          <p className="text-lg font-semibold text-slate-800">{fmtDate(onset.onsetDate)}</p>
          {dvcText && <p className="text-xs text-slate-500">{dvcText} vs normal</p>}
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-400">Usual onset</p>
          <p className="text-lg font-semibold text-slate-800">{fmtDate(onset.climatologyOnset)}</p>
          <p className="text-xs text-slate-500">ref: {REF_LABEL[onset.referenceSource] || onset.referenceSource}</p>
        </div>
      </div>

      <p className="text-sm text-slate-600 leading-relaxed">{onset.message}</p>
    </div>
  );
}
