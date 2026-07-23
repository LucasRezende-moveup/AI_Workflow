import { useState } from 'react';
import { Award, Loader } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function EeatAnalysis() {
  const [url, setUrl] = useState('');
  const [authUser, setAuthUser] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    if (!url) return;
    setLoading(true);
    setResult('');
    setError('');
    try {
      const res = await fetch('/api/eeat/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, auth_user: authUser || null, auth_pass: authPass || null })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Unknown error');
      } else {
        setResult(data.analysis);
      }
    } catch (e) {
      setError('Network error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-col gap-6">
      <div className="glass-panel">
        <h2 className="flex items-center gap-2 mb-6"><Award size={22} color="var(--primary)" /> E-E-A-T Analysis Settings</h2>
        <label className="metric-label mb-2 block">Page URL</label>
        <input className="glass-input mb-4" type="url" placeholder="https://example.com/article" value={url} onChange={e => setUrl(e.target.value)} />

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

        <button className="btn-primary w-full" onClick={handleAnalyze} disabled={loading || !url}>
          {loading ? <span role="status"><div className="loader" /> Fetching &amp; Analyzing…</span> : '🚀 Start E-E-A-T Analysis'}
        </button>
        {error && <div className="banner banner-error mt-4" role="alert">{error}</div>}
      </div>

      {result && (
        <div className="glass-panel">
          <h3 className="mb-4 flex items-center gap-2"><Award size={18} color="var(--primary)"/> Analysis Result</h3>
          <div className="markdown-content">
            <ReactMarkdown>{result}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
