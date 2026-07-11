import { useState } from 'react';
import { LayoutDashboard, ChevronDown, ChevronUp, ExternalLink, Globe, FileSpreadsheet } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import InternalLinkingCrawl from './InternalLinkingCrawl';

function shortLabel(url) {
  try {
    const { hostname, pathname } = new URL(url);
    const path = pathname.replace(/\/$/, '');
    return path || hostname;
  } catch {
    return url.length > 45 ? url.slice(0, 42) + '…' : url;
  }
}

const GENERIC_ANCHORS = new Set([
  'click here', 'here', 'read more', 'learn more', 'this', 'link', 'more',
  'continue', 'see more', 'view more', '[no text/image]',
  'clique aqui', 'aqui', 'saiba mais', 'leia mais', 'veja mais',
  'acesse', 'confira', 'clique', 'ver mais', 'mais',
]);

function anchorType(text) {
  const t = text.toLowerCase().trim();
  if (!t || t.length < 2) return 'empty';
  if (GENERIC_ANCHORS.has(t)) return 'generic';
  if (/^https?:\/\//.test(t)) return 'url';
  return 'descriptive';
}

const TYPE_STYLE = {
  descriptive: { bg: 'rgba(34,197,94,.08)', color: '#4ade80', label: 'descriptive' },
  generic:     { bg: 'rgba(245,158,11,.1)', color: '#f59e0b', label: 'generic' },
  url:         { bg: 'rgba(239,68,68,.08)', color: '#f87171', label: 'url' },
  empty:       { bg: 'rgba(255,255,255,.05)', color: 'var(--text-muted)', label: 'empty' },
};

// ─── sub-components ────────────────────────────────────────────────────────

function StatCard({ label, value, sub, valueColor }) {
  return (
    <div className="glass-panel" style={{ padding: '14px 18px' }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1, color: valueColor || 'white' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function MatrixCell({ cell, targetLabel }) {
  const [hovered, setHovered] = useState(false);

  if (!cell || cell.status === 'self') {
    return (
      <td style={{ textAlign: 'center', padding: '5px 6px' }}>
        <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.15)' }}>—</span>
      </td>
    );
  }

  const isLink = cell.status === 'link';
  const anchors = cell.anchors || [];

  return (
    <td style={{ textAlign: 'center', padding: '5px 6px', position: 'relative' }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, borderRadius: 6,
          background: isLink ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.06)',
          border: isLink ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(239,68,68,0.1)',
          cursor: isLink ? 'default' : 'default',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: isLink ? '#4ade80' : 'rgba(239,68,68,0.35)' }}>
          {isLink ? '✓' : '×'}
        </span>
      </div>
      {isLink && hovered && anchors.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
          zIndex: 30, background: '#1c1c26', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, padding: '10px 12px', minWidth: 190, maxWidth: 260,
          boxShadow: '0 8px 28px rgba(0,0,0,0.6)', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 7 }}>
            → {targetLabel}
          </div>
          {anchors.slice(0, 6).map((a, i) => {
            const t = anchorType(a);
            const s = TYPE_STYLE[t];
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '3px 0', borderBottom: i < anchors.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <span style={{ fontSize: '0.78rem', color: '#d8d8e6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{a}"</span>
                <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: s.bg, color: s.color, flexShrink: 0 }}>{s.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </td>
  );
}

// ─── main component ─────────────────────────────────────────────────────────

export default function InternalLinking() {
  const [mode, setMode]           = useState('live');   // 'live' | 'crawl'
  const [urlsText, setUrlsText]   = useState('');
  const [authUser, setAuthUser]   = useState('');
  const [authPass, setAuthPass]   = useState('');
  const [showAuth, setShowAuth]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState('');
  const [showAI, setShowAI]       = useState(false);
  const [openAnchors, setOpenAnchors] = useState({});

  const handleAnalyze = async () => {
    const urls = urlsText.split('\n').map(u => u.trim()).filter(Boolean);
    if (!urls.length) return;
    setLoading(true);
    setResult(null);
    setError('');
    try {
      const res = await fetch('/api/internal-linking/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls, auth_user: authUser || null, auth_pass: authPass || null }),
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

  // ── derived data ──────────────────────────────────────────────────────────

  const derived = result ? (() => {
    const n = result.summary.length;

    // Compute inbound counts from matrix (works with both old string format and new object format)
    const inbound = {};
    result.matrix_cols.forEach(c => { inbound[c] = 0; });
    result.matrix.forEach(row => {
      result.matrix_cols.forEach(col => {
        const cell = row.values[col];
        const isLink = cell?.status === 'link' || cell === '✅ Link';
        if (isLink) inbound[col] = (inbound[col] || 0) + 1;
      });
    });

    const okPages   = result.summary.filter(p => p.status === 'OK');
    const orphans   = okPages.filter(p => (p.inbound_count ?? inbound[p.url] ?? 0) === 0);
    const totalLinks = result.summary.reduce((s, p) => s + (p.inter_links || 0), 0);
    const maxLinks   = n > 1 ? n * (n - 1) : 1;
    const density    = Math.round((totalLinks / maxLinks) * 100);

    // Missing link opportunities: every "none" cell in the matrix
    const opps = [];
    result.matrix.forEach(row => {
      result.matrix_cols.forEach(col => {
        const cell = row.values[col];
        const status = cell?.status ?? (cell === '❌ No' ? 'none' : cell === '✅ Link' ? 'link' : cell === 'Self' ? 'self' : 'none');
        if (status !== 'none') return;
        const src = result.summary.find(s => s.url === row.source);
        const tgt = result.summary.find(s => s.url === col);
        if (!src || !tgt) return;
        opps.push({ from: row.source, to: col, score: (src.word_count || 0) + (tgt.word_count || 0) });
      });
    });
    opps.sort((a, b) => b.score - a.score);

    return { inbound, orphans, totalLinks, density, opps };
  })() : null;

  // ── render ────────────────────────────────────────────────────────────────

  const TABS = [
    { key: 'live',  label: 'Live URL Scan',       icon: <Globe size={15} /> },
    { key: 'crawl', label: 'Screaming Frog Crawl', icon: <FileSpreadsheet size={15} /> },
  ];

  return (
    <div className="flex-col gap-6">

      {/* ── Mode toggle ── */}
      <div style={{ display: 'flex', gap: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 5, width: 'fit-content' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setMode(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 7,
              border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
              background: mode === t.key ? 'var(--primary)' : 'transparent',
              color: mode === t.key ? 'white' : 'var(--text-muted)',
              transition: 'background .15s, color .15s',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {mode === 'crawl' ? <InternalLinkingCrawl /> : (
      <>
      {/* ── Input panel ── */}
      <div className="glass-panel">
        <h2 className="flex items-center gap-2 mb-4">
          <LayoutDashboard size={22} color="var(--primary)" /> Internal Linking Analysis
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 20 }}>
          Analyze how your pages link to each other, detect orphan pages, and surface missing link opportunities.
        </p>

        <label className="metric-label mb-2 block">Target URLs (one per line)</label>
        <textarea
          className="glass-input mb-4"
          rows={5}
          placeholder={"https://example.com/page1\nhttps://example.com/page2\nhttps://example.com/page3"}
          value={urlsText}
          onChange={e => setUrlsText(e.target.value)}
          style={{ resize: 'vertical' }}
        />

        <div className="mb-4">
          <button
            onClick={() => setShowAuth(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.83rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 10 }}
          >
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

        <button className="btn-primary w-full" onClick={handleAnalyze} disabled={loading || !urlsText.trim()}>
          {loading
            ? <><div className="loader" /> Scraping &amp; analyzing…</>
            : '🔍 Analyze Internal Links'}
        </button>
        {error && <p style={{ marginTop: 14, color: '#f87171', fontSize: '0.85rem' }}>{error}</p>}
      </div>

      {result && derived && (
        <>
          {/* ── Stats row ── */}
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="Pages analyzed" value={result.summary.length} />
            <StatCard
              label="Total inter-links"
              value={derived.totalLinks}
              sub="within this set"
              valueColor="var(--primary)"
            />
            <StatCard
              label="Orphan pages"
              value={derived.orphans.length}
              sub="0 inbound from set"
              valueColor={derived.orphans.length > 0 ? '#f87171' : '#4ade80'}
            />
            <StatCard
              label="Link density"
              value={`${derived.density}%`}
              sub="of possible links exist"
              valueColor={derived.density < 25 ? '#f87171' : derived.density < 55 ? '#f59e0b' : '#4ade80'}
            />
          </div>

          {/* ── Pages summary table ── */}
          <div className="glass-panel">
            <h3 style={{ fontSize: '1rem', marginBottom: 16 }}>Pages Summary</h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Page</th>
                    <th>Title</th>
                    <th style={{ textAlign: 'center' }}>Words</th>
                    <th style={{ textAlign: 'center' }}>Outbound</th>
                    <th style={{ textAlign: 'center' }}>Inbound</th>
                    <th style={{ minWidth: 120 }}>Link health</th>
                  </tr>
                </thead>
                <tbody>
                  {result.summary.map((row, i) => {
                    const inboundVal = row.inbound_count ?? derived.inbound[row.url] ?? 0;
                    const isOrphan  = row.status === 'OK' && inboundVal === 0;
                    const n         = result.summary.length;
                    const maxPer    = Math.max(n - 1, 1);
                    const health    = row.status !== 'OK' ? null
                      : Math.min(Math.round(((row.inter_links + inboundVal) / (2 * maxPer)) * 100), 100);
                    const hColor    = health === null ? null : health < 30 ? '#ef4444' : health < 65 ? '#f59e0b' : '#22c55e';

                    return (
                      <tr key={i}>
                        <td style={{ maxWidth: 180 }}>
                          <a
                            href={row.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--primary)', textDecoration: 'none', fontSize: '0.8rem' }}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortLabel(row.url)}</span>
                            <ExternalLink size={10} style={{ flexShrink: 0, opacity: 0.6 }} />
                          </a>
                        </td>
                        <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {row.title || '—'}
                        </td>
                        <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontSize: '0.85rem' }}>
                          {row.word_count > 0 ? row.word_count.toLocaleString() : '—'}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                          {row.inter_links}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {isOrphan ? (
                            <span style={{
                              fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                              background: 'rgba(239,68,68,0.1)', color: '#f87171',
                            }}>Orphan</span>
                          ) : (
                            <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{inboundVal}</span>
                          )}
                        </td>
                        <td>
                          {health !== null && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.07)' }}>
                                <div style={{ width: `${health}%`, height: '100%', background: hColor, borderRadius: 2, transition: 'width 0.4s ease' }} />
                              </div>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', width: 28, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                {health}%
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Visual matrix ── */}
          <div className="glass-panel">
            <h3 style={{ fontSize: '1rem', marginBottom: 6 }}>Inter-linking Matrix</h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 16 }}>
              Row → source page &nbsp;·&nbsp; Column → target page &nbsp;·&nbsp;
              <span style={{ color: '#4ade80' }}>✓</span> link exists (hover for anchors) &nbsp;·&nbsp;
              <span style={{ color: 'rgba(239,68,68,0.5)' }}>×</span> missing
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: '3px 3px' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '4px 10px', fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'right', fontWeight: 500, whiteSpace: 'nowrap', minWidth: 100 }}>
                      From ↓ &nbsp;/&nbsp; To →
                    </th>
                    {result.matrix_cols.map(col => (
                      <th
                        key={col}
                        style={{ padding: '4px 6px', fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={col}
                      >
                        {shortLabel(col)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.matrix.map((row, i) => (
                    <tr key={i}>
                      <td style={{ padding: '4px 10px', fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 500 }} title={row.source}>
                        {shortLabel(row.source)}
                      </td>
                      {result.matrix_cols.map(col => (
                        <MatrixCell
                          key={col}
                          cell={
                            row.values[col]?.status
                              ? row.values[col]
                              : {
                                  status: row.values[col] === 'Self' ? 'self' : row.values[col] === '✅ Link' ? 'link' : 'none',
                                  anchors: [],
                                }
                          }
                          targetLabel={shortLabel(col)}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Anchor text quality ── */}
          {result.summary.some(p => p.outbound_anchors?.length > 0) && (
            <div className="glass-panel">
              <h3 style={{ fontSize: '1rem', marginBottom: 6 }}>Anchor Text Quality</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                Anchors used in inter-links within this set.
                <span style={{ marginLeft: 8, padding: '1px 6px', borderRadius: 3, background: TYPE_STYLE.generic.bg, color: TYPE_STYLE.generic.color, fontSize: '0.68rem', fontWeight: 700 }}>generic</span>
                <span style={{ marginLeft: 5 }}>anchors should be replaced with keyword-rich text.</span>
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.summary.filter(p => p.outbound_anchors?.length > 0).map((page, i) => {
                  const isOpen = !!openAnchors[page.url];
                  const genericCount = page.outbound_anchors.filter(a => anchorType(a.anchor) === 'generic').length;
                  return (
                    <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, overflow: 'hidden' }}>
                      <button
                        onClick={() => setOpenAnchors(prev => ({ ...prev, [page.url]: !prev[page.url] }))}
                        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', textAlign: 'left' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#d8d8e6' }}>{shortLabel(page.url)}</span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {page.outbound_anchors.length} link{page.outbound_anchors.length !== 1 ? 's' : ''}
                          </span>
                          {genericCount > 0 && (
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: TYPE_STYLE.generic.bg, color: TYPE_STYLE.generic.color }}>
                              {genericCount} generic
                            </span>
                          )}
                        </div>
                        {isOpen ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
                      </button>
                      {isOpen && (
                        <div style={{ padding: '0 14px 12px' }}>
                          {page.outbound_anchors.map((a, j) => {
                            const t  = anchorType(a.anchor);
                            const s  = TYPE_STYLE[t];
                            return (
                              <div
                                key={j}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', flexShrink: 0 }}>→</span>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }} title={a.to}>
                                    {shortLabel(a.to)}
                                  </span>
                                  <span style={{ fontSize: '0.82rem', color: t === 'generic' ? '#f59e0b' : '#d8d8e6' }}>"{a.anchor}"</span>
                                </div>
                                <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 7px', borderRadius: 3, background: s.bg, color: s.color, flexShrink: 0 }}>
                                  {s.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Opportunities ── */}
          {derived.opps.length > 0 && (
            <div className="glass-panel">
              <h3 style={{ fontSize: '1rem', marginBottom: 6 }}>Missing Link Opportunities</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                {derived.opps.length} missing inter-link{derived.opps.length !== 1 ? 's' : ''} detected. Sorted by combined word count of the two pages — higher = more impact.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {derived.opps.slice(0, 12).map((opp, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      background: 'rgba(239,68,68,0.03)', border: '1px solid rgba(239,68,68,0.1)',
                      borderRadius: 8, padding: '9px 14px',
                    }}
                  >
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'rgba(239,68,68,0.08)', color: '#f87171', flexShrink: 0 }}>
                      Add link
                    </span>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 500, color: '#d8d8e6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={opp.from}>
                        {shortLabel(opp.from)}
                      </span>
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>→</span>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={opp.to}>
                        {shortLabel(opp.to)}
                      </span>
                    </div>
                    {opp.score > 0 && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                        {(opp.score / 1000).toFixed(1)}K words
                      </span>
                    )}
                  </div>
                ))}
                {derived.opps.length > 12 && (
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', paddingTop: 4 }}>
                    +{derived.opps.length - 12} more opportunities
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── AI analysis (collapsible) ── */}
          <div className="glass-panel">
            <button
              onClick={() => setShowAI(v => !v)}
              style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', textAlign: 'left' }}
            >
              <h3 style={{ fontSize: '1rem', margin: 0 }}>AI Linking Strategy Analysis</h3>
              {showAI ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
            </button>
            {!showAI && (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 8 }}>Expand to see AI-generated recommendations.</p>
            )}
            {showAI && (
              <div className="markdown-content" style={{ marginTop: 16 }}>
                <ReactMarkdown>{result.analysis}</ReactMarkdown>
              </div>
            )}
          </div>
        </>
      )}
      </>
      )}
    </div>
  );
}
