import React, { useEffect, useState } from 'react';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';
import Shell from './components/Shell.jsx';
import FarmerView from './components/FarmerView.jsx';
import AnalyticsView from './components/AnalyticsView.jsx';
import { getStatus } from './lib/status.js';

// Relative URLs are proxied to the Node API by Vite (see vite.config.js).
const API_BASE = import.meta.env.VITE_API_BASE || '';

// Optional demo scenario from the URL (?demo=plant_now|wait|do_not_plant). Lets
// a judge/demo walkthrough show the full plant/wait/don't-plant decision path
// off-season, without changing what a real farmer sees. Absent -> production.
const DEMO = new URLSearchParams(window.location.search).get('demo') || '';
const STATUS_URL = `${API_BASE}/api/status${DEMO ? `?demo=${encodeURIComponent(DEMO)}` : ''}`;

// Views are addressed by hash so no router dependency is needed:
//   #/ or none -> farmer view (default), #analytics -> judge/analytics view.
function viewFromHash() {
  const h = window.location.hash.replace(/^#\/?/, '');
  if (h === 'analytics') return 'analytics';
  return 'farmer';
}

function fmtRun(iso) {
  if (!iso) return 'unknown';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'unknown';
  }
}

function CenterMessage({ children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 text-center text-secondary">
      {children}
    </div>
  );
}

export default function App() {
  const [status, setStatus] = useState(null);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(viewFromHash);
  const [language, setLanguage] = useState(() => localStorage.getItem('mw_lang') || 'sw');

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
          axios.get(STATUS_URL),
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
    return <CenterMessage>Loading MawinguOps status…</CenterMessage>;
  }

  if (error) {
    return (
      <CenterMessage>
        <div className="max-w-measure rounded-card border border-border bg-surface-1 p-6 shadow-card">
          <p className="mb-1 font-display text-card-title font-medium text-status-red">
            Could not reach the API
          </p>
          <p className="text-body text-secondary">{error}</p>
          <p className="mt-2 text-small text-muted">Is the Node API running on port 3000?</p>
        </div>
      </CenterMessage>
    );
  }

  const rec = status?.recommendation;
  const st = getStatus({ recommendation: rec?.recommendation, phase: rec?.phase, language });

  const nav = [
    { id: 'farmer', hash: '#/', label: language === 'en' ? 'Advisory' : 'Ushauri', icon: 'advisory' },
    { id: 'analytics', hash: '#analytics', label: 'Early warning', icon: 'analytics' },
  ];

  const cropLabel = rec?.crop || 'maize';
  const TITLES = {
    farmer: {
      title: language === 'en' ? 'Advisory' : 'Ushauri',
      subtitle:
        language === 'en'
          ? `This week's ${cropLabel} guidance — Machakos County`
          : `Ushauri wa ${cropLabel} wiki hii — Kaunti ya Machakos`,
    },
    analytics: {
      title: 'Early warning',
      subtitle: 'Anticipatory maize advisory for Machakos — risk, lead time, and what to do',
    },
  };
  const head = TITLES[view];

  // The top-bar status pill appears on the data views; Advisory leads with its
  // own hero, so it does not also repeat the pill.
  const showPill = view === 'analytics';

  return (
    <Shell
      nav={nav}
      activeId={view}
      region="Machakos County"
      health={health}
      lastRun={fmtRun(status?.lastPipelineRun)}
      title={head.title}
      subtitle={head.subtitle}
      status={showPill ? { tone: st.tone, word: st.word } : undefined}
    >
      {status?.demo && (
        <div className="mb-6 rounded-control border border-border bg-status-amber-bg px-4 py-3 text-small text-status-amber">
          Demo scenario:{' '}
          <span className="font-semibold">{status.demo.replace(/_/g, ' ')}</span> — seeded in-season
          data for the walkthrough. Real farmers on this date see the off-season advisory.
        </div>
      )}

      {view === 'farmer' && (
        <FarmerView status={status} language={language} onLanguageChange={changeLanguage} />
      )}
      {view === 'analytics' && <AnalyticsView status={status} health={health} language={language} />}

      <footer className="mx-auto mt-12 max-w-content text-caption text-secondary">
        {status?.dataAsOf && (
          <>
            Rainfall data as of {new Date(status.dataAsOf).toLocaleDateString()}
            {status?.dataSource ? ` (${status.dataSource})` : ''}
            {' · '}
          </>
        )}
        Last pipeline run:{' '}
        {status?.lastPipelineRun ? new Date(status.lastPipelineRun).toLocaleString() : 'unknown'}
        {' · '}Data: CHIRPS (UCSB-CHC), Open-Meteo &amp; ICPAC Geoportal
      </footer>
    </Shell>
  );
}
