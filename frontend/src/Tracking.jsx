import { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, Trash2, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Globe, Link, X, Target } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

const API = (path, opts = {}) => {
  const token = localStorage.getItem('auth_token');
  return fetch(path, { ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
};

function hostname(url) {
  if (!url) return '';
  try {
    const u = /^https?:\/\//.test(url) ? url : 'https://' + url;
    return new URL(u).hostname.replace('www.', '');
  } catch { return url; }
}

function urlPath(url) {
  if (!url) return '';
  try { const p = new URL(url).pathname; return p === '/' ? '/ (homepage)' : p; } catch { return url; }
}

function timeAgo(isoStr) {
  if (!isoStr) return 'never';
  const diff = Math.floor((Date.now() - new Date(isoStr)) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function PositionBadge({ position }) {
  if (position == null) return (
    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>not ranking</span>
  );
  const color = position === 1 ? '#E20071' : position <= 3 ? '#f59e0b' : position <= 10 ? '#4ade80' : '#94a3b8';
  return (
    <span style={{
      fontWeight: 800, fontSize: '1.1rem', color,
      fontVariantNumeric: 'tabular-nums',
    }}>#{position}</span>
  );
}

function TrendIcon({ history }) {
  if (!history || history.length < 2) return <Minus size={14} color="#94a3b8" />;
  const prev = history[history.length - 2]?.position;
  const curr = history[history.length - 1]?.position;
  if (prev == null || curr == null) return <Minus size={14} color="#94a3b8" />;
  if (curr < prev) return <TrendingUp size={14} color="#4ade80" title="Improved" />;
  if (curr > prev) return <TrendingDown size={14} color="#f87171" title="Dropped" />;
  return <Minus size={14} color="#94a3b8" title="Stable" />;
}

function PositionChart({ history }) {
  if (!history || history.length < 2) return (
    <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
      Need at least 2 checks to show a chart.
    </div>
  );

  const data = history.map((r, i) => ({
    i,
    position: r.position,
    label: new Date(r.checked_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    fs: r.fs_holder_domain,
  }));

  const positions = data.map(d => d.position).filter(p => p != null);
  const minPos = Math.max(1, Math.min(...positions) - 1);
  const maxPos = Math.min(20, Math.max(...positions) + 2);

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <XAxis
          dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }}
          tickLine={false} axisLine={false}
          interval={Math.floor(data.length / 5)}
        />
        <YAxis
          domain={[minPos, maxPos]} reversed
          tick={{ fontSize: 10, fill: '#64748b' }}
          tickLine={false} axisLine={false}
          tickFormatter={v => `#${v}`}
        />
        <Tooltip
          contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: '0.78rem' }}
          labelStyle={{ color: '#94a3b8' }}
          formatter={(val, _, props) => [`#${val}`, 'Position']}
        />
        {positions.length > 0 && <ReferenceLine y={1} stroke="rgba(226,0,113,0.25)" strokeDasharray="4 3" />}
        <Line
          type="monotone" dataKey="position" stroke="#E20071" strokeWidth={2}
          dot={{ fill: '#E20071', r: 3, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: '#E20071' }}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function TrackedRow({ item, onDelete, onCheck }) {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory]   = useState(null);
  const [checking, setChecking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function loadHistory() {
    if (history) return;
    const res = await API(`/api/tracking/${item.id}/history`);
    const d = await res.json();
    setHistory(d.history || []);
  }

  async function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next) loadHistory();
  }

  async function handleCheck() {
    setChecking(true);
    await onCheck(item.id);
    setHistory(null); // force reload
    setChecking(false);
    if (expanded) loadHistory();
  }

  async function handleDelete() {
    setDeleting(true);
    await onDelete(item.id);
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.2s',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; setConfirmDelete(false); }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px' }}>
        {/* Position */}
        <div style={{ width: 52, textAlign: 'center', flexShrink: 0 }}>
          <PositionBadge position={item.position} />
        </div>

        {/* Keyword + target site + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
              {item.keyword}
            </span>
            {/* Which site we're targeting to rank */}
            {item.target_url ? (
              <span title={item.target_url} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary)', background: 'rgba(226,0,113,0.12)', border: '1px solid rgba(226,0,113,0.3)', borderRadius: 20, padding: '2px 9px', flexShrink: 0 }}>
                <Target size={11} aria-hidden="true" /> {hostname(item.target_url)}
              </span>
            ) : (
              <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontStyle: 'italic', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 20, padding: '2px 9px', flexShrink: 0 }}>
                no target site
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {item.target_url && item.position != null && item.ranking_url && (
              <span title={item.ranking_url} style={{ fontSize: '0.72rem', color: '#4ade80', display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
                <Link size={10} aria-hidden="true" /> ranking page: {urlPath(item.ranking_url)}
              </span>
            )}
            {item.location && item.location !== 'Global (No Geolocation)' && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Globe size={10} />{item.location}
              </span>
            )}
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              checked {timeAgo(item.last_checked)}
            </span>
          </div>
          {Array.isArray(item.top_domains) && item.top_domains.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 5 }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Top 3</span>
              {item.top_domains.slice(0, 3).map(t => {
                const mine = item.target_url && t.domain === hostname(item.target_url);
                return (
                  <span key={t.position} style={{
                    fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 4,
                    color: mine ? 'var(--primary)' : 'var(--text-muted)', fontWeight: mine ? 700 : 500,
                  }}>
                    <span style={{ fontSize: '0.62rem', opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>{t.position}.</span>{t.domain}{mine ? ' (us)' : ''}
                  </span>
                );
              })}
              {item.top_domains.length > 3 && (
                <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }} title={item.top_domains.slice(3).map(t => `${t.position}. ${t.domain}`).join('\n')}>
                  +{item.top_domains.length - 3} more (top 10 stored)
                </span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          <button onClick={handleExpand} title="History" aria-label="View history" aria-expanded={expanded} style={btnStyle}>
            {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
          </button>
          <button onClick={handleCheck} disabled={checking} title="Re-check now" aria-label="Re-check now" style={btnStyle}>
            <RefreshCw size={13} aria-hidden="true" style={{ animation: checking ? 'spin 1s linear infinite' : 'none' }} />
          </button>
          {confirmDelete ? (
            <button onClick={handleDelete} disabled={deleting} title="Confirm delete" aria-label="Confirm delete keyword"
              style={{ ...btnStyle, color: '#fff', background: 'rgba(248,113,113,0.9)', borderColor: 'rgba(248,113,113,0.9)', gap: 4, padding: '5px 9px', fontSize: '0.72rem' }}>
              <Trash2 size={13} aria-hidden="true" /> Confirm
            </button>
          ) : (
            <button onClick={() => setConfirmDelete(true)} disabled={deleting} title="Remove" aria-label="Delete keyword" style={{ ...btnStyle, color: '#f87171' }}>
              <Trash2 size={13} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '14px 16px' }}>
          {history === null ? (
            <div role="status" style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Loading…</div>
          ) : (
            <PositionChart history={history} />
          )}
        </div>
      )}
    </div>
  );
}

