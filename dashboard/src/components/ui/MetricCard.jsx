import React from 'react';
import Card from './Card.jsx';
import Sparkline from './Sparkline.jsx';

/**
 * KPI metric card — small uppercase label, large tabular value with a delta
 * pill, and a bold full-width sparkline strip along the bottom (the reference's
 * signature metric-card shape). The value is the hero.
 *
 * Props:
 *   label     short uppercase caption
 *   value     the metric (string/number, rendered tabular)
 *   unit      optional trailing unit
 *   delta     { text, tone } where tone is 'up'|'down'|'flat'
 *   spark     array of numbers for the sparkline
 *   sparkColor CSS color for the sparkline
 *   caption   optional context line under the value
 */
const DELTA_TONE = {
  up: 'text-status-green bg-status-green-bg',
  down: 'text-status-red bg-status-red-bg',
  flat: 'text-muted bg-surface-2',
};

export default function MetricCard({ label, value, unit, delta, spark, sparkColor, caption }) {
  return (
    <Card className="flex flex-col justify-between gap-4 overflow-hidden p-4 sm:p-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-caption font-semibold uppercase tracking-wide text-muted">{label}</p>
          {delta && (
            <span
              className={`rounded-pill px-2 py-0.5 text-caption font-semibold ${DELTA_TONE[delta.tone] || DELTA_TONE.flat}`}
            >
              {delta.text}
            </span>
          )}
        </div>
        <div>
          <p className="metric font-display text-hero font-medium leading-none text-primary">
            {value}
            {unit && <span className="ml-1 text-card-title text-secondary">{unit}</span>}
          </p>
          {caption && <p className="mt-2 text-small text-secondary">{caption}</p>}
        </div>
      </div>
      {spark && (
        <div className="-mx-1 -mb-1">
          <Sparkline data={spark} color={sparkColor} responsive width={320} height={44} />
        </div>
      )}
    </Card>
  );
}
