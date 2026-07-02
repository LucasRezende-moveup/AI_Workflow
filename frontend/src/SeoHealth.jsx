import { useState, useEffect, useRef } from 'react';
import { BarChart2, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Settings } from 'lucide-react';

const CACHE_KEY      = 'seo_health_cache';
const STALE_MS       = 24 * 60 * 60 * 1000; // 24 h
const SEVEN_DAYS_MS  = 7  * 24 * 60 * 60 * 1000;

const CAT_COLOR = {
  traffic:     '#00f2fe',
  rankings:    '#8b5cf6',
  technical:   '#f59e0b',
  backlinks:   '#4ade80',
  conversions: '#E20071',
  other:       '#94a3b8',
};

const CAT_ORDER = ['traffic', 'rankings', 'backlinks', 'technical', 'conversions', 'other'];

function scoreColor(s) {
  return s >= 90 ? '#4ade80' : s >= 75 ? '#a3e635' : s >= 55 ? '#f59e0b' : '#f87171';
}

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

function dayLabel(ts) {
  const d    = new Date(ts);
  const now  = new Date();
  const diff = Math.floor((now - d) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yest.';
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function ScoreSparkline({ history }) {
  const recent = (history || []).filter(h => h.ts >= Date.now() - SEVEN_DAYS_MS);
  if (!recent.length) return null;

  const W = 168, H = 72;
  const padT = 12, padB = 20, padL = 6, padR = 6;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const n      = recent.length;
  const scores = recent.map(h => h.score);

  const minS   = Math.max(0,   Math.min(...scores) - 10);
  const maxS   = Math.min(100, Math.max(...scores) + 10);
  const rangeS = maxS - minS || 1;

  const xOf = i => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yOf = s => padT + ((maxS - s) / rangeS) * plotH;

  const pts   = recent.map((h, i) => ({ x: xOf(i), y: yOf(h.score), s: h.score, ts: h.ts }));
  const last  = pts[n - 1];
  const first = pts[0];
  const color = scoreColor(last.s);

  const line = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const area = [
    `M ${first.x.toFixed(1)},${(padT + plotH).toFixed(1)}`,
    ...pts.map(p => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    `L ${last.x.toFixed(1)},${(padT + plotH).toFixed(1)}`,
    'Z',
  ].join(' ');

  const delta     = n >= 2 ? last.s - first.s : null;
  const deltaClr  = delta === null ? null : delta > 0 ? '#4ade80' : delta < 0 ? '#f87171' : '#94a3b8';
  const thresholds = [90, 75, 55].filter(t => t > minS && t < maxS);

  // Which pts get a bottom day label (first, last, plus mid if ≥ 4 pts)
  const labeled = new Set([0, n - 1]);
  if (n >= 4) labeled.add(Math.floor(n / 2));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignSelf: 'flex-start' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Last 7 days
        </span>
        {delta !== null && (
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: deltaClr }}>
            {delta > 0 ? '+' : ''}{delta}
          </span>
        )}
      </div>

      <svg width={W} height={H} style={{ overflow: 'visible' }}>
        {/* threshold gridlines */}
        {thresholds.map(t => (
          <line key={t}
            x1={padL} y1={yOf(t).toFixed(1)}
            x2={W - padR} y2={yOf(t).toFixed(1)}
            stroke="rgba(255,255,255,0.06)" strokeDasharray="3,3"
          />
        ))}

        {/* area */}
        <path d={area} fill={color} opacity={0.1} />

        {/* line */}
        {n > 1 && (
          <polyline points={line} fill="none"
            stroke={color} strokeWidth="1.75"
            strokeLinecap="round" strokeLinejoin="round" />
        )}

        {/* dots */}
        {pts.map((p, i) => {
          const isLast = i === n - 1;
          return (
            <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)}
              r={isLast ? 3.5 : 2}
              fill={isLast ? color : `${color}80`}
              stroke={isLast ? 'rgba(10,10,20,0.6)' : 'none'}
              strokeWidth="1.5"
            />
          );
        })}

        {/* score label above last dot */}
        <text
          x={last.x.toFixed(1)} y={(last.y - 6).toFixed(1)}
          fontSize="9" fontWeight="700" fill={color}
          textAnchor={last.x > W * 0.75 ? 'end' : last.x < W * 0.25 ? 'start' : 'middle'}
        >
          {last.s}
        </text>

        {/* score label above first dot (only if spread > 24px) */}
        {n > 1 && Math.abs(last.x - first.x) > 24 && (
          <text
            x={first.x.toFixed(1)} y={(first.y - 6).toFixed(1)}
            fontSize="9" fill="rgba(255,255,255,0.3)"
            textAnchor={first.x < W * 0.25 ? 'start' : 'middle'}
          >
            {first.s}
          </text>
        )}

        {/* day labels at bottom */}
        {pts.map((p, i) => {
          if (!labeled.has(i)) return null;
          const anchor = p.x < W * 0.2 ? 'start' : p.x > W * 0.8 ? 'end' : 'middle';
          const isLast = i === n - 1;
          return (
            <text key={i}
              x={p.x.toFixed(1)} y={H}
              fontSize="8"
              fill={isLast ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.22)'}
              textAnchor={anchor}
            >
              {dayLabel(p.ts)}
            </text>
          );
        })}
      </svg>

      <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
        {n} {n === 1 ? 'snapshot' : 'snapshots'}
      </div>
    </div>
  );
}

