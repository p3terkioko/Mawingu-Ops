import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

/**
 * Line chart comparing actual rainfall against the climatological baseline.
 * Props:
 *   data - array of { date, actual, baseline } (already merged), OR
 *   actuals + baseline arrays which are merged by date.
 */
function mergeSeries(actuals, baseline) {
  const baseByDate = new Map((baseline || []).map((b) => [b.date, b.mm]));
  return (actuals || []).map((a) => ({
    date: a.date,
    actual: a.mm,
    baseline: baseByDate.get(a.date) ?? null,
  }));
}

export default function RainfallChart({ data, actuals, baseline }) {
  const chartData = data && data.length ? data : mergeSeries(actuals, baseline);

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={20} />
          <YAxis tick={{ fontSize: 11 }} label={{ value: 'mm', angle: -90, position: 'insideLeft', fontSize: 12 }} />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="actual"
            name="Actual rainfall"
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="baseline"
            name="Historical normal"
            stroke="#94a3b8"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
