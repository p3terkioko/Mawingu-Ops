import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || '';

const ALERT_COLOR = {
  GREEN: 'bg-green-500',
  YELLOW: 'bg-yellow-400',
  ORANGE: 'bg-orange-500',
  RED: 'bg-red-600',
};

const STATUS_COLOR = {
  sent: 'text-green-700 bg-green-50',
  dry_run: 'text-sky-700 bg-sky-50',
  failed: 'text-red-700 bg-red-50',
};

/**
 * Ops console (gated by ADMIN_TOKEN): subscriber counts, delivery logs, and
 * the drought-trigger history — the anticipatory-action audit trail.
 */
export default function AdminPanel() {
  const [token, setToken] = useState(
    () => sessionStorage.getItem('mw_admin_token') || ''
  );
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

  if (!token) {
    return (
      <div className="max-w-sm mx-auto rounded-2xl bg-white shadow-md p-6">
        <h2 className="font-semibold text-slate-700 mb-3">Admin access</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sessionStorage.setItem('mw_admin_token', input);
            setToken(input);
          }}
          className="flex flex-col gap-3"
        >
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="ADMIN_TOKEN"
            className="border border-slate-300 rounded-lg px-4 py-2"
          />
          <button className="bg-slate-800 text-white rounded-lg px-4 py-2 font-semibold">
            Open console
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      </div>
    );
  }

  if (!data) {
    return <p className="text-center text-slate-500">{error || 'Loading admin overview…'}</p>;
  }

  const totalSubs = data.subscribers.reduce((s, r) => s + r.count, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Subscriber counts */}
      <div className="rounded-2xl bg-white shadow-md p-6">
        <h2 className="font-semibold text-slate-700 mb-3">
          Subscribers <span className="text-slate-400 font-normal">({totalSubs} active)</span>
        </h2>
        <div className="flex flex-wrap gap-3">
          {data.subscribers.length === 0 && (
            <p className="text-sm text-slate-400">No active subscriptions yet.</p>
          )}
          {data.subscribers.map((r) => (
            <div
              key={`${r.channel}-${r.language}`}
              className="rounded-lg bg-slate-50 px-4 py-3 text-center"
            >
              <p className="text-2xl font-bold text-slate-800">{r.count}</p>
              <p className="text-xs uppercase text-slate-500">
                {r.channel} · {r.language}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Trigger history timeline */}
      <div className="rounded-2xl bg-white shadow-md p-6">
        <h2 className="font-semibold text-slate-700 mb-3">Drought trigger history</h2>
        <div className="flex flex-wrap gap-2">
          {[...data.triggers].reverse().map((tr, i) => (
            <div key={i} className="text-center">
              <span
                className={`inline-block w-8 h-8 rounded-full ${
                  ALERT_COLOR[tr.alert_level] || 'bg-slate-300'
                }`}
                title={`${tr.alert_level} · ${tr.trigger_category || '—'} · SPI ${tr.spi ?? '—'}`}
              />
              <p className="text-[10px] text-slate-400 mt-1">
                {new Date(tr.computed_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Latest: {data.triggers[0]?.alert_level} (trigger:{' '}
          {data.triggers[0]?.trigger_category || '—'}, SPI {data.triggers[0]?.spi ?? '—'})
        </p>
      </div>

      {/* Delivery log */}
      <div className="rounded-2xl bg-white shadow-md p-6 overflow-x-auto">
        <h2 className="font-semibold text-slate-700 mb-3">Recent deliveries</h2>
        {data.deliveries.length === 0 ? (
          <p className="text-sm text-slate-400">
            No deliveries yet — run pipeline/broadcast_advisory.py.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-400">
                <th className="py-2 pr-3">When</th>
                <th className="py-2 pr-3">Contact</th>
                <th className="py-2 pr-3">Channel</th>
                <th className="py-2 pr-3">Reason</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.deliveries.map((d, i) => (
                <tr key={i} className="border-t border-slate-100 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-slate-500">
                    {new Date(d.sent_at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3">{d.contact || '—'}</td>
                  <td className="py-2 pr-3 uppercase text-xs">{d.channel}</td>
                  <td className="py-2 pr-3 text-xs">{d.trigger_reason}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        STATUS_COLOR[d.status] || 'text-slate-600 bg-slate-50'
                      }`}
                      title={d.error_message || ''}
                    >
                      {d.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
