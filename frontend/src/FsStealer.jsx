import { useState, useEffect } from 'react';
import { ExternalLink, Target, Search, Sparkles, Globe, Tag, HelpCircle, ChevronDown, Copy, Download, Check, MapPin, BookmarkPlus, BookmarkCheck } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

/* ── helpers ── */
function hostname(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

const INTENT_COLORS = {
  Transactional: { bg: 'rgba(251,146,60,0.15)', border: 'rgba(251,146,60,0.35)', text: '#fb923c' },
  Commercial:    { bg: 'rgba(167,139,250,0.15)', border: 'rgba(167,139,250,0.35)', text: '#a78bfa' },
  Informational: { bg: 'rgba(56,189,248,0.15)',  border: 'rgba(56,189,248,0.35)',  text: '#38bdf8' },
  Navigational:  { bg: 'rgba(74,222,128,0.15)',  border: 'rgba(74,222,128,0.35)',  text: '#4ade80' },
};

/* ── sub-components ── */
function PaaItem({ question, answer }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 13px', background: open ? 'rgba(255,255,255,0.04)' : 'transparent',
        border: 'none', color: 'var(--text-main)', cursor: 'pointer', textAlign: 'left', gap: 10,
        fontSize: '0.85rem', fontWeight: 500, transition: 'background 0.15s',
      }}>
        <span>{question}</span>
        <ChevronDown size={13} style={{ flexShrink: 0, color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>
      {open && (
        <div style={{ padding: '9px 13px 12px', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '0.81rem', color: 'var(--text-muted)', lineHeight: 1.65 }}>
          {answer}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      flex: 1, minWidth: 130,
      padding: '14px 16px', borderRadius: 10,
      background: accent ? `rgba(226,0,113,0.07)` : 'rgba(255,255,255,0.03)',
      border: accent ? '1px solid rgba(226,0,113,0.3)' : '1px solid rgba(255,255,255,0.07)',
    }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 5 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: accent ? 'var(--primary)' : 'var(--text-main)', lineHeight: 1.2, wordBreak: 'break-all' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function Favicon({ url }) {
  const [ok, setOk] = useState(true);
  const src = `https://www.google.com/s2/favicons?domain=${hostname(url)}&sz=16`;
  if (!ok) return null;
  return (
    <img src={src} alt="" width={14} height={14}
      style={{ borderRadius: 2, flexShrink: 0, marginRight: 2 }}
      onError={() => setOk(false)} />
  );
}

function ExportButton({ onClick, icon: Icon, label, active }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '6px 12px', borderRadius: 7, fontSize: '0.78rem', fontWeight: 600,
      background: active ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.05)',
      border: active ? '1px solid rgba(74,222,128,0.4)' : '1px solid rgba(255,255,255,0.12)',
      color: active ? '#4ade80' : 'var(--text-muted)',
      cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
    }}>
      <Icon size={13} />
      {label}
    </button>
  );
}

const MD_COMPONENTS = {
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '16px 0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th style={{ padding: '8px 12px', borderBottom: '1px solid rgba(226,0,113,0.3)', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'left', fontSize: '0.79rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{children}</th>
  ),
  td: ({ children }) => (
    <td style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-main)', fontSize: '0.85rem' }}>{children}</td>
  ),
  h2: ({ children }) => (
    <h2 style={{ fontSize: '1.02rem', fontWeight: 700, marginTop: 28, marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid rgba(226,0,113,0.2)', color: '#fff' }}>{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 style={{ fontSize: '0.93rem', fontWeight: 700, marginTop: 18, marginBottom: 7, color: 'var(--primary)' }}>{children}</h3>
  ),
  li: ({ children }) => <li style={{ marginBottom: 5, paddingLeft: 4, lineHeight: 1.6, fontSize: '0.875rem' }}>{children}</li>,
  pre: ({ children }) => (
    <pre style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '13px 15px', overflowX: 'auto', fontSize: '0.81rem', lineHeight: 1.55, margin: '12px 0' }}>{children}</pre>
  ),
  code: ({ children, className }) => (
    className
      ? <code style={{ fontFamily: 'monospace', color: '#e2e8f0' }}>{children}</code>
      : <code style={{ background: 'rgba(226,0,113,0.1)', border: '1px solid rgba(226,0,113,0.2)', borderRadius: 4, padding: '1px 6px', fontSize: '0.84em', color: 'var(--primary)', fontFamily: 'monospace' }}>{children}</code>
  ),
  strong: ({ children }) => <strong style={{ color: '#fff', fontWeight: 700 }}>{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote style={{ borderLeft: '3px solid var(--primary)', paddingLeft: 16, margin: '12px 0', color: 'var(--text-muted)', fontStyle: 'italic' }}>{children}</blockquote>
  ),
  p: ({ children }) => <p style={{ marginBottom: 10, lineHeight: 1.7, fontSize: '0.875rem' }}>{children}</p>,
};

