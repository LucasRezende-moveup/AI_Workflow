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

function HealthGauge({ score, label }) {
  const color = score >= 90 ? '#4ade80' : score >= 75 ? '#a3e635' : score >= 55 ? '#f59e0b' : '#f87171';
  const r = 30;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
      <svg width="80" height="80" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: '1.35rem', fontWeight: 800, color, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: '0.52rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>{label}</span>
      </div>
    </div>
  );
}

function ScoreBreakdown({ breakdown }) {
  if (!breakdown?.length) return null;
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Score Deductions</div>
      {breakdown.map((b, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
          <span style={{ color: 'rgba(255,255,255,0.75)' }}>{b.issue}</span>
          <span style={{ color: '#f87171', fontWeight: 700, flexShrink: 0, marginLeft: 12 }}>−{b.penalty}</span>
        </div>
      ))}
    </div>
  );
}

function SiteCard({ site, cached, isLoading, err, onRefresh }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const metrics = cached?.data?.metrics || [];
  const score   = cached?.data?.score;
  const label   = cached?.data?.score_label || '';
  const breakdown = cached?.data?.score_breakdown || [];
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 16 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
          {score !== undefined && score !== null && (
            <div>
              <HealthGauge score={score} label={label} />
              {breakdown.length > 0 && (
                <button
                  onClick={() => setShowBreakdown(v => !v)}
                  style={{ display: 'block', margin: '4px auto 0', fontSize: '0.65rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  {showBreakdown ? 'hide' : 'why?'}
                </button>
              )}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ marginBottom: 3, fontSize: '1.1rem' }}>{site.name}</h3>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {ts && <span>Updated {ts}</span>}
              {cached?.data?.sheets_read?.length > 0 && (
                <span>Sheets: {cached.data.sheets_read.join(', ')}</span>
              )}
            </div>
            {showBreakdown && <ScoreBreakdown breakdown={breakdown} />}
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
        <>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, width: '100%',
              padding: '9px 14px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--text-muted)', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ flex: 1 }}>{expanded ? '▲ Hide Metrics' : '▼ Show Metrics'}</span>
            <span style={{ fontSize: '0.75rem' }}>{metrics.length} metrics</span>
          </button>

          {expanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: 4 }}>
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
        </>
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
