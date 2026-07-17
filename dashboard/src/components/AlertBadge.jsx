import React from 'react';

/**
 * Colored badge for the drought alert level.
 * Props: alertLevel - one of GREEN, YELLOW, ORANGE, RED.
 */
const STYLES = {
  GREEN: 'bg-green-500 text-white',
  YELLOW: 'bg-yellow-400 text-slate-900',
  ORANGE: 'bg-orange-500 text-white',
  RED: 'bg-red-600 text-white',
};

export default function AlertBadge({ alertLevel }) {
  const level = (alertLevel || 'UNKNOWN').toUpperCase();
  const style = STYLES[level] || 'bg-slate-400 text-white';

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold tracking-wide ${style}`}
    >
      {level}
    </span>
  );
}
