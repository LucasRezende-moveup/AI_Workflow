import { useState, useEffect, useCallback } from 'react';
import { Clock, Search, Target, RefreshCw, ChevronDown, ChevronUp, MapPin, Link } from 'lucide-react';

const TOOL_META = {
  fs_stealer:    { label: 'FS Stealer',    color: '#E20071', bg: 'rgba(226,0,113,0.12)' },
  serp_analyzer: { label: 'SERP Analyzer', color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
  seo_health:    { label: 'SEO Health',    color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
};

const ALL_TOOLS = [
  { value: '',              label: 'All tools' },
  { value: 'fs_stealer',    label: 'FS Stealer' },
  { value: 'serp_analyzer', label: 'SERP Analyzer' },
  { value: 'seo_health',    label: 'SEO Health' },
];

function ToolBadge({ tool }) {
  const m = TOOL_META[tool] || { label: tool, color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' };
  return (
    <span style={{
      fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 4,
      color: m.color, background: m.bg, border: `1px solid ${m.color}33`,
      textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>
      {m.label}
    </span>
  );
}

function timeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = Math.floor((Date.now() - new Date(isoStr)) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function RunCard({ run, onExpand, expanded }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10, padding: '14px 16px', transition: 'border-color 0.2s',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <ToolBadge tool={run.tool} />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{timeAgo(run.created_at)}</span>
          </div>

          <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#fff', marginBottom: 4, wordBreak: 'break-word' }}>
            {run.keyword || '—'}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {run.target_url && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <Link size={11} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                  {run.target_url.replace(/^https?:\/\//, '')}
                </span>
              </div>
            )}
            {run.location && run.location !== 'Global (No Geolocation)' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <MapPin size={11} /> {run.location}
              </div>
            )}
            {run.summary && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                {run.summary}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={() => onExpand(run.id)}
          style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', flexShrink: 0,
          }}
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {expanded ? 'Hide' : 'View'}
        </button>
      </div>

      {expanded && <RunDetail runId={run.id} />}
    </div>
  );
}

function RunDetail({ runId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    fetch(`/api/history/${runId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [runId]);

  if (loading) return (
    <div style={{ marginTop: 12, padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
      Loading…
    </div>
  );
  if (!data) return null;

  const result = data.result || {};

  if (data.tool === 'fs_stealer') return <FsStealerDetail result={result} />;
  if (data.tool === 'serp_analyzer') return <SerpDetail result={result} />;
  if (data.tool === 'seo_health') return <SeoHealthDetail result={result} />;

  return (
    <pre style={{
      marginTop: 12, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 8, padding: 12, fontSize: '0.75rem', color: '#cbd5e1',
      overflowX: 'auto', maxHeight: 300, overflowY: 'auto',
    }}>
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}

function FsStealerDetail({ result }) {
  const fs = result.fs_holder || {};
  return (
    <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {fs.link && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', paddingTop: 2 }}>FS Holder</span>
          <a href={fs.link} target="_blank" rel="noreferrer"
            style={{ fontSize: '0.8rem', color: '#E20071', wordBreak: 'break-all' }}>{fs.link}</a>
        </div>
      )}
      {result.organic && (
        <div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 5 }}>Top results</div>
          {result.organic.slice(0, 3).map((r, i) => (
            <div key={i} style={{ fontSize: '0.78rem', color: '#e2e8f0', padding: '4px 0',
              borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>#{i + 1}</span>
              {r.title}
            </div>
          ))}
        </div>
      )}
      {result.analysis && (
        <div style={{
          background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 8, padding: 12, fontSize: '0.78rem', color: '#cbd5e1',
          maxHeight: 220, overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.6,
        }}>
          {result.analysis.slice(0, 800)}{result.analysis.length > 800 ? '…' : ''}
        </div>
      )}
    </div>
  );
}

function SeoHealthDetail({ result }) {
  const score = result.score;
  const color = score >= 90 ? '#4ade80' : score >= 75 ? '#a3e635' : score >= 55 ? '#f59e0b' : '#f87171';
  const breakdown = result.score_breakdown || {};
  return (
    <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ fontSize: '2rem', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{score}</span>
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fff' }}>{result.score_label}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{result.site_name}</div>
        </div>
      </div>
      {Object.keys(breakdown).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(breakdown).map(([cat, val]) => (
            <div key={cat} style={{
              padding: '4px 10px', borderRadius: 6, fontSize: '0.72rem',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--text-muted)',
            }}>
              <span style={{ textTransform: 'capitalize', marginRight: 4 }}>{cat}:</span>
              <span style={{ color: '#fff', fontWeight: 600 }}>{typeof val === 'number' ? val.toFixed(0) : val}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SerpDetail({ result }) {
  return (
    <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {result.organic && (
        <div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 5 }}>Top results</div>
          {result.organic.slice(0, 5).map((r, i) => (
            <div key={i} style={{ fontSize: '0.78rem', color: '#e2e8f0', padding: '4px 0',
              borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>#{i + 1}</span>
              {r.title}
            </div>
          ))}
        </div>
      )}
      {result.analysis && (
        <div style={{
          background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 8, padding: 12, fontSize: '0.78rem', color: '#cbd5e1',
          maxHeight: 220, overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.6,
        }}>
          {result.analysis.slice(0, 800)}{result.analysis.length > 800 ? '…' : ''}
        </div>
      )}
    </div>
  );
}

export default function History() {
  const [runs, setRuns]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [toolFilter, setToolFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [error, setError]         = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const token = localStorage.getItem('auth_token');
    const qs = toolFilter ? `?tool=${toolFilter}` : '';
    try {
      const res = await fetch(`/api/history${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRuns(data.runs || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [toolFilter]);

  useEffect(() => { load(); }, [load]);

  function toggleExpand(id) {
    setExpandedId(prev => prev === id ? null : id);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {ALL_TOOLS.map(t => (
            <button key={t.value} onClick={() => { setToolFilter(t.value); setExpandedId(null); }}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: '0.78rem', cursor: 'pointer',
                border: toolFilter === t.value ? '1px solid #E20071' : '1px solid rgba(255,255,255,0.1)',
                background: toolFilter === t.value ? 'rgba(226,0,113,0.12)' : 'rgba(255,255,255,0.04)',
                color: toolFilter === t.value ? '#E20071' : 'var(--text-muted)',
                fontWeight: toolFilter === t.value ? 600 : 400,
              }}>
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={load} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px',
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6, cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.78rem',
        }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Content */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Loading history…
        </div>
      )}

      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, fontSize: '0.82rem',
          background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171',
        }}>
          {error}
        </div>
      )}

      {!loading && !error && runs.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '60px 0',
          color: 'var(--text-muted)', fontSize: '0.85rem',
        }}>
          <Clock size={28} style={{ marginBottom: 10, opacity: 0.3 }} />
          <div>No runs yet.</div>
          <div style={{ fontSize: '0.78rem', marginTop: 4, opacity: 0.6 }}>
            Results from FS Stealer and SERP Analyzer will appear here.
          </div>
        </div>
      )}

      {!loading && runs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {runs.map(run => (
            <RunCard
              key={run.id}
              run={run}
              expanded={expandedId === run.id}
              onExpand={toggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}