const btnStyle = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 6, padding: '5px 7px', cursor: 'pointer', color: 'var(--text-muted)',
  display: 'flex', alignItems: 'center', transition: 'background 0.15s',
};

function parseBulk(text) {
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const parts = l.split(/\s*(?:[,|]|\t)\s*/);
    return { keyword: (parts[0] || '').trim(), target_url: (parts[1] || '').trim() || null };
  }).filter(x => x.keyword);
}

function AddForm({ onAdded, onBulkAdded, onClose }) {
  const [mode,     setMode]     = useState('single');   // 'single' | 'bulk'
  const [keyword,  setKeyword]  = useState('');
  const [url,      setUrl]      = useState('');
  const [bulkText, setBulkText] = useState('');
  const [location, setLocation] = useState('Global (No Geolocation)');
  const [geoList,  setGeoList]  = useState(['Global (No Geolocation)']);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    fetch('/api/serp/geolocations').then(r => r.json())
      .then(d => { if (d.geolocations?.length) setGeoList(d.geolocations); })
      .catch(() => {});
  }, []);

  const bulkCount = mode === 'bulk' ? parseBulk(bulkText).length : 0;

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (mode === 'single') {
      if (!keyword.trim()) return;
      setLoading(true);
      try {
        const res = await API('/api/tracking', {
          method: 'POST',
          body: JSON.stringify({ keyword: keyword.trim(), target_url: url.trim() || null, location }),
        });
        if (!res.ok) throw new Error((await res.json()).detail || 'Failed');
        onAdded(await res.json());
      } catch (err) { setError(err.message); } finally { setLoading(false); }
    } else {
      const items = parseBulk(bulkText);
      if (!items.length) { setError('Add at least one keyword (one per line).'); return; }
      setLoading(true);
      try {
        const res = await API('/api/tracking/bulk', {
          method: 'POST',
          body: JSON.stringify({ items, location }),
        });
        if (!res.ok) throw new Error((await res.json()).detail || 'Failed');
        const data = await res.json();
        onBulkAdded(data.items || []);
      } catch (err) { setError(err.message); } finally { setLoading(false); }
    }
  }

  const tabStyle = active => active ? { padding: '5px 14px', fontSize: '0.8rem' } : {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'var(--text-muted)', padding: '5px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem',
  };

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(226,0,113,0.3)',
      borderRadius: 12, padding: '18px 20px', marginBottom: 4,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#fff' }}>Track keywords</span>
        <button onClick={onClose} aria-label="Close" style={{ ...btnStyle, padding: '3px 5px' }}><X size={13} aria-hidden="true" /></button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button type="button" onClick={() => setMode('single')} aria-pressed={mode === 'single'}
          className={mode === 'single' ? 'btn-primary' : ''} style={tabStyle(mode === 'single')}>Single</button>
        <button type="button" onClick={() => setMode('bulk')} aria-pressed={mode === 'bulk'}
          className={mode === 'bulk' ? 'btn-primary' : ''} style={tabStyle(mode === 'bulk')}>Bulk</button>
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {mode === 'single' ? (
          <>
            <input className="glass-input" placeholder="Keyword *" aria-label="Keyword" required value={keyword} onChange={e => setKeyword(e.target.value)} />
            <div>
              <input className="glass-input" type="url" style={{ width: '100%' }}
                placeholder="Target site to rank — e.g. https://netvasco.com.br/apostas/…"
                aria-label="Target site or page URL to rank"
                value={url} onChange={e => setUrl(e.target.value)} />
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: 4 }}>
                The site/page we want ranking — its position is tracked over time. Leave blank to only watch the Featured Snippet holder.
              </div>
            </div>
          </>
        ) : (
          <div>
            <textarea className="glass-input" rows={6} aria-label="Bulk keywords"
              placeholder={'One per line — keyword, target URL:\ncodigo betano, https://netvasco.com.br/apostas/codigo/codigo-betano/\napp brazino777, https://netvasco.com.br/apostas/app/brazino777-app/\nmelhores casas de apostas'}
              value={bulkText} onChange={e => setBulkText(e.target.value)}
              style={{ width: '100%', resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: '0.78rem', lineHeight: 1.5 }} />
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: 4 }}>
              One keyword per line; add an optional target URL after a comma. Up to 50 at once.{bulkCount > 0 && <strong style={{ color: 'var(--primary)' }}> {bulkCount} detected</strong>}
            </div>
          </div>
        )}
        <select className="glass-input glass-select" aria-label="Geolocation" value={location} onChange={e => setLocation(e.target.value)}>
          {geoList.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        {error && <div role="alert" style={{ fontSize: '0.78rem', color: '#f87171' }}>{error}</div>}
        <button type="submit" className="btn-primary" disabled={loading || (mode === 'bulk' && bulkCount === 0)} style={{ padding: '9px', fontSize: '0.84rem' }}>
          {loading
            ? (mode === 'bulk' ? `Checking ${bulkCount} live SERP${bulkCount !== 1 ? 's' : ''}…` : 'Checking live SERP…')
            : (mode === 'bulk' ? `Add & Check ${bulkCount || ''} keyword${bulkCount !== 1 ? 's' : ''}`.replace('  ', ' ') : 'Add & Check Now')}
        </button>
      </form>
    </div>
  );
}

