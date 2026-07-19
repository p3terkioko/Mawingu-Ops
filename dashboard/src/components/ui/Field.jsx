import React, { useId } from 'react';

/**
 * Labelled form field — a real <label> above the control, never
 * placeholder-as-label. Renders an <input> by default; pass `children` with an
 * `id`/`aria` wired control for anything custom. `hint` is an optional helper
 * line below the label.
 */
export default function Field({ label, hint, className = '', children, ...inputProps }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label htmlFor={id} className="text-small font-medium text-secondary">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-caption text-muted">
          {hint}
        </p>
      )}
      {children ? (
        children
      ) : (
        <input
          id={id}
          aria-describedby={hintId}
          className="min-h-[44px] rounded-control border border-strong bg-surface-2 px-4 text-body-lg text-primary placeholder:text-muted focus:border-accent"
          {...inputProps}
        />
      )}
    </div>
  );
}
