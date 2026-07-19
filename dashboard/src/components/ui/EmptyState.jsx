import React from 'react';
import Icon from './Icon.jsx';

/**
 * Empty state — an icon, one line of what will appear and when, and an optional
 * action. Replaces bare "No data yet" strings so a farmer/officer understands
 * the panel is waiting, not broken.
 */
export default function EmptyState({ icon = 'seedling', title, description, action, className = '' }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-control border border-dashed border-border px-6 py-8 text-center ${className}`}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-pill bg-surface-2 text-muted">
        <Icon name={icon} size={22} />
      </span>
      {title && <p className="text-body font-medium text-primary">{title}</p>}
      {description && <p className="max-w-measure text-small text-secondary">{description}</p>}
      {action}
    </div>
  );
}
