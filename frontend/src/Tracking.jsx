import { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, Trash2, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Globe, Link, X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

const API = (path, opts = {}) => {
  const token = localStorage.getItem('auth_token');
  return fetch(path, { ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
};

function hostname(url) {
  if (!url) return '';
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
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

        {/* Keyword + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.keyword}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {item.target_url && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Link size={10} />{hostname(item.target_url)}
              </span>
            )}
            {item.location && item.location !== 'Global (No Geolocation)' && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Globe size={10} />{item.location}
              </span>
            )}
            {item.fs_holder_domain && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                FS: <span style={{ color: '#E20071' }}>{item.fs_holder_domain}</span>
              </span>
            )}
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              checked {timeAgo(item.last_checked)}
            </span>
          </div>
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

function AddForm({ onAdded, onClose }) {
  const [keyword,  setKeyword]  = useState('');
  const [url,      setUrl]      = useState('');
  const [location, setLocation] = useState('Global (No Geolocation)');
  const [geoList,  setGeoList]  = useState(['Global (No Geolocation)']);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    fetch('/api/serp/geolocations').then(r => r.json())
      .then(d => { if (d.geolocations?.length) setGeoList(d.geolocations); })
      .catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (!keyword.trim()) return;
    setLoading(true); setError('');
    try {
      const res = await API('/api/tracking', {
        method: 'POST',
        body: JSON.stringify({ keyword: keyword.trim(), target_url: url.trim() || null, location }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed');
      const data = await res.json();
      onAdded(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(226,0,113,0.3)',
      borderRadius: 12, padding: '18px 20px', marginBottom: 4,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#fff' }}>Track a keyword</span>
        <button onClick={onClose} aria-label="Close" style={{ ...btnStyle, padding: '3px 5px' }}><X size={13} aria-hidden="true" /></button>
      </div>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input className="glass-input" placeholder="Keyword *" aria-label="Keyword" required value={keyword} onChange={e => setKeyword(e.target.value)} />
        <input className="glass-input" placeholder="Your URL (optional)" aria-label="Your URL (optional)" value={url} onChange={e => setUrl(e.target.value)} />
        <select className="glass-input glass-select" aria-label="Geolocation" value={location} onChange={e => setLocation(e.target.value)}>
          {geoList.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        {error && <div style={{ fontSize: '0.78rem', color: '#f87171' }}>{error}</div>}
        <button type="submit" className="btn-primary" disabled={loading} style={{ padding: '9px', fontSize: '0.84rem' }}>
          {loading ? 'Checking live SERP…' : 'Add & Check Now'}
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
      fs_holder_domain: data.fs_holder_domain,
      last_checked: new Date().toISOString(),
    }, ...prev]);
    setShowForm(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          {items.length} keyword{items.length !== 1 ? 's' : ''} tracked
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

      {showForm && <AddForm onAdded={handleAdded} onClose={() => setShowForm(false)} />}

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

      {!loading && items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(item => (
            <TrackedRow key={item.id} item={item} onDelete={handleDelete} onCheck={handleCheck} />
          ))}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
