import { useState, useEffect } from 'react';
import { Search, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function SerpAnalyzer() {
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('Global (No Geolocation)');
  const [geolocations, setGeolocations] = useState([]);
  const [targetUrl, setTargetUrl] = useState('');
  const [authUser, setAuthUser] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/serp/geolocations')
      .then(r => r.json())
      .then(data => {
        setGeolocations(data.geolocations || []);
      })
      .catch(() => {});
  }, []);

  const handleAnalyze = async () => {
    if (!keyword) return;
    setLoading(true);
    setResult(null);
    setError('');
    try {
      const res = await fetch('/api/serp/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword,
          location_name: location,
          target_url: targetUrl || null,
          auth_user: authUser || null,
          auth_pass: authPass || null
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
        <h2 className="flex items-center gap-2 mb-6"><Search size={22} color="var(--primary)"/> Mobile SERP Analyzer</h2>
        <p className="mb-6" style={{color: 'var(--text-muted)'}}>Emulate Googlebot Mobile to see how the top results look and why they are winning.</p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="metric-label mb-2 block">Focus Keyword</label>
            <input className="glass-input" placeholder="e.g. best coffee machine 2024" value={keyword} onChange={e => setKeyword(e.target.value)} />
          </div>
          <div>
            <label className="metric-label mb-2 block">Geolocation</label>
            <select className="glass-input glass-select" aria-label="Geolocation" value={location} onChange={e => setLocation(e.target.value)}>
              {geolocations.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>
        <div className="mb-4">
          <label className="metric-label mb-2 block">Target URL (Optional — for gap analysis)</label>
          <input className="glass-input" type="url" placeholder="https://yourpage.com/article" value={targetUrl} onChange={e => setTargetUrl(e.target.value)} />
        </div>

        <div className="mb-4">
          <button className="flex items-center gap-2 text-sm mb-3" style={{color: 'var(--text-muted)'}} onClick={() => setShowAuth(!showAuth)}>
            🔒 Authentication for Target URL (Optional) {showAuth ? '▲' : '▼'}
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

        <button className="btn-primary w-full" onClick={handleAnalyze} disabled={loading || !keyword}>
          {loading ? <span role="status"><div className="loader" /> Fetching SERP Results…</span> : '📱 Analyze Mobile SERP'}
        </button>
        {error && <div className="banner banner-error mt-4" role="alert">{error}</div>}
      </div>

      {result && (
        <>
          {result.related_keywords?.length > 0 && (
            <div className="glass-panel">
              <h4 className="mb-3">💡 Mobile Semantic Trends</h4>
              <div className="flex flex-wrap gap-2">
                {result.related_keywords.slice(0, 8).map((kw, i) => (
                  <span key={i} className="px-3 py-1 rounded-full text-sm" style={{background: 'rgba(226,0,113,0.15)', border: '1px solid rgba(226,0,113,0.3)', color: 'var(--primary)'}}>
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            {result.organic.map((res, i) => (
              <div key={i} className="glass-panel">
                <div className="flex items-center gap-2 mb-3">
                  <span style={{background: 'var(--primary)', color: 'white', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 700, flexShrink: 0}}>
                    #{i + 1}
                  </span>
                  <a href={res.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-white transition-colors" style={{color: 'var(--primary)', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                    {new URL(res.link).hostname} <ExternalLink size={12} />
                  </a>
                </div>
                <p className="font-semibold mb-2" style={{fontSize: '0.9rem'}}>{res.title}</p>
                <p style={{color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: 1.5}}>{res.snippet}</p>
              </div>
            ))}
          </div>

          <div className="glass-panel">
            <h3 className="mb-4">🤖 Mobile Competitor Insights</h3>
            <div className="markdown-content">
              <ReactMarkdown>{result.analysis}</ReactMarkdown>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
