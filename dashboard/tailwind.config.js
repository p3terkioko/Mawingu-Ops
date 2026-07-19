/** @type {import('tailwindcss').Config} */

// Tokens are defined once as CSS variables in src/index.css (:root = dark,
// [data-theme="light"] = light). Here we only expose them to Tailwind as
// utilities so components can write bg-surface-1 / text-primary / rounded-card
// while the actual values — and theme switching — stay in the CSS layer.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg-canvas)',
        sunk: 'var(--bg-sunk)',
        'surface-1': 'var(--surface-1)',
        'surface-2': 'var(--surface-2)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',

        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-press': 'var(--accent-press)',
        'accent-contrast': 'var(--accent-contrast)',
        gold: 'var(--gold)',
        sky: 'var(--sky)',

        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',

        'status-green': 'var(--status-green)',
        'status-amber': 'var(--status-amber)',
        'status-red': 'var(--status-red)',
        'status-green-bg': 'var(--status-green-bg)',
        'status-amber-bg': 'var(--status-amber-bg)',
        'status-red-bg': 'var(--status-red-bg)',
      },
      textColor: {
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        muted: 'var(--text-muted)',
      },
      borderColor: {
        DEFAULT: 'var(--border)',
        strong: 'var(--border-strong)',
      },
      borderRadius: {
        card: 'var(--radius-card)',
        control: 'var(--radius-control)',
        pill: 'var(--radius-pill)',
      },
      // Spacing intentionally NOT overridden: Tailwind's default 1/2/3/4/6/8/12
      // already equal the token scale (4/8/12/16/24/32/48px). The scale is
      // enforced by using only those steps in markup.
      boxShadow: {
        card: 'var(--shadow-card)',
      },
      fontFamily: {
        display: ["'Space Grotesk'", 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        caption: ['12px', { lineHeight: '1.5' }],
        small: ['13px', { lineHeight: '1.5' }],
        body: ['15px', { lineHeight: '1.6' }],
        'body-lg': ['16px', { lineHeight: '1.6' }],
        'card-title': ['20px', { lineHeight: '1.3' }],
        'section-title': ['24px', { lineHeight: '1.25' }],
        hero: ['34px', { lineHeight: '1.1' }],
        status: ['48px', { lineHeight: '1.05', letterSpacing: '-0.01em' }],
      },
      maxWidth: {
        content: '1280px',
        measure: '640px',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.35s ease-out both',
      },
    },
  },
  plugins: [],
};
