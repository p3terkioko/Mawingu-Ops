import React, { useEffect, useState } from 'react';
import Icon, { Logo } from './ui/Icon.jsx';
import StatusBadge from './ui/StatusBadge.jsx';

/**
 * App shell — a persistent left sidebar plus a main content area. The shell is
 * always dark (the twilight-sky identity). Views set their own theme on the
 * content they render (Advisory switches to the light variant).
 *
 * Props:
 *   nav       [{ id, hash, label, icon }]
 *   activeId  current view id
 *   region    region label (Machakos County)
 *   health    { api, db } short status strings
 *   lastRun   formatted last-pipeline-run string
 *   title/subtitle  top-bar heading
 *   status    { tone, word } for the top-bar pill (optional)
 *   chips     optional node of extra top-bar chips
 *   children  main content
 */
function HealthDot({ ok }) {
  return (
    <span
      className={`h-2 w-2 flex-none rounded-full ${ok ? 'bg-status-green' : 'bg-status-red'}`}
      aria-hidden="true"
    />
  );
}

export default function Shell({
  nav,
  activeId,
  region,
  health,
  lastRun,
  title,
  subtitle,
  status,
  chips,
  children,
}) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('mw_nav_collapsed') === '1'
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('mw_nav_collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [activeId]);

  const apiOk = health?.status === 'ok';
  const dbOk = health?.database === 'connected';

  const SidebarInner = (
    <div className="flex h-full flex-col gap-6 p-4">
      {/* Brand */}
      <a
        href="#/"
        className={`flex items-center gap-3 rounded-control px-2 py-2 ${collapsed ? 'justify-center' : ''}`}
      >
        <Logo size={32} />
        {!collapsed && (
          <span className="font-display text-card-title font-bold tracking-tight text-primary">
            MawinguOps
          </span>
        )}
      </a>

      {/* Nav */}
      <nav className="flex flex-col gap-1" aria-label="Views">
        {nav.map((item) => {
          const active = item.id === activeId;
          return (
            <a
              key={item.id}
              href={item.hash}
              aria-current={active ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
              className={`flex min-h-[44px] items-center gap-3 rounded-control px-3 text-body font-medium transition-colors ${
                collapsed ? 'justify-center' : ''
              } ${
                active
                  ? 'bg-surface-2 text-primary'
                  : 'text-secondary hover:bg-surface-2 hover:text-primary'
              }`}
            >
              <span className={active ? 'text-accent' : ''}>
                <Icon name={item.icon} size={20} />
              </span>
              {!collapsed && <span>{item.label}</span>}
              {active && !collapsed && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
              )}
            </a>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        {/* Region */}
        <div
          className={`flex items-center gap-2 rounded-control bg-surface-1 px-3 py-2 text-small text-secondary ${
            collapsed ? 'justify-center' : ''
          }`}
          title={collapsed ? region : undefined}
        >
          <Icon name="pin" size={18} className="flex-none text-accent" />
          {!collapsed && <span className="truncate">{region}</span>}
        </div>

        {/* System health */}
        {!collapsed && (
          <div className="rounded-control bg-surface-1 px-3 py-3 text-caption text-secondary">
            <p className="mb-2 font-semibold uppercase tracking-wide text-muted">System</p>
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-2">
                <HealthDot ok={apiOk} /> API {health?.status || 'unknown'}
              </span>
              <span className="flex items-center gap-2">
                <HealthDot ok={dbOk} /> DB {health?.database || 'unknown'}
              </span>
              <span className="mt-1 text-muted">Last run: {lastRun || 'unknown'}</span>
            </div>
          </div>
        )}

        {/* Collapse toggle — desktop only */}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="hidden min-h-[44px] items-center justify-center gap-2 rounded-control text-small text-muted hover:bg-surface-2 hover:text-primary lg:flex"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Icon name="menu" size={18} />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas">
      {/* Desktop sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden bg-sunk lg:block ${
          collapsed ? 'w-[72px]' : 'w-[240px]'
        }`}
      >
        {SidebarInner}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-[260px] bg-sunk shadow-card">
            {SidebarInner}
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className={`${collapsed ? 'lg:pl-[72px]' : 'lg:pl-[240px]'}`}>
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-canvas/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-content items-center gap-4 px-4 py-4 sm:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex h-11 w-11 flex-none items-center justify-center rounded-control text-secondary hover:bg-surface-2 lg:hidden"
              aria-label="Open menu"
            >
              <Icon name="menu" size={22} />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-section-title font-medium text-primary">
                {title}
              </h1>
              {subtitle && <p className="truncate text-small text-secondary">{subtitle}</p>}
            </div>

            <div className="flex flex-none items-center gap-2">
              {chips}
              {status?.word && <StatusBadge tone={status.tone}>{status.word}</StatusBadge>}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="mx-auto max-w-content px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
