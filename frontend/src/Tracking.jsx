import { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, Trash2, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Globe, Link, X, Target, ArrowLeft, Folder } from 'lucide-react';
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

const btnStyle = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 6, padding: '5px 7px', cursor: 'pointer', color: 'var(--text-muted)',
  display: 'flex', alignItems: 'center', transition: 'background 0.15s',
};

// Domain favicon via Google's service, with a Globe fallback if it fails to load.
function Favicon({ domain, size = 16, style }) {
  const [failed, setFailed] = useState(false);
  if (!domain || failed) return <Globe size={size} color="var(--primary)" aria-hidden="true" style={{ flexShrink: 0, ...style }} />;
  return (
    <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
      width={size} height={size} alt="" loading="lazy" onError={() => setFailed(true)}
      style={{ borderRadius: 3, flexShrink: 0, ...style }} />
  );
}

function PositionBadge({ position }) {
  if (position == null) return (
    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>not ranking</span>
  );
  const color = position === 1 ? '#E20071' : position <= 3 ? '#f59e0b' : position <= 10 ? '#4ade80' : '#94a3b8';
  return (
    <span style={{ fontWeight: 800, fontSize: '1.1rem', color, fontVariantNumeric: 'tabular-nums' }}>#{position}</span>
  );
}

const SERP_PALETTE = ['#60a5fa', '#f59e0b', '#a78bfa', '#4ade80', '#f472b6', '#22d3ee', '#fb923c'];

