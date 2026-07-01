import { useState, useEffect } from 'react';
import { BarChart2, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Settings } from 'lucide-react';

const CACHE_KEY = 'seo_health_cache';

const CAT_COLOR = {
  traffic:     '#00f2fe',
  rankings:    '#8b5cf6',
  technical:   '#f59e0b',
  backlinks:   '#4ade80',
  conversions: '#E20071',
  other:       '#94a3b8',
};

const CAT_ORDER = ['traffic', 'rankings', 'backlinks', 'technical', 'conversions', 'other'];

function fmt(val, unit) {
  if (val === null || val === undefined) return '—';
  const n = Number(val);
  if (isNaN(n)) return String(val);
  if (unit === 'percent') return `${n.toFixed(1)}%`;
  if (unit === 'ms')      return `${n.toFixed(0)}ms`;
  if (unit === 'score')   return n.toFixed(0);
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000)        return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function TrendBadge({ current, previous, trend }) {
  if (!trend || trend === 'neutral' || previous === null || previous === undefined) return null;
  const up = trend === 'up';
  const pct = (typeof current === 'number' && typeof previous === 'number' && previous !== 0)
    ? Math.abs(((current - previous) / previous) * 100).toFixed(1)
    : null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: '0.72rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99,
      background: up ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
      color:      up ? '#4ade80'                : '#f87171',
    }}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {pct ? `${pct}%` : (up ? '↑' : '↓')}
    </span>
  );
}

function MetricCard({ m }) {
  const color = CAT_COLOR[m.category] || CAT_COLOR.other;
  return (
    <div className="glass-panel" style={{ padding: '16px 18px', borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: '0.68rem', color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
        {m.category}
      </div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4, lineHeight: 1.2 }}>
        {m.name}
      </div>
      <div style={{ fontSize: '2.1rem', fontWeight: 800, color: 'white', lineHeight: 1, marginBottom: 8 }}>
        {fmt(m.current, m.unit)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <TrendBadge current={m.current} previous={m.previous} trend={m.trend} />
        {m.previous !== null && m.previous !== undefined && (
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            prev {fmt(m.previous, m.unit)}
          </span>
        )}
      </div>
    </div>
  );
}

function SiteCard({ site, cached, isLoading, err, onRefresh }) {
  const metrics = cached?.data?.metrics || [];
  const ts = cached?.ts
    ? new Date(cached.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  const grouped = {};
  CAT_ORDER.forEach(c => { grouped[c] = []; });
  metrics.forEach(m => {
    const cat = m.category in grouped ? m.category : 'other';
    grouped[cat].push(m);
  });

  return (
    <div className="glass-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h3 style={{ marginBottom: 3, fontSize: '1.1rem' }}>{site.name}</h3>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: 10 }}>
            {ts && <span>Updated {ts}</span>}
            {cached?.data?.sheets_read?.length > 0 && (
              <span>Sheets: {cached.data.sheets_read.join(', ')}</span>
            )}
          </div>
        </div>
        <button
          onClick={() => onRefresh(site)}
          disabled={isLoading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 7, fontSize: '0.82rem', fontWeight: 600,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'white', cursor: isLoading ? 'wait' : 'pointer', flexShrink: 0,
          }}
        >
          {isLoading
            ? <><div className="loader" style={{ width: 13, height: 13, borderWidth: 2 }} /> Loading…</>
            : <><RefreshCw size={13} /> {cached ? 'Refresh' : 'Load Data'}</>}
        </button>
      </div>

      {err && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 14,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          color: '#fca5a5', fontSize: '0.83rem', display: 'flex', gap: 8,
        }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {err}
        </div>
      )}

      {!cached && !isLoading && !err && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '4px 0' }}>
          Click <strong style={{ color: 'white' }}>Load Data</strong> to pull KPIs from this sheet.
        </p>
      )}

      {metrics.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {CAT_ORDER.filter(c => grouped[c].length > 0).map(cat => (
            <div key={cat}>
              <div style={{
                fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.07em', color: CAT_COLOR[cat], marginBottom: 10,
              }}>
                {cat}
              </div>
              <div className="grid grid-cols-4 gap-3">
                {grouped[cat].map((m, i) => <MetricCard key={i} m={m} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SeoHealth() {
  const [sites, setSites]       = useState([]);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [sitesError, setSitesError]     = useState(null);
  const [cache, setCache]       = useState(() => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; }
  });
  const [loading, setLoading]   = useState({});
  const [errors, setErrors]     = useState({});

  useEffect(() => {
    fetch('/api/sheets/sites')
      .then(r => r.json())
      .then(d => { setSites(d.sites || []); setSitesLoading(false); })
      .catch(e => { setSitesError(e.message); setSitesLoading(false); });
  }, []);

  useEffect(() => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  }, [cache]);

  const refresh = async (site) => {
    setLoading(prev => ({ ...prev, [site.id]: true }));
    setErrors(prev => ({ ...prev, [site.id]: null }));
    try {
      const res = await fetch('/api/sheets/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheet_id: site.url, site_name: site.name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors(prev => ({ ...prev, [site.id]: data.detail || 'Failed to load data' }));
      } else {
        setCache(prev => ({ ...prev, [site.id]: { data, ts: Date.now() } }));
      }
    } catch (e) {
      setErrors(prev => ({ ...prev, [site.id]: 'Network error: ' + e.message }));
    } finally {
      setLoading(prev => ({ ...prev, [site.id]: false }));
    }
  };

  return (
    <div className="flex-col gap-6">
      <div className="glass-panel">
        <h2 className="flex items-center gap-2 mb-1">
          <BarChart2 size={22} color="var(--primary)" /> SEO Health
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
          KPI overview pulled from your Looker Studio Google Sheets data sources.
        </p>
      </div>

      {sitesLoading && (
        <div className="glass-panel flex items-center gap-3" style={{ color: 'var(--text-muted)' }}>
          <div className="loader" /> Loading sites…
        </div>
      )}

      {sitesError && (
        <div className="glass-panel" style={{ color: '#f87171' }}>
          Could not load site configuration: {sitesError}
        </div>
      )}

      {!sitesLoading && !sitesError && sites.length === 0 && (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '3.5rem 2rem' }}>
          <Settings size={48} color="rgba(255,255,255,0.1)" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--text-muted)', marginBottom: 8 }}>No sites configured yet.</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.6, maxWidth: 480, margin: '0 auto' }}>
            Add a <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 6px', borderRadius: 4 }}>SEO_HEALTH_SITES</code> environment variable in your Vercel project settings with this format:
          </p>
          <pre style={{
            marginTop: 16, padding: '12px 16px', borderRadius: 8, textAlign: 'left',
            background: 'rgba(0,0,0,0.3)', color: '#4ade80', fontSize: '0.78rem',
            display: 'inline-block', maxWidth: 520,
          }}>
{`[
  {"id":"1","name":"Client A","url":"https://docs.google.com/spreadsheets/d/…"},
  {"id":"2","name":"Client B","url":"https://docs.google.com/spreadsheets/d/…"}
]`}
          </pre>
        </div>
      )}

      {sites.map(site => (
        <SiteCard
          key={site.id}
          site={site}
          cached={cache[site.id]}
          isLoading={!!loading[site.id]}
          err={errors[site.id]}
          onRefresh={refresh}
        />
      ))}
    </div>
  );
}
