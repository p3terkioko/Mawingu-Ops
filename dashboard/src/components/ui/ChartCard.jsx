import React from 'react';
import Card from './Card.jsx';

/**
 * A chart container with a title, an optional right slot (e.g. an SPI figure),
 * a custom HTML legend row, and the chart body. Keeps every chart framed the
 * same way instead of relying on each library's default chrome.
 *
 * Props:
 *   title    string
 *   right    optional node (metric / control)
 *   legend   optional node rendered below the title (custom legend)
 *   children the chart itself
 */
export default function ChartCard({ title, right, legend, children, className = '' }) {
  return (
    <Card className={`flex flex-col gap-4 p-4 sm:p-6 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-display text-card-title font-medium text-primary">{title}</h2>
        {right}
      </div>
      {legend}
      <div>{children}</div>
    </Card>
  );
}

/**
 * Custom legend item — a color/line swatch plus label. `dashed` draws the
 * historical-normal pattern so the two series are distinguishable without
 * relying on color alone.
 */
export function LegendItem({ color, label, dashed = false }) {
  return (
    <span className="inline-flex items-center gap-2 text-small text-secondary">
      <svg width="20" height="8" aria-hidden="true">
        <line
          x1="0"
          y1="4"
          x2="20"
          y2="4"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={dashed ? '4 3' : undefined}
        />
      </svg>
      {label}
    </span>
  );
}
