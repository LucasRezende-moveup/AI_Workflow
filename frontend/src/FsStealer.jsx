import { useState, useEffect } from 'react';
import { ExternalLink, Target, Search, Sparkles, Globe, Tag, HelpCircle, ChevronDown } from 'lucide-react';

function PaaItem({ question, answer }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '11px 14px', background: open ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
          border: 'none', color: 'var(--text-main)', cursor: 'pointer', textAlign: 'left', gap: 12,
          fontSize: '0.87rem', fontWeight: 500, transition: 'background 0.15s',
        }}
      >
        <span>{question}</span>
        <ChevronDown size={14} style={{ flexShrink: 0, color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>
      {open && (
        <div style={{ padding: '10px 14px 13px', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.65 }}>
          {answer}
        </div>
      )}
    </div>
  );
}
import ReactMarkdown from 'react-markdown';


const INTENT_COLORS = {
  Transactional: { bg: 'rgba(251,146,60,0.15)', border: 'rgba(251,146,60,0.4)', text: '#fb923c' },
  Commercial:    { bg: 'rgba(167,139,250,0.15)', border: 'rgba(167,139,250,0.4)', text: '#a78bfa' },
  Informational: { bg: 'rgba(56,189,248,0.15)',  border: 'rgba(56,189,248,0.4)',  text: '#38bdf8' },
  Navigational:  { bg: 'rgba(74,222,128,0.15)',  border: 'rgba(74,222,128,0.4)',  text: '#4ade80' },
};

function StepBadge({ n }) {
  return (
    <div style={{
      flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
      background: 'rgba(226,0,113,0.2)', border: '1px solid rgba(226,0,113,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 800, fontSize: '0.8rem', color: 'var(--primary)',
    }}>{n}</div>
  );
}

