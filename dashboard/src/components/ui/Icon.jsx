import React from 'react';

/**
 * Small inline-SVG icon set. Icons inherit `currentColor` and take a `size`
 * (px). Kept dependency-free — no icon library. Each path is 24×24.
 */
const PATHS = {
  // nav
  advisory: (
    <path
      d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v10A1.5 1.5 0 0 1 18.5 17H9l-4 3v-3H5.5A1.5 1.5 0 0 1 4 15.5v-10ZM8 9h8M8 12.5h5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  analytics: (
    <path
      d="M4 19V5m0 14h16M7.5 15l3.5-4 3 2.5L20 8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  admin: (
    <path
      d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3Zm0 6v3m0 3h.01"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  pin: (
    <path
      d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  // ui
  menu: (
    <path
      d="M4 7h16M4 12h16M4 17h16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  ),
  arrowRight: (
    <path
      d="M5 12h14m-6-6 6 6-6 6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  seedling: (
    <path
      d="M12 20v-6m0 0c0-2.5-2-4.5-5-4.5 0 3 2 4.5 5 4.5Zm0-1.5c0-2.5 2-4.5 5-4.5 0 3-2 4.5-5 4.5Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  bell: (
    <path
      d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Zm4 9a2 2 0 0 0 4 0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  check: (
    <path
      d="m5 12.5 4.5 4.5L19 7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  lock: (
    <path
      d="M7 10V8a5 5 0 0 1 10 0v2m-11 0h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Zm6 4v2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  sparkle: (
    <path
      d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Zm6 9l.8 2.2L21 15l-2.2.8L18 18l-.8-2.2L15 15l2.2-.8L18 12Z"
      fill="currentColor"
    />
  ),
  globe: (
    <path
      d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18M3.5 9h17M3.5 15h17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
};

export default function Icon({ name, size = 20, className = '', ...rest }) {
  const path = PATHS[name];
  if (!path) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {path}
    </svg>
  );
}

/**
 * MawinguOps logo mark — a cloud ("mawingu") with a small maize-gold spark,
 * grounding the twilight-sky identity in the crop subject.
 */
export function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path
        d="M9 21a5 5 0 0 1-.5-9.98A6.5 6.5 0 0 1 21 11.5a4.5 4.5 0 0 1-.4 9H9Z"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M22 15.5c1.6.4 2.8 1.9 2.8 3.6 0-1.7 1.2-3.2 2.8-3.6-1.6-.4-2.8-1.9-2.8-3.6 0 1.7-1.2 3.2-2.8 3.6Z"
        fill="var(--gold)"
      />
    </svg>
  );
}
