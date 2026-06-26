import { useState } from 'react';
import { LayoutDashboard } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function InternalLinking() {
  const [urlsText, setUrlsText] = useState('');
  const [authUser, setAuthUser] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    const urls = urlsText.split('\n').map(u => u.trim()).filter(Boolean);
    if (!urls.length) return;
    setLoading(true);
    setResult(null);
    setError('');
    try {
      const res = await fetch('/api/internal-linking/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls, auth_user: authUser || null, auth_pass: authPass || null })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Unknown error');
      } else {
        setResult(data);
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
        <h2 className="flex items-center gap-2 mb-6"><LayoutDashboard size={22} color="var(--primary)"/> Internal Linking Analysis</h2>
        <p className="mb-6" style={{color: 'var(--text-muted)'}}>Analyze how your pages link to each other, discover gaps, and get AI-powered recommendations.</p>

        <label className="metric-label mb-2 block">Target URLs (one per line)</label>
        <textarea
          className="glass-input mb-4"
          rows={6}
          placeholder="https://example.com/page1&#10;https://example.com/page2&#10;https://example.com/page3"
          value={urlsText}
          onChange={e => setUrlsText(e.target.value)}
          style={{resize: 'vertical'}}
        />

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

        <button className="btn-primary w-full" onClick={handleAnalyze} disabled={loading || !urlsText.trim()}>
          {loading ? <><div className="loader" /> Scraping URLs...</> : '🔍 Analyze Internal Links'}
        </button>
        {error && <p className="mt-4 text-red-400">{error}</p>}
      </div>

      {result && (
        <>
          <div className="glass-panel">
            <h3 className="mb-4">📊 Pages Summary</h3>
            <div className="data-table-container" style={{overflowX: 'auto'}}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>URL</th>
                    <th>Status</th>
                    <th>Title</th>
                    <th>Contextual Links</th>
                    <th>Inter-links</th>
                    <th>Est. Words</th>
                  </tr>
                </thead>
                <tbody>
                  {result.summary.map((row, i) => (
                    <tr key={i}>
                      <td style={{maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{row.url}</td>
                      <td>{row.status}</td>
                      <td style={{maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{row.title}</td>
                      <td>{row.contextual_links}</td>
                      <td>{row.inter_links}</td>
                      <td>{row.word_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="glass-panel">
            <h3 className="mb-4">🤝 Inter-linking Matrix</h3>
            <p className="mb-4 text-sm" style={{color: 'var(--text-muted)'}}>Does Page A (row) link to Page B (column)?</p>
            <div className="data-table-container" style={{overflowX: 'auto'}}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>From / To</th>
                    {result.matrix_cols.map(col => (
                      <th key={col} style={{maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.7rem'}}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.matrix.map((row, i) => (
                    <tr key={i}>
                      <td style={{maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.7rem'}}>{row.source}</td>
                      {result.matrix_cols.map(col => (
                        <td key={col} style={{textAlign: 'center'}}>
                          <span style={{color: row.values[col] === '✅ Link' ? '#4ade80' : row.values[col] === 'Self' ? 'var(--text-muted)' : '#ef4444'}}>
                            {row.values[col]}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="glass-panel">
            <h3 className="mb-4">📋 AI Linking Strategy Analysis</h3>
            <div className="markdown-content">
              <ReactMarkdown>{result.analysis}</ReactMarkdown>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
