import React from 'react';
import Card from './ui/Card.jsx';
import StatusHero from './ui/StatusHero.jsx';
import SignalCard from './ui/SignalCard.jsx';
import StatusBadge from './ui/StatusBadge.jsx';
import AiBadge from './ui/AiBadge.jsx';
import Button from './ui/Button.jsx';
import Icon from './ui/Icon.jsx';
import RainfallChart from './RainfallChart.jsx';
import IcpacMap from './IcpacMap.jsx';
import OnsetCard from './OnsetCard.jsx';
import { getStatus } from '../lib/status.js';
import { nextSeasonOnset } from '../lib/season.js';
import {
  spiVerdict,
  anomalyVerdict,
  droughtRisk,
  warningLevel,
  confidenceWord,
} from '../lib/interpret.js';

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
 * Early-warning readout (officer view). The theme is anticipatory
 * action, so this leads with the plain-language warning, the lead time to act,
 * and what to do — never a wall of indices. The raw figures (SPI, anomaly)
 * survive only as small print for credibility.
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

  const warn = warningLevel(alert?.level);
  const risk = droughtRisk(alert?.triggerCategory);
  const rain = spiVerdict(spi);
  const trend = anomalyVerdict(anomalyPct);
  const season = nextSeasonOnset(new Date());
  const conf = confidenceWord(rec?.confidence);
  const advisorySummary = status?.advisory?.[language] || status?.advisory?.en || status?.advisory?.sw;

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      {/* Row 1 — the early-warning banner: what the signal is, how long you have
          to act, and what to do. */}
      <StatusHero
        tone={st.tone}
        eyebrow="Early warning · maize · Machakos County"
        word={st.word}
        summary={st.summary}
        meta={
          <div className="flex flex-col gap-2 sm:items-end">
            <StatusBadge tone={warn.tone}>{warn.label}</StatusBadge>
            <p className="text-secondary">
              <span className="font-semibold text-primary">
                {season.weeks} {season.weeks === 1 ? 'week' : 'weeks'}
              </span>{' '}
              until {(language === 'sw' ? season.labelSw : season.label).toLowerCase()}
            </p>
            <p className="text-muted">Updated {fmtWhen(rec?.computedAt)}</p>
          </div>
        }
      />

      {/* Row 2 — plain-language signals. Verdict words lead; figures are fine
          print. Drought risk and lead time carry the early-warning message. */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <SignalCard
          label="Drought risk"
          verdict={risk.label}
          tone={risk.tone}
          meaning={risk.detail}
          figure={`Trigger: ${alert?.triggerCategory || 'none'} · alert ${alert?.level || '—'}`}
        />
        <SignalCard
          label="Time to prepare"
          verdict={`~${season.weeks} ${season.weeks === 1 ? 'week' : 'weeks'}`}
          tone="accent"
          meaning={`${language === 'sw' ? season.labelSw : season.label} — around ${season.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
          figure="Next planting window"
          spark={baselineSeries}
          sparkColor="var(--gold)"
        />
        <SignalCard
          label="Rainfall right now"
          verdict={rain.label}
          tone={rain.tone}
          meaning={rain.detail}
          figure={spi != null ? `SPI ${spi > 0 ? '+' : ''}${spi.toFixed(2)}` : undefined}
          spark={cumulative(actualSeries)}
          sparkColor="var(--sky)"
        />
        <SignalCard
          label="Recent rain (30 days)"
          verdict={trend.label}
          tone={trend.tone}
          meaning={trend.detail}
          figure={anomalyPct != null ? `${Math.round(anomalyPct)}% of normal` : undefined}
          spark={actualSeries}
          sparkColor="var(--sky)"
        />
      </div>

      {/* Rows 3–4 — evidence (chart) + what to do on the left; regional context
          and onset on the right. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <RainfallChart data={rainfall} spi={spi} anomalyPct={anomalyPct} />

          <Card className="flex flex-col gap-4 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-caption font-semibold uppercase tracking-wide text-muted">
                    What to do now
                  </p>
                  <AiBadge />
                </div>
                <h2 className="mt-1 font-display text-card-title font-medium text-primary">
                  {st.word}
                </h2>
              </div>
              <Button variant="secondary" onClick={() => (window.location.hash = '#/')}>
                Full advisory
                <Icon name="arrowRight" size={18} />
              </Button>
            </div>
            <p className="text-body text-secondary">
              {advisorySummary || 'No advisory available yet.'}
            </p>
            {/* The AI translation layer: indices -> plain, localised guidance. */}
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted">
              <Icon name="sparkle" size={14} className="text-accent" />
              Translated from the signals into plain{' '}
              <span className="inline-flex items-center gap-1 text-secondary">
                <Icon name="globe" size={13} /> English &amp; Kiswahili
              </span>{' '}
              by Llama 3.3 70B (Groq), grounded in the verified facts and safety-checked.
            </p>
            {conf && (
              <p className="flex items-center gap-2 text-small text-muted">
                <Icon name="check" size={16} /> {conf}
                {rec?.confidence != null ? ` (${Math.round(rec.confidence)}%)` : ''} · validated against
                CHIRPS onset
              </p>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-1">
          <IcpacMap />
          <OnsetCard onset={status?.onset} />
        </div>
      </div>

      {/* Officer detail — the raw indices survive here for credibility, clearly
          marked as technical, so the plain readout above never leads with them. */}
      <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 sm:px-6">
        <span className="text-caption font-semibold uppercase tracking-wide text-muted">
          Technical detail
        </span>
        <span className="tabular text-small text-secondary">
          SPI {spi != null ? `${spi > 0 ? '+' : ''}${spi.toFixed(2)}` : '—'}
        </span>
        <span className="tabular text-small text-secondary">
          30-day anomaly {anomalyPct != null ? `${Math.round(anomalyPct)}%` : '—'}
        </span>
        {alert?.spi1Month != null && (
          <span className="tabular text-small text-secondary">
            SPI-1mo {alert.spi1Month > 0 ? '+' : ''}
            {alert.spi1Month.toFixed(2)}
          </span>
        )}
        <span className="text-small text-muted">
          Source: CHIRPS (UCSB-CHC), Open-Meteo &amp; ICPAC Geoportal
        </span>
      </Card>
    </div>
  );
}
