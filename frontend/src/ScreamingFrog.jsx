import { useState } from 'react';
import { Upload, FileDown, Terminal, ChevronDown, ChevronUp, Link, CheckCircle, AlertTriangle, FileMinus, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function ScreamingFrog({ onData } = {}) {
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
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
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const res = await fetch('/api/sf/analyze', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
        setInsights('');
        onData?.(data);
      } else {
        alert("Error parsing file: " + data.detail);
      }
    } catch (e) {
      console.error(e);
      alert("Network Error");
    } finally {
      setLoading(false);
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

  const getCmd = () => {
    let cmd = `screamingfrogseospider --crawl ${cliTarget} --headless --save-crawl --output-type dbseospider`;
    if (cliStorage === 'Database') cmd += ' --db-storage';
    return cmd;
  };

  return (
    <div className="flex-col gap-6">
      
      {!result ? (
        <>
          <div 
            className={`glass-panel flex flex-col items-center justify-center p-12 transition-all ${isDragging ? 'border-primary' : ''}`}
            style={{borderStyle: 'dashed', borderWidth: '2px', borderColor: isDragging ? 'var(--primary)' : 'rgba(255,255,255,0.2)'}}
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
              Maximum performance parsing via backend streaming.
            </p>
            <input type="file" id="file-upload" className="hidden" onChange={handleFileChange} />
            <label htmlFor="file-upload" className="btn-primary" style={{cursor: 'pointer'}}>
              Select File
            </label>
            {file && <div className="mt-4 text-green-400 font-semibold">{file.name}</div>}
            {file && (
              <button className="btn-primary mt-4" style={{width: '100%', padding: '16px', fontSize: '1.1rem'}} onClick={handleAnalyze} disabled={loading}>
                {loading ? <div className="loader"/> : "🚀 Start Analysis"}
              </button>
            )}
          </div>

          <div className="glass-panel p-0 overflow-hidden">
            <div 
              className="flex justify-between items-center p-4 cursor-pointer hover:bg-white/5"
              onClick={() => setCliOpen(!cliOpen)}
            >
              <h4 className="flex items-center gap-2 m-0"><Terminal size={18}/> CLI Automation & Headless Setup</h4>
              {cliOpen ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
            </div>
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
                  <input className="glass-input mb-3" placeholder="Target URL" value={cliTarget} onChange={e => setCliTarget(e.target.value)} />
                  <select className="glass-input glass-select mb-3" value={cliStorage} onChange={e => setCliStorage(e.target.value)}>
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
              <Link className="mb-2" size={24} color="#00f2fe" />
              <div className="metric-label">Total URLs</div>
              <div className="metric-value">{result.metrics.total_urls.toLocaleString()}</div>
            </div>
            <div className="glass-panel interactive">
              <CheckCircle className="mb-2" size={24} color="#4ade80" />
              <div className="metric-label">200 OK</div>
              <div className="metric-value">{result.metrics.status_200.toLocaleString()}</div>
            </div>
            <div className="glass-panel interactive">
              <AlertTriangle className="mb-2" size={24} color="#f59e0b" />
              <div className="metric-label">Missing Titles</div>
              <div className="metric-value">{result.metrics.missing_titles.toLocaleString()}</div>
            </div>
            <div className="glass-panel interactive">
              <FileMinus className="mb-2" size={24} color="#ef4444" />
              <div className="metric-label">Missing Meta Desc</div>
              <div className="metric-value">{result.metrics.missing_desc.toLocaleString()}</div>
            </div>
          </div>

          <div className="glass-panel">
            <h3 className="mb-4 flex items-center gap-2"><Sparkles size={20} color="var(--primary)"/> AI Crawl Insights</h3>
            {!insights ? (
              <div className="text-center p-6">
                <button className="btn-primary" onClick={getInsights} disabled={insightsLoading}>
                  {insightsLoading ? <div className="loader"/> : "Generate AI Insights"}
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