// ── Other components (unchanged) ──────────────────────────────────────────────

function TrendBadge({ current, previous, trend }) {
  if (!trend || trend === 'neutral' || previous == null) return null;
  const up  = trend === 'up';
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

function MetricSparkline({ values, color }) {
  const recent = (values || []).filter(v => v.ts >= Date.now() - SEVEN_DAYS_MS);
  if (recent.length < 2) return null;

  const H = 28;
  const n = recent.length;
  const vals = recent.map(v => v.value);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const rangeV = maxV - minV || 1;

  const xOf = i => ((i / (n - 1)) * 100).toFixed(1);
  const yOf = v  => (2 + ((maxV - v) / rangeV) * (H - 4)).toFixed(1);

  const pts  = recent.map((v, i) => [xOf(i), yOf(v.value)]);
  const line = pts.map(([x, y]) => `${x},${y}`).join(' ');
  const area = `M 0,${H} L ${pts.map(([x, y]) => `${x},${y}`).join(' L ')} L 100,${H} Z`;

  return (
    <svg
      viewBox={`0 0 100 ${H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: H, display: 'block', marginTop: 10 }}
    >
      <path d={area} fill={color} opacity={0.15} vectorEffect="non-scaling-stroke" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {/* endpoint dot — fixed apparent size via non-scaling-stroke trick on a degenerate line */}
      <circle cx={pts[n-1][0]} cy={pts[n-1][1]} r="1" fill={color}
        stroke={color} strokeWidth="3" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function MetricCard({ m, sparkValues }) {
  const color = CAT_COLOR[m.category] || CAT_COLOR.other;
  return (
    <div className="glass-panel" style={{ padding: '14px 16px', borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', marginBottom: 4, lineHeight: 1.2 }}>
        {m.name}
      </div>
      <div style={{ fontSize: '2rem', fontWeight: 800, color: 'white', lineHeight: 1, marginBottom: 7 }}>
        {fmt(m.current, m.unit)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <TrendBadge current={m.current} previous={m.previous} trend={m.trend} />
        {m.previous != null && (
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>prev {fmt(m.previous, m.unit)}</span>
        )}
      </div>
      <MetricSparkline values={sparkValues} color={color} />
    </div>
  );
}

function HealthGauge({ score, label }) {
  const color  = scoreColor(score);
  const r      = 30;
  const circ   = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
      <svg width="80" height="80" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
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
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
        Score Deductions
      </div>
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
  const [expanded, setExpanded]           = useState(false);

  const metrics   = cached?.data?.metrics || [];
  const score     = cached?.data?.score;
  const label     = cached?.data?.score_label || '';
  const breakdown = cached?.data?.score_breakdown || [];
  const history   = cached?.history || [];

  // Build per-metric value arrays from the daily history snapshots
  const metricHistories = {};
  history.forEach(h => {
    if (!h.metrics) return;
    Object.entries(h.metrics).forEach(([name, value]) => {
      if (!metricHistories[name]) metricHistories[name] = [];
      metricHistories[name].push({ ts: h.ts, value });
    });
  });
  const ts        = cached?.ts
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
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 16 }}>

        {/* Gauge + sparkline + site info */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>

          {/* Gauge */}
          {score != null && (
            <div style={{ flexShrink: 0 }}>
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

          {/* Sparkline */}
          {history.length > 0 && score != null && (
            <div style={{
              flexShrink: 0, padding: '6px 10px', borderRadius: 8,
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <ScoreSparkline history={history} />
            </div>
          )}

          {/* Name + metadata */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ marginBottom: 3, fontSize: '1.1rem' }}>{site.name}</h3>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {isLoading && <span style={{ color: 'var(--primary)' }}>Updating…</span>}
              {!isLoading && ts && <span>Updated {ts}</span>}
              {cached?.data?.sheets_read?.length > 0 && (
                <span>Sheets: {cached.data.sheets_read.join(', ')}</span>
              )}
            </div>
            {showBreakdown && <ScoreBreakdown breakdown={breakdown} />}
          </div>
        </div>

        {/* Refresh button */}
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
            : <><RefreshCw size={13} /> Refresh</>}
        </button>
      </div>

      {/* Error */}
      {err && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 14,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          color: '#fca5a5', fontSize: '0.83rem', display: 'flex', gap: 8,
        }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {err}
        </div>
      )}

      {/* First-load skeleton */}
      {!cached && isLoading && (
        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ flex: 1, height: 72, borderRadius: 8, background: 'rgba(255,255,255,0.04)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      )}

      {/* Metrics accordion */}
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
                    {grouped[cat].map((m, i) => (
                      <MetricCard key={i} m={m} sparkValues={metricHistories[m.name] || []} />
                    ))}
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SeoHealth() {
  const [sites, setSites]               = useState([]);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [sitesError, setSitesError]     = useState(null);
  const [cache, setCache]               = useState(() => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; }
  });
  const [loading, setLoading] = useState({});
  const [errors, setErrors]   = useState({});

  // Keep a stable ref to cache so the auto-load effect doesn't re-run when cache updates
  const cacheRef = useRef(cache);
  useEffect(() => { cacheRef.current = cache; }, [cache]);

  useEffect(() => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  }, [cache]);

  // ── fetch site list ────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/sheets/sites')
      .then(r => r.json())
      .then(d => { setSites(d.sites || []); setSitesLoading(false); })
      .catch(e => { setSitesError(e.message); setSitesLoading(false); });
  }, []);

  // ── refresh helper ─────────────────────────────────────────────────────────
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
        setCache(prev => {
          const prevHistory  = prev[site.id]?.history || [];
          const todayStr     = new Date().toDateString();

          // Snapshot metric values keyed by name
          const metricsSnapshot = {};
          (data.metrics || []).forEach(m => {
            if (m.name && m.current != null) metricsSnapshot[m.name] = m.current;
          });

          // One entry per calendar day — replace today's if it exists
          const withoutToday = prevHistory.filter(h => new Date(h.ts).toDateString() !== todayStr);
          const newHistory   = (data.score != null)
            ? [...withoutToday, { ts: Date.now(), score: data.score, metrics: metricsSnapshot }].slice(-30)
            : prevHistory;

          return { ...prev, [site.id]: { data, ts: Date.now(), history: newHistory } };
        });
      }
    } catch (e) {
      setErrors(prev => ({ ...prev, [site.id]: 'Network error: ' + e.message }));
    } finally {
      setLoading(prev => ({ ...prev, [site.id]: false }));
    }
  };

  // ── auto-load stale sites when the site list arrives ───────────────────────
  useEffect(() => {
    if (!sites.length) return;
    sites.forEach(site => {
      const cached = cacheRef.current[site.id];
      const isStale = !cached?.ts || (Date.now() - cached.ts) > STALE_MS;
      if (isStale) refresh(site);
    });
  }, [sites]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-col gap-6">
      <div className="glass-panel">
        <h2 className="flex items-center gap-2 mb-1">
          <BarChart2 size={22} color="var(--primary)" /> SEO Health
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
          KPI overview pulled from your Looker Studio Google Sheets data sources. Refreshes automatically every 24 h.
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
            Add a <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 6px', borderRadius: 4 }}>SEO_HEALTH_SITES</code> environment variable with this format:
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
