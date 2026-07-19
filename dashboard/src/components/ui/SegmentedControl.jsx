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
  // Both sizes keep a 44px touch target; sm only tightens padding/type.
  const pad = size === 'sm' ? 'px-3 min-h-[44px] text-small' : 'px-4 min-h-[44px] text-body';
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex flex-wrap gap-1 rounded-pill bg-sunk p-1 ${className}`}
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
            style={
              active
                ? { boxShadow: '0 2px 10px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.18)' }
                : undefined
            }
            className={`inline-flex items-center justify-center gap-2 rounded-pill font-semibold transition-colors duration-150 ${pad} ${
              active
                ? 'bg-accent text-accent-contrast'
                : 'text-secondary hover:bg-surface-2 hover:text-primary'
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
