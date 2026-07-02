import { useState, useEffect, useMemo } from 'react';
import { Globe, CheckCircle, AlertCircle, ArrowUpDown, ExternalLink, Filter, Map } from 'lucide-react';

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtCtr(raw) {
  if (raw == null) return '—';
  const n = parseFloat(raw);
  return isNaN(n) ? '—' : (n * 100).toFixed(1) + '%';
}

function fmtPos(raw) {
  if (raw == null) return '—';
  const n = parseFloat(raw);
  return isNaN(n) ? '—' : n.toFixed(1);
}

function shortPath(url) {
  try {
    const { pathname, hostname } = new URL(url);
    const path = pathname.replace(/\/$/, '') || '/';
    return path === '/' ? hostname : path;
  } catch {
    return url.length > 60 ? url.slice(0, 57) + '…' : url;
  }
}

function pageStatus(page) {
  if ((page.clicks || 0) > 0) return 'active';
  if ((page.impressions || 0) > 0) return 'visible';
  return 'indexed';
}

const STATUS_STYLE = {
  active:  { bg: 'rgba(34,197,94,.1)',    color: '#4ade80', label: 'Clicks'   },
  visible: { bg: 'rgba(245,158,11,.1)',   color: '#f59e0b', label: 'Visible'  },
  indexed: { bg: 'rgba(255,255,255,.06)', color: '#94a3b8', label: 'Indexed'  },
};

// ── sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, valueColor }) {
  return (
    <div className="glass-panel" style={{ padding: '14px 18px' }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1, color: valueColor || 'white' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function SortHeader({ col, label, current, dir, onSort }) {
  const active = current === col;
  return (
    <th onClick={() => onSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        <ArrowUpDown size={11} color={active ? 'var(--primary)' : 'rgba(255,255,255,0.25)'} />
      </span>
    </th>
  );
}

function TabBtn({ id, label, active, onClick }) {
  return (
    <button
      onClick={() => onClick(id)}
      style={{
        padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
        ...(active
          ? { background: 'var(--primary)', color: 'white', border: '1px solid var(--primary)' }
          : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)' }),
      }}
    >
      {label}
    </button>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function IndexationControl() {
  const [sites, setSites]             = useState([]);
  const [dates, setDates]             = useState([]);
  const [siteSearch, setSiteSearch]   = useState('');
  const [selectedSite, setSelectedSite] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [searchType, setSearchType]   = useState('web');
  const [urlsText, setUrlsText]       = useState('');
  const [loading, setLoading]         = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [result, setResult]           = useState(null);
  const [error, setError]             = useState('');
  const [filter, setFilter]           = useState('');
  const [sortBy, setSortBy]           = useState('impressions');
  const [sortDir, setSortDir]         = useState('desc');
  const [activeTab, setActiveTab]     = useState('urls');

  // sitemap check state
  const [sitemapUrl, setSitemapUrl]         = useState('');
  const [sitemapResult, setSitemapResult]   = useState(null);
  const [sitemapLoading, setSitemapLoading] = useState(false);
  const [sitemapFilter, setSitemapFilter]   = useState('');
  const [sitemapStatus, setSitemapStatus]   = useState('all'); // 'all' | 'indexed' | 'missing'
  const [smSortBy, setSmSortBy]             = useState('status'); // 'status' | 'impressions' | 'clicks' | 'ctr' | 'position'
  const [smSortDir, setSmSortDir]           = useState('asc');

  // ── load catalog ─────────────────────────────────────────────────────────

  useEffect(() => {
    setCatalogLoading(true);
    Promise.all([
      fetch('/api/indexation/gsc-sites').then(r => r.json()),
      fetch('/api/indexation/gsc-dates').then(r => r.json()),
    ])
      .then(([sitesData, datesData]) => {
        const s = sitesData.sites || [];
        const d = datesData.dates || [];
        setSites(s);
        setDates(d);
        const now = Date.now();
        const settled = d.filter(row => (now - new Date(row.date).getTime()) / 86400000 >= 3);
        if (settled.length > 0) setSelectedDate(settled[0].date);
      })
      .catch(() => {})
      .finally(() => setCatalogLoading(false));
  }, []);

  // ── regular check ─────────────────────────────────────────────────────────

  const handleCheck = async () => {
    if (!selectedSite) return;
    setLoading(true);
    setResult(null);
    setError('');
    const urls = urlsText.split('\n').map(u => u.trim()).filter(Boolean);
    try {
      const res = await fetch('/api/indexation/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_slug: selectedSite,
          date: selectedDate || null,
          search_type: searchType,
          urls: urls.length > 0 ? urls : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.detail?.error || data?.detail || 'Unknown error';
        setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      } else {
        setResult(data);
        setActiveTab(urls.length > 0 ? 'urls' : 'pages');
      }
    } catch (e) {
      setError('Network error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── sitemap check ─────────────────────────────────────────────────────────

  const handleSitemapCheck = async (url) => {
    const target = (url || sitemapUrl).trim();
    if (!selectedSite || !target) return;
    setSitemapLoading(true);
    setSitemapResult(null);
    setError('');
    try {
      const res = await fetch('/api/indexation/sitemap-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_slug: selectedSite,
          date: selectedDate || null,
          search_type: searchType,
          sitemap_url: target,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.detail?.error || data?.detail || 'Unknown error';
        setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      } else {
        setSitemapResult(data);
        setActiveTab('sitemap');
      }
    } catch (e) {
      setError('Network error: ' + e.message);
    } finally {
      setSitemapLoading(false);
    }
  };

  // ── sort/filter pages ─────────────────────────────────────────────────────

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const filteredPages = useMemo(() => {
    if (!result) return [];
    return result.pages
      .filter(p => !filter || (p.page || '').toLowerCase().includes(filter.toLowerCase()))
      .sort((a, b) => {
        const va = parseFloat(a[sortBy] ?? 0) || 0;
        const vb = parseFloat(b[sortBy] ?? 0) || 0;
        return sortDir === 'desc' ? vb - va : va - vb;
      });
  }, [result, filter, sortBy, sortDir]);

  const filteredSites = useMemo(() =>
    sites.filter(s => !siteSearch || (s.site || '').toLowerCase().includes(siteSearch.toLowerCase())).slice(0, 40),
    [sites, siteSearch]
  );

  // ── sort/filter sitemap results ───────────────────────────────────────────

  const handleSmSort = (col) => {
    if (smSortBy === col) setSmSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSmSortBy(col); setSmSortDir(col === 'status' ? 'asc' : 'desc'); }
  };

  const filteredSitemapUrls = useMemo(() => {
    if (!sitemapResult) return [];
    let rows = sitemapResult.url_results;
    if (sitemapFilter) rows = rows.filter(r => r.url.toLowerCase().includes(sitemapFilter.toLowerCase()));
    if (sitemapStatus === 'indexed') rows = rows.filter(r => r.in_gsc);
    if (sitemapStatus === 'missing') rows = rows.filter(r => !r.in_gsc);
    return [...rows].sort((a, b) => {
      if (smSortBy === 'status') {
        // asc = not indexed first
        const diff = (a.in_gsc ? 1 : 0) - (b.in_gsc ? 1 : 0);
        return smSortDir === 'asc' ? diff : -diff;
      }
      const va = parseFloat(a[smSortBy] ?? 0) || 0;
      const vb = parseFloat(b[smSortBy] ?? 0) || 0;
      return smSortDir === 'desc' ? vb - va : va - vb;
    });
  }, [sitemapResult, sitemapFilter, sitemapStatus, smSortBy, smSortDir]);

  // ── render ────────────────────────────────────────────────────────────────

  const stats = result?.stats;
  const anyLoading = loading || sitemapLoading;

  return (
    <div className="flex-col gap-6">

      {/* ── Config panel ── */}
      <div className="glass-panel">
        <h2 className="flex items-center gap-2 mb-4">
          <Globe size={22} color="var(--primary)" /> Indexation Control
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 20 }}>
          Cross-reference your URLs against Google Search Console appearance data. Pages found in GSC are indexed and appearing in search results.
        </p>

        {/* Site + date row */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="metric-label mb-2 block">GSC Site</label>
            <input
              className="glass-input mb-2"
              placeholder="Search sites…"
              value={siteSearch}
              onChange={e => setSiteSearch(e.target.value)}
              style={{ fontSize: '0.82rem', padding: '8px 12px' }}
            />
            <select
              className="glass-input"
              value={selectedSite}
              onChange={e => setSelectedSite(e.target.value)}
              disabled={catalogLoading}
              style={{ fontSize: '0.82rem' }}
            >
              <option value="">{catalogLoading ? 'Loading sites…' : '— Select a site —'}</option>
              {filteredSites.map(s => (
                <option key={s.site_slug} value={s.site_slug}>{s.site}</option>
              ))}
              {sites.length > 40 && <option disabled>… {sites.length - 40} more (refine search)</option>}
            </select>
          </div>
          <div>
            <label className="metric-label mb-2 block">Date (settled ≥ 3 days ago)</label>
            <select
              className="glass-input mb-2"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              disabled={catalogLoading}
              style={{ fontSize: '0.82rem' }}
            >
              <option value="">{catalogLoading ? 'Loading dates…' : '— Latest available —'}</option>
              {dates.map(d => (
                <option key={d.date} value={d.date}>{d.date} ({(d.row_count || 0).toLocaleString()} rows)</option>
              ))}
            </select>
            <label className="metric-label mb-1 block">Search type</label>
            <select
              className="glass-input"
              value={searchType}
              onChange={e => setSearchType(e.target.value)}
              style={{ fontSize: '0.82rem' }}
            >
              {['web', 'image', 'video', 'news', 'discover', 'googleNews'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        {/* URL checker input */}
        <label className="metric-label mb-2 block">URLs to check (optional — one per line)</label>
        <textarea
          className="glass-input mb-4"
          rows={4}
          placeholder={"https://example.com/page1\nhttps://example.com/page2\nLeave empty to fetch all indexed pages for the site"}
          value={urlsText}
          onChange={e => setUrlsText(e.target.value)}
          style={{ resize: 'vertical', fontSize: '0.82rem' }}
        />

        <button
          className="btn-primary w-full mb-4"
          onClick={handleCheck}
          disabled={anyLoading || !selectedSite}
        >
          {loading
            ? <><div className="loader" /> Fetching GSC data…</>
            : '🔍 Check Indexation'}
        </button>

        {/* Sitemap check section */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 }}>
          <label className="metric-label mb-2 block" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Map size={13} color="var(--primary)" /> Check entire sitemap
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="glass-input"
              placeholder="https://example.com/sitemap.xml"
              value={sitemapUrl}
              onChange={e => setSitemapUrl(e.target.value)}
              style={{ fontSize: '0.82rem', flex: 1 }}
            />
            <button
              className="btn-primary"
              onClick={() => handleSitemapCheck()}
              disabled={anyLoading || !selectedSite || !sitemapUrl.trim()}
              style={{ whiteSpace: 'nowrap', padding: '10px 18px', fontSize: '0.85rem' }}
            >
              {sitemapLoading ? <><div className="loader" /> Checking…</> : '📄 Check Sitemap'}
            </button>
          </div>
          {result?.sitemaps?.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>GSC sitemaps:</span>
              {result.sitemaps.slice(0, 6).map((sm, i) => (
                <button
                  key={i}
                  onClick={() => { setSitemapUrl(sm.path); handleSitemapCheck(sm.path); }}
                  disabled={anyLoading || !selectedSite}
                  style={{
                    fontSize: '0.7rem', padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                    background: 'rgba(226,0,113,0.08)', border: '1px solid rgba(226,0,113,0.25)',
                    color: 'var(--primary)', whiteSpace: 'nowrap', maxWidth: 240,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                  title={sm.path}
                >
                  {shortPath(sm.path)}
                </button>
              ))}
              {result.sitemaps.length > 6 && (
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>+{result.sitemaps.length - 6} more</span>
              )}
            </div>
          )}
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', fontSize: '0.83rem' }}>
            {error}
          </div>
        )}
      </div>

      {/* ── Results ── */}
      {(result && stats) || sitemapResult ? (
        <>
          {/* Stats (only when regular check ran) */}
          {result && stats && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Report date:</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#d8d8e6' }}>{stats.report_date || '—'}</span>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <StatCard label="Pages in GSC" value={stats.total_pages.toLocaleString()} sub="indexed + impressions" valueColor="var(--primary)" />
                <StatCard label="Getting clicks" value={stats.with_clicks.toLocaleString()} sub={`${stats.total_pages > 0 ? Math.round((stats.with_clicks / stats.total_pages) * 100) : 0}% of indexed pages`} valueColor="#4ade80" />
                <StatCard label="0-click pages" value={stats.no_clicks.toLocaleString()} sub="impressions only — no CTR" valueColor={stats.no_clicks > stats.with_clicks ? '#f59e0b' : '#d8d8e6'} />
                <StatCard label="Sitemaps" value={stats.sitemap_count} sub="submitted to GSC" />
              </div>
            </>
          )}

          {/* Sitemap coverage summary stats (when sitemap check ran) */}
          {sitemapResult && (
            <div className="glass-panel" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 4 }}>Sitemap Coverage</div>
                  <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', wordBreak: 'break-all' }}>{sitemapResult.sitemap_url}</div>
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1, color: '#4ade80' }}>{sitemapResult.indexed_count.toLocaleString()}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>indexed</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1, color: sitemapResult.not_indexed_count > 0 ? '#f59e0b' : '#4ade80' }}>{sitemapResult.not_indexed_count.toLocaleString()}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>not in GSC</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1, color: 'white' }}>{sitemapResult.total_urls.toLocaleString()}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>total in sitemap</div>
                  </div>
                </div>
              </div>
              {/* Coverage bar */}
              <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${sitemapResult.coverage_pct}%`,
                  background: sitemapResult.coverage_pct >= 80 ? '#4ade80' : sitemapResult.coverage_pct >= 50 ? '#f59e0b' : '#f87171',
                  borderRadius: 6,
                  transition: 'width 0.6s ease',
                }} />
              </div>
              <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {sitemapResult.child_sitemaps.length > 0 && `Sitemap index → ${sitemapResult.child_sitemaps.length} child sitemaps · `}
                  Date: {sitemapResult.report_date || '—'}
                </span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: sitemapResult.coverage_pct >= 80 ? '#4ade80' : sitemapResult.coverage_pct >= 50 ? '#f59e0b' : '#f87171' }}>
                  {sitemapResult.coverage_pct}% indexed
                </span>
              </div>
            </div>
          )}

          {/* Note */}
          <div style={{ padding: '10px 16px', borderRadius: 8, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', fontSize: '0.78rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>
            <strong style={{ color: '#60a5fa' }}>How to read this:</strong> Pages shown here appeared at least once in Google Search on this date — they are confirmed indexed.
            A URL <em>not</em> appearing here may still be indexed but received 0 impressions on this day. Use Google's URL Inspection tool for a definitive per-URL verdict.
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {result?.url_results?.length > 0 && (
              <TabBtn id="urls" label={`URL Check (${result.url_results.length})`} active={activeTab === 'urls'} onClick={setActiveTab} />
            )}
            {result && (
              <TabBtn id="pages" label={`All indexed pages (${stats.total_pages.toLocaleString()})`} active={activeTab === 'pages'} onClick={setActiveTab} />
            )}
            {result?.sitemaps?.length > 0 && (
              <TabBtn id="sitemaps" label={`Sitemaps (${result.sitemaps.length})`} active={activeTab === 'sitemaps'} onClick={setActiveTab} />
            )}
            {sitemapResult && (
              <TabBtn id="sitemap" label={`Sitemap Coverage (${sitemapResult.total_urls.toLocaleString()})`} active={activeTab === 'sitemap'} onClick={setActiveTab} />
            )}
          </div>

          {/* ── URL Check tab ── */}
          {activeTab === 'urls' && result?.url_results?.length > 0 && (
            <div className="glass-panel">
              <h3 style={{ fontSize: '1rem', marginBottom: 16 }}>URL Check Results</h3>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>URL</th>
                      <th style={{ textAlign: 'center' }}>In GSC</th>
                      <th style={{ textAlign: 'center' }}>Clicks</th>
                      <th style={{ textAlign: 'center' }}>Impressions</th>
                      <th style={{ textAlign: 'center' }}>CTR</th>
                      <th style={{ textAlign: 'center' }}>Avg. Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.url_results.map((row, i) => (
                      <tr key={i}>
                        <td style={{ maxWidth: 300 }}>
                          <a href={row.url} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--primary)', textDecoration: 'none', fontSize: '0.8rem' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.url}>{shortPath(row.url)}</span>
                            <ExternalLink size={10} style={{ flexShrink: 0, opacity: 0.6 }} />
                          </a>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {row.in_gsc
                            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', fontWeight: 700, color: '#4ade80' }}><CheckCircle size={13} /> Indexed</span>
                            : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', fontWeight: 700, color: '#f59e0b' }}><AlertCircle size={13} /> Not in GSC</span>}
                        </td>
                        <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontWeight: row.clicks > 0 ? 700 : 400 }}>{row.clicks ?? '—'}</td>
                        <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{row.impressions != null ? row.impressions.toLocaleString() : '—'}</td>
                        <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{fmtCtr(row.ctr)}</td>
                        <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{fmtPos(row.position)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(() => {
                const inGsc = result.url_results.filter(r => r.in_gsc).length;
                const notInGsc = result.url_results.length - inGsc;
                return (
                  <div style={{ marginTop: 14, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: 20, background: 'rgba(34,197,94,0.1)', color: '#4ade80', fontWeight: 700 }}>{inGsc} indexed</span>
                    {notInGsc > 0 && <span style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: 20, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontWeight: 700 }}>{notInGsc} not in GSC</span>}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── All pages tab ── */}
          {activeTab === 'pages' && result && (
            <div className="glass-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: '1rem', margin: 0 }}>All Indexed Pages</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Filter size={14} color="var(--text-muted)" />
                  <input
                    className="glass-input"
                    placeholder="Filter by URL…"
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    style={{ fontSize: '0.8rem', padding: '6px 10px', width: 220 }}
                  />
                  {filteredPages.length !== result.pages.length && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{filteredPages.length.toLocaleString()} shown</span>
                  )}
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Page URL</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                      <SortHeader col="clicks"      label="Clicks"     current={sortBy} dir={sortDir} onSort={handleSort} />
                      <SortHeader col="impressions" label="Impressions" current={sortBy} dir={sortDir} onSort={handleSort} />
                      <SortHeader col="ctr"         label="CTR"        current={sortBy} dir={sortDir} onSort={handleSort} />
                      <SortHeader col="position"    label="Avg. Pos"   current={sortBy} dir={sortDir} onSort={handleSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPages.slice(0, 300).map((p, i) => {
                      const st = pageStatus(p);
                      const ss = STATUS_STYLE[st];
                      return (
                        <tr key={i}>
                          <td style={{ maxWidth: 340 }}>
                            <a href={p.page} target="_blank" rel="noopener noreferrer"
                              style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--primary)', textDecoration: 'none', fontSize: '0.8rem' }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.page}>{shortPath(p.page)}</span>
                              <ExternalLink size={9} style={{ flexShrink: 0, opacity: 0.5 }} />
                            </a>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: ss.bg, color: ss.color }}>{ss.label}</span>
                          </td>
                          <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontWeight: (p.clicks || 0) > 0 ? 700 : 400 }}>{(p.clicks || 0).toLocaleString()}</td>
                          <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{(p.impressions || 0).toLocaleString()}</td>
                          <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{fmtCtr(p.ctr)}</td>
                          <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{fmtPos(p.position)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredPages.length > 300 && (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 12 }}>
                  Showing top 300 of {filteredPages.length.toLocaleString()} — refine the filter to see more
                </p>
              )}
            </div>
          )}

          {/* ── Sitemaps tab ── */}
          {activeTab === 'sitemaps' && result?.sitemaps?.length > 0 && (
            <div className="glass-panel">
              <h3 style={{ fontSize: '1rem', marginBottom: 16 }}>Submitted Sitemaps</h3>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sitemap path</th>
                      <th style={{ textAlign: 'center' }}>Submitted</th>
                      <th style={{ textAlign: 'center' }}>Indexed</th>
                      <th style={{ textAlign: 'center' }}>Errors</th>
                      <th style={{ textAlign: 'center' }}>Warnings</th>
                      <th>Last downloaded</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.sitemaps.map((sm, i) => {
                      const hasErr = (sm.errors || 0) > 0;
                      return (
                        <tr key={i}>
                          <td style={{ maxWidth: 300 }}>
                            <a href={sm.path} target="_blank" rel="noopener noreferrer"
                              style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--primary)', textDecoration: 'none', fontSize: '0.78rem' }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sm.path}>{sm.path}</span>
                              <ExternalLink size={9} style={{ flexShrink: 0, opacity: 0.5 }} />
                            </a>
                          </td>
                          <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{sm.submitted ?? '—'}</td>
                          <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: sm.indexed != null ? '#4ade80' : 'var(--text-muted)' }}>{sm.indexed ?? '—'}</td>
                          <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: hasErr ? '#f87171' : 'var(--text-muted)' }}>{sm.errors ?? '—'}</td>
                          <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: (sm.warnings || 0) > 0 ? '#f59e0b' : 'var(--text-muted)' }}>{sm.warnings ?? '—'}</td>
                          <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{sm.last_downloaded ? new Date(sm.last_downloaded).toLocaleDateString() : '—'}</td>
                          <td>
                            <button
                              onClick={() => { setSitemapUrl(sm.path); handleSitemapCheck(sm.path); }}
                              disabled={anyLoading || !selectedSite}
                              style={{
                                fontSize: '0.72rem', padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
                                background: 'rgba(226,0,113,0.08)', border: '1px solid rgba(226,0,113,0.3)',
                                color: 'var(--primary)', whiteSpace: 'nowrap',
                              }}
                            >
                              {sitemapLoading ? '…' : 'Check coverage'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Sitemap Coverage tab ── */}
          {activeTab === 'sitemap' && sitemapResult && (
            <div className="glass-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: '1rem', margin: 0 }}>Sitemap Coverage — URL by URL</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {/* Status filter chips */}
                  {['all', 'indexed', 'missing'].map(s => (
                    <button
                      key={s}
                      onClick={() => setSitemapStatus(s)}
                      style={{
                        fontSize: '0.72rem', padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                        background: sitemapStatus === s ? (s === 'missing' ? 'rgba(245,158,11,0.2)' : 'rgba(34,197,94,0.15)') : 'rgba(255,255,255,0.05)',
                        border: sitemapStatus === s ? (s === 'missing' ? '1px solid #f59e0b' : '1px solid #4ade80') : '1px solid rgba(255,255,255,0.1)',
                        color: sitemapStatus === s ? (s === 'missing' ? '#f59e0b' : '#4ade80') : 'var(--text-muted)',
                        fontWeight: sitemapStatus === s ? 700 : 400,
                      }}
                    >
                      {s === 'all' ? `All (${sitemapResult.total_urls.toLocaleString()})` : s === 'indexed' ? `Indexed (${sitemapResult.indexed_count.toLocaleString()})` : `Not in GSC (${sitemapResult.not_indexed_count.toLocaleString()})`}
                    </button>
                  ))}
                  <Filter size={14} color="var(--text-muted)" />
                  <input
                    className="glass-input"
                    placeholder="Filter by URL…"
                    value={sitemapFilter}
                    onChange={e => setSitemapFilter(e.target.value)}
                    style={{ fontSize: '0.8rem', padding: '6px 10px', width: 200 }}
                  />
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>URL</th>
                      <SortHeader col="status"     label="GSC Status"   current={smSortBy} dir={smSortDir} onSort={handleSmSort} />
                      <SortHeader col="clicks"     label="Clicks"       current={smSortBy} dir={smSortDir} onSort={handleSmSort} />
                      <SortHeader col="impressions" label="Impressions"  current={smSortBy} dir={smSortDir} onSort={handleSmSort} />
                      <SortHeader col="ctr"        label="CTR"          current={smSortBy} dir={smSortDir} onSort={handleSmSort} />
                      <SortHeader col="position"   label="Avg. Pos"     current={smSortBy} dir={smSortDir} onSort={handleSmSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSitemapUrls.slice(0, 500).map((row, i) => (
                      <tr key={i}>
                        <td style={{ maxWidth: 340 }}>
                          <a href={row.url} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--primary)', textDecoration: 'none', fontSize: '0.8rem' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.url}>{shortPath(row.url)}</span>
                            <ExternalLink size={9} style={{ flexShrink: 0, opacity: 0.5 }} />
                          </a>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {row.in_gsc
                            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 700, color: '#4ade80' }}><CheckCircle size={12} /> Indexed</span>
                            : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b' }}><AlertCircle size={12} /> Not in GSC</span>}
                        </td>
                        <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: row.clicks > 0 ? '#4ade80' : 'var(--text-muted)', fontWeight: row.clicks > 0 ? 700 : 400 }}>{row.clicks != null ? row.clicks.toLocaleString() : '—'}</td>
                        <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{row.impressions != null ? row.impressions.toLocaleString() : '—'}</td>
                        <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{fmtCtr(row.ctr)}</td>
                        <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{fmtPos(row.position)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredSitemapUrls.length > 500 && (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 12 }}>
                  Showing 500 of {filteredSitemapUrls.length.toLocaleString()} — use the filter or status chips to narrow down
                </p>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
