import { useState } from 'react';
import { Link2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function UrlComparator() {
  const [keyword, setKeyword] = useState('');
  const [url1, setUrl1] = useState(''); const [pos1, setPos1] = useState(1);
  const [url2, setUrl2] = useState(''); const [pos2, setPos2] = useState(2);
  const [url3, setUrl3] = useState(''); const [pos3, setPos3] = useState(3);
  const [authUser, setAuthUser] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleCompare = async () => {
    if (!keyword || !url1 || !url2) return;
    setLoading(true);
    setResult(null);
    setError('');
    try {
      const res = await fetch('/api/comparator/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword, url1, url2, url3: url3 || null,
          pos1, pos2, pos3,
          auth_user: authUser || null, auth_pass: authPass || null
        })
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
        <h2 className="flex items-center gap-2 mb-6"><Link2 size={22} color="var(--primary)"/> URL Comparator</h2>
        <p className="mb-6" style={{color: 'var(--text-muted)'}}>Deep side-by-side SEO comparison of 2–3 URLs for a target keyword, powered by AI.</p>

        <div className="mb-4">
          <label className="metric-label mb-2 block">Focus Keyword</label>
          <input className="glass-input" placeholder="e.g. best seo tools" value={keyword} onChange={e => setKeyword(e.target.value)} />
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          {[
            { label: 'URL 1 (Target)', url: url1, setUrl: setUrl1, pos: pos1, setPos: setPos1 },
            { label: 'URL 2 (Competitor)', url: url2, setUrl: setUrl2, pos: pos2, setPos: setPos2 },
            { label: 'URL 3 (Optional)', url: url3, setUrl: setUrl3, pos: pos3, setPos: setPos3 },
          ].map((item, i) => (
            <div key={i}>
              <label className="metric-label mb-2 block">{item.label}</label>
              <input className="glass-input mb-2" placeholder="https://example.com/page" value={item.url} onChange={e => item.setUrl(e.target.value)} />
              <label className="metric-label mb-1 block" style={{fontSize: '0.7rem'}}>SERP Position</label>
              <input type="number" className="glass-input" min={1} value={item.pos} onChange={e => item.setPos(Number(e.target.value))} />
            </div>
          ))}
        </div>

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

        <button className="btn-primary w-full" onClick={handleCompare} disabled={loading || !keyword || !url1 || !url2}>
          {loading ? <><div className="loader" /> Scraping &amp; Analyzing...</> : '⚙️ Compare Pages'}
        </button>
        {error && <p className="mt-4 text-red-400">{error}</p>}
      </div>

      {result && (
        <>
          {result.scraped && (
            <div className="glass-panel">
              <details>
                <summary className="cursor-pointer font-semibold" style={{color: 'var(--text-muted)'}}>🔍 View Scraped Data</summary>
                <div className="grid gap-4 mt-4" style={{gridTemplateColumns: `repeat(${result.scraped.filter(Boolean).length}, 1fr)`}}>
                  {result.scraped.map((d, i) => d && (
                    <div key={i}>
                      <p className="metric-label mb-2">URL {i + 1}</p>
                      <pre className="p-3 bg-black/30 rounded text-xs overflow-auto max-h-64">{JSON.stringify(d, null, 2)}</pre>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
          <div className="glass-panel">
            <h3 className="mb-4">🏁 Analysis Result</h3>
            <div className="markdown-content">
              <ReactMarkdown>{result.analysis}</ReactMarkdown>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
