import React from 'react';
import { TONE_CLASSES } from '../../lib/status.js';

/**
 * Compact status pill — color tint + dot + word. Never color alone: the word
 * always carries the meaning too. Used in the top bar and card headers.
 */
export default function StatusBadge({ tone = 'neutral', children, className = '' }) {
  const c = TONE_CLASSES[tone] || TONE_CLASSES.neutral;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-pill px-3 py-1.5 text-small font-semibold ${c.bg} ${c.text} ${className}`}
    >
      <span className={`h-2 w-2 rounded-full ${c.dot}`} aria-hidden="true" />
      {children}
    </span>
  );
}
