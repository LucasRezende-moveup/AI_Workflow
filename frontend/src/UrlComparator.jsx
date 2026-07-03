import { useState, useEffect } from 'react';
import { Link2, Globe, Wand2 } from 'lucide-react';
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
  const [serpLoading, setSerpLoading] = useState(false);
  const [serpLocation, setSerpLocation] = useState('Global (No Geolocation)');
  const [geolocations, setGeolocations] = useState(['Global (No Geolocation)']);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/serp/geolocations').then(r => r.json())
      .then(d => { if (d.geolocations?.length) setGeolocations(d.geolocations); })
      .catch(() => {});
  }, []);

  const handleFetchTop3 = async () => {
    if (!keyword.trim()) return;
    setSerpLoading(true);
    setError('');
    try {
      const res = await fetch('/api/serp/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: keyword.trim(), location_name: serpLocation }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'SERP fetch failed'); return; }
      const organic = data.organic || [];
      if (organic[0]) { setUrl1(organic[0].link); setPos1(1); }
      if (organic[1]) { setUrl2(organic[1].link); setPos2(2); }
      if (organic[2]) { setUrl3(organic[2].link); setPos3(3); }
    } catch (e) {
      setError('Network error: ' + e.message);
    } finally {
      setSerpLoading(false);
    }
  };

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

        <div className="flex items-center gap-3 mb-5" style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <Globe size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <select
            className="glass-input glass-select"
            style={{ flex: 1, padding: '6px 10px', fontSize: '0.82rem' }}
            value={serpLocation}
            onChange={e => setSerpLocation(e.target.value)}
          >
            {geolocations.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <button
            onClick={handleFetchTop3}
            disabled={serpLoading || !keyword.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              borderRadius: 7, border: '1px solid rgba(226,0,113,0.4)',
              background: 'rgba(226,0,113,0.1)', color: 'var(--primary)',
              cursor: keyword.trim() ? 'pointer' : 'not-allowed',
              fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap',
              opacity: !keyword.trim() ? 0.4 : 1,
            }}
          >
            {serpLoading
              ? <><div className="loader" style={{ width: 12, height: 12, borderWidth: 2 }} /> Fetching…</>
              : <><Wand2 size={13} /> Auto-fill top 3</>}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          {[
            { label: 'URL 1 (Your URL)', url: url1, setUrl: setUrl1, pos: pos1, setPos: setPos1 },
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
