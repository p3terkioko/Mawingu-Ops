import React from 'react';
import Card from './ui/Card.jsx';
import StatusHero from './ui/StatusHero.jsx';
import MetricCard from './ui/MetricCard.jsx';
import Button from './ui/Button.jsx';
import Icon from './ui/Icon.jsx';
import RainfallChart from './RainfallChart.jsx';
import IcpacMap from './IcpacMap.jsx';
import OnsetCard from './OnsetCard.jsx';
import { getStatus } from '../lib/status.js';
import { nextSeasonOnset } from '../lib/season.js';

/** Running cumulative of a numeric series (nulls treated as 0), for a sparkline. */
function cumulative(nums) {
  let sum = 0;
  return nums.map((n) => (sum += n == null ? 0 : Number(n)));
}

function fmtWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

/**
 * Analytics — the dark flagship view. Status is the visual lead (full-width
 * hero), then a KPI row, then the rainfall chart beside the ICPAC map, then a
 * condensed advisory (links out to the full Advisory) and the onset panel.
 */
export default function AnalyticsView({ status, language = 'en' }) {
  const rec = status?.recommendation;
  const alert = status?.alert;
  const st = getStatus({ recommendation: rec?.recommendation, phase: rec?.phase, language: 'en' });

  const spi = alert?.spi;
  const anomalyPct = alert?.anomalyPct;
  const rainfall = status?.rainfall || [];
  const actualSeries = rainfall.map((r) => r.actual);
  const baselineSeries = rainfall.map((r) => r.baseline);

  const season = nextSeasonOnset(new Date());
  const advisorySummary = status?.advisory?.[language] || status?.advisory?.en || status?.advisory?.sw;

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      {/* Row 1 — signature status banner */}
      <StatusHero
        tone={st.tone}
        eyebrow="Current planting signal · Machakos County"
        word={st.word}
        summary={st.summary}
        meta={
          <>
            <p className="text-muted">Last updated</p>
            <p className="font-medium text-primary">{fmtWhen(rec?.computedAt)}</p>
          </>
        }
      />

      {/* Row 2 — KPI row */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="SPI (rainfall index)"
          value={spi != null ? `${spi > 0 ? '+' : ''}${spi.toFixed(2)}` : '—'}
          delta={
            spi != null
              ? { text: spi >= 0 ? 'Above normal' : 'Below normal', tone: spi >= 0 ? 'up' : 'down' }
              : undefined
          }
          caption={alert?.triggerCategory ? `${alert.triggerCategory} trigger` : 'standardised precipitation'}
          spark={cumulative(actualSeries)}
          sparkColor="var(--sky)"
        />
        <MetricCard
          label="30-day anomaly"
          value={anomalyPct != null ? `${Math.round(anomalyPct)}` : '—'}
          unit={anomalyPct != null ? '%' : ''}
          delta={
            anomalyPct != null
              ? {
                  text: anomalyPct >= 100 ? 'Wetter than normal' : 'Drier than normal',
                  tone: anomalyPct >= 100 ? 'up' : 'down',
                }
              : undefined
          }
          caption="vs climatological normal"
          spark={actualSeries}
          sparkColor="var(--sky)"
        />
        <MetricCard
          label="Next season onset"
          value={season.weeks}
          unit={season.weeks === 1 ? 'wk' : 'wks'}
          caption={`${language === 'sw' ? season.labelSw : season.label} · ${season.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
          spark={baselineSeries}
          sparkColor="var(--gold)"
        />
      </div>

      {/* Row 3 — rainfall chart + ICPAC context map */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RainfallChart data={rainfall} spi={spi} anomalyPct={anomalyPct} />
        </div>
        <div className="lg:col-span-1">
          <IcpacMap />
        </div>
      </div>

      {/* Row 4 — condensed advisory + onset */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-caption font-semibold uppercase tracking-wide text-muted">
                Advisory summary
              </p>
              <h2 className="mt-1 font-display text-card-title font-medium text-primary">
                {st.word}
              </h2>
            </div>
          </div>
          <p className="text-body text-secondary">
            {advisorySummary || 'No advisory available yet.'}
          </p>
          <div>
            <Button variant="secondary" onClick={() => (window.location.hash = '#/')}>
              Open full advisory
              <Icon name="arrowRight" size={18} />
            </Button>
          </div>
        </Card>

        <OnsetCard onset={status?.onset} />
      </div>
    </div>
  );
}
