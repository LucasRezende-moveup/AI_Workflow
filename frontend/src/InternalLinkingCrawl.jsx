import { useState, useMemo } from 'react';
import { Upload, Link2, Users as UsersIcon, Target, AlertTriangle, Download, Search, X, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import Papa from 'papaparse';

// ─── helpers ─────────────────────────────────────────────────────────────────

// Case-insensitive column picker against Papa's header field list
function pickCol(fields, cands) {
  const lower = {};
  fields.forEach(f => { lower[String(f).trim().toLowerCase()] = f; });
  for (const c of cands) if (lower[c] !== undefined) return lower[c];
  return null;
}

// Build the audit result (same shape as the backend) from parsed CSV records
function buildResult(records, fields) {
  const typeCol   = pickCol(fields, ['type']);
  const fromCol   = pickCol(fields, ['source', 'from']);
  const toCol     = pickCol(fields, ['destination', 'to']);
  const anchorCol = pickCol(fields, ['anchor text', 'anchor', 'anchor_text', 'anchortext']);
  const statusCol = pickCol(fields, ['status code', 'status_code', 'statuscode']);
  const posCol    = pickCol(fields, ['link position', 'link_position', 'linkposition']);
  const pathCol   = pickCol(fields, ['link path', 'link_path', 'linkpath']);
  const originCol = pickCol(fields, ['link origin', 'link_origin', 'linkorigin']);

  if (!fromCol || !toCol) {
    throw new Error("This does not look like a Screaming Frog inlinks export. Expected 'Source' and " +
      "'Destination' columns — use Bulk Export → Links → All Inlinks.");
  }

  const totalRows = records.length;

  // Filter exclusively for hyperlink types
  let typeFiltered = false;
  let src = records;
  if (typeCol) {
    typeFiltered = true;
    src = records.filter(r => String(r[typeCol] ?? '').trim().toLowerCase() === 'hyperlink');
  }

  const clean = (v) => {
    const s = String(v ?? '').trim();
    return (s === 'nan' || s === 'None') ? '' : s;
  };

  const rows = src.map(r => {
    let code = '';
    if (statusCol) {
      const n = parseInt(String(r[statusCol] ?? '').trim(), 10);
      code = Number.isNaN(n) ? '' : String(n);
    }
    return {
      from: clean(r[fromCol]),
      to: clean(r[toCol]),
      anchor: anchorCol ? clean(r[anchorCol]) : '',
      status_code: code,
      link_position: posCol ? clean(r[posCol]) : '',
      link_path: pathCol ? clean(r[pathCol]) : '',
      link_origin: originCol ? clean(r[originCol]) : '',
    };
  });

  const sources = new Set(), targets = new Set(), breakdown = {};
  const posSet = new Set(), originSet = new Set();
  let broken = 0, redirect = 0;
  rows.forEach(r => {
    if (r.from) sources.add(r.from);
    if (r.to) targets.add(r.to);
    if (r.link_position) posSet.add(r.link_position);
    if (r.link_origin) originSet.add(r.link_origin);
    const n = parseInt(r.status_code, 10);
    if (!Number.isNaN(n)) { if (n >= 400) broken++; else if (n >= 300) redirect++; }
    const key = r.status_code || 'Unknown';
    breakdown[key] = (breakdown[key] || 0) + 1;
  });

  const status_breakdown = Object.entries(breakdown)
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => (a.code === 'Unknown') - (b.code === 'Unknown') || a.code.localeCompare(b.code, undefined, { numeric: true }));

  const sortVals = (set) => [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return {
    rows,
    total_links: rows.length,
    returned: rows.length,
    truncated: false,
    total_rows_in_file: totalRows,
    unique_sources: sources.size,
    unique_targets: targets.size,
    broken_links: broken,
    redirect_links: redirect,
    status_breakdown,
    position_options: sortVals(posSet),
    origin_options: sortVals(originSet),
    type_filtered: typeFiltered,
    has_status: !!statusCol,
    has_anchor: !!anchorCol,
    has_position: !!posCol,
    has_link_path: !!pathCol,
    has_origin: !!originCol,
  };
}


function shortLabel(url) {
  if (!url) return '—';
  try {
    const { pathname, hostname } = new URL(url);
    const path = pathname.replace(/\/$/, '');
    return path || hostname;
  } catch {
    return url.length > 60 ? url.slice(0, 57) + '…' : url;
  }
}

// Anchors ignored by the consistency check — generic TOC/navigation labels that
// legitimately point to many destinations, plus bare section numbers (5.1, 5.2, …)
const EXCLUDED_ANCHORS = new Set(['confira também', 'perguntas frequentes']);

function isExcludedAnchor(anchor) {
  const a = anchor.trim().toLowerCase();
  // Any anchor that starts with a number (section numbers, "9 confira também", etc.)
  if (/^\d/.test(a)) return true;
  // Phrase match anywhere
  for (const p of EXCLUDED_ANCHORS) if (a.includes(p)) return true;
  return false;
}

// Normalize a URL so trailing-slash / fragment / case differences don't count as distinct destinations
function normUrl(u) {
  if (!u) return '';
  try {
    const x = new URL(u);
    x.hash = '';
    return x.href.replace(/\/$/, '').toLowerCase();
  } catch {
    return String(u).replace(/#.*$/, '').replace(/\/$/, '').toLowerCase();
  }
}

function statusStyle(code) {
  const n = parseInt(code, 10);
  if (!code || Number.isNaN(n)) return { bg: 'rgba(255,255,255,.06)', color: 'var(--text-muted)' };
  if (n >= 200 && n < 300) return { bg: 'rgba(34,197,94,.1)',  color: '#4ade80' };  // 2xx
  if (n >= 300 && n < 400) return { bg: 'rgba(59,130,246,.12)', color: '#60a5fa' };  // 3xx
  return { bg: 'rgba(239,68,68,.1)', color: '#f87171' };                             // 4xx / 5xx
}

function toCsv(rows) {
  const esc = (v) => {
    const s = (v ?? '').toString();
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['From', 'To', 'Anchor Text', 'Status Code'];
  const body = rows.map(r => [r.from, r.to, r.anchor, r.status_code].map(esc).join(','));
  return [header.join(','), ...body].join('\n');
}

// ─── sub-components ────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, valueColor }) {
  return (
    <div className="glass-panel" style={{ padding: '14px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {icon}
        <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>{label}</span>
      </div>
      <div style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1, color: valueColor || 'white' }}>{value}</div>
    </div>
  );
}

// ─── main component ────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

export default function InternalLinkingCrawl() {
  const [file, setFile]         = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState('');

  const [query, setQuery]         = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [positionFilter, setPositionFilter] = useState('all');
  const [originFilter, setOriginFilter]     = useState('all');
  const [pathQuery, setPathQuery]           = useState('');
  const [anchorExact, setAnchorExact]       = useState('');   // exact-anchor filter set by "isolate"
  const [page, setPage]           = useState(1);
  const [openConflicts, setOpenConflicts]   = useState({});
  const [showAllConflicts, setShowAllConflicts] = useState(false);

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) { setFile(f); setResult(null); setError(''); }
  };

  const applyResult = (data) => {
    setResult(data);
    setQuery('');
    setStatusFilter('all');
    setPositionFilter('all');
    setOriginFilter('all');
    setPathQuery('');
    setAnchorExact('');
    setPage(1);
    setOpenConflicts({});
    setShowAllConflicts(false);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    setResult(null);
    const name = (file.name || '').toLowerCase();
    try {
      if (name.endsWith('.csv')) {
        // Parse entirely in the browser — avoids Vercel's ~4.5 MB request-body limit
        const parsed = await new Promise((resolve, reject) => {
          Papa.parse(file, {
            header: true,
            skipEmptyLines: 'greedy',
            complete: resolve,
            error: reject,
          });
        });
        const fields = parsed.meta?.fields || [];
        applyResult(buildResult(parsed.data, fields));
      } else if (name.endsWith('.xlsx')) {
        // XLSX is binary and usually small — parse server-side
        if (file.size > 4_400_000) {
          throw new Error('This XLSX is over ~4.4 MB and would exceed the upload limit. ' +
            'Re-export as CSV — CSV is parsed locally with no size cap.');
        }
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/internal-linking/crawl-audit', { method: 'POST', body: form });
        if (!res.ok) {
          let detail = 'Could not parse the crawl file.';
          try { detail = (await res.json()).detail || detail; } catch { /* non-JSON error body */ }
          throw new Error(detail);
        }
        applyResult(await res.json());
      } else {
        throw new Error('Please upload a Screaming Frog CSV or XLSX export.');
      }
    } catch (e) {
      setError(e.message || 'Could not parse the crawl file.');
    } finally {
      setLoading(false);
    }
  };

  // ── derived / filtered rows ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!result) return [];
    const q = query.trim().toLowerCase();
    const pq = pathQuery.trim().toLowerCase();
    return result.rows.filter(r => {
      if (statusFilter !== 'all') {
        const code = r.status_code || 'Unknown';
        if (statusFilter === 'broken') {
          const n = parseInt(r.status_code, 10);
          if (!(n >= 400)) return false;
        } else if (code !== statusFilter) return false;
      }
      if (positionFilter !== 'all' && r.link_position !== positionFilter) return false;
      if (originFilter !== 'all' && r.link_origin !== originFilter) return false;
      if (anchorExact && (r.anchor || '').trim().toLowerCase() !== anchorExact.toLowerCase()) return false;
      if (pq && !(r.link_path || '').toLowerCase().includes(pq)) return false;
      if (q && !(`${r.from} ${r.to} ${r.anchor}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [result, query, statusFilter, positionFilter, originFilter, pathQuery, anchorExact]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage  = Math.min(page, pageCount);
  const pageRows  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const downloadCsv = () => {
    const blob = new Blob([toCsv(filtered)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'internal-hyperlinks.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setError('');
    setQuery('');
    setStatusFilter('all');
    setPositionFilter('all');
    setOriginFilter('all');
    setPathQuery('');
    setAnchorExact('');
    setPage(1);
    setOpenConflicts({});
    setShowAllConflicts(false);
  };

  // ── validation: same anchor text → different destination URLs ─────────────────
  const anchorConflicts = useMemo(() => {
    if (!result) return [];
    const map = new Map(); // lowercased anchor → { display, total, dests: Map(normUrl → {url, count}) }
    result.rows.forEach(r => {
      const a = (r.anchor || '').trim();
      if (!a || isExcludedAnchor(a)) return;
      const key = a.toLowerCase();
      let e = map.get(key);
      if (!e) { e = { display: a, total: 0, dests: new Map() }; map.set(key, e); }
      e.total++;
      const nk = normUrl(r.to);
      const d = e.dests.get(nk);
      if (d) d.count++;
      else e.dests.set(nk, { url: r.to, count: 1 });
    });
    const conflicts = [];
    map.forEach(e => {
      if (e.dests.size >= 2) {
        conflicts.push({
          anchor: e.display,
          total: e.total,
          destinations: [...e.dests.values()].sort((a, b) => b.count - a.count),
        });
      }
    });
    conflicts.sort((a, b) => b.destinations.length - a.destinations.length || b.total - a.total);
    return conflicts;
  }, [result]);

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex-col gap-6">

      {/* ── Upload panel (hidden once a crawl is loaded) ── */}
      {!result && (
      <div
        className="glass-panel flex flex-col items-center justify-center"
        style={{
          padding: '40px 24px', borderStyle: 'dashed', borderWidth: 2,
          borderColor: dragging ? 'var(--primary)' : 'rgba(255,255,255,0.18)',
          transition: 'border-color .2s',
        }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div style={{ background: 'rgba(226,0,113,0.1)', padding: 20, borderRadius: '50%', marginBottom: 16 }}>
          <Upload size={40} color="var(--primary)" />
        </div>
        <h3 className="mb-2">Upload a Screaming Frog Crawl</h3>
        <p className="text-center" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: 480, marginBottom: 18 }}>
          Export <strong>Bulk Export → Links → All Inlinks</strong> as CSV and drop it here.
          Only rows of type <strong>Hyperlink</strong> are kept — CSS, JS, redirect and image links are filtered out.
          CSV is parsed locally in your browser, so there's no file-size limit (recommended for large crawls).
        </p>
        <input type="file" id="sf-inlinks-upload" accept=".csv,.xlsx" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setResult(null); setError(''); } }} />
        <label htmlFor="sf-inlinks-upload" className="btn-primary" style={{ cursor: 'pointer' }}>Select File</label>
        {file && <div className="mt-4" style={{ color: '#4ade80', fontWeight: 600, fontSize: '0.85rem' }}>{file.name}</div>}
        {file && (
          <button className="btn-primary mt-4" style={{ minWidth: 240 }} onClick={handleUpload} disabled={loading}>
            {loading ? <><div className="loader" /> Parsing crawl…</> : '🐸 Audit Internal Links'}
          </button>
        )}
        {error && <p style={{ marginTop: 14, color: '#f87171', fontSize: '0.85rem', textAlign: 'center', maxWidth: 480 }}>{error}</p>}
      </div>
      )}

      {result && (
        <>
          {/* ── Header: loaded file + upload-new button ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#d8d8e6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file?.name || 'Crawl loaded'}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {result.total_rows_in_file.toLocaleString()} rows in file · {result.total_links.toLocaleString()} hyperlinks
              </div>
            </div>
            <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', flexShrink: 0 }} onClick={reset}>
              <Upload size={15} /> Upload New File
            </button>
          </div>

          {/* ── Stats ── */}
          <div className="grid grid-cols-4 gap-4">
            <StatCard icon={<Link2 size={16} color="#00f2fe" />}     label="Hyperlinks"      value={result.total_links.toLocaleString()} />
            <StatCard icon={<UsersIcon size={16} color="#a78bfa" />}  label="Source Pages"    value={result.unique_sources.toLocaleString()} />
            <StatCard icon={<Target size={16} color="#4ade80" />}     label="Target Pages"    value={result.unique_targets.toLocaleString()} />
            <StatCard icon={<AlertTriangle size={16} color="#f87171" />} label="Broken (4xx/5xx)" value={result.broken_links.toLocaleString()}
              valueColor={result.broken_links > 0 ? '#f87171' : '#4ade80'} />
          </div>

          {/* ── Notices ── */}
          {!result.type_filtered && (
            <div className="glass-panel" style={{ padding: '10px 16px', fontSize: '0.8rem', color: '#f59e0b' }}>
              ⚠️ No <strong>Type</strong> column found — could not filter to hyperlinks only. Showing every link row in the export.
            </div>
          )}
          {result.truncated && (
            <div className="glass-panel" style={{ padding: '10px 16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Showing the first {result.returned.toLocaleString()} of {result.total_links.toLocaleString()} hyperlinks. Refine with the filters below or export the full set.
            </div>
          )}

          {/* ── Validation: anchor consistency ── */}
          {result.has_anchor && (
            <div className="glass-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle size={16} color={anchorConflicts.length ? '#f59e0b' : '#4ade80'} />
                    Anchor Consistency
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '6px 0 0', maxWidth: 620 }}>
                    Anchors with identical text that link to <strong>different destination URLs</strong> — often a sign of inconsistent
                    or cannibalizing internal links. Trailing-slash / fragment differences are ignored.
                  </p>
                </div>
                <span style={{
                  fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20, flexShrink: 0,
                  background: anchorConflicts.length ? 'rgba(245,158,11,.1)' : 'rgba(34,197,94,.1)',
                  color: anchorConflicts.length ? '#f59e0b' : '#4ade80',
                }}>
                  {anchorConflicts.length} {anchorConflicts.length === 1 ? 'conflict' : 'conflicts'}
                </span>
              </div>

              {anchorConflicts.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: '#4ade80', marginTop: 14 }}>✓ Every anchor points to a single destination.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                  {anchorConflicts.slice(0, showAllConflicts ? anchorConflicts.length : 15).map((c, i) => {
                    const open = !!openConflicts[c.anchor];
                    return (
                      <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 8, overflow: 'hidden' }}>
                        <button
                          onClick={() => setOpenConflicts(p => ({ ...p, [c.anchor]: !p[c.anchor] }))}
                          style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', textAlign: 'left' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#d8d8e6' }}>"{c.anchor}"</span>
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 8px', borderRadius: 10, background: 'rgba(245,158,11,.1)', color: '#f59e0b' }}>
                              {c.destinations.length} destinations
                            </span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{c.total} links</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                            <span
                              role="button"
                              title="Show only this anchor's links in the table"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAnchorExact(c.anchor);
                                setQuery('');
                                setStatusFilter('all');
                                setPositionFilter('all');
                                setOriginFilter('all');
                                setPathQuery('');
                                setPage(1);
                              }}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: 'var(--text-muted)' }}
                            >
                              <Filter size={12} /> isolate
                            </span>
                            {open ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
                          </div>
                        </button>
                        {open && (
                          <div style={{ padding: '0 14px 12px' }}>
                            {c.destinations.map((d, j) => (
                              <div key={j} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                <a href={d.url} target="_blank" rel="noopener noreferrer" title={d.url}
                                  style={{ fontSize: '0.8rem', color: 'var(--primary)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {shortLabel(d.url)}
                                </a>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>{d.count} link{d.count !== 1 ? 's' : ''}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {anchorConflicts.length > 15 && !showAllConflicts && (
                    <button className="btn-secondary" style={{ alignSelf: 'center', padding: '6px 14px', marginTop: 4 }} onClick={() => setShowAllConflicts(true)}>
                      Show all {anchorConflicts.length} conflicts
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Toolbar ── */}
          <div className="glass-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <h3 style={{ fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                Internal Hyperlinks
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                  {filtered.length.toLocaleString()} shown
                </span>
                {anchorExact && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 600, padding: '3px 6px 3px 10px', borderRadius: 20, background: 'rgba(245,158,11,.12)', color: '#f59e0b' }}>
                    anchor = "{anchorExact}"
                    <X size={13} style={{ cursor: 'pointer' }} onClick={() => { setAnchorExact(''); setPage(1); }} />
                  </span>
                )}
              </h3>
              <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px' }} onClick={downloadCsv}>
                <Download size={15} /> Export CSV
              </button>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  className="glass-input"
                  style={{ paddingLeft: 34 }}
                  placeholder="Filter by URL or anchor text…"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                />
                {query && (
                  <X size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', cursor: 'pointer' }}
                    onClick={() => { setQuery(''); setPage(1); }} />
                )}
              </div>
              <select
                className="glass-input glass-select"
                style={{ maxWidth: 220 }}
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              >
                <option value="all">All status codes</option>
                {result.broken_links > 0 && <option value="broken">Broken only (4xx/5xx)</option>}
                {result.status_breakdown.map(s => (
                  <option key={s.code} value={s.code}>{s.code} · {s.count.toLocaleString()}</option>
                ))}
              </select>

              {result.has_position && (
                <select
                  className="glass-input glass-select"
                  style={{ maxWidth: 220 }}
                  value={positionFilter}
                  onChange={(e) => { setPositionFilter(e.target.value); setPage(1); }}
                >
                  <option value="all">All link positions</option>
                  {result.position_options.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              )}

              {result.has_origin && (
                <select
                  className="glass-input glass-select"
                  style={{ maxWidth: 220 }}
                  value={originFilter}
                  onChange={(e) => { setOriginFilter(e.target.value); setPage(1); }}
                >
                  <option value="all">All link origins</option>
                  {result.origin_options.map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              )}

              {result.has_link_path && (
                <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                  <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    className="glass-input"
                    style={{ paddingLeft: 34 }}
                    placeholder="Filter by link path…"
                    value={pathQuery}
                    onChange={(e) => { setPathQuery(e.target.value); setPage(1); }}
                  />
                  {pathQuery && (
                    <X size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', cursor: 'pointer' }}
                      onClick={() => { setPathQuery(''); setPage(1); }} />
                  )}
                </div>
              )}
            </div>

            {/* ── Table ── */}
            <div className="data-table-container" style={{ maxHeight: 640, overflowY: 'auto', overflowX: 'auto' }}>
              <table className="data-table">
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-dark)', zIndex: 1 }}>
                  <tr>
                    <th style={{ minWidth: 220 }}>From</th>
                    <th style={{ minWidth: 220 }}>To</th>
                    <th style={{ minWidth: 180 }}>Anchor Text</th>
                    <th style={{ textAlign: 'center', minWidth: 90 }}>Status Code</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r, i) => {
                    const s = statusStyle(r.status_code);
                    return (
                      <tr key={i}>
                        <td style={{ maxWidth: 300 }}>
                          <a href={r.from} target="_blank" rel="noopener noreferrer" title={r.from}
                            style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.8rem', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {shortLabel(r.from)}
                          </a>
                        </td>
                        <td style={{ maxWidth: 300 }}>
                          <a href={r.to} target="_blank" rel="noopener noreferrer" title={r.to}
                            style={{ color: '#d8d8e6', textDecoration: 'none', fontSize: '0.8rem', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {shortLabel(r.to)}
                          </a>
                        </td>
                        <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem', color: r.anchor ? '#d8d8e6' : 'var(--text-muted)' }}
                          title={r.anchor}>
                          {r.anchor || '[no anchor / image link]'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: s.bg, color: s.color, fontVariantNumeric: 'tabular-nums' }}>
                            {r.status_code || '—'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {pageRows.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        No hyperlinks match the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ── Pagination ── */}
            {pageCount > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, marginTop: 16 }}>
                <button className="btn-secondary" style={{ padding: '6px 14px' }} disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>← Prev</button>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Page {safePage} of {pageCount}</span>
                <button className="btn-secondary" style={{ padding: '6px 14px' }} disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>Next →</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
