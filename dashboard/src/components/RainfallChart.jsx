import React from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import ChartCard, { LegendItem } from './ui/ChartCard.jsx';

/**
 * 30-day rainfall vs the climatological normal, framed in a ChartCard.
 *   Actual   — sky series, 2px round line over a 12%→0 gradient area fill.
 *   Normal   — muted grey, 2px dashed (distinguishable without colour).
 * Recessive horizontal-only gridlines, tabular muted axis labels, a custom
 * HTML legend below the title, and a hover crosshair + tooltip.
 *
 * Props:
 *   data     [{ date, actual, baseline }] (already merged), OR
 *   actuals + baseline arrays merged by date.
 *   spi, anomalyPct  optional figures shown in the card's right slot.
 */
function mergeSeries(actuals, baseline) {
  const baseByDate = new Map((baseline || []).map((b) => [b.date, b.mm]));
  return (actuals || []).map((a) => ({
    date: a.date,
    actual: a.mm,
    baseline: baseByDate.get(a.date) ?? null,
  }));
}

function fmtDay(d) {
  try {
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return d;
  }
}

const AXIS_TICK = { fontSize: 12, fill: 'var(--text-muted)' };

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const byKey = Object.fromEntries(payload.map((p) => [p.dataKey, p.value]));
  return (
    <div className="rounded-control border border-strong bg-surface-2 px-3 py-2 text-small shadow-card">
      <p className="mb-1 font-medium text-primary">{fmtDay(label)}</p>
      <p className="tabular text-secondary">
        <span className="text-sky">Actual</span>{' '}
        {byKey.actual != null ? `${Number(byKey.actual).toFixed(1)} mm` : '—'}
      </p>
      <p className="tabular text-secondary">
        Normal {byKey.baseline != null ? `${Number(byKey.baseline).toFixed(1)} mm` : '—'}
      </p>
    </div>
  );
}

export default function RainfallChart({ data, actuals, baseline, spi, anomalyPct }) {
  const chartData = data && data.length ? data : mergeSeries(actuals, baseline);

  const right = (
    <div className="flex items-center gap-4 text-small">
      {spi != null && (
        <span className="tabular text-secondary">
          SPI <span className="font-semibold text-primary">{spi > 0 ? '+' : ''}{spi.toFixed(2)}</span>
        </span>
      )}
      {anomalyPct != null && (
        <span className="tabular text-secondary">
          Anomaly <span className="font-semibold text-primary">{Math.round(anomalyPct)}%</span>
        </span>
      )}
    </div>
  );

  const legend = (
    <div className="flex flex-wrap gap-4">
      <LegendItem color="var(--sky)" label="Actual rainfall" />
      <LegendItem color="var(--chart-normal)" label="Historical normal" dashed />
    </div>
  );

  return (
    <ChartCard title="30-day rainfall vs normal" right={right} legend={legend}>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="rain-actual-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--sky)" stopOpacity="0.12" />
                <stop offset="100%" stopColor="var(--sky)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
            <XAxis
              dataKey="date"
              tick={AXIS_TICK}
              tickFormatter={fmtDay}
              tickLine={false}
              axisLine={{ stroke: 'var(--chart-grid)' }}
              minTickGap={24}
            />
            <YAxis
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={36}
              label={{ value: 'mm', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 12 }}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="actual"
              name="Actual rainfall"
              stroke="var(--sky)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="url(#rain-actual-fill)"
              dot={false}
              activeDot={{ r: 4, fill: 'var(--sky)', stroke: 'var(--surface-1)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="baseline"
              name="Historical normal"
              stroke="var(--chart-normal)"
              strokeWidth={2}
              strokeDasharray="5 5"
              strokeLinecap="round"
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
