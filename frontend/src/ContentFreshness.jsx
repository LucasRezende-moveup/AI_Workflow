import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CalendarClock, RefreshCw, Download, ExternalLink, AlertTriangle, CheckCircle,
  HelpCircle, ChevronLeft, Search, Globe, Clock, MapPin,
} from 'lucide-react';

const token = () => localStorage.getItem('auth_token');
const authHeaders = () => ({ Authorization: `Bearer ${token()}` });

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

function timeAgo(iso) {
  if (!iso) return 'Never checked';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return 'Never checked';
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function shortSitemap(url) {
  // Properties are already named host+path, so the useful detail here is which
  // sitemap feeds them -- domain-wide or scoped to the folder.
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') + u.pathname;
  } catch { return url || ''; }
}

function StatCard({ label, value, color, hint }) {
  return (
    <div className="glass-panel" style={{ padding: '14px 18px', flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: '1.5rem', lineHeight: 1, color: color || 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {hint && <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: 5 }}>{hint}</div>}
    </div>
  );
}

/* Proportional fresh / stale / unknown bar — the at-a-glance shape of a property. */
function FreshnessBar({ fresh, stale, unknown }) {
  const total = (fresh || 0) + (stale || 0) + (unknown || 0);
  if (!total) return <div style={{ height: 6, borderRadius: 3, background: 'rgb(var(--ink) / 0.08)' }} />;
  const seg = (n, color, label) => n > 0 && (
    <div title={`${label}: ${n.toLocaleString()}`} style={{ width: `${(n / total) * 100}%`, background: color }} />
  );
  return (
    <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: 'rgb(var(--ink) / 0.08)' }}>
      {seg(fresh, '#15803d', 'Fresh')}
      {seg(stale, '#dc2626', 'Stale')}
      {seg(unknown, '#b45309', 'No date found')}
    </div>
  );
}

function StatusBadge({ row }) {
  if (row.age_days == null) {
    return <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><HelpCircle size={11} aria-hidden="true" /> Unknown</span>;
  }
  if (row.flagged) {
    return <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={11} aria-hidden="true" /> Stale</span>;
  }
  return <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle size={11} aria-hidden="true" /> Fresh</span>;
}

