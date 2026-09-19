import { useState } from 'react';
import { parseCrawlFile } from './sfParse';
import { Upload, FileDown, Terminal, ChevronDown, ChevronUp, Link, CheckCircle, AlertTriangle, FileMinus, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';


// A 413 from the platform, or a 500 page, is not JSON — calling res.json() on it throws and
// the only thing the user ever saw was "Network Error". Read the body as text first and turn
// the common cases into something actionable.
async function readJson(res) {
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* not JSON — handled below */ }
  if (res.ok) {
    if (body) return body;
    throw new Error('The server returned an unreadable response.');
  }
  if (res.status === 413 || /too large|PAYLOAD_TOO_LARGE/i.test(text)) {
    throw new Error('That file is too large to upload (the limit is 4.5 MB). ' +
                    'Save the crawl as .dbseospider or .seospider and it will be read here in the browser instead.');
  }
  throw new Error((body && (body.detail || body.error)) || `Request failed (${res.status}).`);
}

export default function ScreamingFrog({ onData } = {}) {
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [cliOpen, setCliOpen] = useState(false);
  const [cliTarget, setCliTarget] = useState('https://example.com');
  const [cliStorage, setCliStorage] = useState('Database');
  
  const [insights, setInsights] = useState('');
  const [insightsLoading, setInsightsLoading] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError('');
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const name = (file.name || '').toLowerCase();
      let data;

      if (/\.(dbseospider|seospider|csv)$/.test(name)) {
        // Parsed in the browser. A database-mode crawl is far larger than the 4.5 MB a Vercel
        // function will accept, so the file itself never leaves the machine — only the counts
        // and a 500-row sample do.
        setStage('Reading the crawl file…');
        const payload = await parseCrawlFile(file);
        setStage(`Parsed ${payload.metrics.total_urls.toLocaleString()} URLs — building the report…`);
        const token = localStorage.getItem('auth_token');
        const res = await fetch('/api/sf/analyze-parsed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        data = await readJson(res);
      } else {
        // .xlsx still goes to the server, which has the reader for it.
        setStage('Uploading…');
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/sf/analyze', { method: 'POST', body: formData });
        data = await readJson(res);
      }

      setResult(data);
      setInsights('');
      onData?.(data);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Could not analyse that file.');
    } finally {
      setLoading(false);
      setStage('');
    }
  };

  const getInsights = async () => {
    if (!result) return;
    setInsightsLoading(true);
    
    const summary_text = `Crawl Summary: ${result.metrics.total_urls} URLs, ${result.metrics.status_200} OK, ${result.metrics.missing_titles} missing titles.`;
    const cols_to_use = result.cols_used.filter(Boolean);
    const sample_data = result.data.slice(0, 50).map(row => {
      let trimmed = {};
      cols_to_use.forEach(c => { trimmed[c] = row[c] });
      return trimmed;
    });

    try {
      const res = await fetch('/api/sf/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary_text, sample_data })
      });
      const json = await res.json();
      setInsights(json.insights);
    } catch (e) {
      console.error(e);
    } finally {
      setInsightsLoading(false);
    }
  };

  // Exports CSV rather than a saved crawl. A .dbseospider is a Derby database that only
  // Screaming Frog can open, so telling people to produce one gave them a file this tool
  // cannot read — which is how the "not a database" dead end started.
  const getCmd = () => {
    let cmd = `screamingfrogseospider --crawl ${cliTarget} --headless`;
    if (cliStorage === 'Database') cmd += ' --db-storage';
    cmd += ' --output-folder ./crawl-export --overwrite --export-format csv';
    cmd += ' --export-tabs "Internal:All"';
    return cmd;
  };

  return (
    <div className="flex-col gap-6">
      
      {!result ? (
        <>
          <div 
            className={`glass-panel flex flex-col items-center justify-center p-12 ${isDragging ? 'border-primary' : ''}`}
            style={{borderStyle: 'dashed', borderWidth: '2px', borderColor: isDragging ? 'var(--primary)' : 'rgb(var(--ink) / 0.2)', transition: 'border-color 0.15s'}}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div style={{background: 'rgba(226, 0, 113, 0.1)', padding: 24, borderRadius: '50%'}} className="mb-6">
              <Upload size={48} color="var(--primary)" />
            </div>
            <h3 className="mb-2">Upload Crawl Data</h3>
            <p className="text-center mb-6" style={{color: 'var(--text-muted)'}}>
              Drag and drop your .seospider, .dbseospider, or CSV/XLSX file here.<br/>
              CSV is read in your browser, so crawl size is not limited. Saved .dbseospider crawls are
              an Apache Derby database only Screaming Frog can open — export Internal:All as CSV instead.
            </p>
            <input type="file" id="file-upload" className="hidden" onChange={handleFileChange}
              accept=".dbseospider,.seospider,.csv,.xlsx" />
            <label htmlFor="file-upload" className="btn-primary" style={{cursor: 'pointer'}}>
              Select File
            </label>
            {file && <div className="mt-4 text-green-400 font-semibold">{file.name}</div>}
            {file && (
              <button className="btn-primary mt-4" style={{width: '100%', padding: '16px', fontSize: '1.1rem'}} onClick={handleAnalyze} disabled={loading}>
                {loading ? <div className="loader" role="status"/> : "🚀 Start Analysis"}
              </button>
            )}
            {loading && stage && (
              <div role="status" style={{ marginTop: 10, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{stage}</div>
            )}
            {error && (
              <div role="alert" style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: '0.82rem',
                background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#dc2626', maxWidth: 460 }}>
                {error}
              </div>
            )}
          </div>

          <div className="glass-panel p-0 overflow-hidden">
            <button
              type="button"
              className="flex justify-between items-center p-4 cursor-pointer hover:bg-white/5"
              onClick={() => setCliOpen(!cliOpen)}
              aria-expanded={cliOpen}
              style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer' }}
            >
              <h4 className="flex items-center gap-2 m-0"><Terminal size={18}/> CLI Automation & Headless Setup</h4>
              {cliOpen ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
            </button>
            {cliOpen && (
              <div className="p-4 border-t border-white/10 flex gap-6">
                <div className="flex-1">
                  <h5 className="mb-2 flex items-center gap-2"><FileDown size={16}/> Dockerfile Snippet</h5>
                  <pre className="p-3 bg-black/30 rounded-lg text-sm font-mono overflow-x-auto text-gray-300">
                    RUN apt-get update && apt-get install -y wget gnupg{'\n'}
                    RUN wget -q -O - https://www.screamingfrog.co.uk/gpg-key.public | apt-key add -{'\n'}
                    RUN echo "deb https://www.screamingfrog.co.uk/repository/ubuntu stable main" &gt;&gt; /etc/apt/sources.list{'\n'}
                    RUN apt-get update && apt-get install -y screamingfrogseospider
                  </pre>
                </div>
                <div className="flex-1">
                  <h5 className="mb-2">Command Generator</h5>
                  <input className="glass-input mb-3" type="url" aria-label="Target URL" placeholder="Target URL" value={cliTarget} onChange={e => setCliTarget(e.target.value)} />
                  <select className="glass-input glass-select mb-3" aria-label="Storage" value={cliStorage} onChange={e => setCliStorage(e.target.value)}>
                    <option value="Database">Database Storage</option>
                    <option value="Memory">Memory Storage</option>
                  </select>
                  <pre className="p-3 bg-black/30 rounded-lg text-sm font-mono overflow-x-auto text-primary border border-primary/30">
                    {getCmd()}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex justify-between items-center mb-2">
            <h3>Crawl Overview</h3>
            <button className="btn-primary flex items-center gap-2" onClick={() => {setResult(null); setFile(null);}}>
              <Upload size={16} /> New Crawl
            </button>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="glass-panel interactive">
              <Link className="mb-2" size={24} color="#0891b2" />
              <div className="metric-label">Total URLs</div>
              <div className="metric-value">{result.metrics.total_urls.toLocaleString()}</div>
            </div>
            <div className="glass-panel interactive">
              <CheckCircle className="mb-2" size={24} color="#15803d" />
              <div className="metric-label">200 OK</div>
              <div className="metric-value">{result.metrics.status_200.toLocaleString()}</div>
            </div>
            <div className="glass-panel interactive">
              <AlertTriangle className="mb-2" size={24} color="#b45309" />
              <div className="metric-label">Missing Titles</div>
              <div className="metric-value">{result.metrics.missing_titles.toLocaleString()}</div>
            </div>
            <div className="glass-panel interactive">
              <FileMinus className="mb-2" size={24} color="#dc2626" />
              <div className="metric-label">Missing Meta Desc</div>
              <div className="metric-value">{result.metrics.missing_desc.toLocaleString()}</div>
            </div>
          </div>

          <div className="glass-panel">
            <h3 className="mb-4 flex items-center gap-2"><Sparkles size={20} color="var(--primary)"/> AI Crawl Insights</h3>
            {!insights ? (
              <div className="text-center p-6">
                <button className="btn-primary" onClick={getInsights} disabled={insightsLoading}>
                  {insightsLoading ? <div className="loader" role="status"/> : "Generate AI Insights"}
                </button>
                <p className="mt-4 text-sm text-gray-400">Analyzes aggregate metrics and the top 50 URLs to find SEO opportunities.</p>
              </div>
            ) : (
              <div className="markdown-content">
                <ReactMarkdown>{insights}</ReactMarkdown>
              </div>
            )}
          </div>

          <div className="glass-panel">
            <div className="flex justify-between items-center mb-4">
              <h4>Data Table (Top {result.data.length} rows)</h4>
            </div>
            <div className="data-table-container" style={{maxHeight: 500, overflowY: 'auto'}}>
              <table className="data-table">
                <thead style={{position: 'sticky', top: 0, background: 'var(--bg-dark)'}}>
                  <tr>
                    {result.columns.slice(0, 8).map(col => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((row, i) => (
                    <tr key={i}>
                      {result.columns.slice(0, 8).map(col => (
                        <td key={col} style={{maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                          {row[col] !== null ? row[col].toString() : '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
