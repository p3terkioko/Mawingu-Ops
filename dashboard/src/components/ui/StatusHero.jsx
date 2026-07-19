import React from 'react';
import { TONE_CLASSES, TONE_VAR } from '../../lib/status.js';

/**
 * The signature status banner — the product's core signal made the visual lead.
 * Driven by tone (green/amber/red/accent): tinted background, the large
 * uppercase action word, a plain-language summary, and a timestamp.
 *
 * This is the ONE place a glow is allowed (soft box-shadow in the status
 * color). Everything else stays quiet. Respects prefers-reduced-motion via the
 * global stylesheet (the glow is static, not animated).
 *
 * Props:
 *   tone      green|amber|red|accent
 *   eyebrow   small label above the word (e.g. "This week's advisory")
 *   word      the uppercase action word (PLANT NOW / SUBIRI / …)
 *   summary   one-line plain-language meaning
 *   meta      right-aligned meta (timestamp) — optional node
 *   glow      whether to apply the signature glow (default true)
 *   variant   'dark' | 'light' (affects only text weight tuning)
 */
export default function StatusHero({ tone = 'accent', eyebrow, word, summary, meta, glow = true, className = '' }) {
  const c = TONE_CLASSES[tone] || TONE_CLASSES.accent;
  const color = TONE_VAR[tone] || TONE_VAR.accent;

  return (
    <section
      className={`relative overflow-hidden rounded-card bg-surface-1 p-6 sm:p-8 ${className}`}
      style={
        glow
          ? { boxShadow: `var(--shadow-card), 0 0 70px color-mix(in srgb, ${color} 26%, transparent)` }
          : { boxShadow: 'var(--shadow-card)' }
      }
    >
      {/* Gradient wash + soft light source keyed to the status color. */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background: `radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, ${color} 22%, transparent) 0%, transparent 55%)`,
        }}
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span className={`mt-2 h-3 w-3 flex-none rounded-full ${c.dot}`} aria-hidden="true" />
          <div>
            {eyebrow && <p className="text-small font-medium text-secondary">{eyebrow}</p>}
            <h1 className={`font-display text-status font-bold ${c.text}`}>{word}</h1>
            {summary && <p className="mt-2 max-w-measure text-body-lg text-primary">{summary}</p>}
          </div>
        </div>
        {meta && <div className="flex-none text-small text-secondary sm:text-right">{meta}</div>}
      </div>
    </section>
  );
}
