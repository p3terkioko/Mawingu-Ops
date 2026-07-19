import React from 'react';

/**
 * Button — three variants only, one primary accent across the whole app.
 *   primary     accent fill
 *   secondary   ghost with strong border
 *   destructive red fill (rare; irreversible actions)
 * Min height 44px for touch. Focus ring comes from the global :focus-visible.
 */
const VARIANTS = {
  primary:
    'bg-accent text-accent-contrast hover:bg-accent-hover active:bg-accent-press border border-transparent',
  secondary:
    'bg-transparent text-primary border border-strong hover:bg-surface-2',
  destructive:
    'bg-status-red text-white hover:opacity-90 border border-transparent',
};

export default function Button({
  variant = 'primary',
  type = 'button',
  className = '',
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-control px-4 text-body-lg font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
        VARIANTS[variant] || VARIANTS.primary
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
