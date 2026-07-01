import { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, LineChart, Line, CartesianGrid } from 'recharts';
import { Database, Filter, Download, Activity, Globe, AlertTriangle, Bot, TrendingUp, Eye } from 'lucide-react';

const COLORS = ['#E20071', '#00f2fe', '#4ade80', '#f59e0b', '#8b5cf6', '#ec4899', '#38bdf8', '#a3e635'];

const BOT_OPTIONS = [
  { label: 'All Traffic',    value: 'All' },
  { label: 'Any Bot',        value: 'Any Bot' },
  { label: 'Googlebot',      value: 'Googlebot' },
  { label: 'Bingbot',        value: 'bingbot' },
  { label: 'AhrefsBot',      value: 'AhrefsBot' },
  { label: 'SemrushBot',     value: 'SemrushBot' },
  { label: 'YandexBot',      value: 'YandexBot' },
  { label: 'DotBot',         value: 'dotbot' },
  { label: 'MJ12bot',        value: 'mj12bot' },
  { label: 'PetalBot',       value: 'PetalBot' },
  { label: 'DataForSeoBot',  value: 'DataForSeoBot' },
];

const STATUS_OPTIONS = [
  { label: 'All Statuses', value: '' },
  { label: '200 OK',            value: '200' },
  { label: '301 Redirect',      value: '301' },
  { label: '302 Redirect',      value: '302' },
  { label: '304 Not Modified',  value: '304' },
  { label: '400 Bad Request',   value: '400' },
  { label: '403 Forbidden',     value: '403' },
  { label: '404 Not Found',     value: '404' },
  { label: '500 Server Error',  value: '500' },
  { label: '502 Bad Gateway',   value: '502' },
  { label: '503 Unavailable',   value: '503' },
];

