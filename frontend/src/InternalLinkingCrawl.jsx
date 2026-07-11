import { useState, useMemo } from 'react';
import { Upload, Link2, Users as UsersIcon, Target, AlertTriangle, Download, Search, X } from 'lucide-react';

// ─── helpers ─────────────────────────────────────────────────────────────────

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
  const [page, setPage]           = useState(1);

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) { setFile(f); setResult(null); setError(''); }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    setResult(null);
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch('/api/internal-linking/crawl-audit', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) setError(data.detail || 'Could not parse the crawl file.');
      else {
        setResult(data);
        setQuery('');
        setStatusFilter('all');
        setPage(1);
      }
    } catch (e) {
      setError('Network error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── derived / filtered rows ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!result) return [];
    const q = query.trim().toLowerCase();
    return result.rows.filter(r => {
      if (statusFilter !== 'all') {
        const code = r.status_code || 'Unknown';
        if (statusFilter === 'broken') {
          const n = parseInt(r.status_code, 10);
          if (!(n >= 400)) return false;
        } else if (code !== statusFilter) return false;
      }
      if (q && !(`${r.from} ${r.to} ${r.anchor}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [result, query, statusFilter]);

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

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex-col gap-6">

      {/* ── Upload panel ── */}
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
          Export <strong>Bulk Export → Links → All Inlinks</strong> as CSV or XLSX and drop it here.
          Only rows of type <strong>Hyperlink</strong> are kept — CSS, JS, redirect and image links are filtered out.
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

      {result && (
        <>
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

          {/* ── Toolbar ── */}
          <div className="glass-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <h3 style={{ fontSize: '1rem', margin: 0 }}>
                Internal Hyperlinks
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>
                  {filtered.length.toLocaleString()} shown
                </span>
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
