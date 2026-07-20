import React from 'react';
import Icon from './Icon.jsx';

/**
 * Small attribution mark for the AI translation layer. The AI (Llama 3.3 70B
 * via Groq) translates the verified climate signals into farmer-readable
 * guidance in both English and Kiswahili — so it is credited exactly where that
 * prose appears.
 */
export default function AiBadge({ label = 'AI translation', className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill bg-surface-2 px-2.5 py-1 text-caption font-semibold text-accent ${className}`}
      title="Plain-language advisory drafted by Llama 3.3 70B (Groq) from the verified signals, then safety-checked"
    >
      <Icon name="sparkle" size={14} />
      {label}
    </span>
  );
}
