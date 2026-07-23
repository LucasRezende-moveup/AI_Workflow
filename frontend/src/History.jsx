import { useState, useEffect, useCallback } from 'react';
import { Clock, RefreshCw, ChevronDown, ChevronUp, MapPin, Link } from 'lucide-react';

const TOOL_META = {
  fs_stealer:       { label: 'FS Stealer',       color: '#E20071', bg: 'rgba(226,0,113,0.12)' },
  serp_analyzer:    { label: 'SERP Analyzer',    color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
  seo_health:       { label: 'SEO Health',       color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  cwv:              { label: 'Core Web Vitals',  color: '#00bcd4', bg: 'rgba(0,188,212,0.12)' },
  eeat:             { label: 'E-E-A-T',          color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  schema:           { label: 'Schema',           color: '#38bdf8', bg: 'rgba(56,189,248,0.12)' },
  image_alt:        { label: 'Image Alt',        color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  headers:          { label: 'Headers',          color: '#fb923c', bg: 'rgba(251,146,60,0.12)' },
  comparator:       { label: 'URL Comparator',   color: '#14b8a6', bg: 'rgba(20,184,166,0.12)' },
  internal_linking: { label: 'Internal Linking', color: '#eab308', bg: 'rgba(234,179,8,0.12)' },
};

const ALL_TOOLS = [
  { value: '',                 label: 'All Tools' },
  { value: 'fs_stealer',       label: 'FS Stealer' },
  { value: 'serp_analyzer',    label: 'SERP Analyzer' },
  { value: 'seo_health',       label: 'SEO Health' },
  { value: 'cwv',              label: 'Core Web Vitals' },
  { value: 'eeat',             label: 'E-E-A-T' },
  { value: 'schema',           label: 'Schema' },
  { value: 'image_alt',        label: 'Image Alt' },
  { value: 'headers',          label: 'Headers' },
  { value: 'comparator',       label: 'URL Comparator' },
  { value: 'internal_linking', label: 'Internal Linking' },
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
          aria-expanded={expanded}
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
    <div role="status" style={{ marginTop: 12, padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
      Loading…
    </div>
  );
  if (!data) return null;

  const result = data.result || {};

  if (data.tool === 'fs_stealer') return <FsStealerDetail result={result} />;
  if (data.tool === 'serp_analyzer') return <SerpDetail result={result} />;
  if (data.tool === 'seo_health') return <SeoHealthDetail result={result} />;

  // Generic: tools that produce a markdown analysis (E-E-A-T, Schema, Comparator, Headers, Internal Linking)
  const text = result.analysis || result.ai_analysis;
  if (text) return <AnalysisDetail text={text} url={result.url} score={result.score} />;

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

function AnalysisDetail({ text, url, score }) {
  return (
    <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {(url || score != null) && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {url && <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem', color: '#E20071', wordBreak: 'break-all' }}>{url}</a>}
          {score != null && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Score: <b style={{ color: '#fff' }}>{score}/100</b></span>}
        </div>
      )}
      <div style={{
        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 8, padding: 12, fontSize: '0.78rem', color: '#cbd5e1',
        maxHeight: 260, overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.6,
      }}>
        {String(text).slice(0, 1200)}{String(text).length > 1200 ? '…' : ''}
      </div>
    </div>
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
              aria-pressed={toolFilter === t.value}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 88, borderRadius: 10 }} />)}
        </div>
      )}

      {error && <div role="alert" className="banner banner-error">{error}</div>}

      {!loading && !error && runs.length === 0 && (
        <div className="empty-state">
          <Clock size={30} className="empty-icon" />
          <div className="empty-title">No runs yet</div>
          <div className="empty-hint">Results from your analyses across the platform will appear here.</div>
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