/* ── main component ── */
export default function FsStealer() {
  const [keyword,      setKeyword]      = useState('');
  const [targetUrl,    setTargetUrl]    = useState('');
  const [location,     setLocation]     = useState('Global (No Geolocation)');
  const [authUser,     setAuthUser]     = useState('');
  const [authPass,     setAuthPass]     = useState('');
  const [geolocations, setGeolocations] = useState(['Global (No Geolocation)']);
  const [showAuth,     setShowAuth]     = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [result,       setResult]       = useState(null);
  const [error,        setError]        = useState('');
  const [phase,        setPhase]        = useState('');
  const [copied,       setCopied]       = useState(false);
  const [tracking,     setTracking]     = useState(false);
  const [tracked,      setTracked]      = useState(false);

  useEffect(() => {
    fetch('/api/serp/geolocations').then(r => r.json())
      .then(d => { if (d.geolocations?.length) setGeolocations(d.geolocations); })
      .catch(() => {});
  }, []);

  const handleTrack = async () => {
    if (!result || tracking || tracked) return;
    setTracking(true);
    try {
      const token = localStorage.getItem('auth_token');
      await fetch('/api/tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ keyword: result.keyword, target_url: result.target_url || null, location }),
      });
      setTracked(true);
    } catch { /* silent */ } finally {
      setTracking(false);
    }
  };

  const handleAnalyze = async () => {
    if (!keyword.trim() || !targetUrl.trim()) return;
    setLoading(true); setResult(null); setError(''); setTracked(false); setPhase('Fetching live SERP…');
    const phases = [
      [4000, 'Analyzing SERP results…'],
      [8000, 'Fetching competitor pages…'],
      [14000, 'Fetching your target page…'],
      [20000, 'Running AI gap analysis…'],
    ];
    const timers = phases.map(([ms, msg]) => setTimeout(() => setPhase(msg), ms));
    try {
      const res = await fetch('/api/fs/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: keyword.trim(), target_url: targetUrl.trim(),
          location_name: location, auth_user: authUser || null, auth_pass: authPass || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Analysis failed'); return; }
      setResult(data);
    } catch { setError('Request failed. Check network.'); }
    finally { timers.forEach(clearTimeout); setLoading(false); setPhase(''); }
  };

  const buildMarkdown = () => {
    if (!result) return '';
    const fsHolder = result.organic[0];
    const targetPos = result.organic.findIndex(r =>
      r.link && result.target_url &&
      (() => { try { return r.link.includes(new URL(result.target_url).hostname); } catch { return false; } })()
    );
    const lines = [
      `# Featured Snippet Steal — "${result.keyword}"`,
      ``,
      `| Field | Value |`,
      `|-------|-------|`,
      `| **Keyword** | ${result.keyword} |`,
      `| **Location** | ${location} |`,
      `| **Intent** | ${result.intent} |`,
      `| **FS Holder** | ${fsHolder?.link || 'N/A'} |`,
      `| **Your position** | ${targetPos === -1 ? 'Not in top 10' : `#${targetPos + 1}`} |`,
      ``,
      `---`,
      ``,
      `## SERP Snapshot`,
      ``,
      `| # | Title | URL | Snippet |`,
      `|---|-------|-----|---------|`,
      ...result.organic.map((r, i) =>
        `| ${i + 1} | ${r.title.replace(/\|/g, '\\|')} | ${r.link} | ${(r.snippet || '').replace(/\|/g, '\\|').slice(0, 90)}… |`
      ),
    ];
    if (result.related_keywords?.length) {
      lines.push(``, `## Related Searches`, ``, result.related_keywords.join(' · '));
    }
    if (result.paa?.length) {
      lines.push(``, `## People Also Ask`, ``);
      result.paa.forEach(p => { lines.push(`**${p.question}**`, p.answer, ``); });
    }
    lines.push(``, `---`, ``, result.analysis);
    return lines.join('\n');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(buildMarkdown()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  };

  const handleDownload = () => {
    const content = buildMarkdown();
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fs-${result.keyword.replace(/\s+/g, '-').toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* derived values for results */
  const targetPos = result
    ? result.organic.findIndex(r =>
        r.link && result.target_url &&
        (() => { try { return r.link.includes(new URL(result.target_url).hostname); } catch { return false; } })()
      )
    : -1;
  const intentColor = result && INTENT_COLORS[result.intent];
  const hasRelated = result?.related_keywords?.length > 0;
  const hasPaa     = result?.paa?.length > 0;

  return (
    <div className="flex-col gap-6">

      {/* ── Header ── */}
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

      {/* ── Form ── */}
      <div className="glass-panel">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="metric-label mb-2 block">Target Keyword</label>
            <input className="glass-input" placeholder="e.g. código promocional betano"
              value={keyword} onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !loading && handleAnalyze()} />
          </div>
          <div>
            <label className="metric-label mb-2 block">URL you want to have the FS</label>
            <input className="glass-input" placeholder="https://yoursite.com/page"
              value={targetUrl} onChange={e => setTargetUrl(e.target.value)} />
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
            <button className="btn-primary w-full" onClick={handleAnalyze}
              disabled={loading || !keyword.trim() || !targetUrl.trim()}>
              {loading ? <><div className="loader" /> {phase || 'Analyzing…'}</> : <><Target size={16} /> Steal the Featured Snippet</>}
            </button>
          </div>
        </div>
        <div>
          <button onClick={() => setShowAuth(!showAuth)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.82rem', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
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

      {/* ── Error ── */}
      {error && <div className="banner banner-error">{error}</div>}

      {/* ── Loading ── */}
      {loading && (
        <div className="glass-panel" style={{ padding: 48, textAlign: 'center' }}>
          <div className="loader" style={{ width: 44, height: 44, borderWidth: 4, margin: '0 auto 20px' }} />
          <p style={{ color: 'var(--text-muted)', marginBottom: 8 }}>{phase || 'Starting analysis…'}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Fetching live Google SERP and running AI analysis — takes 20–40 s</p>
        </div>
      )}

      {/* ── Results ── */}
      {result && !loading && (
        <>
          {/* ── 1. Summary strip ── */}
          <div className="glass-panel" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <StatCard label="FS Holder" value={hostname(result.organic[0]?.link || '')} accent />
              <StatCard
                label="Your Position"
                value={targetPos === -1 ? 'Not in top 10' : `#${targetPos + 1}`}
                sub={targetPos === -1 ? 'Not found in SERP' : `of ${result.organic.length} results`}
              />
              {intentColor && (
                <div style={{
                  flex: 1, minWidth: 130, padding: '14px 16px', borderRadius: 10,
                  background: intentColor.bg, border: `1px solid ${intentColor.border}`,
                }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: intentColor.text, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 5 }}>Intent</div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: intentColor.text }}>{result.intent}</div>
                </div>
              )}
              <StatCard label="Location" value={location.split(' (')[0]} sub={result.organic.length + ' results analyzed'} />
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleTrack}
                disabled={tracking || tracked}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                  borderRadius: 7, fontSize: '0.78rem', fontWeight: 600, cursor: tracked ? 'default' : 'pointer',
                  border: tracked ? '1px solid rgba(74,222,128,0.35)' : '1px solid rgba(226,0,113,0.35)',
                  background: tracked ? 'rgba(74,222,128,0.08)' : 'rgba(226,0,113,0.08)',
                  color: tracked ? '#4ade80' : 'var(--primary)',
                  transition: 'all 0.2s',
                }}
              >
                {tracked ? <BookmarkCheck size={14} /> : <BookmarkPlus size={14} />}
                {tracking ? 'Adding…' : tracked ? 'Tracking' : 'Track this keyword'}
              </button>
            </div>
          </div>

          {/* ── 2. SERP Snapshot ── */}
          <div className="glass-panel">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              <h3 className="flex items-center gap-2" style={{ margin: 0, fontSize: '0.97rem' }}>
                <Search size={17} /> SERP Snapshot
              </h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>— live Google results for <strong style={{ color: 'var(--text-main)' }}>{result.keyword}</strong></span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {result.organic.map((row, i) => {
                const isFs = i === 0;
                const isTarget = row.link && result.target_url &&
                  (() => { try { return row.link.includes(new URL(result.target_url).hostname); } catch { return false; } })();
                const host = hostname(row.link);
                return (
                  <div key={i} style={{
                    display: 'flex', gap: 12, padding: isFs ? '14px 16px' : '10px 14px', borderRadius: 10,
                    background: isFs ? 'rgba(226,0,113,0.09)' : isTarget ? 'rgba(74,222,128,0.06)' : 'rgba(255,255,255,0.025)',
                    border: isFs ? '1px solid rgba(226,0,113,0.38)' : isTarget ? '1px solid rgba(74,222,128,0.28)' : '1px solid rgba(255,255,255,0.055)',
                    boxShadow: isFs ? '0 0 0 1px rgba(226,0,113,0.1) inset' : 'none',
                    transition: 'background 0.15s',
                  }}>
                    {/* Position badge */}
                    <div style={{
                      flexShrink: 0, width: 30, height: 30, borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: '0.85rem',
                      background: isFs ? 'rgba(226,0,113,0.22)' : 'rgba(255,255,255,0.06)',
                      color: isFs ? 'var(--primary)' : 'var(--text-muted)',
                      alignSelf: 'flex-start', marginTop: 1,
                    }}>{i + 1}</div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Title row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: isFs ? '0.93rem' : '0.87rem', color: 'var(--text-main)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.title}
                        </span>
                        {isFs && (
                          <span style={{ flexShrink: 0, fontSize: '0.67rem', padding: '2px 8px', borderRadius: 4, background: 'var(--primary)', color: '#fff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            FS HOLDER
                          </span>
                        )}
                        {isTarget && (
                          <span style={{ flexShrink: 0, fontSize: '0.67rem', padding: '2px 8px', borderRadius: 4, background: 'rgba(74,222,128,0.18)', color: '#4ade80', fontWeight: 700, border: '1px solid rgba(74,222,128,0.3)' }}>
                            YOUR PAGE
                          </span>
                        )}
                      </div>
                      {/* URL row */}
                      <a href={row.link} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.73rem', color: isFs ? 'var(--primary)' : 'rgba(74,222,128,0.8)', marginBottom: 5, textDecoration: 'none', opacity: 0.9 }}>
                        <Favicon url={row.link} />
                        {host}
                        <ExternalLink size={9} />
                      </a>
                      {/* Snippet */}
                      <p style={{ fontSize: '0.79rem', color: 'var(--text-muted)', lineHeight: 1.45, margin: 0 }}>{row.snippet}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 3. Related + PAA (side by side when both present) ── */}
          {(hasRelated || hasPaa) && (
            <div style={{ display: 'grid', gridTemplateColumns: hasRelated && hasPaa ? '1fr 1fr' : '1fr', gap: 16 }}>
              {hasRelated && (
                <div className="glass-panel">
                  <h3 className="flex items-center gap-2 mb-3" style={{ fontSize: '0.9rem', margin: '0 0 12px' }}>
                    <Tag size={14} /> Related Searches
                  </h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {result.related_keywords.map((kw, i) => (
                      <button key={i} onClick={() => { setKeyword(kw); setResult(null); }} style={{
                        background: 'rgba(226,0,113,0.07)', border: '1px solid rgba(226,0,113,0.22)',
                        borderRadius: 20, padding: '4px 11px', fontSize: '0.78rem', color: 'var(--text-muted)',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(226,0,113,0.17)'; e.currentTarget.style.color = '#fff'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(226,0,113,0.07)'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
                        {kw}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {hasPaa && (
                <div className="glass-panel">
                  <h3 className="flex items-center gap-2 mb-3" style={{ fontSize: '0.9rem', margin: '0 0 12px' }}>
                    <HelpCircle size={14} /> People Also Ask
                    <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>({result.paa.length})</span>
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {result.paa.map((item, i) => <PaaItem key={i} question={item.question} answer={item.answer} />)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── 4. AI Action Plan ── */}
          <div className="glass-panel">
            {/* Header row with export buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
              <h3 className="flex items-center gap-2" style={{ margin: 0 }}>
                <Sparkles size={17} color="var(--primary)" /> AI Action Plan
              </h3>
              <div style={{ display: 'flex', gap: 7 }}>
                <ExportButton onClick={handleCopy} icon={copied ? Check : Copy} label={copied ? 'Copied!' : 'Copy'} active={copied} />
                <ExportButton onClick={handleDownload} icon={Download} label="Download .md" />
              </div>
            </div>

            <div className="markdown-content" style={{ lineHeight: 1.75 }}>
              <ReactMarkdown components={MD_COMPONENTS}>{result.analysis}</ReactMarkdown>
            </div>

            {/* Bottom export strip */}
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'flex-end', gap: 7 }}>
              <ExportButton onClick={handleCopy} icon={copied ? Check : Copy} label={copied ? 'Copied!' : 'Copy markdown'} active={copied} />
              <ExportButton onClick={handleDownload} icon={Download} label="Download .md" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