export default function Tracking() {
  const [items,      setItems]    = useState([]);
  const [loading,    setLoading]  = useState(true);
  const [error,      setError]    = useState('');
  const [showForm,   setShowForm] = useState(false);
  const [siteFilter, setSiteFilter] = useState('');   // '' = all, '__none__' = no target site

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await API('/api/tracking');
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      setItems(d.tracked || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCheck(id) {
    const res = await API(`/api/tracking/${id}/check`, { method: 'POST' });
    if (!res.ok) return;
    const ranking = await res.json();
    setItems(prev => prev.map(it =>
      it.id === id ? { ...it, ...ranking, last_checked: new Date().toISOString() } : it
    ));
  }

  async function handleDelete(id) {
    await API(`/api/tracking/${id}`, { method: 'DELETE' });
    setItems(prev => prev.filter(it => it.id !== id));
  }

  function handleAdded(data) {
    setItems(prev => [{
      id: data.id,
      keyword: data.keyword,
      target_url: data.target_url,
      location: data.location,
      position: data.position,
      ranking_url: data.ranking_url,
      fs_holder_domain: data.fs_holder_domain,
      last_checked: new Date().toISOString(),
    }, ...prev]);
    setShowForm(false);
  }

  function handleBulkAdded(added) {
    const now = new Date().toISOString();
    const rows = (added || []).map(d => ({
      id: d.id, keyword: d.keyword, target_url: d.target_url, location: d.location,
      position: d.position, ranking_url: d.ranking_url, fs_holder_domain: d.fs_holder_domain,
      top_domains: d.top_domains, last_checked: now,
    }));
    setItems(prev => [...rows, ...prev]);
    setShowForm(false);
  }

  // Group tracked keywords by target site for the filter.
  const siteCounts = {};
  let noneCount = 0;
  items.forEach(i => {
    const h = hostname(i.target_url);
    if (h) siteCounts[h] = (siteCounts[h] || 0) + 1;
    else noneCount++;
  });
  const siteOptions = Object.keys(siteCounts).sort();
  const showFilter = siteOptions.length > 1 || (siteOptions.length >= 1 && noneCount > 0);
  const shown = items.filter(i => {
    if (!siteFilter) return true;
    if (siteFilter === '__none__') return !i.target_url;
    return hostname(i.target_url) === siteFilter;
  });

  // Per-site performance summary (only when filtered to a specific site).
  const siteSummary = (siteFilter && siteFilter !== '__none__' && shown.length) ? (() => {
    const ranked = shown.filter(i => i.position != null);
    return {
      avg: ranked.length ? Math.round(ranked.reduce((s, i) => s + i.position, 0) / ranked.length * 10) / 10 : null,
      top3: shown.filter(i => i.position != null && i.position <= 3).length,
      top10: shown.filter(i => i.position != null && i.position <= 10).length,
      notRanking: shown.filter(i => i.position == null).length,
    };
  })() : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {siteFilter ? `${shown.length} of ${items.length}` : items.length} keyword{items.length !== 1 ? 's' : ''} tracked
          </div>
          {showFilter && (
            <select className="glass-input glass-select" aria-label="Filter by target site"
              value={siteFilter} onChange={e => setSiteFilter(e.target.value)}
              style={{ fontSize: '0.8rem', padding: '5px 30px 5px 10px', width: 'auto' }}>
              <option value="">All sites ({items.length})</option>
              {siteOptions.map(s => <option key={s} value={s}>{s} ({siteCounts[s]})</option>)}
              {noneCount > 0 && <option value="__none__">No target site ({noneCount})</option>}
            </select>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} aria-label="Refresh rankings" style={btnStyle}>
            <RefreshCw size={13} aria-hidden="true" />
          </button>
          <button onClick={() => setShowForm(v => !v)} className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: '0.82rem' }}>
            <Plus size={14} /> Track keyword
          </button>
        </div>
      </div>

      {showForm && <AddForm onAdded={handleAdded} onBulkAdded={handleBulkAdded} onClose={() => setShowForm(false)} />}

      {siteSummary && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', padding: '11px 16px', background: 'rgba(226,0,113,0.06)', border: '1px solid rgba(226,0,113,0.18)', borderRadius: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700, fontSize: '0.82rem', color: '#fff' }}>
            <Target size={13} color="var(--primary)" aria-hidden="true" /> {siteFilter}
          </span>
          {[
            ['Avg. position', siteSummary.avg != null ? `#${siteSummary.avg}` : '—'],
            ['Top 3', siteSummary.top3],
            ['Top 10', siteSummary.top10],
            ['Not ranking', siteSummary.notRanking],
          ].map(([label, val]) => (
            <span key={label} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
              <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{val}</span>
            </span>
          ))}
        </div>
      )}

      {error && (
        <div role="alert" style={{ padding: '10px 14px', borderRadius: 8, fontSize: '0.82rem', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171' }}>
          {error}
        </div>
      )}

      {loading && (
        <div role="status" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading…</div>
      )}

      {!loading && !error && items.length === 0 && !showForm && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          <TrendingUp size={28} style={{ marginBottom: 10, opacity: 0.3 }} />
          <div>No keywords tracked yet.</div>
          <div style={{ fontSize: '0.78rem', marginTop: 4, opacity: 0.6 }}>
            Add keywords to monitor their Featured Snippet position over time.
          </div>
        </div>
      )}

      {!loading && items.length > 0 && shown.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          No keywords for this site.{' '}
          <button onClick={() => setSiteFilter('')} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}>Show all</button>
        </div>
      )}

      {!loading && shown.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map(item => (
            <TrackedRow key={item.id} item={item} onDelete={handleDelete} onCheck={handleCheck} />
          ))}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
