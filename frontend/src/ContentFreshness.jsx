import { useState, useEffect } from 'react';
import { CalendarClock, RefreshCw, Download, ExternalLink, AlertTriangle, CheckCircle, HelpCircle } from 'lucide-react';

const token = () => localStorage.getItem('auth_token');

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function ageLabel(days) {
  if (days == null) return 'Unknown';
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

function StatCard({ label, value, color }) {
  return (
    <div className="glass-panel" style={{ padding: '14px 18px', flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: '1.5rem', lineHeight: 1, color: color || '#fff', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

export default function ContentFreshness() {
  const [sites, setSites] = useState([]);
  const [mode, setMode] = useState('site');            // 'site' | 'sitemap'
  const [siteSlug, setSiteSlug] = useState('');
  const [siteSearch, setSiteSearch] = useState('');
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [thresholdDays, setThresholdDays] = useState(4);
  const [limit, setLimit] = useState(80);
  const [showAuth, setShowAuth] = useState(false);
  const [authUser, setAuthUser] = useState('');
  const [authPass, setAuthPass] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [onlyStale, setOnlyStale] = useState(false);

  useEffect(() => {
    fetch('/api/indexation/gsc-sites', { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(d => setSites(d.sites || []))
      .catch(() => {});
  }, []);

  const filteredSites = sites.filter(s =>
    !siteSearch || (s.site || '').toLowerCase().includes(siteSearch.toLowerCase())
  );

  async function run() {
    setError(''); setResult(null); setLoading(true);
    try {
      const body = {
        threshold_days: Number(thresholdDays) || 4,
        limit: Number(limit) || 80,
      };
      if (mode === 'site') {
        if (!siteSlug) { setError('Pick a site first.'); setLoading(false); return; }
        body.site_slug = siteSlug;
      } else {
        if (!sitemapUrl.trim()) { setError('Paste a sitemap URL first.'); setLoading(false); return; }
        body.sitemap_url = sitemapUrl.trim();
      }
      if (showAuth && authUser) { body.auth_user = authUser; body.auth_pass = authPass; }

      const res = await fetch('/api/freshness/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Check failed');
      setResult(data);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    if (!result) return;
    const rows = [['URL', 'Last updated', 'Age (days)', 'Source', 'Status']];
    result.results.forEach(r => rows.push([
      r.url,
      r.last_modified || '',
      r.age_days == null ? '' : r.age_days,
      r.source || '',
      r.flagged ? 'Stale' : 'Fresh',
    ]));
    const csv = rows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `content-freshness-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const shown = result ? result.results.filter(r => !onlyStale || r.flagged) : [];

  return (
    <div className="flex-col gap-6">
      <div className="page-header">
        <h1 className="flex items-center gap-2" style={{ fontSize: '1.35rem' }}>
          <CalendarClock size={22} color="var(--primary)" aria-hidden="true" /> Content Freshness
        </h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
          Flags pages whose content hasn’t been updated recently, read from each page’s own last-updated signals —
          schema <code>dateModified</code>, meta modified-time tags, then sitemap <code>lastmod</code>.
        </p>
      </div>

      {/* Config */}
      <div className="glass-panel">
        <div className="flex gap-2 mb-4">
          <button type="button" onClick={() => setMode('site')}
            className={mode === 'site' ? 'btn-primary' : ''}
            aria-pressed={mode === 'site'}
            style={mode !== 'site' ? { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' } : {}}>
            GSC Site
          </button>
          <button type="button" onClick={() => setMode('sitemap')}
            className={mode === 'sitemap' ? 'btn-primary' : ''}
            aria-pressed={mode === 'sitemap'}
            style={mode !== 'sitemap' ? { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' } : {}}>
            Sitemap URL
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          {mode === 'site' ? (
            <div style={{ gridColumn: 'span 2' }}>
              <label className="metric-label mb-2 block" htmlFor="cf-site">Site</label>
              <input className="glass-input mb-2" id="cf-site-search" aria-label="Search sites"
                placeholder="Filter sites…" value={siteSearch} onChange={e => setSiteSearch(e.target.value)} />
              <select id="cf-site" aria-label="Site" className="glass-input glass-select"
                value={siteSlug} onChange={e => setSiteSlug(e.target.value)}>
                <option value="">Select a site…</option>
                {filteredSites.map(s => <option key={s.site_slug} value={s.site_slug}>{s.site}</option>)}
              </select>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 4 }}>
                Uses the site’s first sitemap. Switch to “Sitemap URL” to target a specific one.
              </div>
            </div>
          ) : (
            <div style={{ gridColumn: 'span 2' }}>
              <label className="metric-label mb-2 block" htmlFor="cf-sitemap">Sitemap URL</label>
              <input className="glass-input" id="cf-sitemap" type="url"
                placeholder="https://example.com/sitemap.xml"
                value={sitemapUrl} onChange={e => setSitemapUrl(e.target.value)} />
            </div>
          )}
          <div>
            <label className="metric-label mb-2 block" htmlFor="cf-threshold">Stale after (days)</label>
            <input className="glass-input" id="cf-threshold" type="number" min="0" inputMode="numeric"
              value={thresholdDays} onChange={e => setThresholdDays(e.target.value)} />
            <label className="metric-label mb-2 block mt-3" htmlFor="cf-limit">Max pages to check</label>
            <input className="glass-input" id="cf-limit" type="number" min="1" max="500" inputMode="numeric"
              value={limit} onChange={e => setLimit(e.target.value)} />
          </div>
        </div>

        <div className="mb-4">
          <button type="button" className="flex items-center gap-2 text-sm mb-3" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            onClick={() => setShowAuth(v => !v)} aria-expanded={showAuth}>
            <span aria-hidden="true">🔒</span> Authentication (optional, for protected sites) {showAuth ? '▲' : '▼'}
          </button>
          {showAuth && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="metric-label mb-2 block" htmlFor="cf-user">Username</label>
                <input className="glass-input" id="cf-user" aria-label="Username" placeholder="user" value={authUser} onChange={e => setAuthUser(e.target.value)} />
              </div>
              <div>
                <label className="metric-label mb-2 block" htmlFor="cf-pass">Password</label>
                <input className="glass-input" id="cf-pass" type="password" aria-label="Password" placeholder="password" value={authPass} onChange={e => setAuthPass(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        <button className="btn-primary w-full" onClick={run} disabled={loading}>
          {loading
            ? <span role="status"><span className="loader" /> Fetching pages…</span>
            : <><RefreshCw size={15} aria-hidden="true" /> Check Freshness</>}
        </button>
        {error && <div className="banner banner-error mt-4" role="alert">{error}</div>}
      </div>

      {result && (
        <>
          <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
            <StatCard label={`Stale (>${result.threshold_days}d)`} value={result.stale_count} color="#f87171" />
            <StatCard label="Fresh" value={result.fresh_count} color="#4ade80" />
            {result.unknown_count > 0 && <StatCard label="No date found" value={result.unknown_count} color="#f59e0b" />}
            <StatCard label="Pages checked" value={result.checked} />
          </div>

          {result.capped && (
            <div className="banner banner-info" role="note">
              Checked the first {result.cap} of {result.total_urls.toLocaleString()} URLs in the sitemap. Raise “Max pages to check” to cover more.
            </div>
          )}

          <div className="glass-panel">
            <div className="flex items-center justify-between mb-4" style={{ flexWrap: 'wrap', gap: 10 }}>
              <h3 style={{ fontSize: '1rem', margin: 0 }}>
                {onlyStale ? 'Stale pages' : 'All checked pages'}
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 400, marginLeft: 8 }}>
                  {shown.length} shown
                </span>
              </h3>
              <div className="flex gap-2">
                <button type="button" onClick={() => setOnlyStale(v => !v)} aria-pressed={onlyStale}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                  {onlyStale ? 'Show all' : 'Show stale only'}
                </button>
                <button type="button" onClick={exportCsv} aria-label="Export CSV"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Download size={13} aria-hidden="true" /> CSV
                </button>
              </div>
            </div>

            {shown.length === 0 ? (
              <div className="empty-state">
                <CheckCircle size={28} color="#4ade80" aria-hidden="true" />
                <div style={{ marginTop: 8 }}>Nothing stale — every checked page was updated within {result.threshold_days} days.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Page</th>
                      <th>Last updated</th>
                      <th style={{ textAlign: 'right' }}>Age</th>
                      <th>Source</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r, i) => (
                      <tr key={r.url + i}>
                        <td style={{ maxWidth: 420 }}>
                          <a href={r.url} target="_blank" rel="noopener noreferrer"
                            className="truncate" title={r.url}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-main)', textDecoration: 'none' }}>
                            <span className="truncate">{r.url}</span>
                            <ExternalLink size={12} aria-hidden="true" style={{ flexShrink: 0, opacity: 0.5 }} />
                          </a>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.last_modified)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: r.age_days == null ? '#f59e0b' : r.flagged ? '#f87171' : '#4ade80' }}>
                          {ageLabel(r.age_days)}
                        </td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{r.source || (r.error ? `error: ${r.error}` : '—')}</td>
                        <td style={{ textAlign: 'center' }}>
                          {r.age_days == null ? (
                            <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><HelpCircle size={11} aria-hidden="true" /> Unknown</span>
                          ) : r.flagged ? (
                            <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={11} aria-hidden="true" /> Stale</span>
                          ) : (
                            <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle size={11} aria-hidden="true" /> Fresh</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="banner banner-info mt-4" role="note">
              “Last updated” is the freshest authoritative signal on each page, in priority order: schema <code>dateModified</code> →
              meta <code>article:modified_time</code> → sitemap <code>lastmod</code> → HTTP <code>Last-Modified</code>. Pages with no
              date signal are marked “Unknown”.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