export default function FsStealer() {
  const [keyword,    setKeyword]    = useState('');
  const [targetUrl,  setTargetUrl]  = useState('');
  const [location,   setLocation]   = useState('Global (No Geolocation)');
  const [authUser,   setAuthUser]   = useState('');
  const [authPass,   setAuthPass]   = useState('');
  const [geolocations, setGeolocations] = useState(['Global (No Geolocation)']);
  const [showAuth,   setShowAuth]   = useState(false);
  const [loading,    setLoading]    = useState(false);

  useEffect(() => {
    fetch('/api/serp/geolocations').then(r => r.json())
      .then(d => { if (d.geolocations?.length) setGeolocations(d.geolocations); })
      .catch(() => {});
  }, []);
  const [result,     setResult]     = useState(null);
  const [error,      setError]      = useState('');
  const [phase,      setPhase]      = useState('');

  const handleAnalyze = async () => {
    if (!keyword.trim() || !targetUrl.trim()) return;
    setLoading(true); setResult(null); setError(''); setPhase('Fetching live SERP…');

    // Simulate phase updates while waiting
    const phases = [
      [4000,  'Analyzing SERP results…'],
      [8000,  'Fetching competitor pages…'],
      [14000, 'Fetching your target page…'],
      [20000, 'Running AI gap analysis…'],
    ];
    const timers = phases.map(([ms, msg]) => setTimeout(() => setPhase(msg), ms));

    try {
      const res = await fetch('/api/fs/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: keyword.trim(),
          target_url: targetUrl.trim(),
          location_name: location,
          auth_user: authUser || null,
          auth_pass: authPass || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Analysis failed'); return; }
      setResult(data);
    } catch (e) {
      setError('Request failed. Check network.');
    } finally {
      timers.forEach(clearTimeout);
      setLoading(false); setPhase('');
    }
  };

  return (
    <div className="flex-col gap-6">

      {/* Header */}
      <div className="glass-panel">
        <div className="flex items-center gap-3 mb-2">
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(226,0,113,0.15)', border: '1px solid rgba(226,0,113,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Target size={20} color="var(--primary)" />
          </div>
          <div>
            <h2 style={{ margin: 0 }}>Featured Snippet Stealer</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              Analyze a SERP, identify who holds the FS, and get an exact action plan to take it.
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="glass-panel">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="metric-label mb-2 block">Target Keyword</label>
            <input
              className="glass-input"
              placeholder="e.g. código promocional betano"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !loading && handleAnalyze()}
            />
          </div>
          <div>
            <label className="metric-label mb-2 block">URL you want to have the FS</label>
            <input
              className="glass-input"
              placeholder="https://yoursite.com/page"
              value={targetUrl}
              onChange={e => setTargetUrl(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="metric-label mb-2 block"><Globe size={12} style={{ display: 'inline', marginRight: 4 }} />Geolocation</label>
            <select className="glass-input glass-select" value={location} onChange={e => setLocation(e.target.value)}>
              {geolocations.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button
              className="btn-primary w-full"
              onClick={handleAnalyze}
              disabled={loading || !keyword.trim() || !targetUrl.trim()}
            >
              {loading
                ? <><div className="loader" /> {phase || 'Analyzing…'}</>
                : <><Target size={16} /> Steal the Featured Snippet</>}
            </button>
          </div>
        </div>

        <div>
          <button
            onClick={() => setShowAuth(!showAuth)}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.82rem', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            🔒 Auth for target URL (optional) {showAuth ? '▲' : '▼'}
          </button>
          {showAuth && (
            <div className="grid grid-cols-2 gap-4 mt-3">
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
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="glass-panel" style={{ padding: 48, textAlign: 'center' }}>
          <div className="loader" style={{ width: 44, height: 44, borderWidth: 4, margin: '0 auto 20px' }} />
          <p style={{ color: 'var(--text-muted)', marginBottom: 8 }}>{phase || 'Starting analysis…'}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>This fetches live SERP data and analyzes multiple pages — can take 20–40 s</p>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <>
          {/* SERP Snapshot */}
          <div className="glass-panel">
            <div className="flex items-center gap-3 mb-4" style={{ flexWrap: 'wrap' }}>
              <h3 className="flex items-center gap-2" style={{ margin: 0 }}>
                <Search size={18} /> SERP Snapshot
                <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-muted)' }}>— {result.keyword}</span>
              </h3>
              {result.intent && (() => {
                const c = INTENT_COLORS[result.intent] || INTENT_COLORS.Navigational;
                return (
                  <span style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: 20, fontWeight: 700,
                    background: c.bg, border: `1px solid ${c.border}`, color: c.text, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                    {result.intent}
                  </span>
                );
              })()}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {result.organic.map((row, i) => {
                const isFs = i === 0;
                const isTarget = row.link && result.target_url &&
                  (() => { try { return row.link.includes(new URL(result.target_url).hostname); } catch { return false; } })();
                return (
                  <div key={i} style={{
                    display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 10,
                    background: isFs ? 'rgba(226,0,113,0.1)' : isTarget ? 'rgba(74,222,128,0.07)' : 'rgba(255,255,255,0.03)',
                    border: isFs ? '1px solid rgba(226,0,113,0.4)' : isTarget ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <div style={{
                      flexShrink: 0, width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: '0.9rem',
                      background: isFs ? 'rgba(226,0,113,0.25)' : 'rgba(255,255,255,0.06)',
                      color: isFs ? 'var(--primary)' : 'var(--text-muted)',
                    }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{row.title}</span>
                        {isFs && (
                          <span style={{ flexShrink: 0, fontSize: '0.68rem', padding: '2px 8px', borderRadius: 4, background: 'var(--primary)', color: 'white', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            FS HOLDER
                          </span>
                        )}
                        {isTarget && (
                          <span style={{ flexShrink: 0, fontSize: '0.68rem', padding: '2px 8px', borderRadius: 4, background: 'rgba(74,222,128,0.2)', color: '#4ade80', fontWeight: 700, border: '1px solid rgba(74,222,128,0.3)' }}>
                            YOUR PAGE
                          </span>
                        )}
                      </div>
                      <a href={row.link} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: isFs ? 'var(--primary)' : '#4ade80', marginBottom: 4, textDecoration: 'none' }}>
                        {(() => { try { return new URL(row.link).hostname.replace('www.', ''); } catch { return row.link; } })()}
                        <ExternalLink size={10} />
                      </a>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4, margin: 0 }}>{row.snippet}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Related Keywords */}
          {result.related_keywords && result.related_keywords.length > 0 && (
            <div className="glass-panel">
              <h3 className="flex items-center gap-2 mb-3" style={{ fontSize: '0.95rem' }}>
                <Tag size={16} /> Related Searches
                <span style={{ fontSize: '0.78rem', fontWeight: 400, color: 'var(--text-muted)' }}>— semantic cluster for this keyword</span>
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {result.related_keywords.map((kw, i) => (
                  <button
                    key={i}
                    onClick={() => { setKeyword(kw); setResult(null); }}
                    style={{
                      background: 'rgba(226,0,113,0.08)', border: '1px solid rgba(226,0,113,0.25)',
                      borderRadius: 20, padding: '4px 12px', fontSize: '0.8rem', color: 'var(--text-muted)',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.target.style.background = 'rgba(226,0,113,0.18)'; e.target.style.color = '#fff'; }}
                    onMouseLeave={e => { e.target.style.background = 'rgba(226,0,113,0.08)'; e.target.style.color = 'var(--text-muted)'; }}
                  >
                    {kw}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* People Also Ask */}
          {result.paa && result.paa.length > 0 && (
            <div className="glass-panel">
              <h3 className="flex items-center gap-2 mb-3" style={{ fontSize: '0.95rem' }}>
                <HelpCircle size={16} /> People Also Ask
                <span style={{ fontSize: '0.78rem', fontWeight: 400, color: 'var(--text-muted)' }}>— {result.paa.length} questions</span>
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {result.paa.map((item, i) => (
                  <PaaItem key={i} question={item.question} answer={item.answer} />
                ))}
              </div>
            </div>
          )}

          {/* AI Analysis */}
          <div className="glass-panel">
            <h3 className="flex items-center gap-2 mb-5">
              <Sparkles size={18} color="var(--primary)" /> AI Action Plan
            </h3>
            <div className="markdown-content" style={{ lineHeight: 1.75 }}>
              <ReactMarkdown
                components={{
                  table: ({ children }) => (
                    <div style={{ overflowX: 'auto', margin: '16px 0' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>{children}</table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th style={{ padding: '8px 12px', borderBottom: '1px solid rgba(226,0,113,0.3)', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{children}</th>
                  ),
                  td: ({ children }) => (
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-main)' }}>{children}</td>
                  ),
                  h2: ({ children }) => (
                    <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginTop: 28, marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid rgba(226,0,113,0.2)', color: '#fff' }}>{children}</h2>
                  ),
                  h3: ({ children }) => (
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: 20, marginBottom: 8, color: 'var(--primary)' }}>{children}</h3>
                  ),
                  li: ({ children }) => (
                    <li style={{ marginBottom: 6, paddingLeft: 4, lineHeight: 1.6 }}>{children}</li>
                  ),
                  code: ({ inline, children }) => inline
                    ? <code style={{ background: 'rgba(226,0,113,0.1)', border: '1px solid rgba(226,0,113,0.2)', borderRadius: 4, padding: '1px 6px', fontSize: '0.85em', color: 'var(--primary)', fontFamily: 'monospace' }}>{children}</code>
                    : <pre style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '14px 16px', overflowX: 'auto', fontSize: '0.82rem', lineHeight: 1.5, margin: '12px 0' }}><code style={{ fontFamily: 'monospace', color: '#e2e8f0' }}>{children}</code></pre>,
                  strong: ({ children }) => (
                    <strong style={{ color: '#fff', fontWeight: 700 }}>{children}</strong>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote style={{ borderLeft: '3px solid var(--primary)', paddingLeft: 16, margin: '12px 0', color: 'var(--text-muted)', fontStyle: 'italic' }}>{children}</blockquote>
                  ),
                }}
              >
                {result.analysis}
              </ReactMarkdown>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
