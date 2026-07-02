import { useState } from 'react';
import { Zap, Layout, Clock, Move, TrendingUp, Gauge, AlertTriangle } from 'lucide-react';

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

  const handleAnalyze = async () => {
    if (!url) return;
    setLoading(true);
    setResult(null);
    setError('');
    try {
      const res = await fetch('/api/cwv/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, strategy, auth_user: authUser || null, auth_pass: authPass || null })
      });
      const data = await res.json();
      if (!res.ok) setError(data.detail || 'Unknown error');
      else setResult(data);
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
            <input className="glass-input" placeholder="https://example.com" value={url} onChange={e => setUrl(e.target.value)} />
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
          {loading ? <><div className="loader" /> Running PageSpeed Insights...</> : '⚡ Analyze Core Web Vitals'}
        </button>
        {error && <p className="mt-4 text-red-400">{error}</p>}
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
            <div>
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
