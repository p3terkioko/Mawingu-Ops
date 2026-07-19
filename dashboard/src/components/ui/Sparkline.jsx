import React, { useId } from 'react';

/**
 * Tiny inline-SVG sparkline — a line with a soft gradient area fill, matching
 * the main chart's series styling. Dependency-free so metric cards stay light.
 *
 * Props:
 *   data   array of numbers (nulls skipped)
 *   color  CSS color for the stroke/fill (default the sky data series)
 *   width/height in px
 */
export default function Sparkline({
  data = [],
  color = 'var(--sky)',
  width = 96,
  height = 32,
  strokeWidth = 2,
  responsive = false,
}) {
  const id = useId();
  const nums = data.map((n) => (n == null ? null : Number(n)));
  const valid = nums.filter((n) => n != null && !Number.isNaN(n));
  if (valid.length < 2) {
    return <div style={{ width: responsive ? '100%' : width, height }} aria-hidden="true" />;
  }

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const span = max - min || 1;
  const pad = strokeWidth;
  const stepX = (width - pad * 2) / (nums.length - 1);
  const y = (v) => pad + (height - pad * 2) * (1 - (v - min) / span);

  const pts = [];
  nums.forEach((v, i) => {
    if (v == null || Number.isNaN(v)) return;
    pts.push([pad + i * stepX, y(v)]);
  });

  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${height - pad} L${pts[0][0].toFixed(1)} ${
    height - pad
  } Z`;

  return (
    <svg
      width={responsive ? '100%' : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={responsive ? 'none' : 'xMidYMid meet'}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${id})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
