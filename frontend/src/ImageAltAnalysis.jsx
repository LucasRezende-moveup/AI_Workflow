import { useState } from 'react';
import { Image as ImageIcon, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

export default function ImageAltAnalysis() {
  const [url, setUrl] = useState('');
  const [keyword, setKeyword] = useState('');
  const [manualIntent, setManualIntent] = useState('');
  const [maxImages, setMaxImages] = useState(10);
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
      const res = await fetch('/api/image-alt/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url, keyword,
          manual_intent: manualIntent || null,
          max_images: maxImages,
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

  const statusIcon = (status) => {
    if (status === '✅ Best') return <CheckCircle size={16} color="#4ade80" />;
    if (status === '⚠️ Needs Change') return <AlertTriangle size={16} color="#f59e0b" />;
    return <XCircle size={16} color="#ef4444" />;
  };

  return (
    <div className="flex-col gap-6">
      <div className="glass-panel">
        <h2 className="flex items-center gap-2 mb-6"><ImageIcon size={22} color="var(--primary)"/> Image Alt Text Analysis</h2>
        <p className="mb-6" style={{color: 'var(--text-muted)'}}>AI-powered image alt text audit with automatic intent detection.</p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="metric-label mb-2 block">Page URL</label>
            <input className="glass-input" type="url" placeholder="https://example.com/page" value={url} onChange={e => setUrl(e.target.value)} />
          </div>
          <div>
            <label className="metric-label mb-2 block">Target Keyword</label>
            <input className="glass-input" placeholder="e.g. digital marketing" value={keyword} onChange={e => setKeyword(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="metric-label mb-2 block">Override User Intent (leave blank for auto)</label>
            <input className="glass-input" placeholder="e.g. Informational" value={manualIntent} onChange={e => setManualIntent(e.target.value)} />
          </div>
          <div>
            <label className="metric-label mb-2 block">Max Images to Analyze</label>
            <input type="number" className="glass-input" min={1} max={500} value={maxImages} onChange={e => setMaxImages(Number(e.target.value))} />
          </div>
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

        <button className="btn-primary w-full" onClick={handleAnalyze} disabled={loading || !url || !keyword}>
          {loading ? <span role="status"><div className="loader" /> Analyzing Images…</span> : '🚀 Run Analysis'}
        </button>
        {error && <div className="banner banner-error mt-4" role="alert">{error}</div>}
      </div>

      {result && (
        <>
          <div className="glass-panel flex items-center gap-4">
            <span style={{background: 'rgba(226,0,113,0.15)', border: '1px solid var(--primary)', padding: '6px 16px', borderRadius: 20, color: 'var(--primary)', fontWeight: 600}}>
              🎯 Detected Intent: {result.detected_intent}
            </span>
            <span style={{color: 'var(--text-muted)'}}>Found {result.total_images} content images — analyzed {result.results.length}</span>
          </div>

          <div className="flex-col gap-4">
            {result.results.map((res, i) => (
              <div key={i} className="glass-panel">
                <div className="flex gap-6">
                  <div style={{width: 140, flexShrink: 0}}>
                    <img src={res.src} alt={res.alt || 'Image'} loading="lazy" width={140} height={120} style={{width: '100%', borderRadius: 8, objectFit: 'cover', maxHeight: 120}} onError={e => { e.target.style.display = 'none'; }} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {statusIcon(res.status)}
                      <span className="font-semibold">{res.status}</span>
                    </div>
                    <p className="mb-2" style={{color: 'var(--text-muted)', fontSize: '0.85rem'}}>
                      <strong>Current Alt:</strong> <code style={{background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4}}>{res.alt || '[Empty]'}</code>
                    </p>
                    {res.error ? (
                      <p className="text-red-400 text-sm">{res.error}</p>
                    ) : (
                      <>
                        <p className="mb-2 text-sm" style={{color: 'var(--text-muted)'}}><strong>Reasoning:</strong> {res.reasoning}</p>
                        {res.status !== '✅ Best' && (
                          <p className="text-sm" style={{color: '#4ade80'}}>
                            <strong>AI Proposes:</strong> {res.proposed_alt}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
