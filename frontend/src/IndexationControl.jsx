import { useState, useEffect, useMemo } from 'react';
import { Globe, CheckCircle, XCircle, AlertCircle, ArrowUpDown, ExternalLink, Filter } from 'lucide-react';

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
  active:  { bg: 'rgba(34,197,94,.1)',  color: '#4ade80', label: 'Clicks'     },
  visible: { bg: 'rgba(245,158,11,.1)', color: '#f59e0b', label: 'Visible'    },
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
    <th
      onClick={() => onSort(col)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        <ArrowUpDown size={11} color={active ? 'var(--primary)' : 'rgba(255,255,255,0.25)'} />
      </span>
    </th>
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
  const [activeTab, setActiveTab]     = useState('urls');   // 'urls' | 'pages' | 'sitemaps'

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
        // Pre-select the most recent settled date (≥3 days ago)
        const now = Date.now();
        const settled = d.filter(row => (now - new Date(row.date).getTime()) / 86400000 >= 3);
        if (settled.length > 0) setSelectedDate(settled[0].date);
      })
      .catch(() => {})
      .finally(() => setCatalogLoading(false));
  }, []);

  // ── analysis ─────────────────────────────────────────────────────────────

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
        const va = parseFloat(a[sortBy] ?? a[sortBy]) || 0;
        const vb = parseFloat(b[sortBy] ?? b[sortBy]) || 0;
        return sortDir === 'desc' ? vb - va : va - vb;
      });
  }, [result, filter, sortBy, sortDir]);

  // ── filtered sites for selector ───────────────────────────────────────────

  const filteredSites = useMemo(() =>
    sites.filter(s =>
      !siteSearch || (s.site || '').toLowerCase().includes(siteSearch.toLowerCase())
    ).slice(0, 40),
    [sites, siteSearch]
  );

  // ── render ────────────────────────────────────────────────────────────────

  const stats = result?.stats;

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
                <option key={d.date} value={d.date}>
                  {d.date} ({(d.row_count || 0).toLocaleString()} rows)
                </option>
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
          className="btn-primary w-full"
          onClick={handleCheck}
          disabled={loading || !selectedSite}
        >
          {loading
            ? <><div className="loader" /> Fetching GSC data…</>
            : '🔍 Check Indexation'}
        </button>

        {error && (
          <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', fontSize: '0.83rem' }}>
            {error}
          </div>
        )}
      </div>

      {/* ── Results ── */}
      {result && stats && (
        <>
          {/* ── Stats ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Report date:</span>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#d8d8e6' }}>{stats.report_date || '—'}</span>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <StatCard
              label="Pages in GSC"
              value={stats.total_pages.toLocaleString()}
              sub="indexed + impressions"
              valueColor="var(--primary)"
            />
            <StatCard
              label="Getting clicks"
              value={stats.with_clicks.toLocaleString()}
              sub={`${stats.total_pages > 0 ? Math.round((stats.with_clicks / stats.total_pages) * 100) : 0}% of indexed pages`}
              valueColor="#4ade80"
            />
            <StatCard
              label="0-click pages"
              value={stats.no_clicks.toLocaleString()}
              sub="impressions only — no CTR"
              valueColor={stats.no_clicks > stats.with_clicks ? '#f59e0b' : '#d8d8e6'}
            />
            <StatCard
              label="Sitemaps"
              value={stats.sitemap_count}
              sub="submitted to GSC"
            />
          </div>

          {/* ── Note ── */}
          <div style={{ padding: '10px 16px', borderRadius: 8, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', fontSize: '0.78rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>
            <strong style={{ color: '#60a5fa' }}>How to read this:</strong> Pages shown here appeared at least once in Google Search on this date — they are confirmed indexed.
            A URL <em>not</em> appearing here may still be indexed but received 0 impressions on this day. Use Google's URL Inspection tool for a definitive per-URL verdict.
          </div>

          {/* ── Tabs ── */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {result.url_results.length > 0 && (
              <button
                onClick={() => setActiveTab('urls')}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                  ...(activeTab === 'urls'
                    ? { background: 'var(--primary)', color: 'white', border: '1px solid var(--primary)' }
                    : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)' }),
                }}
              >
                URL Check ({result.url_results.length})
              </button>
            )}
            <button
              onClick={() => setActiveTab('pages')}
              style={{
                padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                ...(activeTab === 'pages'
                  ? { background: 'var(--primary)', color: 'white', border: '1px solid var(--primary)' }
                  : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)' }),
              }}
            >
              All indexed pages ({stats.total_pages.toLocaleString()})
            </button>
            {result.sitemaps.length > 0 && (
              <button
                onClick={() => setActiveTab('sitemaps')}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                  ...(activeTab === 'sitemaps'
                    ? { background: 'var(--primary)', color: 'white', border: '1px solid var(--primary)' }
                    : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)' }),
                }}
              >
                Sitemaps ({result.sitemaps.length})
              </button>
            )}
          </div>

          {/* ── URL Check tab ── */}
          {activeTab === 'urls' && result.url_results.length > 0 && (
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
                          <a
                            href={row.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--primary)', textDecoration: 'none', fontSize: '0.8rem' }}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.url}>{shortPath(row.url)}</span>
                            <ExternalLink size={10} style={{ flexShrink: 0, opacity: 0.6 }} />
                          </a>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {row.in_gsc ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', fontWeight: 700, color: '#4ade80' }}>
                              <CheckCircle size={13} /> Indexed
                            </span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', fontWeight: 700, color: '#f59e0b' }}>
                              <AlertCircle size={13} /> Not in GSC
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontWeight: row.clicks > 0 ? 700 : 400 }}>
                          {row.clicks ?? '—'}
                        </td>
                        <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                          {row.impressions != null ? row.impressions.toLocaleString() : '—'}
                        </td>
                        <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                          {fmtCtr(row.ctr)}
                        </td>
                        <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                          {fmtPos(row.position)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Quick summary */}
              {(() => {
                const inGsc = result.url_results.filter(r => r.in_gsc).length;
                const notInGsc = result.url_results.length - inGsc;
                return (
                  <div style={{ marginTop: 14, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: 20, background: 'rgba(34,197,94,0.1)', color: '#4ade80', fontWeight: 700 }}>
                      {inGsc} indexed
                    </span>
                    {notInGsc > 0 && (
                      <span style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: 20, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontWeight: 700 }}>
                        {notInGsc} not in GSC
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── All pages tab ── */}
          {activeTab === 'pages' && (
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
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {filteredPages.length.toLocaleString()} shown
                    </span>
                  )}
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Page URL</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                      <SortHeader col="clicks"      label="Clicks"      current={sortBy} dir={sortDir} onSort={handleSort} />
                      <SortHeader col="impressions" label="Impressions"  current={sortBy} dir={sortDir} onSort={handleSort} />
                      <SortHeader col="ctr"         label="CTR"         current={sortBy} dir={sortDir} onSort={handleSort} />
                      <SortHeader col="position"    label="Avg. Pos"    current={sortBy} dir={sortDir} onSort={handleSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPages.slice(0, 300).map((p, i) => {
                      const st = pageStatus(p);
                      const ss = STATUS_STYLE[st];
                      return (
                        <tr key={i}>
                          <td style={{ maxWidth: 340 }}>
                            <a
                              href={p.page}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--primary)', textDecoration: 'none', fontSize: '0.8rem' }}
                            >
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.page}>{shortPath(p.page)}</span>
                              <ExternalLink size={9} style={{ flexShrink: 0, opacity: 0.5 }} />
                            </a>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: ss.bg, color: ss.color }}>
                              {ss.label}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontWeight: (p.clicks || 0) > 0 ? 700 : 400 }}>
                            {(p.clicks || 0).toLocaleString()}
                          </td>
                          <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                            {(p.impressions || 0).toLocaleString()}
                          </td>
                          <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                            {fmtCtr(p.ctr)}
                          </td>
                          <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                            {fmtPos(p.position)}
                          </td>
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
          {activeTab === 'sitemaps' && result.sitemaps.length > 0 && (
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
                    </tr>
                  </thead>
                  <tbody>
                    {result.sitemaps.map((sm, i) => {
                      const hasErr = (sm.errors || 0) > 0;
                      return (
                        <tr key={i}>
                          <td style={{ maxWidth: 320 }}>
                            <a
                              href={sm.path}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--primary)', textDecoration: 'none', fontSize: '0.78rem' }}
                            >
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sm.path}>{sm.path}</span>
                              <ExternalLink size={9} style={{ flexShrink: 0, opacity: 0.5 }} />
                            </a>
                          </td>
                          <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{sm.submitted ?? '—'}</td>
                          <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: sm.indexed != null ? '#4ade80' : 'var(--text-muted)' }}>
                            {sm.indexed ?? '—'}
                          </td>
                          <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: hasErr ? '#f87171' : 'var(--text-muted)' }}>
                            {sm.errors ?? '—'}
                          </td>
                          <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: (sm.warnings || 0) > 0 ? '#f59e0b' : 'var(--text-muted)' }}>
                            {sm.warnings ?? '—'}
                          </td>
                          <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {sm.last_downloaded ? new Date(sm.last_downloaded).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