function MetricCard({ icon: Icon, label, value, color = 'var(--primary)', sub }) {
  return (
    <div className="glass-panel">
      <Icon className="mb-2" size={24} color={color} />
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function LogAnalyzer({ onData } = {}) {
  const [sites, setSites] = useState({});
  const [selectedSite, setSelectedSite] = useState('');
  const [availableFiles, setAvailableFiles] = useState([]);
  const [fileRange, setFileRange] = useState(28);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [botFilter, setBotFilter] = useState('All');
  const [pathFilter, setPathFilter] = useState('');
  const [ipFilter, setIpFilter] = useState('');
  const [customUa, setCustomUa] = useState('');

  useEffect(() => { fetchSites(); }, []);

  const fetchSites = async () => {
    try {
      const res = await fetch('/api/sites');
      const data = await res.json();
      setSites(data);
      if (Object.keys(data).length > 0) setSelectedSite(Object.keys(data)[0]);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (selectedSite) fetchFiles(selectedSite);
  }, [selectedSite]);

  const startProgress = (numFiles) => {
    setProgress(0);
    const estimatedMs = Math.max(numFiles * 1800, 3000);
    const stepMs = 120;
    const increment = 88 / (estimatedMs / stepMs);
    let current = 0;
    progressRef.current = setInterval(() => {
      current = Math.min(current + increment, 88);
      setProgress(current);
      if (current >= 88) clearInterval(progressRef.current);
    }, stepMs);
  };

  const finishProgress = () => {
    if (progressRef.current) clearInterval(progressRef.current);
    setProgress(100);
    setTimeout(() => setProgress(0), 800);
  };

  const fetchFiles = async (siteName) => {
    setLoadingFiles(true);
    setAvailableFiles([]);
    setAnalytics(null);
    try {
      const res = await fetch('/api/logs/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_name: siteName })
      });
      const data = await res.json();
      setAvailableFiles(data.files || []);
    } catch (e) { console.error(e); }
    finally { setLoadingFiles(false); }
  };

  const handleAnalyze = async () => {
    if (!selectedSite || !availableFiles.length) return;
    const filesToLoad = availableFiles.slice(0, fileRange);
    setLoading(true);
    setAnalytics(null);
    startProgress(filesToLoad.length);
    try {
      const res = await fetch('/api/logs/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_name: selectedSite, files: filesToLoad })
      });
      const data = await res.json();
      setAnalytics(data);
      onData?.(data);
      finishProgress();
    } catch (e) { console.error(e); finishProgress(); }
    finally { setLoading(false); }
  };

  // Filters apply to the raw sample (table only)
  const sampleRows = analytics?.sample_rows || [];
  const filteredRows = sampleRows.filter(log => {
    if (statusFilter && log.status !== statusFilter) return false;
    if (pathFilter && !log.request?.toLowerCase().includes(pathFilter.toLowerCase())) return false;
    if (ipFilter && !log.ip?.includes(ipFilter)) return false;
    const ua = log.user_agent?.toLowerCase() || '';
    if (customUa && !ua.includes(customUa.toLowerCase())) return false;
    if (botFilter !== 'All') {
      if (botFilter === 'Any Bot' && !ua.match(/bot|spider|crawler/i)) return false;
      if (botFilter !== 'Any Bot' && !ua.includes(botFilter.toLowerCase())) return false;
    }
    return true;
  });

  // When a bot is selected, use its pre-computed full-dataset aggregations from the server.
  // Other filters only affect the table.
  const activeBotAgg = botFilter !== 'All' ? analytics?.bot_aggregations?.[botFilter] : null;

  const _src = activeBotAgg || analytics;
  const statusData   = (_src?.status_data  || []).map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }));
  const topPathsData = (_src?.top_paths    || []).map(p => ({ path: p.path.length > 35 ? p.path.substring(0, 35) + '…' : p.path, hits: p.hits }));
  const timeData     = (_src?.time_series  || []).map(t => ({ date: t.date.replace('.json.gz', '').replace(/^.*?(\d{4}-\d{2}-\d{2}.*)$/, '$1'), hits: t.hits }));
  const botBreakdown = (analytics?.bot_breakdown || []).map((b, i) => ({ ...b, fill: COLORS[i % COLORS.length] }));

  const isBotFiltered = botFilter !== 'All';

  // Real count from full dataset for the active status filter
  const realStatusCount = statusFilter && analytics
    ? (analytics.status_data?.find(s => s.name === statusFilter)?.value ?? null)
    : null;

  const exportCSV = async () => {
    if (!analytics) return;
    setExporting(true);
    try {
      const filesToLoad = availableFiles.slice(0, fileRange);
      const res = await fetch('/api/logs/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_name: selectedSite,
          files: filesToLoad,
          status_filter: statusFilter || null,
          bot_filter: botFilter,
          path_filter: pathFilter || null,
          ip_filter: ipFilter || null,
          custom_ua: customUa || null,
        })
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logs_${selectedSite.replace(/ /g, '_')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex-col gap-6">

      {/* Data Source */}
      <div className="glass-panel">
        <h2 className="flex items-center gap-2 mb-6"><Database size={20} color="var(--primary)" /> Data Source</h2>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="metric-label mb-2 block">Log Site</label>
            <select className="glass-input glass-select" value={selectedSite} onChange={e => setSelectedSite(e.target.value)}>
              {Object.keys(sites).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="metric-label mb-2 block">
              Days to Load
              {loadingFiles
                ? <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontSize: '0.78rem' }}>fetching files…</span>
                : availableFiles.length > 0
                  ? <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontSize: '0.78rem' }}>{availableFiles.length} files available</span>
                  : null}
            </label>
            <div className="flex gap-2">
              {[1, 3, 5, 7, 14, 28, 60, 90].map(d => (
                <button
                  key={d}
                  onClick={() => setFileRange(d)}
                  className={fileRange === d ? 'btn-primary' : ''}
                  style={fileRange !== d ? {
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--text-muted)', padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                    fontWeight: 600, fontSize: '0.8rem'
                  } : { padding: '10px 14px', fontSize: '0.8rem' }}
                  disabled={availableFiles.length === 0}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end">
            <button
              className="btn-primary w-full"
              onClick={handleAnalyze}
              disabled={loading || availableFiles.length === 0}
            >
              {loading
                ? <><div className="loader" /> Loading {Math.min(fileRange, availableFiles.length)} files…</>
                : `🚀 Load & Analyze Logs`}
            </button>
          </div>
        </div>

        {availableFiles.length > 0 && !loading && progress === 0 && (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Will load the <strong style={{ color: 'white' }}>{Math.min(fileRange, availableFiles.length)}</strong> most recent files
            (newest: <code style={{ color: 'var(--primary)' }}>{availableFiles[0]}</code>)
          </p>
        )}

        {/* File-list fetch: indeterminate shimmer */}
        {loadingFiles && (
          <div style={{ marginTop: 12, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
            <style>{`@keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(500%)}}`}</style>
            <div style={{ height: '100%', width: '20%', background: 'linear-gradient(90deg, transparent, var(--primary), transparent)', borderRadius: 4, animation: 'shimmer 1.2s ease infinite' }} />
          </div>
        )}

        {/* Log analysis: estimated progress */}
        {(loading || progress > 0) && (
          <div style={{ marginTop: 16 }}>
            <div className="flex justify-between mb-2" style={{ fontSize: '0.82rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>
                {loading ? `Downloading & parsing ${Math.min(fileRange, availableFiles.length)} files…` : '✓ Complete'}
              </span>
              <span style={{ fontWeight: 700, color: progress >= 100 ? '#4ade80' : 'white' }}>
                {Math.round(progress)}%
              </span>
            </div>
            <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${progress}%`,
                background: progress >= 100 ? '#4ade80' : 'linear-gradient(90deg, #E20071, #00f2fe)',
                borderRadius: 6,
                transition: progress === 0 ? 'none' : 'width 0.15s ease',
                boxShadow: progress >= 100 ? '0 0 12px rgba(74,222,128,0.5)' : '0 0 10px rgba(226,0,113,0.4)',
              }} />
            </div>
          </div>
        )}
      </div>

      {analytics?.total_hits > 0 && (
        <>
          {/* Summary Metrics */}
          <div className="grid grid-cols-3 gap-4">
            <MetricCard icon={Activity}      label="Total Hits"     value={analytics.total_hits.toLocaleString()}     color="var(--primary)" sub={`${Math.min(fileRange, availableFiles.length)} files`} />
            <MetricCard icon={AlertTriangle} label="404 Errors"     value={analytics.errors_404.toLocaleString()}     color="#f87171" />
            <MetricCard icon={AlertTriangle} label="5xx Errors"     value={analytics.errors_5xx.toLocaleString()}     color="#fb923c" />
            <MetricCard icon={Globe}         label="Unique IPs"     value={analytics.unique_ips.toLocaleString()}     color="#00f2fe" />
            <MetricCard icon={Eye}           label="Googlebot Hits" value={analytics.googlebot_hits.toLocaleString()} color="#4ade80" sub={`${analytics.googlebot_rate}% of total`} />
            <MetricCard icon={TrendingUp}    label="Bot Crawlers"   value={analytics.bot_count}                       color="#8b5cf6" sub="distinct bots detected" />
          </div>

          {/* Filters */}
          <div className="glass-panel">
            <h3 className="flex items-center gap-2 mb-4"><Filter size={18} /> Filter Results</h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="metric-label mb-2 block">Status Code</label>
                <select className="glass-input glass-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="metric-label mb-2 block">Bot / Crawler</label>
                <select className="glass-input glass-select" value={botFilter} onChange={e => { setBotFilter(e.target.value); setCustomUa(''); }}>
                  {BOT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="metric-label mb-2 block">Custom User Agent</label>
                <input className="glass-input" placeholder="contains…" value={customUa} onChange={e => { setCustomUa(e.target.value); setBotFilter('All'); }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="metric-label mb-2 block">Path Contains</label>
                <input className="glass-input" placeholder="/apostas/" value={pathFilter} onChange={e => setPathFilter(e.target.value)} />
              </div>
              <div>
                <label className="metric-label mb-2 block">IP Address</label>
                <input className="glass-input" placeholder="66.249." value={ipFilter} onChange={e => setIpFilter(e.target.value)} />
              </div>
            </div>
            <div className="mt-3" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Table shows <strong style={{ color: 'white' }}>{filteredRows.length.toLocaleString()}</strong> from the <strong style={{ color: 'white' }}>{sampleRows.length.toLocaleString()}</strong>-row sample
              {realStatusCount !== null && (
                <> — full {statusFilter} count across all data: <strong style={{ color: '#f87171' }}>{realStatusCount.toLocaleString()}</strong></>
              )}
              {' '}— <strong style={{ color: 'white' }}>Export CSV</strong> streams all matching entries from the source
            </div>
          </div>

          {/* Charts row 1 */}
          {isBotFiltered && (
            <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(226,0,113,0.1)', border: '1px solid rgba(226,0,113,0.3)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Charts show full-dataset aggregations for <strong style={{ color: 'white' }}>{botFilter}</strong> only ({(analytics?.bot_aggregations?.[botFilter]?.status_data || []).reduce((s, d) => s + d.value, 0).toLocaleString()} hits).
              Clear the bot filter to restore all-traffic view.
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="glass-panel" style={{ height: 320 }}>
              <h4 className="mb-4">Status Code Distribution</h4>
              <ResponsiveContainer width="100%" height="85%">
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={4} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} />
                  <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(226,0,113,0.3)', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="glass-panel" style={{ height: 320 }}>
              <h4 className="mb-4">Top 10 Requested Paths</h4>
              <ResponsiveContainer width="100%" height="85%">
                <BarChart data={topPathsData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="path" type="category" width={160} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(226,0,113,0.3)', borderRadius: 8 }} />
                  <Bar dataKey="hits" fill="var(--primary)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Traffic over time */}
          <div className="glass-panel" style={{ height: 300 }}>
            <h4 className="mb-4">Traffic Over Time</h4>
            <ResponsiveContainer width="100%" height="85%">
              <LineChart data={timeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(226,0,113,0.3)', borderRadius: 8 }} />
                <Line type="monotone" dataKey="hits" stroke="#00f2fe" strokeWidth={2.5} dot={{ r: 3, fill: '#0f172a', strokeWidth: 2 }} activeDot={{ r: 7 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Bot Breakdown */}
          {botBreakdown.length > 0 && (
            <div className="glass-panel" style={{ height: 280 }}>
              <h4 className="mb-1 flex items-center gap-2"><Bot size={18} color="#8b5cf6" /> Bot / Crawler Breakdown</h4>
              <p className="mb-4" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Across all {analytics.total_hits.toLocaleString()} loaded entries
              </p>
              <ResponsiveContainer width="100%" height="75%">
                <BarChart data={botBreakdown} margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                  <XAxis dataKey="bot" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(226,0,113,0.3)', borderRadius: 8 }} />
                  <Bar dataKey="hits" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Log Table */}
          <div className="glass-panel">
            <div className="flex justify-between items-center mb-4">
              <h4>Log Data Explorer <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 400 }}>(showing first 200 of sample)</span></h4>
              <button className="btn-primary flex items-center gap-2" onClick={exportCSV} disabled={exporting} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                {exporting ? <><div className="loader" style={{ width: 14, height: 14, borderWidth: 2 }} /> Exporting…</> : <><Download size={14} /> Export All CSV</>}
              </button>
            </div>
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>IP</th>
                    <th>Status</th>
                    <th>Method</th>
                    <th>Path</th>
                    <th>User Agent</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.slice(0, 200).map((log, i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {log._source_file?.replace('.json.gz', '').replace(/^.*?(\d{4}-\d{2}-\d{2}.*)$/, '$1')}
                      </td>
                      <td>{log.ip}</td>
                      <td>
                        <span className={`tag status-${log.status}`}>{log.status}</span>
                      </td>
                      <td>{log.method}</td>
                      <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.request}</td>
                      <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{log.user_agent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredRows.length > 200 && (
                <div className="mt-3" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {(filteredRows.length - 200).toLocaleString()} more rows — export CSV to see all.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
