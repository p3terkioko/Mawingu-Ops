import React from 'react';

/**
 * Surface card — surface-1 fill, 1px border, 20px radius, standard elevation.
 * The single card style used across the whole app. `as` lets it be a section
 * or article when semantics call for it.
 */
export default function Card({ as: Tag = 'div', className = '', children, ...rest }) {
  return (
    <Tag className={`rounded-card bg-surface-1 shadow-card ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

/** Optional card header: a title with an optional right-aligned slot. */
export function CardHeader({ title, subtitle, right, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div>
        <h2 className="font-display text-card-title font-medium text-primary">{title}</h2>
        {subtitle && <p className="mt-1 text-small text-secondary">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
