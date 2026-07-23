import { useState } from 'react';
import { Zap, Layout, Clock, Move, TrendingUp, Gauge, AlertTriangle } from 'lucide-react';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function perfColorScore(s) {
  return s >= 90 ? '#4ade80' : s >= 50 ? '#f59e0b' : '#ef4444';
}

function dayLabel(ts) {
  const diff = Math.floor((Date.now() - ts) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yest.';
  return new Date(ts).toLocaleDateString('en-US', { weekday: 'short' });
}

// Performance-score history sparkline (mirrors the SEO Health chart)
function ScoreSparkline({ history }) {
  const pts0 = (history || []).slice(-14);
  if (pts0.length < 2) return null;

  const W = 220, H = 80, padT = 14, padB = 20, padL = 8, padR = 8;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = pts0.length;
  const scores = pts0.map(h => h.score);
  const minS = Math.max(0, Math.min(...scores) - 8);
  const maxS = Math.min(100, Math.max(...scores) + 8);
  const rangeS = maxS - minS || 1;
  const xOf = i => padL + (i / (n - 1)) * plotW;
  const yOf = s => padT + ((maxS - s) / rangeS) * plotH;
  const pts = pts0.map((h, i) => ({ x: xOf(i), y: yOf(h.score), s: h.score, ts: h.ts }));
  const last = pts[n - 1], first = pts[0];
  const color = perfColorScore(last.s);
  const line = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `M ${first.x.toFixed(1)},${(padT + plotH).toFixed(1)} ${pts.map(p => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} L ${last.x.toFixed(1)},${(padT + plotH).toFixed(1)} Z`;
  const delta = last.s - first.s;
  const deltaClr = delta > 0 ? '#4ade80' : delta < 0 ? '#f87171' : '#94a3b8';
  const labeled = new Set([0, n - 1]);
  if (n >= 4) labeled.add(Math.floor(n / 2));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Score history
        </span>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: deltaClr }}>{delta > 0 ? '+' : ''}{delta}</span>
      </div>
      <svg width={W} height={H} style={{ overflow: 'visible' }}>
        {[90, 50].filter(t => t > minS && t < maxS).map(t => (
          <line key={t} x1={padL} y1={yOf(t).toFixed(1)} x2={W - padR} y2={yOf(t).toFixed(1)} stroke="rgba(255,255,255,0.06)" strokeDasharray="3,3" />
        ))}
        <path d={area} fill={color} opacity={0.1} />
        <polyline points={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={i === n - 1 ? 3.5 : 2}
            fill={i === n - 1 ? color : `${color}80`} stroke={i === n - 1 ? 'rgba(10,10,20,0.6)' : 'none'} strokeWidth="1.5" />
        ))}
        <text x={last.x.toFixed(1)} y={(last.y - 6).toFixed(1)} fontSize="9" fontWeight="700" fill={color}
          textAnchor={last.x > W * 0.75 ? 'end' : 'middle'}>{last.s}</text>
        {pts.map((p, i) => labeled.has(i) ? (
          <text key={i} x={p.x.toFixed(1)} y={H} fontSize="8"
            fill={i === n - 1 ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.22)'}
            textAnchor={p.x < W * 0.2 ? 'start' : p.x > W * 0.8 ? 'end' : 'middle'}>{dayLabel(p.ts)}</text>
        ) : null)}
      </svg>
      <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
        {n} snapshot{n !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

const METRICS_CONFIG = [
  { key: 'lcp', label: 'LCP', desc: 'Largest Contentful Paint', icon: Layout },
  { key: 'fcp', label: 'FCP', desc: 'First Contentful Paint',   icon: Zap },
  { key: 'cls', label: 'CLS', desc: 'Cumulative Layout Shift',  icon: Move },
  { key: 'tbt', label: 'TBT', desc: 'Total Blocking Time',      icon: Clock },
  { key: 'si',  label: 'Speed Index', desc: 'Speed Index',      icon: TrendingUp },
  { key: 'tti', label: 'TTI', desc: 'Time to Interactive',      icon: Gauge },
];

function scoreColor(score) {
  if (score === null || score === undefined) return '#94a3b8';
  if (score >= 0.9) return '#4ade80';
  if (score >= 0.5) return '#f59e0b';
  return '#ef4444';
}

function perfColor(score) {
  if (score >= 90) return '#4ade80';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

export default function CwvAnalysis() {
  const [url, setUrl]           = useState('');
  const [strategy, setStrategy] = useState('mobile');
  const [authUser, setAuthUser] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState('');
  const [history, setHistory]   = useState([]);

  const loadHistory = async (u, strat) => {
    try {
      const res = await fetch(`/api/cwv/history?url=${encodeURIComponent(u)}&strategy=${strat}`);
      if (!res.ok) return;
      const data = await res.json();
      setHistory((data.history || []).filter(h => h.ts && h.score != null));
    } catch { /* history is best-effort */ }
  };

  const handleAnalyze = async () => {
    if (!url) return;
    setLoading(true);
    setResult(null);
    setError('');
    setHistory([]);
    try {
      const res = await fetch('/api/cwv/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, strategy, auth_user: authUser || null, auth_pass: authPass || null })
      });
      const data = await res.json();
      if (!res.ok) setError(data.detail || 'Unknown error');
      else {
        setResult(data);
        // This run is already persisted server-side — pull the full daily history for the sparkline
        loadHistory(url, strategy);
      }
    } catch (e) {
      setError('Network error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const color = result ? perfColor(result.performance_score) : 'var(--primary)';

  return (
    <div className="flex-col gap-6">
      <div className="glass-panel">
        <h2 className="flex items-center gap-2 mb-6"><Zap size={22} color="var(--primary)" /> Core Web Vitals Analysis</h2>
        <p className="mb-6" style={{ color: 'var(--text-muted)' }}>
          Real performance metrics via Google PageSpeed Insights — LCP, FCP, CLS, TBT and more.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="metric-label mb-2 block">Page URL</label>
            <input className="glass-input" type="url" placeholder="https://example.com" value={url} onChange={e => setUrl(e.target.value)} />
          </div>
          <div>
            <label className="metric-label mb-2 block">Strategy</label>
            <div className="flex gap-3">
              {['mobile', 'desktop'].map(s => (
                <button
                  key={s}
                  onClick={() => setStrategy(s)}
                  className={strategy === s ? 'btn-primary' : ''}
                  style={strategy !== s ? {
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--text-muted)', padding: '12px 24px', borderRadius: 8, cursor: 'pointer',
                    fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '0.85rem'
                  } : {}}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-4">
          <button className="flex items-center gap-2 text-sm mb-3" style={{ color: 'var(--text-muted)' }} onClick={() => setShowAuth(!showAuth)}>
            🔒 Authentication (Optional) {showAuth ? '▲' : '▼'}
          </button>
          {showAuth && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="metric-label mb-2 block">Username</label>
                <input className="glass-input" placeholder="user" value={authUser} onChange={e => setAuthUser(e.target.value)} />
              </div>
              <div>
                <label className="metric-label mb-2 block">Password</label>
                <input className="glass-input" type="password" placeholder="password" value={authPass} onChange={e => setAuthPass(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        <button className="btn-primary w-full" onClick={handleAnalyze} disabled={loading || !url}>
          {loading ? <span role="status"><div className="loader" /> Running PageSpeed Insights…</span> : '⚡ Analyze Core Web Vitals'}
        </button>
        {error && <div className="banner banner-error mt-4" role="alert">{error}</div>}
      </div>

      {result && (
        <>
          {/* Performance Score */}
          <div className="glass-panel flex items-center gap-8">
            <div style={{ textAlign: 'center', flexShrink: 0 }}>
              <div style={{
                width: 120, height: 120, borderRadius: '50%',
                border: `6px solid ${color}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 0 30px ${color}40`
              }}>
                <span style={{ fontSize: '2.2rem', fontWeight: 700, color }}>{result.performance_score}</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Score</span>
              </div>
              <div className="mt-2" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{result.strategy}</div>
            </div>
            <div style={{ flex: 1 }}>
              <h3 className="mb-2">Performance Score</h3>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {result.performance_score >= 90
                  ? '✅ Excellent — your page is fast and well-optimized.'
                  : result.performance_score >= 50
                  ? '⚠️ Needs Improvement — some metrics require attention.'
                  : '❌ Poor — significant performance issues detected.'}
              </p>
              <p className="mt-2" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Powered by Google PageSpeed Insights v5</p>
            </div>

            {history.length >= 2 && (
              <div style={{
                flexShrink: 0, padding: '10px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <ScoreSparkline history={history} />
              </div>
            )}
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-3 gap-4">
            {METRICS_CONFIG.map(({ key, label, desc, icon: Icon }) => {
              const m = result.metrics[key];
              const c = scoreColor(m?.score);
              return (
                <div key={key} className="glass-panel interactive">
                  <Icon size={24} color={c} />
                  <div className="metric-label mt-2">{label}</div>
                  <div className="metric-value" style={{ color: c, fontSize: '1.6rem' }}>{m?.value || 'N/A'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{desc}</div>
                </div>
              );
            })}
          </div>

          {/* Opportunities */}
          {result.opportunities?.length > 0 && (
            <div className="glass-panel">
              <h3 className="mb-4 flex items-center gap-2">
                <AlertTriangle size={20} color="#f59e0b" /> Top Optimization Opportunities
              </h3>
              <div className="flex-col gap-3">
                {result.opportunities.map((opp, i) => (
                  <div key={i} className="p-4 rounded-lg" style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-semibold" style={{ fontSize: '0.9rem' }}>{opp.title}</span>
                      <span style={{ color: '#f59e0b', fontSize: '0.8rem', flexShrink: 0, marginLeft: 12 }}>
                        ~{Math.round(opp.savings_ms)}ms saved
                      </span>
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.5 }}>{opp.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
