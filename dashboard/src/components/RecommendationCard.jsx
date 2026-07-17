import React from 'react';
import AlertBadge from './AlertBadge.jsx';

/**
 * Card summarising the current planting recommendation.
 * Props: recommendation, confidence, advisoryText, alertLevel, computedAt.
 */
const REC_LABEL = {
  PLANT_NOW: 'PLANT NOW',
  WAIT: 'WAIT',
  DO_NOT_PLANT: 'DO NOT PLANT',
};

const REC_COLOR = {
  PLANT_NOW: 'text-green-600',
  WAIT: 'text-yellow-600',
  DO_NOT_PLANT: 'text-red-600',
};

function formatWhen(computedAt) {
  if (!computedAt) return 'Not yet computed';
  try {
    return new Date(computedAt).toLocaleString();
  } catch {
    return String(computedAt);
  }
}

export default function RecommendationCard({
  recommendation,
  confidence,
  advisoryText,
  alertLevel,
  computedAt,
  offSeason = false,
}) {
  // Off-season there is no planting decision — the advisory is pre-season prep.
  const label = offSeason
    ? 'PREPARE'
    : REC_LABEL[recommendation] || recommendation || 'NO DATA';
  const color = offSeason
    ? 'text-sky-600'
    : REC_COLOR[recommendation] || 'text-slate-600';

  return (
    <div className="rounded-2xl bg-white shadow-md p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            {offSeason ? 'Pre-season guidance' : 'Recommendation'}
          </p>
          <h2 className={`text-3xl font-extrabold ${color}`}>{label}</h2>
        </div>
        <AlertBadge alertLevel={alertLevel} />
      </div>

      {!offSeason && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">Confidence</span>
          <span className="text-lg font-semibold text-slate-700">
            {confidence != null ? `${Math.round(confidence)}%` : '—'}
          </span>
        </div>
      )}

      <div className="rounded-lg bg-slate-50 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Advisory (Kiswahili)</p>
        <p className="text-slate-800 leading-relaxed">
          {advisoryText || 'Hakuna ushauri kwa sasa.'}
        </p>
      </div>

      <p className="text-xs text-slate-400">Last updated: {formatWhen(computedAt)}</p>
    </div>
  );
}
