import React from 'react';
import Card from './ui/Card.jsx';
import EmptyState from './ui/EmptyState.jsx';
import StatusBadge from './ui/StatusBadge.jsx';

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
  agrees: { label: 'Agrees with onset', tone: 'green' },
  conservative: { label: 'More cautious than onset', tone: 'amber' },
  diverges: { label: 'Diverges from onset', tone: 'red' },
  'n/a': { label: 'No active season', tone: 'neutral' },
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
      <Card className="flex flex-col gap-4 p-6">
        <div>
          <p className="text-caption font-semibold uppercase tracking-wide text-muted">
            Growing-season onset
          </p>
          <h2 className="mt-1 font-display text-card-title font-medium text-primary">
            Waiting for the season
          </h2>
        </div>
        <EmptyState
          icon="seedling"
          title="No onset validation yet"
          description="When the next rains begin, this panel cross-checks the planting signal against the CHIRPS climatology (or the ICPAC Data Library) and shows how early or late the season opened."
        />
      </Card>
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
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-caption font-semibold uppercase tracking-wide text-muted">
            Growing-season onset
          </p>
          <h2 className="mt-1 font-display text-card-title font-medium text-primary">
            {SEASON_LABEL[onset.season] || onset.season}
          </h2>
        </div>
        <StatusBadge tone={agree.tone}>{agree.label}</StatusBadge>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-control bg-surface-2 p-3">
          <p className="text-caption text-muted">Onset detected</p>
          <p className="metric mt-1 text-card-title font-semibold text-primary">
            {fmtDate(onset.onsetDate)}
          </p>
          {dvcText && <p className="text-caption text-secondary">{dvcText} vs normal</p>}
        </div>
        <div className="rounded-control bg-surface-2 p-3">
          <p className="text-caption text-muted">Usual onset</p>
          <p className="metric mt-1 text-card-title font-semibold text-primary">
            {fmtDate(onset.climatologyOnset)}
          </p>
          <p className="text-caption text-secondary">
            ref: {REF_LABEL[onset.referenceSource] || onset.referenceSource}
          </p>
        </div>
      </div>

      <p className="text-body text-secondary">{onset.message}</p>
    </Card>
  );
}
