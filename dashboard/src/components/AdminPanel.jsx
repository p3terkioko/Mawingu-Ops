import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Card from './ui/Card.jsx';
import Button from './ui/Button.jsx';
import Field from './ui/Field.jsx';
import Icon from './ui/Icon.jsx';
import StatusBadge from './ui/StatusBadge.jsx';
import EmptyState from './ui/EmptyState.jsx';
import { toneForAlert } from '../lib/status.js';

const API_BASE = import.meta.env.VITE_API_BASE || '';

const DELIVERY_TONE = {
  sent: 'green',
  dry_run: 'accent',
  failed: 'red',
};

/**
 * Ops console (gated by an access token): subscriber counts, delivery logs, and
 * the drought-trigger history — the anticipatory-action audit trail. The token
 * gate keeps console internals hidden until authenticated.
 */
export default function AdminPanel() {
  const [token, setToken] = useState(() => sessionStorage.getItem('mw_admin_token') || '');
  const [input, setInput] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await axios.get(`${API_BASE}/api/admin/overview`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled) {
          setData(res.data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.status === 401 ? 'Invalid token' : 'Failed to load');
          if (err.response?.status === 401) {
            sessionStorage.removeItem('mw_admin_token');
            setToken('');
          }
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Unauthenticated: a centered, width-constrained access card — no console
  // internals shown, nothing floating in dead space.
  if (!token) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center animate-fade-up">
        <Card className="w-full max-w-sm p-6 sm:p-8">
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-control bg-surface-2 text-accent">
              <Icon name="lock" size={24} />
            </span>
            <div>
              <h2 className="font-display text-card-title font-medium text-primary">
                Admin access
              </h2>
              <p className="mt-1 text-small text-secondary">
                Enter your access token to open the operations console.
              </p>
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sessionStorage.setItem('mw_admin_token', input);
              setToken(input);
            }}
            className="flex flex-col gap-4"
          >
            <Field
              label="Access token"
              type="password"
              autoComplete="off"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste your access token"
            />
            <Button type="submit">Open console</Button>
            {error && <p className="text-small font-semibold text-status-red">{error}</p>}
          </form>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <p className="py-12 text-center text-secondary">{error || 'Loading admin overview…'}</p>
    );
  }

  const totalSubs = data.subscribers.reduce((s, r) => s + r.count, 0);
  const latest = data.triggers[0];

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      {/* Subscriber counts */}
      <Card className="p-6">
        <div className="mb-4 flex items-baseline gap-2">
          <h2 className="font-display text-card-title font-medium text-primary">Subscribers</h2>
          <span className="text-small text-secondary">{totalSubs} active</span>
        </div>
        {data.subscribers.length === 0 ? (
          <EmptyState
            icon="bell"
            title="No active subscriptions yet"
            description="Counts by channel and language will appear here once farmers subscribe."
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {data.subscribers.map((r) => (
              <div
                key={`${r.channel}-${r.language}`}
                className="rounded-control bg-surface-2 px-4 py-3 text-center"
              >
                <p className="metric font-display text-hero font-medium leading-none text-primary">
                  {r.count}
                </p>
                <p className="mt-1 text-caption uppercase tracking-wide text-muted">
                  {r.channel} · {r.language}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Trigger history timeline */}
      <Card className="p-6">
        <h2 className="mb-4 font-display text-card-title font-medium text-primary">
          Drought trigger history
        </h2>
        {data.triggers.length === 0 ? (
          <EmptyState icon="analytics" title="No triggers recorded yet" />
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              {[...data.triggers].reverse().map((tr, i) => {
                const tone = toneForAlert(tr.alert_level);
                const color = {
                  green: 'bg-status-green',
                  amber: 'bg-status-amber',
                  red: 'bg-status-red',
                  neutral: 'bg-surface-2',
                }[tone];
                return (
                  <div key={i} className="text-center">
                    <span
                      className={`inline-block h-8 w-8 rounded-pill ${color}`}
                      title={`${tr.alert_level} · ${tr.trigger_category || '—'} · SPI ${tr.spi ?? '—'}`}
                    />
                    <p className="mt-1 text-caption text-muted">
                      {new Date(tr.computed_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                );
              })}
            </div>
            {latest && (
              <p className="mt-3 flex items-center gap-2 text-small text-secondary">
                Latest:{' '}
                <StatusBadge tone={toneForAlert(latest.alert_level)}>
                  {latest.alert_level}
                </StatusBadge>
                <span>
                  trigger {latest.trigger_category || '—'} · SPI {latest.spi ?? '—'}
                </span>
              </p>
            )}
          </>
        )}
      </Card>

      {/* Delivery log */}
      <Card className="overflow-x-auto p-6">
        <h2 className="mb-4 font-display text-card-title font-medium text-primary">
          Recent deliveries
        </h2>
        {data.deliveries.length === 0 ? (
          <EmptyState
            icon="bell"
            title="No deliveries yet"
            description="Delivery records appear here after the weekly broadcast runs (pipeline/broadcast_advisory.py)."
          />
        ) : (
          <table className="w-full text-small">
            <thead>
              <tr className="text-left text-caption uppercase tracking-wide text-muted">
                <th className="py-2 pr-3 font-semibold">When</th>
                <th className="py-2 pr-3 font-semibold">Contact</th>
                <th className="py-2 pr-3 font-semibold">Channel</th>
                <th className="py-2 pr-3 font-semibold">Reason</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.deliveries.map((d, i) => (
                <tr key={i} className="border-t border-border align-top">
                  <td className="whitespace-nowrap py-2 pr-3 text-secondary">
                    {new Date(d.sent_at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 text-primary">{d.contact || '—'}</td>
                  <td className="py-2 pr-3 uppercase text-secondary">{d.channel}</td>
                  <td className="py-2 pr-3 text-secondary">{d.trigger_reason}</td>
                  <td className="py-2 pr-3">
                    <StatusBadge tone={DELIVERY_TONE[d.status] || 'neutral'}>
                      {d.status}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
