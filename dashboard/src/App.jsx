import React, { useEffect, useState } from 'react';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';
import AlertBadge from './components/AlertBadge.jsx';
import RainfallChart from './components/RainfallChart.jsx';
import RecommendationCard from './components/RecommendationCard.jsx';
import OnsetCard from './components/OnsetCard.jsx';
import IcpacMap from './components/IcpacMap.jsx';
import FarmerView from './components/FarmerView.jsx';
import AdminPanel from './components/AdminPanel.jsx';

// Relative URLs are proxied to the Node API by Vite (see vite.config.js).
const API_BASE = import.meta.env.VITE_API_BASE || '';

// Views are addressed by hash so no router dependency is needed:
//   #/ or none -> farmer view (default), #analytics -> judge/analytics view,
//   #admin -> ops console.
function viewFromHash() {
  const h = window.location.hash.replace(/^#\/?/, '');
  if (h === 'analytics') return 'analytics';
  if (h === 'admin') return 'admin';
  return 'farmer';
}

/** Analytics/judge view — the original dashboard cards. */
function AnalyticsView({ status }) {
  const alertLevel = status?.alert?.level;
  const anomalyPct = status?.alert?.anomalyPct;
  const spi = status?.alert?.spi;
  const rec = status?.recommendation;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <RecommendationCard
        recommendation={rec?.recommendation}
        confidence={rec?.confidence}
        advisoryText={status?.advisory?.sw}
        alertLevel={alertLevel}
        computedAt={rec?.computedAt}
        offSeason={rec?.phase === 'off_season'}
      />

      <div className="rounded-2xl bg-white shadow-md p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-700">30-day rainfall vs normal</h2>
          <span className="text-sm text-slate-500">
            {spi != null && (
              <span className="mr-3">SPI {spi > 0 ? '+' : ''}{spi.toFixed(2)}</span>
            )}
            Anomaly: {anomalyPct != null ? `${Math.round(anomalyPct)}%` : '—'}
          </span>
        </div>
        <RainfallChart data={status?.rainfall} />
        {status?.advisory?.en && (
          <p className="text-xs text-slate-500 border-t pt-3">
            <span className="font-semibold">EN:</span> {status.advisory.en}
          </p>
        )}
      </div>

      <OnsetCard onset={status?.onset} />

      <IcpacMap />
    </div>
  );
}

export default function App() {
  const [status, setStatus] = useState(null);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(viewFromHash);
  const [language, setLanguage] = useState(
    () => localStorage.getItem('mw_lang') || 'sw'
  );

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [healthRes, statusRes] = await Promise.all([
          axios.get(`${API_BASE}/health`),
          axios.get(`${API_BASE}/api/status`),
        ]);
        setHealth(healthRes.data);
        setStatus(statusRes.data);
      } catch (err) {
        setError(err.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function changeLanguage(code) {
    localStorage.setItem('mw_lang', code);
    setLanguage(code);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Loading MawinguOps status…
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="rounded-lg bg-red-50 text-red-700 p-6 max-w-md text-center">
          <p className="font-semibold mb-1">Could not reach the API</p>
          <p className="text-sm">{error}</p>
          <p className="text-xs mt-2 text-red-500">
            Is the Node API running on port 3000?
          </p>
        </div>
      </div>
    );
  }

  const rec = status?.recommendation;
  const tabs = [
    { id: 'farmer', hash: '#/', label: language === 'en' ? 'Advisory' : 'Ushauri' },
    { id: 'analytics', hash: '#analytics', label: 'Analytics' },
    { id: 'admin', hash: '#admin', label: 'Admin' },
  ];

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-5xl mx-auto">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">MawinguOps</h1>
          <p className="text-sm text-slate-500">
            <span className="capitalize">{rec?.crop || 'maize'}</span> planting advisory — Machakos County, Kenya
          </p>
        </div>
        <nav className="flex gap-1 rounded-full bg-slate-200 p-1">
          {tabs.map((t) => (
            <a
              key={t.id}
              href={t.hash}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold ${
                view === t.id ? 'bg-white text-slate-800 shadow' : 'text-slate-500'
              }`}
            >
              {t.label}
            </a>
          ))}
        </nav>
        {view === 'analytics' && (
          <div className="text-right w-full sm:w-auto">
            <AlertBadge alertLevel={status?.alert?.level} />
            {status?.alert?.triggerCategory && (
              <p className="text-xs text-slate-500 mt-1">
                ICPAC trigger:{' '}
                <span className="font-semibold capitalize">
                  {status.alert.triggerCategory}
                </span>
                {status.alert.spi != null && (
                  <>
                    {' '}· SPI {status.alert.spi > 0 ? '+' : ''}
                    {status.alert.spi.toFixed(2)}
                  </>
                )}
              </p>
            )}
            {status?.alert?.spi1Month != null && (
              <p className="text-xs text-slate-400 mt-0.5">
                SPI-1 {status.alert.spi1Month > 0 ? '+' : ''}
                {status.alert.spi1Month.toFixed(2)}{' '}
                <span className="italic">
                  (Drought Watch method, ref {status.alert.spi1MonthRef})
                </span>
              </p>
            )}
            <p className="text-xs text-slate-400 mt-1">
              API: {health?.status} · DB: {health?.database}
            </p>
          </div>
        )}
      </header>

      {view === 'farmer' && (
        <FarmerView
          status={status}
          language={language}
          onLanguageChange={changeLanguage}
        />
      )}
      {view === 'analytics' && <AnalyticsView status={status} />}
      {view === 'admin' && <AdminPanel />}

      <footer className="mt-6 text-center text-xs text-slate-400">
        {status?.dataAsOf && (
          <>
            Rainfall data as of{' '}
            {new Date(status.dataAsOf).toLocaleDateString()}
            {status?.dataSource ? ` (${status.dataSource})` : ''}
            {' · '}
          </>
        )}
        Last pipeline run:{' '}
        {status?.lastPipelineRun
          ? new Date(status.lastPipelineRun).toLocaleString()
          : 'unknown'}
        {' · '}Data: CHIRPS (UCSB-CHC), Open-Meteo &amp; ICPAC Geoportal
      </footer>
    </div>
  );
}
