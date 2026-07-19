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
    'text-accent-contrast border border-transparent bg-gradient-to-b from-accent to-accent-press hover:from-accent-hover hover:to-accent shadow-[0_6px_18px_var(--accent-glow)]',
  secondary: 'bg-surface-2 text-primary border border-strong hover:bg-surface-1',
  destructive: 'bg-status-red text-white hover:opacity-90 border border-transparent',
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
