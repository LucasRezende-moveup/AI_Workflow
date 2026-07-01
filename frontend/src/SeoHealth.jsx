import { useState, useEffect } from 'react';
import { BarChart2, Plus, RefreshCw, Trash2, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';

const SITES_KEY = 'seo_health_sites';
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
  if (unit === 'ms') return `${n.toFixed(0)}ms`;
  if (unit === 'score') return n.toFixed(0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000)    return `${(n / 1_000).toFixed(1)}K`;
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
      color: up ? '#4ade80' : '#f87171',
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
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4, lineHeight: 1.2 }}>{m.name}</div>
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

function SiteCard({ site, onRemove, onRefresh, cached, isLoading, err }) {
  const metrics = cached?.data?.metrics || [];
  const ts = cached?.ts ? new Date(cached.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

  const grouped = {};
  CAT_ORDER.forEach(c => { grouped[c] = []; });
  metrics.forEach(m => {
    const cat = m.category in grouped ? m.category : 'other';
    grouped[cat].push(m);
  });

  return (
    <div className="glass-panel">
      {/* Site header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h3 style={{ marginBottom: 2, fontSize: '1.1rem' }}>{site.name}</h3>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {ts && <span>Updated {ts}</span>}
            {cached?.data?.sheets_read?.length > 0 && (
              <span>Sheets: {cached.data.sheets_read.join(', ')}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => onRefresh(site)}
            disabled={isLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 7, fontSize: '0.82rem', fontWeight: 600,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              color: 'white', cursor: isLoading ? 'wait' : 'pointer',
            }}
          >
            {isLoading
              ? <><div className="loader" style={{ width: 13, height: 13, borderWidth: 2 }} /> Loading…</>
              : <><RefreshCw size={13} /> {cached ? 'Refresh' : 'Load Data'}</>}
          </button>
          <button
            onClick={() => onRemove(site.id)}
            style={{
              display: 'flex', alignItems: 'center', padding: '8px 10px', borderRadius: 7,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              color: '#f87171', cursor: 'pointer',
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {err && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', fontSize: '0.83rem', marginBottom: 12, display: 'flex', gap: 8 }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {err}
        </div>
      )}

      {!cached && !isLoading && !err && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '8px 0' }}>
          Click <strong style={{ color: 'white' }}>Load Data</strong> to pull KPIs from this sheet.
        </p>
      )}

      {metrics.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {CAT_ORDER.filter(c => grouped[c].length > 0).map(cat => (
            <div key={cat}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: CAT_COLOR[cat], marginBottom: 10 }}>
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
  const [sites, setSites] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SITES_KEY)) || []; } catch { return []; }
  });
  const [cache, setCache] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; }
  });
  const [loading, setLoading]   = useState({});
  const [errors, setErrors]     = useState({});
  const [showAdd, setShowAdd]   = useState(false);
  const [newName, setNewName]   = useState('');
  const [newUrl, setNewUrl]     = useState('');

  useEffect(() => { localStorage.setItem(SITES_KEY, JSON.stringify(sites)); }, [sites]);
  useEffect(() => { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); }, [cache]);

  const addSite = () => {
    if (!newName.trim() || !newUrl.trim()) return;
    setSites(prev => [...prev, { id: Date.now(), name: newName.trim(), url: newUrl.trim() }]);
    setNewName(''); setNewUrl(''); setShowAdd(false);
  };

  const removeSite = (id) => {
    setSites(prev => prev.filter(s => s.id !== id));
    setCache(prev => { const c = { ...prev }; delete c[id]; return c; });
    setErrors(prev => { const e = { ...prev }; delete e[id]; return e; });
  };

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
      {/* Page header */}
      <div className="glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="flex items-center gap-2 mb-1">
              <BarChart2 size={22} color="var(--primary)" /> SEO Health
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              KPI overview pulled from your Looker Studio Google Sheets data sources via AI extraction.
            </p>
          </div>
          <button className="btn-primary flex items-center gap-2" onClick={() => setShowAdd(v => !v)}>
            <Plus size={16} /> Add Site
          </button>
        </div>

        {showAdd && (
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="metric-label mb-2 block">Site / Product Name</label>
                <input
                  className="glass-input"
                  placeholder="e.g. Client A — Organic"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSite()}
                />
              </div>
              <div>
                <label className="metric-label mb-2 block">Google Sheets URL or ID</label>
                <input
                  className="glass-input"
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  value={newUrl}
                  onChange={e => setNewUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSite()}
                />
              </div>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 12 }}>
              The sheet must be set to <strong style={{ color: 'white' }}>Anyone with the link can view</strong> for the API to read it.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-primary" onClick={addSite} disabled={!newName.trim() || !newUrl.trim()}>
                Save Site
              </button>
              <button
                onClick={() => setShowAdd(false)}
                style={{ padding: '10px 18px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Empty state */}
      {sites.length === 0 && (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <BarChart2 size={52} color="rgba(255,255,255,0.08)" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
            No sites configured yet.
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            Click <strong style={{ color: 'white' }}>Add Site</strong> and paste the Google Sheets URL that powers your Looker Studio dashboard.
          </p>
        </div>
      )}

      {/* Site cards */}
      {sites.map(site => (
        <SiteCard
          key={site.id}
          site={site}
          cached={cache[site.id]}
          isLoading={!!loading[site.id]}
          err={errors[site.id]}
          onRemove={removeSite}
          onRefresh={refresh}
        />
      ))}
    </div>
  );
}