function PositionChart({ history, targetDomain }) {
  if (!history || history.length < 2) return (
    <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
      Need at least 2 checks to show a chart.
    </div>
  );

  // Rank domains that have appeared in the top 10 across snapshots (frequency, then best position).
  const freq = {}, best = {};
  history.forEach(s => (s.top_domains || []).forEach(t => {
    if (!t.domain) return;
    freq[t.domain] = (freq[t.domain] || 0) + 1;
    best[t.domain] = Math.min(best[t.domain] ?? 99, t.position);
  }));
  const hasSerp = Object.keys(freq).length > 0;

  // Fallback for old snapshots without top_domains: single line of our own position.
  if (!hasSerp) {
    const data = history.map(r => ({ label: new Date(r.checked_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), position: r.position }));
    const positions = data.map(d => d.position).filter(p => p != null);
    return (
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} interval={Math.floor(data.length / 5)} />
          <YAxis domain={[Math.max(1, Math.min(...positions) - 1), Math.min(20, Math.max(...positions) + 2)]} reversed tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={v => `#${v}`} />
          <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: '0.78rem' }} labelStyle={{ color: '#94a3b8' }} formatter={v => [`#${v}`, 'Position']} />
          <Line type="monotone" dataKey="position" stroke="#E20071" strokeWidth={2} dot={{ fill: '#E20071', r: 3 }} activeDot={{ r: 5 }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  const tgt = targetDomain && freq[targetDomain] ? targetDomain : null;
  const ranked = Object.keys(freq).sort((a, b) => (freq[b] - freq[a]) || (best[a] - best[b]));
  const selected = [];
  if (tgt) selected.push(tgt);
  for (const d of ranked) { if (selected.length >= 6) break; if (d !== tgt) selected.push(d); }

  const colors = {};
  let ci = 0;
  selected.forEach(d => { colors[d] = d === tgt ? '#E20071' : SERP_PALETTE[ci++ % SERP_PALETTE.length]; });

  const data = history.map(s => {
    const row = { label: new Date(s.checked_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) };
    const map = {};
    (s.top_domains || []).forEach(t => { map[t.domain] = t.position; });
    selected.forEach(d => { row[d] = map[d] ?? null; });
    return row;
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        {selected.map(d => (
          <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: d === tgt ? '#fff' : 'var(--text-muted)', fontWeight: d === tgt ? 700 : 500 }}>
            <span style={{ width: 11, height: 3, background: colors[d], borderRadius: 2, display: 'inline-block' }} />{d}{d === tgt ? ' (us)' : ''}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: -20 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} interval={Math.floor(data.length / 6)} />
          <YAxis domain={[1, 10]} reversed ticks={[1, 3, 5, 10]} tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={v => `#${v}`} allowDecimals={false} />
          <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: '0.76rem' }} labelStyle={{ color: '#94a3b8' }} formatter={(v, name) => [`#${v}`, name]} />
          {selected.map(d => (
            <Line key={d} type="monotone" dataKey={d} stroke={colors[d]} strokeWidth={d === tgt ? 2.5 : 1.5}
              dot={{ fill: colors[d], r: d === tgt ? 3 : 2, strokeWidth: 0 }} activeDot={{ r: 4 }} connectNulls={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div style={{ fontSize: '0.64rem', color: 'var(--text-dim)', marginTop: 6, textAlign: 'center' }}>
        Top domains in the SERP over time — a gap means the domain dropped out of the top 10 that day.
      </div>
    </div>
  );
}

const HISTORY_METRICS = {
  avg_position: { label: 'Avg. position', color: '#E20071', reversed: true },
  visibility:   { label: 'Visibility %', color: '#4ade80', reversed: false },
  top10:        { label: 'In top 10',    color: '#60a5fa', reversed: false },
  top3:         { label: 'In top 3',     color: '#f59e0b', reversed: false },
};

function ProjectHistoryChart({ projectId }) {
  const [data, setData]     = useState(null);
  const [metric, setMetric] = useState('avg_position');

  useEffect(() => {
    setData(null);
    API(`/api/tracking/projects/${projectId}/history?days=90`)
      .then(r => r.json()).then(d => setData(d.history || [])).catch(() => setData([]));
  }, [projectId]);

  if (data === null) return <div role="status" style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Loading history…</div>;
  if (data.length < 2) return (
    <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
      Trends appear after a couple of daily checks — history is building.
    </div>
  );

  const m = HISTORY_METRICS[metric];
  const chartData = data.map(d => ({
    label: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    value: d[metric],
  })).filter(d => d.value != null);
  const vals = chartData.map(d => d.value);
  const domain = metric === 'avg_position'
    ? [Math.max(1, Math.floor(Math.min(...vals)) - 1), Math.ceil(Math.max(...vals)) + 1]
    : metric === 'visibility' ? [0, 100] : [0, Math.max(...vals) + 1];

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {Object.entries(HISTORY_METRICS).map(([k, mm]) => (
          <button key={k} type="button" onClick={() => setMetric(k)} aria-pressed={metric === k}
            style={metric === k
              ? { background: 'rgba(226,0,113,0.15)', border: '1px solid rgba(226,0,113,0.4)', color: '#fff', padding: '4px 11px', borderRadius: 7, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }
              : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', padding: '4px 11px', borderRadius: 7, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
            {mm.label}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData} margin={{ top: 8, right: 10, bottom: 0, left: -18 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} interval={Math.floor(chartData.length / 6)} />
          <YAxis domain={domain} reversed={m.reversed} tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false}
            tickFormatter={v => metric === 'avg_position' ? `#${v}` : (metric === 'visibility' ? `${v}%` : v)} allowDecimals={false} />
          <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: '0.78rem' }}
            labelStyle={{ color: '#94a3b8' }}
            formatter={v => [metric === 'avg_position' ? `#${v}` : (metric === 'visibility' ? `${v}%` : v), m.label]} />
          <Line type="monotone" dataKey="value" stroke={m.color} strokeWidth={2}
            dot={{ fill: m.color, r: 2.5, strokeWidth: 0 }} activeDot={{ r: 5, fill: m.color }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function CompetitorChart({ projectId }) {
  const [data, setData]     = useState(null);
  const [metric, setMetric] = useState('pos');   // 'pos' | 'vis'

  useEffect(() => {
    setData(null);
    API(`/api/tracking/projects/${projectId}/competitors?days=90`)
      .then(r => r.json()).then(setData).catch(() => setData({ domains: [], history: [] }));
  }, [projectId]);

  if (data === null) return <div role="status" style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Loading competitors…</div>;
  const domains = data.domains || [];
  const history = data.history || [];
  if (domains.length === 0 || history.length < 2) return (
    <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
      Competitor trends appear once a few daily checks have accrued for this project's keywords.
    </div>
  );

  const colors = {};
  let ci = 0;
  domains.forEach(d => { colors[d.domain] = d.is_target ? '#E20071' : SERP_PALETTE[ci++ % SERP_PALETTE.length]; });
  const chartData = history.map(h => {
    const row = { label: new Date(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) };
    domains.forEach(d => { const v = h.values[d.domain]; row[d.domain] = v ? (metric === 'pos' ? v.pos : v.vis) : null; });
    return row;
  });
  const reversed = metric === 'pos';
  const fmt = v => metric === 'pos' ? `#${v}` : `${v}%`;

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {[['pos', 'Avg. position'], ['vis', 'Visibility %']].map(([k, lbl]) => (
          <button key={k} type="button" onClick={() => setMetric(k)} aria-pressed={metric === k}
            style={metric === k
              ? { background: 'rgba(226,0,113,0.15)', border: '1px solid rgba(226,0,113,0.4)', color: '#fff', padding: '4px 11px', borderRadius: 7, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }
              : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', padding: '4px 11px', borderRadius: 7, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
            {lbl}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
        {domains.map(d => (
          <span key={d.domain} title={`${d.coverage} top-10 appearances`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: d.is_target ? '#fff' : 'var(--text-muted)', fontWeight: d.is_target ? 700 : 500 }}>
            <span style={{ width: 11, height: 3, background: colors[d.domain], borderRadius: 2, display: 'inline-block' }} />{d.domain}{d.is_target ? ' (us)' : ''}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={210}>
        <LineChart data={chartData} margin={{ top: 8, right: 10, bottom: 0, left: -18 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} interval={Math.floor(chartData.length / 6)} />
          <YAxis domain={reversed ? [1, 10] : [0, 100]} reversed={reversed} ticks={reversed ? [1, 3, 5, 10] : undefined}
            tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={fmt} allowDecimals={false} />
          <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: '0.76rem' }} labelStyle={{ color: '#94a3b8' }} formatter={(v, name) => [fmt(v), name]} />
          {domains.map(d => (
            <Line key={d.domain} type="monotone" dataKey={d.domain} stroke={colors[d.domain]} strokeWidth={d.is_target ? 2.5 : 1.5}
              dot={{ fill: colors[d.domain], r: d.is_target ? 3 : 2, strokeWidth: 0 }} activeDot={{ r: 4 }} connectNulls={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div style={{ fontSize: '0.64rem', color: 'var(--text-dim)', marginTop: 6, textAlign: 'center' }}>
        {metric === 'pos' ? 'Average position across this project’s keywords' : '% of the project’s keywords each domain ranks in the top 10'} — auto-detected top rivals.
      </div>
    </div>
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
  async function handleExpand() { const next = !expanded; setExpanded(next); if (next) loadHistory(); }
  async function handleCheck() {
    setChecking(true); await onCheck(item.id); setHistory(null); setChecking(false); if (expanded) loadHistory();
  }
  async function handleDelete() { setDeleting(true); await onDelete(item.id); }

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.2s' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; setConfirmDelete(false); }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px' }}>
        <div style={{ width: 52, textAlign: 'center', flexShrink: 0 }}>
          <PositionBadge position={item.position} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
              {item.keyword}
            </span>
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
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>checked {timeAgo(item.last_checked)}</span>
          </div>
          {Array.isArray(item.top_domains) && item.top_domains.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 5 }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Top 3</span>
              {item.top_domains.slice(0, 3).map(t => {
                const mine = item.target_url && t.domain === hostname(item.target_url);
                return (
                  <span key={t.position} style={{ fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 4, color: mine ? 'var(--primary)' : 'var(--text-muted)', fontWeight: mine ? 700 : 500 }}>
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
          {history === null
            ? <div role="status" style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Loading…</div>
            : <PositionChart history={history} targetDomain={hostname(item.target_url)} />}
        </div>
      )}
    </div>
  );
}

function parseBulk(text) {
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const parts = l.split(/\s*(?:[,|]|\t)\s*/);
    return { keyword: (parts[0] || '').trim(), target_url: (parts[1] || '').trim() || null };
  }).filter(x => x.keyword);
}

// ── Add keywords (scoped to a project) ────────────────────────────────────────
function AddForm({ project, onSaved, onClose }) {
  const [mode,     setMode]     = useState('single');
  const [keyword,  setKeyword]  = useState('');
  const [url,      setUrl]      = useState('');
  const [bulkText, setBulkText] = useState('');
  const [location, setLocation] = useState(project?.location || 'Global (No Geolocation)');
  const [geoList,  setGeoList]  = useState(['Global (No Geolocation)']);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    fetch('/api/serp/geolocations').then(r => r.json())
      .then(d => { if (d.geolocations?.length) setGeoList(d.geolocations); }).catch(() => {});
  }, []);

  const bulkCount = mode === 'bulk' ? parseBulk(bulkText).length : 0;

  async function submit(e) {
    e.preventDefault();
    setError('');
    const projectField = project ? { project_id: project.id } : {};
    if (mode === 'single') {
      if (!keyword.trim()) return;
      setLoading(true);
      try {
        const res = await API('/api/tracking', {
          method: 'POST',
          body: JSON.stringify({ keyword: keyword.trim(), target_url: url.trim() || null, location, ...projectField }),
        });
        if (!res.ok) throw new Error((await res.json()).detail || 'Failed');
        await res.json(); onSaved();
      } catch (err) { setError(err.message); } finally { setLoading(false); }
    } else {
      const items = parseBulk(bulkText);
      if (!items.length) { setError('Add at least one keyword (one per line).'); return; }
      setLoading(true);
      try {
        const res = await API('/api/tracking/bulk', {
          method: 'POST',
          body: JSON.stringify({ items, location, ...projectField }),
        });
        if (!res.ok) throw new Error((await res.json()).detail || 'Failed');
        await res.json(); onSaved();
      } catch (err) { setError(err.message); } finally { setLoading(false); }
    }
  }

  const tabStyle = active => active ? { padding: '5px 14px', fontSize: '0.8rem' } : {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'var(--text-muted)', padding: '5px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem',
  };
  const urlPlaceholder = project
    ? `Optional exact page — defaults to ${project.domain}`
    : 'Target site to rank — e.g. https://netvasco.com.br/apostas/…';

  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(226,0,113,0.3)', borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#fff' }}>
          Add keywords{project ? ` to ${project.domain}` : ''}
        </span>
        <button onClick={onClose} aria-label="Close" style={{ ...btnStyle, padding: '3px 5px' }}><X size={13} aria-hidden="true" /></button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button type="button" onClick={() => setMode('single')} aria-pressed={mode === 'single'} className={mode === 'single' ? 'btn-primary' : ''} style={tabStyle(mode === 'single')}>Single</button>
        <button type="button" onClick={() => setMode('bulk')} aria-pressed={mode === 'bulk'} className={mode === 'bulk' ? 'btn-primary' : ''} style={tabStyle(mode === 'bulk')}>Bulk</button>
      </div>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {mode === 'single' ? (
          <>
            <input className="glass-input" placeholder="Keyword *" aria-label="Keyword" required value={keyword} onChange={e => setKeyword(e.target.value)} />
            <div>
              <input className="glass-input" type="url" style={{ width: '100%' }} placeholder={urlPlaceholder}
                aria-label="Target page URL" value={url} onChange={e => setUrl(e.target.value)} />
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: 4 }}>
                {project
                  ? `Tracks whether ${project.domain} ranks for this keyword. Add a specific URL to track an exact page.`
                  : 'The site/page we want ranking — its position is tracked over time.'}
              </div>
            </div>
          </>
        ) : (
          <div>
            <textarea className="glass-input" rows={6} aria-label="Bulk keywords"
              placeholder={project
                ? 'One keyword per line (optional URL after a comma):\ncodigo betano\napp brazino777, https://…/app/brazino777-app/\nmelhores casas de apostas'
                : 'One per line — keyword, target URL:\ncodigo betano, https://netvasco.com.br/apostas/codigo/codigo-betano/\nmelhores casas de apostas'}
              value={bulkText} onChange={e => setBulkText(e.target.value)}
              style={{ width: '100%', resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: '0.78rem', lineHeight: 1.5 }} />
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: 4 }}>
              One keyword per line{project ? ` (all target ${project.domain} unless a URL is given)` : '; optional target URL after a comma'}. Up to 50 at once.{bulkCount > 0 && <strong style={{ color: 'var(--primary)' }}> {bulkCount} detected</strong>}
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

// ── Register a domain (project) ───────────────────────────────────────────────
function RegisterForm({ onSaved, onClose }) {
  const [domain, setDomain]     = useState('');
  const [name, setName]         = useState('');
  const [location, setLocation] = useState('Global (No Geolocation)');
  const [geoList, setGeoList]   = useState(['Global (No Geolocation)']);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    fetch('/api/serp/geolocations').then(r => r.json())
      .then(d => { if (d.geolocations?.length) setGeoList(d.geolocations); }).catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (!domain.trim()) return;
    setLoading(true); setError('');
    try {
      const res = await API('/api/tracking/projects', {
        method: 'POST',
        body: JSON.stringify({ domain: domain.trim(), name: name.trim() || null, location }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed');
      onSaved();
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(226,0,113,0.3)', borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#fff' }}>Register a project (domain)</span>
        <button onClick={onClose} aria-label="Close" style={{ ...btnStyle, padding: '3px 5px' }}><X size={13} aria-hidden="true" /></button>
      </div>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input className="glass-input" placeholder="Domain * — e.g. netvasco.com.br" aria-label="Domain" required value={domain} onChange={e => setDomain(e.target.value)} />
        <input className="glass-input" placeholder="Display name (optional)" aria-label="Project name" value={name} onChange={e => setName(e.target.value)} />
        <select className="glass-input glass-select" aria-label="Default location" value={location} onChange={e => setLocation(e.target.value)}>
          {geoList.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        {error && <div role="alert" style={{ fontSize: '0.78rem', color: '#f87171' }}>{error}</div>}
        <button type="submit" className="btn-primary" disabled={loading} style={{ padding: '9px', fontSize: '0.84rem' }}>
          {loading ? 'Creating…' : 'Create project'}
        </button>
      </form>
    </div>
  );
}

function Kpi({ label, value, color }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: '1rem', fontWeight: 800, color: color || '#fff', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </span>
  );
}

function ProjectCard({ project, onOpen, onDelete }) {
  const [confirm, setConfirm] = useState(false);
  const vis = project.visibility || 0;
  const visColor = vis >= 60 ? '#4ade80' : vis >= 30 ? '#f59e0b' : '#f87171';
  return (
    <div className="glass-panel" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.2s' }}
      role="button" tabIndex={0} onClick={() => onOpen(project)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(project); } }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(226,0,113,0.4)'}
      onMouseLeave={e => { e.currentTarget.style.borderColor = ''; setConfirm(false); }}>
      <div style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Favicon domain={project.domain} size={18} />
              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.domain}</span>
            </div>
            {project.name && project.name !== project.domain && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{project.name}</div>
            )}
          </div>
          {confirm ? (
            <button onClick={e => { e.stopPropagation(); onDelete(project.id); }} aria-label="Confirm delete project"
              style={{ ...btnStyle, color: '#fff', background: 'rgba(248,113,113,0.9)', borderColor: 'rgba(248,113,113,0.9)', fontSize: '0.7rem', gap: 4, padding: '4px 8px', flexShrink: 0 }}>
              <Trash2 size={12} aria-hidden="true" /> Delete
            </button>
          ) : (
            <button onClick={e => { e.stopPropagation(); setConfirm(true); }} aria-label="Delete project"
              style={{ ...btnStyle, color: '#f87171', flexShrink: 0 }}><Trash2 size={13} aria-hidden="true" /></button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <Kpi label="Keywords" value={project.keyword_count} />
          <Kpi label="Avg. pos" value={project.avg_position != null ? `#${project.avg_position}` : '—'} />
          <Kpi label="Top 3" value={project.top3} color={project.top3 > 0 ? '#4ade80' : undefined} />
          <Kpi label="Top 10" value={project.top10} />
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            <span>Visibility (top 10)</span><span style={{ color: visColor, fontWeight: 700 }}>{vis}%</span>
          </div>
          <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${vis}%`, background: visColor, borderRadius: 3 }} />
          </div>
        </div>
      </div>
      <div style={{ padding: '8px 18px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '0.68rem', color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between' }}>
        <span>checked {timeAgo(project.last_checked)}</span>
        <span style={{ color: 'var(--primary)', fontWeight: 600 }}>Open →</span>
      </div>
    </div>
  );
}

export default function Tracking() {
  const [projects, setProjects] = useState([]);
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [activeId, setActiveId] = useState(null);      // project id, '__none__', or null (overview)
  const [showForm, setShowForm] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [pr, kr] = await Promise.all([API('/api/tracking/projects'), API('/api/tracking')]);
      if (!pr.ok) throw new Error(await pr.text());
      if (!kr.ok) throw new Error(await kr.text());
      setProjects((await pr.json()).projects || []);
      setItems((await kr.json()).tracked || []);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCheck(id) {
    const res = await API(`/api/tracking/${id}/check`, { method: 'POST' });
    if (!res.ok) return;
    const ranking = await res.json();
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...ranking, last_checked: new Date().toISOString() } : it));
  }
  async function handleDelete(id) {
    await API(`/api/tracking/${id}`, { method: 'DELETE' });
    setItems(prev => prev.filter(it => it.id !== id));
  }
  async function handleDeleteProject(id) {
    await API(`/api/tracking/projects/${id}`, { method: 'DELETE' });
    if (activeId === id) setActiveId(null);
    load();
  }
  function afterSave() { setShowForm(false); setShowRegister(false); load(); }

  // Unassigned keywords (no project) become a virtual card.
  const unassigned = items.filter(i => !i.project_id);

  const activeProject = activeId && activeId !== '__none__' ? projects.find(p => p.id === activeId) : null;
  const detailItems = activeId
    ? items.filter(i => activeId === '__none__' ? !i.project_id : i.project_id === activeId)
    : [];

  // Client-side KPIs for the detail header (fresh after re-checks).
  const detailSummary = activeId && detailItems.length ? (() => {
    const ranked = detailItems.filter(i => i.position != null);
    return {
      avg: ranked.length ? Math.round(ranked.reduce((s, i) => s + i.position, 0) / ranked.length * 10) / 10 : null,
      top3: detailItems.filter(i => i.position != null && i.position <= 3).length,
      top10: detailItems.filter(i => i.position != null && i.position <= 10).length,
      notRanking: detailItems.filter(i => i.position == null).length,
    };
  })() : null;

  const spin = <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>;

  // ── Project detail view ─────────────────────────────────────────────────────
  if (activeId) {
    const label = activeProject ? activeProject.domain : 'Keywords without a target site';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => { setActiveId(null); setShowForm(false); }} aria-label="Back to projects" style={btnStyle}><ArrowLeft size={15} aria-hidden="true" /></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {activeProject ? <Favicon domain={activeProject.domain} size={20} /> : <Globe size={18} color="var(--primary)" aria-hidden="true" />}
              <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#fff' }}>{label}</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>· {detailItems.length} keyword{detailItems.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          {activeProject && (
            <button onClick={() => setShowForm(v => !v)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: '0.82rem' }}>
              <Plus size={14} /> Add keyword
            </button>
          )}
        </div>

        {detailSummary && (
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center', padding: '13px 18px', background: 'rgba(226,0,113,0.06)', border: '1px solid rgba(226,0,113,0.18)', borderRadius: 10 }}>
            <Kpi label="Avg. position" value={detailSummary.avg != null ? `#${detailSummary.avg}` : '—'} />
            <Kpi label="Top 3" value={detailSummary.top3} color="#4ade80" />
            <Kpi label="Top 10" value={detailSummary.top10} />
            <Kpi label="Not ranking" value={detailSummary.notRanking} color="#f87171" />
          </div>
        )}

        {activeProject && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
            <div className="glass-panel">
              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: 4 }}>Project dynamics · 90 days</div>
              <ProjectHistoryChart projectId={activeProject.id} />
            </div>
            <div className="glass-panel">
              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: 4 }}>Competitors · 90 days</div>
              <CompetitorChart projectId={activeProject.id} />
            </div>
          </div>
        )}

        {showForm && activeProject && <AddForm project={activeProject} onSaved={afterSave} onClose={() => setShowForm(false)} />}

        {detailItems.length === 0 && !showForm && (
          <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            <TrendingUp size={28} style={{ marginBottom: 10, opacity: 0.3 }} />
            <div>No keywords in this project yet.</div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {detailItems.map(item => <TrackedRow key={item.id} item={item} onDelete={handleDelete} onCheck={handleCheck} />)}
        </div>
        {spin}
      </div>
    );
  }

  // ── Projects overview ───────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          {projects.length} project{projects.length !== 1 ? 's' : ''} · {items.length} keyword{items.length !== 1 ? 's' : ''}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} aria-label="Refresh" style={btnStyle}><RefreshCw size={13} aria-hidden="true" /></button>
          <button onClick={() => setShowRegister(v => !v)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: '0.82rem' }}>
            <Plus size={14} /> Register domain
          </button>
        </div>
      </div>

      {showRegister && <RegisterForm onSaved={afterSave} onClose={() => setShowRegister(false)} />}

      {error && (
        <div role="alert" style={{ padding: '10px 14px', borderRadius: 8, fontSize: '0.82rem', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171' }}>{error}</div>
      )}
      {loading && <div role="status" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading…</div>}

      {!loading && !error && projects.length === 0 && unassigned.length === 0 && !showRegister && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          <Folder size={28} style={{ marginBottom: 10, opacity: 0.3 }} />
          <div>No projects yet.</div>
          <div style={{ fontSize: '0.78rem', marginTop: 4, opacity: 0.6 }}>Register a domain to start tracking its keyword rankings.</div>
        </div>
      )}

      {!loading && (projects.length > 0 || unassigned.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {projects.map(p => <ProjectCard key={p.id} project={p} onOpen={pr => setActiveId(pr.id)} onDelete={handleDeleteProject} />)}
          {unassigned.length > 0 && (
            <div className="glass-panel" style={{ padding: '16px 18px', cursor: 'pointer' }}
              role="button" tabIndex={0} onClick={() => setActiveId('__none__')}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveId('__none__'); } }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                <Folder size={15} color="var(--text-muted)" aria-hidden="true" />
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fff' }}>Unassigned</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {unassigned.length} keyword{unassigned.length !== 1 ? 's' : ''} without a target site.
              </div>
              <div style={{ marginTop: 10, fontSize: '0.68rem', color: 'var(--primary)', fontWeight: 600 }}>Open →</div>
            </div>
          )}
        </div>
      )}
      {spin}
    </div>
  );
}
