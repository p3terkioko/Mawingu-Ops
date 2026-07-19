import React from 'react';
import Card from './Card.jsx';
import Sparkline from './Sparkline.jsx';

/**
 * KPI metric card — small uppercase label, large tabular value, an optional
 * delta, and an inline sparkline. The value is the hero; everything else is
 * secondary.
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
  up: 'text-status-green',
  down: 'text-status-red',
  flat: 'text-muted',
};

export default function MetricCard({ label, value, unit, delta, spark, sparkColor, caption }) {
  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-6">
      <p className="text-caption font-semibold uppercase tracking-wide text-muted">{label}</p>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="metric font-display text-hero font-medium leading-none text-primary">
            {value}
            {unit && <span className="ml-1 text-card-title text-secondary">{unit}</span>}
          </p>
          {(delta || caption) && (
            <p className="mt-2 text-small">
              {delta && <span className={`font-semibold ${DELTA_TONE[delta.tone] || 'text-muted'}`}>{delta.text}</span>}
              {delta && caption && <span className="text-muted"> · </span>}
              {caption && <span className="text-secondary">{caption}</span>}
            </p>
          )}
        </div>
        {spark && <Sparkline data={spark} color={sparkColor} />}
      </div>
    </Card>
  );
}
