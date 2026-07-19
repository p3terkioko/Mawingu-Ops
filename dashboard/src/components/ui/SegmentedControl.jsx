import React from 'react';

/**
 * The single toggle style used everywhere a segmented choice appears —
 * language, SMS/Email, map layers, and (optionally) view nav. One visual
 * language for all of them.
 *
 * Props:
 *   options  [{ value, label, icon? }]
 *   value    current value
 *   onChange (value) => void
 *   size     'sm' | 'md'  (md default; sm for dense chip rows)
 *   ariaLabel accessible group label
 */
export default function SegmentedControl({
  options,
  value,
  onChange,
  size = 'md',
  ariaLabel,
  className = '',
}) {
  const pad = size === 'sm' ? 'px-3 min-h-[36px] text-small' : 'px-4 min-h-[44px] text-body';
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex flex-wrap gap-1 rounded-pill border border-border bg-sunk p-1 ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center justify-center gap-2 rounded-pill font-semibold transition-colors duration-150 ${pad} ${
              active
                ? 'bg-accent text-accent-contrast shadow-card'
                : 'text-secondary hover:text-primary hover:bg-surface-2'
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