function toCsv(rows) {
  const head = ['URL', 'Last updated', 'Age (days)', 'Source', 'Google last crawl', 'Google crawl age (days)', 'Status'];
  const body = rows.map(r => [
    r.url, r.last_modified || '', r.age_days ?? '', r.source || '',
    r.gsc_last_crawl || '', r.gsc_crawl_age_days ?? '',
    r.age_days == null ? 'Unknown' : r.flagged ? 'Stale' : 'Fresh',
  ]);
  return [head, ...body].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

function download(name, csv) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

const softBtn = {
  background: 'rgb(var(--ink) / 0.05)', border: '1px solid rgb(var(--ink) / 0.1)',
  color: 'var(--text-muted)', padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
  fontSize: '0.8rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6,
};

/* Where the property list came from. Discovery pairs every GSC property with its
   first sitemap; an explicit FRESHNESS_SITES still wins, and the built-in list is the
   fallback so a SEO API outage doesn't empty the dashboard. */
const SOURCE_NOTE = {
  discovered: 'Sitemaps resolved per property via the SEO API. Folder properties are scoped to their own path.',
  env: 'From the FRESHNESS_SITES environment variable.',
  default: 'Built-in property list — the SEO API returned no sites, so sitemaps are guessed from each path.',
};

/* ── Properties dashboard ──────────────────────────────────────────────────── */

function ProjectCard({ p, onOpen, onRecheck, busy }) {
  const staleColor = p.stale_count > 0 ? '#dc2626' : '#15803d';
  return (
    <div className="glass-panel interactive" onClick={() => onOpen(p.site)} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(p.site); } }}
      style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>

      <div className="flex items-center justify-between" style={{ gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-strong)' }} className="truncate">{p.site}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Globe size={10} aria-hidden="true" />
            <span className="truncate" title={p.sitemap_url}>{shortSitemap(p.sitemap_url)}</span>
          </div>
        </div>
        <span className={`badge ${p.stale_count > 0 ? 'badge-danger' : p.last_run ? 'badge-success' : 'badge-neutral'}`}>
          {p.last_run ? (p.stale_count > 0 ? `${p.stale_count} stale` : 'All fresh') : 'Never checked'}
        </span>
      </div>

      <FreshnessBar fresh={p.fresh_count} stale={p.stale_count} unknown={p.unknown_count} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {[
          ['Fresh', p.fresh_pct == null ? '—' : `${p.fresh_pct}%`, p.fresh_pct == null ? 'var(--text-dim)' : '#15803d'],
          ['Stale', (p.stale_count || 0).toLocaleString(), staleColor],
          ['Checked', (p.checked || 0).toLocaleString(), 'var(--text-strong)'],
        ].map(([label, value, color]) => (
          <div key={label}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between" style={{ gap: 8, fontSize: '0.68rem', color: 'var(--text-dim)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Clock size={10} aria-hidden="true" /> {timeAgo(p.last_run)}
          {p.unknown_count > 0 && <> · {p.unknown_count} no date</>}
          {p.oldest_age_days != null && <> · oldest {p.oldest_age_days}d</>}
        </span>
        <button type="button" style={{ ...softBtn, padding: '4px 9px', fontSize: '0.7rem' }} disabled={busy}
          onClick={e => { e.stopPropagation(); onRecheck(p.site); }}
          aria-label={`Re-check ${p.site}`}>
          {busy ? <><span className="loader" style={{ width: 10, height: 10, borderWidth: 2 }} /> Checking…</> : <><RefreshCw size={11} aria-hidden="true" /> Re-check</>}
        </button>
      </div>

      {p.error && (
        <div style={{ fontSize: '0.68rem', color: 'var(--danger)' }} title={p.error}>
          Last sweep failed: <span className="truncate">{p.error}</span>
        </div>
      )}
      {p.excluded_children > 0 && (
        <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)' }}>
          Excludes {p.excluded_children} sub-{p.excluded_children === 1 ? 'property' : 'properties'} tracked separately.
        </div>
      )}
      {p.in_scope > 0 && (
        <div>
          <div className="flex items-center justify-between" style={{ fontSize: '0.66rem', color: 'var(--text-dim)', marginBottom: 3 }}>
            <span>Coverage {(p.checked || 0).toLocaleString()} / {p.in_scope.toLocaleString()} URLs</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: p.coverage_pct >= 100 ? '#15803d' : 'var(--text-muted)' }}>
              {p.coverage_pct == null ? '—' : `${Math.min(100, p.coverage_pct)}%`}
            </span>
          </div>
          <div style={{ height: 3, borderRadius: 2, background: 'rgb(var(--ink) / 0.08)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, p.coverage_pct || 0)}%`, background: p.coverage_pct >= 100 ? '#15803d' : 'var(--primary)' }} />
          </div>
        </div>
      )}
    </div>
  );
}

/* Group properties by market. Markets carrying stale pages sort first so the view
   opens on what needs attention, then by property count, then by name. */
function groupByMarket(projects) {
  const by = new Map();
  for (const p of projects) {
    const m = p.market || 'Other';
    if (!by.has(m)) by.set(m, []);
    by.get(m).push(p);
  }
  return [...by.entries()]
    .map(([market, items]) => {
      const checked = items.reduce((n, p) => n + (p.checked || 0), 0);
      const unknown = items.reduce((n, p) => n + (p.unknown_count || 0), 0);
      const fresh = items.reduce((n, p) => n + (p.fresh_count || 0), 0);
      const stale = items.reduce((n, p) => n + (p.stale_count || 0), 0);
      const known = checked - unknown;
      return {
        market, items, checked, stale,
        freshPct: known > 0 ? Math.round((fresh / known) * 1000) / 10 : null,
      };
    })
    .sort((a, b) => b.stale - a.stale || b.items.length - a.items.length || a.market.localeCompare(b.market));
}

function MarketHeading({ g }) {
  return (
    <div className="flex items-center justify-between"
      style={{ gap: 10, flexWrap: 'wrap', paddingBottom: 6, borderBottom: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
        <MapPin size={13} aria-hidden="true" style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-strong)' }}>{g.market}</span>
        <span className="badge badge-neutral">{g.items.length}</span>
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
        {g.checked > 0 ? (
          <>
            {g.freshPct == null ? '—' : <><span style={{ color: '#15803d', fontWeight: 700 }}>{g.freshPct}%</span> fresh</>}
            {g.stale > 0 && <> · <span style={{ color: '#dc2626', fontWeight: 700 }}>{g.stale.toLocaleString()}</span> stale</>}
            {' · '}{g.checked.toLocaleString()} checked
          </>
        ) : 'Not checked yet'}
      </div>
    </div>
  );
}

function Dashboard({ data, loading, error, onOpen, onRecheck, busySite, onRefresh }) {
  const t = data?.totals;
  return (
    <div className="flex-col gap-6">
      <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
        <StatCard label="Properties" value={t?.properties ?? '—'}
          hint={t?.never_checked ? `${t.never_checked} never checked` : null} />
        <StatCard label="Markets" value={data?.projects?.length ? new Set(data.projects.map(p => p.market || 'Other')).size : '—'} />
        <StatCard label="Pages checked" value={(t?.checked ?? 0).toLocaleString()} />
        <StatCard label="Stale" value={(t?.stale_count ?? 0).toLocaleString()} color={t?.stale_count ? '#dc2626' : '#15803d'} />
        <StatCard label="Fresh" value={t?.fresh_pct == null ? '—' : `${t.fresh_pct}%`} color="#15803d"
          hint="Of pages with a known date" />
        {t?.unknown_count > 0 && <StatCard label="No date found" value={t.unknown_count.toLocaleString()} color="#b45309" />}
      </div>

      {error && <div className="banner banner-error" role="alert">{error}</div>}

      <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ fontSize: '1rem', margin: 0 }}>Properties</h3>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 2 }}>{SOURCE_NOTE[data?.source] || ''}</div>
        </div>
        <button type="button" style={softBtn} onClick={onRefresh} disabled={loading}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </button>
      </div>

      {loading && !data ? (
        <div className="card-grid">
          {[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 168 }} />)}
        </div>
      ) : !data?.projects?.length ? (
        <div className="glass-panel">
          <div className="empty-state">
            <CalendarClock size={28} className="empty-icon" aria-hidden="true" />
            <div className="empty-title">No properties configured</div>
            <div className="empty-hint">
              Properties come from the <code>FRESHNESS_SITES</code> environment variable (a JSON list of
              <code>{' {name, sitemap_url, threshold_days, limit, include, exclude} '}</code>), falling back to the
              built-in defaults.
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-col gap-6">
          {groupByMarket(data.projects).map(g => (
            <div key={g.market} className="flex-col gap-3">
              <MarketHeading g={g} />
              <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))' }}>
                {g.items.map(p => (
                  <ProjectCard key={p.site} p={p} onOpen={onOpen} onRecheck={onRecheck} busy={busySite === p.site} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {data?.projects?.length > 0 && (
        <div className="banner banner-info" role="note">
          Each run works through a bounded batch, least-recently-checked first — across
          properties, and across the URLs within one. A property larger than its batch size
          fills in over successive runs until coverage reaches 100%, then keeps refreshing
          its oldest pages. <strong>Re-check</strong> advances one property immediately.
        </div>
      )}

      {data?.db_error && (
        <div className="banner banner-warning" role="note">
          Couldn’t read the freshness store: {data.db_error}
        </div>
      )}
    </div>
  );
}

/* ── Single property: every checked page ───────────────────────────────────── */

function ProjectDetail({ site, project, onBack, onRecheck, busy, reloadKey }) {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [onlyStale, setOnlyStale] = useState(false);
  const debounce = useRef(null);

  const load = useCallback(async (q, staleOnly) => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ site });
      if (q) params.set('q', q);
      if (staleOnly) params.set('stale_only', 'true');
      const res = await fetch(`/api/freshness/pages?${params}`, { headers: authHeaders() });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || 'Could not load pages');
      setRows(d.rows || []);
      setMeta(d);
    } catch (e) {
      setError(e.message || String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [site]);

  // Debounced so typing in the URL filter doesn't fire a request per keystroke.
  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(query, onlyStale), query ? 260 : 0);
    return () => clearTimeout(debounce.current);
  }, [query, onlyStale, load, reloadKey]);

  const run = meta?.run;
  const threshold = run?.threshold_days ?? project?.threshold_days ?? 4;

  return (
    <div className="flex-col gap-6">
      <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
          <button type="button" onClick={onBack} style={softBtn} aria-label="Back to properties">
            <ChevronLeft size={14} aria-hidden="true" /> Properties
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-strong)' }} className="truncate">{site}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
              {project?.market && <>{project.market} · </>}
              Stale after {threshold}d · swept {timeAgo(run?.ran_at || project?.last_run)}
              {project?.excluded_children > 0 && <> · excludes {project.excluded_children} sub-{project.excluded_children === 1 ? 'property' : 'properties'}</>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" style={softBtn} disabled={busy} onClick={() => onRecheck(site)}>
            {busy ? <><span className="loader" style={{ width: 11, height: 11, borderWidth: 2 }} /> Checking…</> : <><RefreshCw size={13} aria-hidden="true" /> Re-check</>}
          </button>
          <button type="button" style={softBtn} disabled={!rows.length}
            onClick={() => download(`freshness-${site.replace(/\W+/g, '-').toLowerCase()}.csv`, toCsv(rows))}>
            <Download size={13} aria-hidden="true" /> CSV
          </button>
        </div>
      </div>

      <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
        <StatCard label={`Stale (>${threshold}d)`} value={(run?.stale_count ?? 0).toLocaleString()} color="#dc2626" />
        <StatCard label="Fresh" value={(run?.fresh_count ?? 0).toLocaleString()} color="#15803d" />
        {(run?.unknown_count ?? 0) > 0 && <StatCard label="No date found" value={run.unknown_count.toLocaleString()} color="#b45309" />}
        <StatCard label="Pages checked" value={(run?.checked ?? meta?.total ?? 0).toLocaleString()}
          hint={project?.in_scope ? `of ${project.in_scope.toLocaleString()} in scope${project.coverage_pct != null ? ` (${Math.min(100, project.coverage_pct)}%)` : ''}` : null} />
        {project?.oldest_age_days != null && <StatCard label="Oldest page" value={`${project.oldest_age_days}d`} color="#b45309" />}
      </div>

      {run?.error && <div className="banner banner-error" role="alert">Last sweep failed: {run.error}</div>}

      <div className="glass-panel">
        <div className="flex items-center justify-between mb-4" style={{ flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ fontSize: '1rem', margin: 0 }}>
            {onlyStale ? 'Stale pages' : 'All checked pages'}
            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 400, marginLeft: 8 }}>
              {loading ? 'loading…' : `${rows.length.toLocaleString()} shown${meta && rows.length < meta.total ? ` of ${meta.total.toLocaleString()}` : ''}`}
            </span>
          </h3>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', pointerEvents: 'none' }} />
              <input className="glass-input" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Filter by URL…" aria-label="Filter by URL"
                style={{ padding: '6px 12px 6px 30px', fontSize: '0.8rem', width: 230 }} />
            </div>
            <button type="button" onClick={() => setOnlyStale(v => !v)} aria-pressed={onlyStale}
              style={onlyStale
                ? { ...softBtn, background: 'rgba(226,0,113,0.08)', borderColor: 'rgba(226,0,113,0.45)', color: 'var(--primary)' }
                : softBtn}>
              {onlyStale ? 'Showing stale only' : 'Show stale only'}
            </button>
          </div>
        </div>

        {error && <div className="banner banner-error mb-4" role="alert">{error}</div>}

        {loading ? (
          <div className="flex-col gap-2">
            {[0, 1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 34 }} />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <CheckCircle size={28} color="#15803d" aria-hidden="true" />
            <div className="empty-title" style={{ marginTop: 8 }}>
              {query ? 'No pages match that URL filter'
                : onlyStale ? `Nothing stale — every checked page was updated within ${threshold} days`
                : run ? 'No pages stored for this property yet'
                : 'This property hasn’t been checked yet'}
            </div>
            {!run && <div className="empty-hint">Run “Re-check” to sweep its sitemap now, or wait for the nightly cron.</div>}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Last updated</th>
                  <th style={{ textAlign: 'right' }}>Age</th>
                  <th title="The last time Google crawled this page (GSC URL inspection)">Google last crawl</th>
                  <th>Source</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.url + i}>
                    <td style={{ maxWidth: 420 }}>
                      <a href={r.url} target="_blank" rel="noopener noreferrer" title={r.url}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-main)', textDecoration: 'none' }}>
                        <span className="truncate">{r.url}</span>
                        <ExternalLink size={12} aria-hidden="true" style={{ flexShrink: 0, opacity: 0.5 }} />
                      </a>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.last_modified)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: r.age_days == null ? '#b45309' : r.flagged ? '#dc2626' : '#15803d' }}>
                      {ageLabel(r.age_days)}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {r.gsc_last_crawl
                        ? <span>{fmtDate(r.gsc_last_crawl)} <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>({ageLabel(r.gsc_crawl_age_days)} ago)</span></span>
                        : <span style={{ color: 'var(--text-dim)' }}>Not inspected</span>}
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{r.source || (r.error ? `error: ${r.error}` : '—')}</td>
                    <td style={{ textAlign: 'center' }}><StatusBadge row={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta?.truncated && (
          <div className="banner banner-info mt-4" role="note">
            Showing the first {rows.length.toLocaleString()} rows. Narrow the URL filter to see the rest.
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Ad-hoc check (unchanged one-shot crawler, kept for sitemaps that aren't
      configured properties) ─────────────────────────────────────────────────── */

function AdHocCheck() {
  const [sites, setSites] = useState([]);
  const [mode, setMode] = useState('site');
  const [siteSlug, setSiteSlug] = useState('');
  const [siteSearch, setSiteSearch] = useState('');
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [thresholdDays, setThresholdDays] = useState(4);
  const [limit, setLimit] = useState(80);
  const [include, setInclude] = useState('');
  const [exclude, setExclude] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [authUser, setAuthUser] = useState('');
  const [authPass, setAuthPass] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [onlyStale, setOnlyStale] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch('/api/indexation/gsc-sites', { headers: authHeaders() })
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
      const body = { threshold_days: Number(thresholdDays) || 4, limit: Number(limit) || 80 };
      if (mode === 'site') {
        if (!siteSlug) { setError('Pick a site first.'); setLoading(false); return; }
        body.site_slug = siteSlug;
      } else {
        if (!sitemapUrl.trim()) { setError('Paste a sitemap URL first.'); setLoading(false); return; }
        body.sitemap_url = sitemapUrl.trim();
      }
      if (include.trim()) body.include = include.trim();
      if (exclude.trim()) body.exclude = exclude.trim();
      if (showAuth && authUser) { body.auth_user = authUser; body.auth_pass = authPass; }

      const res = await fetch('/api/freshness/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
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

  const shown = result
    ? result.results.filter(r => (!onlyStale || r.flagged) && (!query || r.url.toLowerCase().includes(query.toLowerCase())))
    : [];

  return (
    <div className="flex-col gap-6">
      <div className="glass-panel">
        <div className="flex gap-2 mb-4">
          {['site', 'sitemap'].map(m => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={mode === m ? 'btn-primary' : ''} aria-pressed={mode === m}
              style={mode !== m ? { ...softBtn, padding: '8px 16px', fontSize: '0.85rem' } : {}}>
              {m === 'site' ? 'GSC Site' : 'Sitemap URL'}
            </button>
          ))}
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

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="metric-label mb-2 block" htmlFor="cf-include">Only crawl URLs containing</label>
            <input className="glass-input" id="cf-include" aria-label="Only crawl URLs containing"
              placeholder="e.g. /se/, /blog/  (comma-separated, matches any)"
              value={include} onChange={e => setInclude(e.target.value)} />
          </div>
          <div>
            <label className="metric-label mb-2 block" htmlFor="cf-exclude">Skip URLs containing</label>
            <input className="glass-input" id="cf-exclude" aria-label="Skip URLs containing"
              placeholder="e.g. /tag/, ?utm  (comma-separated)"
              value={exclude} onChange={e => setExclude(e.target.value)} />
          </div>
          <div style={{ gridColumn: 'span 2', fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: -6 }}>
            Filters run before crawling, so the page cap applies to the pages you keep. Leave blank to check the whole sitemap.
          </div>
        </div>

        <div className="mb-4">
          <button type="button" className="flex items-center gap-2 text-sm mb-3"
            style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
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
            <StatCard label={`Stale (>${result.threshold_days}d)`} value={result.stale_count} color="#dc2626" />
            <StatCard label="Fresh" value={result.fresh_count} color="#15803d" />
            {result.unknown_count > 0 && <StatCard label="No date found" value={result.unknown_count} color="#b45309" />}
            <StatCard label="Pages checked" value={result.checked} />
          </div>

          {result.filtered && (
            <div className="banner banner-info" role="note">
              Filter matched {result.matched.toLocaleString()} of {result.sitemap_total.toLocaleString()} URLs in the sitemap.
            </div>
          )}
          {result.capped && (
            <div className="banner banner-info" role="note">
              Checked the first {result.cap} of {result.total_urls.toLocaleString()} {result.filtered ? 'matching' : 'sitemap'} URLs. Raise “Max pages to check” to cover more.
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
              <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={13} aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', pointerEvents: 'none' }} />
                  <input className="glass-input" value={query} onChange={e => setQuery(e.target.value)}
                    placeholder="Filter by URL…" aria-label="Filter by URL"
                    style={{ padding: '6px 12px 6px 30px', fontSize: '0.8rem', width: 230 }} />
                </div>
                <button type="button" onClick={() => setOnlyStale(v => !v)} aria-pressed={onlyStale} style={softBtn}>
                  {onlyStale ? 'Show all' : 'Show stale only'}
                </button>
                <button type="button" onClick={() => download(`content-freshness-${Date.now()}.csv`, toCsv(result.results))}
                  aria-label="Export CSV" style={softBtn}>
                  <Download size={13} aria-hidden="true" /> CSV
                </button>
              </div>
            </div>

            {shown.length === 0 ? (
              <div className="empty-state">
                <CheckCircle size={28} color="#15803d" aria-hidden="true" />
                <div style={{ marginTop: 8 }}>
                  {query ? 'No pages match that URL filter.'
                    : `Nothing stale — every checked page was updated within ${result.threshold_days} days.`}
                </div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Page</th>
                      <th>Last updated</th>
                      <th style={{ textAlign: 'right' }}>Age</th>
                      <th title="The last time Google crawled this page (GSC URL inspection)">Google last crawl</th>
                      <th>Source</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r, i) => (
                      <tr key={r.url + i}>
                        <td style={{ maxWidth: 420 }}>
                          <a href={r.url} target="_blank" rel="noopener noreferrer" title={r.url}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-main)', textDecoration: 'none' }}>
                            <span className="truncate">{r.url}</span>
                            <ExternalLink size={12} aria-hidden="true" style={{ flexShrink: 0, opacity: 0.5 }} />
                          </a>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.last_modified)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: r.age_days == null ? '#b45309' : r.flagged ? '#dc2626' : '#15803d' }}>
                          {ageLabel(r.age_days)}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {r.gsc_last_crawl
                            ? <span>{fmtDate(r.gsc_last_crawl)} <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>({ageLabel(r.gsc_crawl_age_days)} ago)</span></span>
                            : <span style={{ color: 'var(--text-dim)' }}>Not inspected</span>}
                        </td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{r.source || (r.error ? `error: ${r.error}` : '—')}</td>
                        <td style={{ textAlign: 'center' }}><StatusBadge row={r} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Shell ─────────────────────────────────────────────────────────────────── */

async function fetchProjects() {
  const res = await fetch('/api/freshness/projects', { headers: authHeaders() });
  const d = await res.json();
  if (!res.ok) throw new Error(d.detail || 'Could not load properties');
  return d;
}

export default function ContentFreshness() {
  const [tab, setTab] = useState('properties');   // 'properties' | 'adhoc'
  const [selected, setSelected] = useState(null); // property name
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busySite, setBusySite] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // State is only touched from promise callbacks, never synchronously in the body,
  // so the mount effect below doesn't trigger a cascading render. `loading` starts
  // true for the mount case; refresh sets it at the call site.
  const loadProjects = useCallback(() =>
    fetchProjects()
      .then(d => { setData(d); setError(''); })
      .catch(e => setError(e.message || String(e)))
      .finally(() => setLoading(false)),
  []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const recheck = useCallback(async (site) => {
    setBusySite(site); setError('');
    try {
      const res = await fetch('/api/freshness/recheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ site }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || 'Re-check failed');
      setReloadKey(k => k + 1);
      await loadProjects();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusySite('');
    }
  }, [loadProjects]);

  const project = data?.projects?.find(p => p.site === selected) || null;

  return (
    <div className="flex-col gap-6">
      <div className="page-header">
        <div>
          <h1 className="flex items-center gap-2" style={{ fontSize: '1.35rem' }}>
            <CalendarClock size={22} color="var(--primary)" aria-hidden="true" /> Content Freshness
          </h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
            Flags pages whose content hasn’t been updated recently, read from each page’s own last-updated signals —
            schema <code>dateModified</code>, meta modified-time tags, then sitemap <code>lastmod</code>.
          </p>
        </div>
        {!selected && (
          <div className="tab-group" role="tablist">
            <button role="tab" aria-selected={tab === 'properties'} className={`tab-btn ${tab === 'properties' ? 'active' : ''}`}
              onClick={() => setTab('properties')}>Properties</button>
            <button role="tab" aria-selected={tab === 'adhoc'} className={`tab-btn ${tab === 'adhoc' ? 'active' : ''}`}
              onClick={() => setTab('adhoc')}>Ad-hoc check</button>
          </div>
        )}
      </div>

      {tab === 'adhoc' ? (
        <AdHocCheck />
      ) : selected ? (
        <ProjectDetail
          site={selected}
          project={project}
          reloadKey={reloadKey}
          busy={busySite === selected}
          onRecheck={recheck}
          onBack={() => setSelected(null)}
        />
      ) : (
        <Dashboard
          data={data}
          loading={loading}
          error={error}
          busySite={busySite}
          onOpen={setSelected}
          onRecheck={recheck}
          onRefresh={() => { setLoading(true); loadProjects(); }}
        />
      )}

      <div className="banner banner-info" role="note">
        “Last updated” is the freshest authoritative signal on each page, in priority order: schema <code>dateModified</code> →
        meta <code>article:modified_time</code> → sitemap <code>lastmod</code> → HTTP <code>Last-Modified</code>. Pages with no
        date signal are marked “Unknown” and excluded from the fresh percentage.
      </div>
    </div>
  );
}
