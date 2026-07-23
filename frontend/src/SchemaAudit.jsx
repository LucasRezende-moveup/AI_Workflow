import { useState } from 'react';
import { FileCode } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function SchemaAudit() {
  const [url, setUrl] = useState('');
  const [authUser, setAuthUser] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [expandedBlocks, setExpandedBlocks] = useState({});

  const handleAudit = async () => {
    if (!url) return;
    setLoading(true);
    setResult(null);
    setError('');
    try {
      const res = await fetch('/api/schema/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, auth_user: authUser || null, auth_pass: authPass || null })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Unknown error');
      } else {
        setResult(data);
        // Expand all blocks by default
        const expanded = {};
        data.blocks.forEach((_, i) => { expanded[i] = true; });
        setExpandedBlocks(expanded);
      }
    } catch (e) {
      setError('Network error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleBlock = (i) => setExpandedBlocks(prev => ({ ...prev, [i]: !prev[i] }));

  return (
    <div className="flex-col gap-6">
      <div className="glass-panel">
        <h2 className="flex items-center gap-2 mb-6"><FileCode size={22} color="var(--primary)"/> Schema Validation & Audit</h2>
        <label className="metric-label mb-2 block">URL to Audit</label>
        <input className="glass-input mb-4" type="url" placeholder="https://example.com/page" value={url} onChange={e => setUrl(e.target.value)} />

        <div className="mb-4">
          <button className="flex items-center gap-2 text-sm mb-3" style={{color: 'var(--text-muted)'}} onClick={() => setShowAuth(!showAuth)}>
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

        <button className="btn-primary w-full" onClick={handleAudit} disabled={loading || !url}>
          {loading ? <span role="status"><div className="loader" /> Fetching Schema…</span> : '🔍 Audit Schema'}
        </button>
        {error && <div className="banner banner-error mt-4" role="alert">{error}</div>}
      </div>

      {result && (
        <>
          <div className="glass-panel">
            <p className="text-green-400 font-semibold">✅ Found {result.count} JSON-LD block{result.count > 1 ? 's' : ''} on this page.</p>
          </div>

          {result.blocks.map((block, i) => (
            <div key={i} className="glass-panel p-0 overflow-hidden">
              <button
                type="button"
                className="flex justify-between items-center p-4 cursor-pointer hover:bg-white/5"
                onClick={() => toggleBlock(i)}
                aria-expanded={!!expandedBlocks[i]}
                style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer' }}
              >
                <h4 className="m-0">Schema Block {i + 1}
                  {block.types.length > 0 && (
                    <span className="ml-3 text-sm font-normal" style={{color: 'var(--primary)'}}>
                      {block.types.join(', ')}
                    </span>
                  )}
                </h4>
                <span>{expandedBlocks[i] ? '▲' : '▼'}</span>
              </button>
              {expandedBlocks[i] && (
                <div className="p-4 border-t border-white/10">
                  <pre className="p-4 bg-black/30 rounded-lg text-sm font-mono overflow-x-auto text-gray-300 max-h-80 overflow-y-auto">
                    {JSON.stringify(block.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}

          <div className="glass-panel">
            <h3 className="mb-4">🤖 AI Schema Analysis</h3>
            <div className="markdown-content">
              <ReactMarkdown>{result.ai_analysis}</ReactMarkdown>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
