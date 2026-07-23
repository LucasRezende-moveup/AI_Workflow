import { useState } from 'react';
import { Layers, FileCode, Image as ImageIcon, Award, Heading } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import SchemaAudit from './SchemaAudit';
import ImageAltAnalysis from './ImageAltAnalysis';
import EeatAnalysis from './EeatAnalysis';

const TABS = [
  { id: 'headers', label: 'Header Analysis', Icon: Heading   },
  { id: 'schema',  label: 'Schema Audit',    Icon: FileCode  },
  { id: 'images',  label: 'Image Alt',       Icon: ImageIcon },
  { id: 'eeat',    label: 'E-E-A-T',         Icon: Award     },
];

const SEVERITY = {
  critical: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', text: '#f87171', label: 'Critical' },
  warning:  { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', text: '#fbbf24', label: 'Warning'  },
  info:     { bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.3)',  text: '#60a5fa', label: 'Info'     },
};

const H_SIZE = { 1: '1.05rem', 2: '0.95rem', 3: '0.88rem', 4: '0.82rem', 5: '0.78rem', 6: '0.75rem' };
const H_WEIGHT = { 1: 800, 2: 700, 3: 600, 4: 600, 5: 500, 6: 500 };

function HeaderAnalysis() {
  const [url, setUrl] = useState('');
  const [keyword, setKeyword] = useState('');
  const [authUser, setAuthUser] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    if (!url || !keyword) return;
    setLoading(true);
    setResult(null);
    setError('');
    try {
      const res = await fetch('/api/headers/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, keyword, auth_user: authUser || null, auth_pass: authPass || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Unknown error'); }
      else { setResult(data); }
    } catch (e) {
      setError('Network error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = (s) => s >= 80 ? '#4ade80' : s >= 60 ? '#f59e0b' : '#f87171';

  return (
    <div className="flex-col gap-6">
      <div className="glass-panel">
        <h2 className="flex items-center gap-2 mb-6">
          <Heading size={22} color="var(--primary)" /> Header Structure Analysis
        </h2>
        <p className="mb-5" style={{ color: 'var(--text-muted)' }}>
          Extracts H1–H6 tags from any URL and evaluates hierarchy, keyword presence, and content flow.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="metric-label mb-2 block">Page URL</label>
            <input className="glass-input" type="url" placeholder="https://example.com/page" value={url} onChange={e => setUrl(e.target.value)} />
          </div>
          <div>
            <label className="metric-label mb-2 block">Target Keyword</label>
            <input className="glass-input" placeholder="e.g. best seo tools" value={keyword} onChange={e => setKeyword(e.target.value)} />
          </div>
        </div>

        <div className="mb-4">
          <button className="flex items-center gap-2 text-sm mb-3" style={{ color: 'var(--text-muted)' }} onClick={() => setShowAuth(!showAuth)}>
            🔒 Authentication (Optional) {showAuth ? '▲' : '▼'}
          </button>
          {showAuth && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="metric-label mb-2 block">Username</label>
                <input className="glass-input" placeholder="user" value={authUser} onChange={e => setAuthUser(e.target.value)} />
              </div>
              <div>
                <label className="metric-label mb-2 block">Password</label>
                <input className="glass-input" type="password" placeholder="password" value={authPass} onChange={e => setAuthPass(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        <button className="btn-primary w-full" onClick={handleAnalyze} disabled={loading || !url || !keyword}>
          {loading ? <span role="status"><div className="loader" /> Fetching &amp; Analyzing…</span> : '🔍 Analyze Headers'}
        </button>
        {error && <div className="banner banner-error mt-4" role="alert">{error}</div>}
      </div>

      {result && (
        <>
          {/* Score + issues row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="glass-panel flex flex-col items-center justify-center" style={{ minHeight: 130 }}>
              <div style={{ fontSize: '3.8rem', fontWeight: 800, lineHeight: 1, color: scoreColor(result.score) }}>
                {result.score}
              </div>
              <div className="metric-label mt-2">Header Score</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                {result.total} heading{result.total !== 1 ? 's' : ''} found
              </div>
            </div>

            <div className="glass-panel" style={{ gridColumn: '2 / 4' }}>
              <h4 className="mb-3" style={{ fontSize: '0.9rem' }}>
                {result.issues.length === 0 ? '✅ No issues detected' : `Issues (${result.issues.length})`}
              </h4>
              {result.issues.length === 0 ? (
                <p style={{ color: '#4ade80', fontSize: '0.85rem' }}>Heading structure looks solid for the keyword.</p>
              ) : (
                <div className="flex-col gap-2">
                  {result.issues.map((issue, i) => {
                    const s = SEVERITY[issue.severity] || SEVERITY.info;
                    return (
                      <div key={i} style={{
                        padding: '8px 12px', borderRadius: 7,
                        background: s.bg, border: `1px solid ${s.border}`,
                        fontSize: '0.83rem', color: s.text,
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                      }}>
                        <span style={{ fontWeight: 700, flexShrink: 0, fontSize: '0.75rem', marginTop: 1 }}>
                          {s.label.toUpperCase()}
                        </span>
                        <span style={{ color: 'rgba(255,255,255,0.85)' }}>{issue.message}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Header tree */}
          <div className="glass-panel">
            <h3 className="mb-4" style={{ fontSize: '1rem' }}>
              Heading Structure
              <span style={{ marginLeft: 10, fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                — green border = contains keyword "{result.keyword}"
              </span>
            </h3>
            <div className="flex-col gap-1">
              {result.headers.map((h, i) => (
                <div
                  key={i}
                  style={{
                    paddingLeft: (h.level - 1) * 18 + 12,
                    paddingRight: 12,
                    paddingTop: 7,
                    paddingBottom: 7,
                    borderLeft: `3px solid ${h.has_keyword ? '#4ade80' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: '0 6px 6px 0',
                    background: h.level === 1 ? 'rgba(226,0,113,0.06)' : i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <span style={{
                    fontSize: '0.68rem', fontFamily: 'monospace', fontWeight: 700,
                    padding: '2px 6px', borderRadius: 4,
                    background: h.level === 1 ? 'rgba(226,0,113,0.2)' : 'rgba(255,255,255,0.07)',
                    color: h.level === 1 ? 'var(--primary)' : 'var(--text-muted)',
                    flexShrink: 0,
                  }}>
                    H{h.level}
                  </span>
                  <span style={{
                    fontSize: H_SIZE[h.level] || '0.82rem',
                    fontWeight: H_WEIGHT[h.level] || 500,
                    color: h.level === 1 ? 'white' : 'rgba(255,255,255,0.85)',
                    flex: 1,
                  }}>
                    {h.text}
                  </span>
                  {h.has_keyword && (
                    <span style={{ fontSize: '0.7rem', color: '#4ade80', flexShrink: 0, fontWeight: 600 }}>
                      ✓ keyword
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* AI analysis */}
          <div className="glass-panel">
            <h3 className="mb-4" style={{ fontSize: '1rem' }}>AI Recommendations</h3>
            <div className="markdown-content">
              <ReactMarkdown>{result.ai_analysis}</ReactMarkdown>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function OnPageAudit() {
  const [activeTab, setActiveTab] = useState('headers');

  return (
    <div className="flex-col gap-6">
      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {TABS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '10px 18px', borderRadius: 8, fontWeight: 600, fontSize: '0.9rem',
                cursor: 'pointer', transition: 'background 0.15s, color 0.15s, box-shadow 0.15s',
                ...(isActive
                  ? { background: 'var(--primary)', color: 'white', border: '1px solid var(--primary)', boxShadow: '0 0 14px rgba(226,0,113,0.35)' }
                  : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)' }),
              }}
            >
              <Icon size={15} /> {label}
            </button>
          );
        })}
      </div>

      <div style={{ display: activeTab === 'headers' ? 'flex' : 'none', flexDirection: 'column', gap: '1.5rem' }}>
        <HeaderAnalysis />
      </div>
      <div style={{ display: activeTab === 'schema' ? 'flex' : 'none', flexDirection: 'column', gap: '1.5rem' }}>
        <SchemaAudit />
      </div>
      <div style={{ display: activeTab === 'images' ? 'flex' : 'none', flexDirection: 'column', gap: '1.5rem' }}>
        <ImageAltAnalysis />
      </div>
      <div style={{ display: activeTab === 'eeat' ? 'flex' : 'none', flexDirection: 'column', gap: '1.5rem' }}>
        <EeatAnalysis />
      </div>
    </div>
  );
}
