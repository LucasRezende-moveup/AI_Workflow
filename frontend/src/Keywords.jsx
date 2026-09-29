import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, TrendingUp, AlertTriangle, ChevronLeft, ChevronRight, Check } from 'lucide-react';

// The keyword corpus from MoveUp Publisher, read through our server so the API key — which
// carries its owner's full market scope — never reaches the browser.
//
// Two warnings from the API's own documentation are enforced in the UI rather than left to the
// reader: a null volume is unknown and is never shown as zero, and no market's volumes have
// been verified against Mangools, so anything ordered by volume says so on screen.

const API = (path, opts = {}) => {
  const token = localStorage.getItem('auth_token');
  return fetch(path, { ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
};

const PROVENANCE = {
  validated: { label: 'validated', color: '#15803d', hint: 'a person confirmed the tags' },
  suggested: { label: 'suggested', color: '#b45309', hint: 'a model proposed them; nobody has looked' },
  estimated: { label: 'estimated', color: '#64748b', hint: 'neither confirmed nor suggested' },
};

const fmt = (n) => (n === null || n === undefined ? null : Number(n).toLocaleString());
const money = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 }));

function Stat({ label, value, sub, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontSize: '1.05rem', fontWeight: 800, color: color || 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      {sub && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{sub}</span>}
    </div>
  );
}

export default function Keywords() {
  const [who, setWho] = useState(null);
  const [market, setMarket] = useState('');
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);
  const [q, setQ] = useState('');
  const [provenance, setProvenance] = useState('');
  const [volumeMin, setVolumeMin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [domain, setDomain] = useState('');
  const [pushing, setPushing] = useState(false);
  const [pushed, setPushed] = useState(null);

  useEffect(() => {
    API('/api/keywords/whoami').then((r) => r.json()).then((d) => {
      setWho(d);
      if (d.markets?.length) setMarket(d.markets.includes('BR-pt') ? 'BR-pt' : d.markets[0]);
    }).catch(() => setError('Could not reach the Keywords API.'));
  }, []);

  const load = useCallback(async () => {
    if (!market) return;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ market, limit: String(limit), offset: String(offset) });
      if (q.trim()) params.set('q', q.trim());
      if (provenance) params.set('provenance', provenance);
      if (volumeMin) params.set('volume_min', volumeMin);
      const [lr, sr] = await Promise.all([
        API(`/api/keywords/list?${params}`),
        API(`/api/keywords/stats/${market}`),
      ]);
      const ld = await lr.json();
      if (!lr.ok) throw new Error(ld.detail || 'Request failed');
      setRows(ld.rows || []); setTotal(ld.total || 0);
      if (sr.ok) setStats(await sr.json());
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [market, offset, limit, q, provenance, volumeMin]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setOffset(0); setSelected(new Set()); }, [market, q, provenance, volumeMin]);

  const toggle = (ref) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(ref) ? next.delete(ref) : next.add(ref);
    return next;
  });

  const pushToTracking = async () => {
    if (!selected.size || !domain.trim()) return;
    setPushing(true); setPushed(null); setError('');
    try {
      const res = await API('/api/keywords/to-tracking', {
        method: 'POST',
        body: JSON.stringify({ refs: [...selected], market, domain: domain.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || 'Failed');
      setPushed(d); setSelected(new Set());
    } catch (e) { setError(e.message); } finally { setPushing(false); }
  };

  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Who the key reads as */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', padding: '10px 14px',
        borderRadius: 10, background: 'rgb(var(--ink) / 0.03)', border: '1px solid rgb(var(--ink) / 0.08)',
        fontSize: '0.76rem', color: 'var(--text-muted)' }}>
        {who ? (
          <>
            <span>Reading as <strong style={{ color: 'var(--text-strong)' }}>{who.email}</strong> ({who.role})</span>
            <span>{who.markets?.length} markets in scope</span>
            {who.readOnly && <span style={{ color: 'var(--text-dim)' }}>read-only — changes are made in the console</span>}
          </>
        ) : <span>Connecting to the Keywords API…</span>}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label className="metric-label mb-2 block" htmlFor="kw-market">Market</label>
          <select id="kw-market" className="glass-input glass-select" value={market}
            onChange={(e) => setMarket(e.target.value)} style={{ minWidth: 130 }}>
            {(who?.markets || []).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div style={{ flex: '1 1 240px', position: 'relative' }}>
          <label className="metric-label mb-2 block" htmlFor="kw-q">Search</label>
          <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, top: 34, color: 'var(--text-dim)' }} />
          <input id="kw-q" className="glass-input" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="keyword or ref (BR-0004)" style={{ width: '100%', paddingLeft: 30 }} />
        </div>
        <div>
          <label className="metric-label mb-2 block" htmlFor="kw-prov">Tag provenance</label>
          <select id="kw-prov" className="glass-input glass-select" value={provenance}
            onChange={(e) => setProvenance(e.target.value)}>
            <option value="">any</option>
            {Object.keys(PROVENANCE).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="metric-label mb-2 block" htmlFor="kw-vol">Min volume</label>
          <input id="kw-vol" className="glass-input" type="number" value={volumeMin} placeholder="any"
            onChange={(e) => setVolumeMin(e.target.value)} style={{ width: 110 }} />
        </div>
        <button onClick={load} aria-label="Refresh" className="btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 13px' }}>
          <RefreshCw size={13} aria-hidden="true" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Market numbers */}
      {stats && (
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', padding: '12px 16px', borderRadius: 10,
          background: 'rgb(var(--ink) / 0.03)', border: '1px solid rgb(var(--ink) / 0.08)' }}>
          <Stat label="Keywords" value={fmt(stats.keywords)} sub={`${fmt(stats.validated)} validated`} />
          <Stat label="No volume yet" value={fmt(stats.without_volume)}
            sub={stats.keywords ? `${Math.round((stats.without_volume / stats.keywords) * 100)}% of the market` : null}
            color={stats.without_volume > stats.keywords / 2 ? '#b45309' : undefined} />
          <Stat label="Total volume" value={fmt(stats.total_volume)} />
          <Stat label="Market value" value={money(stats.market_value)} />
          <Stat label="Articles" value={fmt(stats.articles)} sub={`${fmt(stats.published)} published`} />
          <Stat label="Verified volume" value={`${stats.verifiedVolumeShare ?? 0}%`}
            color={(stats.verifiedVolumeShare ?? 0) === 0 ? '#dc2626' : undefined} sub="measured, not imported" />
        </div>
      )}

      {/* The caveat the corpus documentation insists on carrying */}
      {stats && (stats.verifiedVolumeShare ?? 0) === 0 && (
        <div style={{ display: 'flex', gap: 10, padding: '11px 14px', borderRadius: 10, fontSize: '0.8rem',
          background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.25)', color: 'var(--text-strong)' }}>
          <AlertTriangle size={16} color="#dc2626" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>No volume in {market} has been verified against Mangools.</strong> Every figure below was
            imported, much of it typed into a spreadsheet by hand, so an ordering by volume is an ordering of
            estimates. {stats.without_volume > 0 && <>A further <strong>{fmt(stats.without_volume)}</strong> keywords
            have no volume at all — that means unresearched, not zero.</>}
          </div>
        </div>
      )}

      {error && (
        <div role="alert" style={{ padding: '10px 14px', borderRadius: 8, fontSize: '0.82rem',
          background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#dc2626' }}>{error}</div>
      )}

      {/* Send to tracking */}
      {selected.size > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '11px 14px',
          borderRadius: 10, background: 'rgba(226,0,113,0.07)', border: '1px solid rgba(226,0,113,0.25)' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-strong)' }}>
            <strong>{selected.size}</strong> selected
          </span>
          <input className="glass-input" value={domain} onChange={(e) => setDomain(e.target.value)}
            placeholder="track against which domain? e.g. theplayoffs.news"
            style={{ flex: '1 1 260px', fontSize: '0.8rem', padding: '6px 10px' }} />
          <button onClick={pushToTracking} disabled={pushing || !domain.trim()} className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: '0.82rem' }}>
            <TrendingUp size={14} aria-hidden="true" /> {pushing ? 'Adding…' : 'Add to rank tracking'}
          </button>
          <button onClick={() => setSelected(new Set())} className="btn-secondary"
            style={{ padding: '7px 12px', fontSize: '0.8rem' }}>Clear</button>
        </div>
      )}

      {pushed && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '11px 14px', borderRadius: 10,
          fontSize: '0.82rem', background: 'rgba(21,128,61,0.08)', border: '1px solid rgba(21,128,61,0.28)' }}>
          <Check size={16} color="#15803d" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ color: 'var(--text-strong)' }}>
            Added <strong>{pushed.added}</strong> keyword{pushed.added !== 1 ? 's' : ''} to <strong>{pushed.domain}</strong>
            {pushed.skipped_already_tracked > 0 && <> · {pushed.skipped_already_tracked} were already tracked</>}.
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 3 }}>{pushed.note}</div>
          </div>
        </div>
      )}

      {/* The corpus */}
      <div className="data-table-container" style={{ maxHeight: 620, overflowY: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>Ref</th>
              <th>Keyword</th>
              <th style={{ textAlign: 'right' }}>Volume</th>
              <th style={{ textAlign: 'right' }}>Value</th>
              <th>Intent</th>
              <th>Brand</th>
              <th>Tags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const prov = PROVENANCE[r.tagging_provenance] || PROVENANCE.estimated;
              return (
                <tr key={r.ref} style={selected.has(r.ref) ? { background: 'rgba(226,0,113,0.07)' } : undefined}>
                  <td>
                    <input type="checkbox" checked={selected.has(r.ref)} onChange={() => toggle(r.ref)}
                      aria-label={`Select ${r.ref}`} />
                  </td>
                  <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.74rem', color: 'var(--text-muted)' }}>{r.ref}</td>
                  <td style={{ fontWeight: 550, color: 'var(--text-strong)' }}>{r.keyword}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {r.search_volume === null || r.search_volume === undefined
                      ? <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }} title="Not researched — not zero">unknown</span>
                      : fmt(r.search_volume)}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(r.keyword_value)}</td>
                  <td style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{r.user_intent || '—'}</td>
                  <td style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{r.brand || '—'}</td>
                  <td>
                    <span title={prov.hint} style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.04em', color: prov.color, background: `${prov.color}1a`,
                      border: `1px solid ${prov.color}55`, padding: '1px 7px', borderRadius: 20 }}>
                      {prov.label}
                    </span>
                  </td>
                </tr>
              );
            })}
            {!rows.length && !loading && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
                No keywords match those filters.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {fmt(total)} keywords · page {page} of {fmt(pages)} · ordered by value, highest first
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn-secondary" disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - limit))}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 11px', fontSize: '0.8rem' }}>
            <ChevronLeft size={14} aria-hidden="true" /> Previous
          </button>
          <button className="btn-secondary" disabled={offset + limit >= total || loading}
            onClick={() => setOffset(offset + limit)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 11px', fontSize: '0.8rem' }}>
            Next <ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
