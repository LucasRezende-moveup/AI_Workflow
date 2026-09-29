import { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, LineChart, Line, CartesianGrid } from 'recharts';
import { Database, Filter, Download, Activity, Globe, AlertTriangle, Bot, TrendingUp, Eye, Gauge, Sparkles, FileText, Table } from 'lucide-react';

const COLORS = ['#E20071', '#0891b2', '#15803d', '#b45309', '#7c3aed', '#db2777', '#0284c7', '#4d7c0f'];

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

  // Crawl budget action plan (AI, on demand — one Gemini call per click)
  const [plan, setPlan]             = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError]   = useState('');

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
    // The plan describes the previous window; keeping it on screen next to new numbers
    // would attribute one period's actions to another.
    setPlan(null); setPlanError('');
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

  // ── Crawl budget action plan ────────────────────────────────────────────────
  const runCrawlBudget = async () => {
    if (!selectedSite || !availableFiles.length) return;
    setPlanLoading(true); setPlanError(''); setPlan(null);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch('/api/logs/crawl-budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ site_name: selectedSite, files: availableFiles.slice(0, fileRange) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Analysis failed');
      setPlan(data);
    } catch (e) {
      setPlanError(e.message || 'Request failed.');
    } finally {
      setPlanLoading(false);
    }
  };

  const planPeriod = () =>
    `${plan?.days_covered || 0} day${plan?.days_covered === 1 ? '' : 's'} of logs`;

  const planMarkdown = () => {
    if (!plan) return '';
    const s = plan.signals || {};
    const L = [
      `# Crawl Budget Actions — ${plan.site}`,
      ``,
      `${planPeriod()} · generated ${new Date(plan.generated_at).toLocaleString()}`,
      ``,
      `## Measured`,
      ``,
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Googlebot requests | ${(s.googlebot_hits || 0).toLocaleString()} (${s.googlebot_share_pct}% of ${(s.total_hits || 0).toLocaleString()} hits) |`,
      `| Wasted on redirects/errors | ${(s.wasted_hits || 0).toLocaleString()} (${s.wasted_pct}% of Googlebot requests) |`,
      `| 3xx redirects | ${s.redirect_pct}% |`,
      `| 404/410 | ${s.not_found_pct}% |`,
      `| 5xx | ${s.server_error_pct}% |`,
      `| Parameter URLs (top paths) | ${s.parameter_url_pct}% |`,
      `| Static assets (top paths) | ${s.static_asset_pct}% |`,
      `| Low-value paths (top paths) | ${s.low_value_path_pct}% |`,
      `| Third-party crawlers | ${s.third_party_pct}% of all hits |`,
      `| Googlebot trend | ${s.googlebot_trend_pct == null ? 'n/a' : `${s.googlebot_trend_pct > 0 ? '+' : ''}${s.googlebot_trend_pct}%`} |`,
      ``,
    ];
    if (plan.summary) L.push(`## Summary`, ``, plan.summary, ``);
    L.push(`## Top actions`, ``);
    (plan.actions || []).forEach((a, i) => {
      L.push(
        `### ${i + 1}. ${a.title}`,
        ``,
        `**Impact:** ${a.impact} · **Effort:** ${a.effort}`,
        ``,
        `- **Evidence:** ${a.evidence}`,
        `- **Fix:** ${a.fix}`,
        `- **Watch:** ${a.metric}`,
        ``,
      );
    });
    if (plan.parse_failed && plan.raw) L.push(`## Raw analysis`, ``, plan.raw, ``);
    return L.join('\n');
  };

  const planCsv = () => {
    if (!plan) return '';
    const cell = v => {
      const t = v == null ? '' : String(v);
      return /[",;\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const rows = [['#', 'Action', 'Impact', 'Effort', 'Evidence', 'Fix', 'Metric to watch']];
    (plan.actions || []).forEach((a, i) =>
      rows.push([i + 1, a.title, a.impact, a.effort, a.evidence, a.fix, a.metric]));
    // BOM + CRLF so Excel opens it as UTF-8; cells quote on ';' too for pt-BR locales.
    return '\ufeff' + rows.map(r => r.map(cell).join(',')).join('\r\n');
  };

  const downloadPlan = (kind) => {
    const isCsv = kind === 'csv';
    const body = isCsv ? planCsv() : planMarkdown();
    const blob = new Blob([body], { type: isCsv ? 'text/csv;charset=utf-8;' : 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crawl-budget-${selectedSite.replace(/ /g, '_')}-${new Date().toISOString().slice(0, 10)}.${isCsv ? 'csv' : 'md'}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

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
            <label className="metric-label mb-2 block" htmlFor="log-site">Log Site</label>
            <select id="log-site" aria-label="Log Site" className="glass-input glass-select" value={selectedSite} onChange={e => setSelectedSite(e.target.value)}>
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
                    background: 'rgb(var(--ink) / 0.05)', border: '1px solid rgb(var(--ink) / 0.1)',
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
                : <><span aria-hidden="true">🚀</span> Load & Analyze Logs</>}
            </button>
          </div>
        </div>

        {availableFiles.length > 0 && !loading && progress === 0 && (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Will load the <strong style={{ color: 'var(--text-strong)' }}>{Math.min(fileRange, availableFiles.length)}</strong> most recent files
            (newest: <code style={{ color: 'var(--primary)' }}>{availableFiles[0]}</code>)
          </p>
        )}

        {/* File-list fetch: indeterminate shimmer */}
        {loadingFiles && (
          <div style={{ marginTop: 12, height: 4, background: 'rgb(var(--ink) / 0.08)', borderRadius: 4, overflow: 'hidden' }}>
            <style>{`@keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(500%)}}`}</style>
            <div style={{ height: '100%', width: '20%', background: 'linear-gradient(90deg, transparent, var(--primary), transparent)', borderRadius: 4, animation: 'shimmer 1.2s ease infinite' }} />
          </div>
        )}

        {/* Log analysis: estimated progress */}
        {(loading || progress > 0) && (
          <div style={{ marginTop: 16 }}>
            <div className="flex justify-between mb-2" role="status" aria-live="polite" style={{ fontSize: '0.82rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>
                {loading ? `Downloading & parsing ${Math.min(fileRange, availableFiles.length)} files…` : '✓ Complete'}
              </span>
              <span style={{ fontWeight: 700, color: progress >= 100 ? '#15803d' : 'var(--text-strong)' }}>
                {Math.round(progress)}%
              </span>
            </div>
            <div style={{ height: 8, background: 'rgb(var(--ink) / 0.08)', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${progress}%`,
                background: progress >= 100 ? '#15803d' : 'linear-gradient(90deg, #E20071, #0891b2)',
                borderRadius: 6,
                transition: progress === 0 ? 'none' : 'width 0.15s ease',
                boxShadow: progress >= 100 ? '0 2px 8px rgba(21,128,61,0.35)' : '0 0 10px rgba(226,0,113,0.4)',
              }} />
            </div>
          </div>
        )}
      </div>

      {analytics?.total_hits > 0 && (
        <>
          {/* 404-rate health banner */}
          {(() => {
            const rate = analytics.total_hits > 0 ? (analytics.errors_404 / analytics.total_hits) * 100 : 0;
            if (rate < 10) return null;
            const critical = rate >= 25;
            const color = critical ? '#dc2626' : '#b45309';
            const bg = critical ? 'rgba(248,113,113,0.08)' : 'rgba(251,191,36,0.08)';
            return (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', borderRadius: 8,
                background: bg, border: `1px solid ${color}44`, color,
              }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
                  <strong>{critical ? 'Critical: ' : 'Warning: '}</strong>
                  {rate.toFixed(1)}% of requests are 404s ({analytics.errors_404.toLocaleString()} of {analytics.total_hits.toLocaleString()}).
                  That's above the 10% threshold — broken links or bad URLs are wasting crawl budget.
                  This site is monitored daily and will alert in Slack automatically.
                </span>
              </div>
            );
          })()}

          {/* Summary Metrics */}
          <div className="grid grid-cols-3 gap-4">
            <MetricCard icon={Activity}      label="Total Hits"     value={analytics.total_hits.toLocaleString()}     color="var(--primary)" sub={`${Math.min(fileRange, availableFiles.length)} files`} />
            <MetricCard icon={AlertTriangle} label="404 Errors"     value={analytics.errors_404.toLocaleString()}     color="#dc2626" />
            <MetricCard icon={AlertTriangle} label="5xx Errors"     value={analytics.errors_5xx.toLocaleString()}     color="#c2410c" />
            <MetricCard icon={Globe}         label="Unique IPs"     value={analytics.unique_ips.toLocaleString()}     color="#0891b2" />
            <MetricCard icon={Eye}           label="Googlebot Hits" value={analytics.googlebot_hits.toLocaleString()} color="#15803d" sub={`${analytics.googlebot_rate}% of total`} />
            <MetricCard icon={TrendingUp}    label="Bot Crawlers"   value={analytics.bot_count}                       color="#7c3aed" sub="distinct bots detected" />
          </div>

          {/* Crawl budget action plan */}
          <div className="glass-panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h3 className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                  <Gauge size={18} color="var(--primary)" /> Crawl Budget Actions
                </h3>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Reads the {Math.min(fileRange, availableFiles.length)} selected day{Math.min(fileRange, availableFiles.length) === 1 ? '' : 's'} and ranks what to fix first — based on where Googlebot actually spent its requests.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {plan && !planLoading && (
                  <>
                    <button type="button" onClick={() => downloadPlan('md')} className="btn-secondary"
                      title="Export the action plan as Markdown"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', fontSize: '0.8rem' }}>
                      <FileText size={14} aria-hidden="true" /> .md
                    </button>
                    <button type="button" onClick={() => downloadPlan('csv')} className="btn-secondary"
                      title="Export the actions as a spreadsheet"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', fontSize: '0.8rem' }}>
                      <Table size={14} aria-hidden="true" /> .csv
                    </button>
                  </>
                )}
                <button type="button" onClick={runCrawlBudget} disabled={planLoading} className="btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', fontSize: '0.84rem' }}>
                  <Sparkles size={14} aria-hidden="true" style={{ animation: planLoading ? 'spin 1.4s linear infinite' : 'none' }} />
                  {planLoading ? 'Analysing…' : plan ? 'Re-analyse' : 'Analyse crawl budget'}
                </button>
              </div>
            </div>

            {planError && (
              <div role="alert" style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, fontSize: '0.82rem',
                background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#dc2626' }}>
                {planError}
              </div>
            )}

            {planLoading && (
              <div role="status" style={{ marginTop: 16, textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                Reading Googlebot's requests across {Math.min(fileRange, availableFiles.length)} days…
              </div>
            )}

            {plan && !planLoading && (
              <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* The measured basis for the plan — shown so no recommendation looks like a guess */}
                <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', padding: '12px 16px', borderRadius: 10,
                  background: 'rgb(var(--ink) / 0.03)', border: '1px solid rgb(var(--ink) / 0.08)' }}>
                  {[
                    ['Googlebot requests', (plan.signals.googlebot_hits || 0).toLocaleString(), `${plan.signals.googlebot_share_pct}% of all hits`, 'var(--text-strong)'],
                    ['Wasted', `${plan.signals.wasted_pct}%`, `${(plan.signals.wasted_hits || 0).toLocaleString()} redirects, errors & blocks`, plan.signals.wasted_pct >= 20 ? '#dc2626' : plan.signals.wasted_pct >= 10 ? '#b45309' : '#15803d'],
                    ['Parameter URLs', `${plan.signals.parameter_url_pct}%`, 'of top crawled paths', 'var(--text-strong)'],
                    ['Third-party bots', `${plan.signals.third_party_pct}%`, 'of all server hits', 'var(--text-strong)'],
                  ].map(([label, value, sub, color]) => (
                    <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)' }}>{label}</span>
                      <span style={{ fontSize: '1.05rem', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{sub}</span>
                    </div>
                  ))}
                </div>

                {plan.ai_error && (
                  <div role="status" style={{ padding: '10px 14px', borderRadius: 8, fontSize: '0.8rem',
                    background: 'rgba(180,83,9,0.09)', border: '1px solid rgba(180,83,9,0.3)', color: 'var(--text-strong)' }}>
                    <strong>The measured numbers below are complete; the ranked actions are not.</strong>{' '}
                    Gemini was unavailable for this run — {plan.ai_error.slice(0, 160)}
                    {plan.ai_error.length > 160 ? '…' : ''}. Re-run in a minute and the plan will fill in.
                  </div>
                )}

                {plan.summary && (
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-strong)', lineHeight: 1.6, maxWidth: '72ch' }}>
                    {plan.summary}
                  </p>
                )}

                {plan.parse_failed && plan.raw && (
                  <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>{plan.raw}</pre>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(plan.actions || []).map((a, i) => {
                    const impactColor = a.impact === 'high' ? '#dc2626' : a.impact === 'medium' ? '#b45309' : '#64748b';
                    return (
                      <div key={i} style={{ border: '1px solid rgb(var(--ink) / 0.08)', borderLeft: `3px solid ${impactColor}`,
                        borderRadius: 8, padding: '13px 16px', background: 'rgb(var(--ink) / 0.02)' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-dim)', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
                          <span style={{ fontWeight: 650, fontSize: '0.92rem', color: 'var(--text-strong)', flex: 1, minWidth: 200 }}>{a.title}</span>
                          <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                            color: impactColor, background: `${impactColor}1a`, border: `1px solid ${impactColor}55`, padding: '2px 8px', borderRadius: 20 }}>
                            {a.impact} impact
                          </span>
                          <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                            color: 'var(--text-muted)', background: 'rgb(var(--ink) / 0.06)', border: '1px solid rgb(var(--ink) / 0.12)', padding: '2px 8px', borderRadius: 20 }}>
                            {a.effort} effort
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.82rem', lineHeight: 1.55 }}>
                          {a.evidence && <div style={{ color: 'var(--text-muted)' }}><strong style={{ color: 'var(--text-strong)' }}>Evidence: </strong>{a.evidence}</div>}
                          {a.fix && <div style={{ color: 'var(--text-muted)' }}><strong style={{ color: 'var(--text-strong)' }}>Fix: </strong>{a.fix}</div>}
                          {a.metric && <div style={{ color: 'var(--text-muted)' }}><strong style={{ color: 'var(--text-strong)' }}>Watch: </strong>{a.metric}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                  Based on {planPeriod()} · generated {new Date(plan.generated_at).toLocaleString()} · the percentages above are measured from the logs, the ranking and wording are AI.
                </div>
              </div>
            )}
          </div>

          {(analytics.cache_hits > 0 || analytics.files_parsed > 0) && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: -8 }}>
              <span aria-hidden="true">⚡</span> {analytics.cache_hits > 0 && <><strong style={{ color: '#15803d' }}>{analytics.cache_hits}</strong> day{analytics.cache_hits !== 1 ? 's' : ''} from cache</>}
              {analytics.cache_hits > 0 && analytics.files_parsed > 0 && ' · '}
              {analytics.files_parsed > 0 && <><strong style={{ color: 'var(--text-strong)' }}>{analytics.files_parsed}</strong> freshly parsed</>}
              {' '}— cached days load instantly without re-downloading.
            </div>
          )}

          {/* Filters */}
          <div className="glass-panel">
            <h3 className="flex items-center gap-2 mb-4"><Filter size={18} /> Filter Results</h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="metric-label mb-2 block" htmlFor="log-status">Status Code</label>
                <select id="log-status" aria-label="Status Code" className="glass-input glass-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="metric-label mb-2 block" htmlFor="log-bot">Bot / Crawler</label>
                <select id="log-bot" aria-label="Bot / Crawler" className="glass-input glass-select" value={botFilter} onChange={e => { setBotFilter(e.target.value); setCustomUa(''); }}>
                  {BOT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="metric-label mb-2 block" htmlFor="log-ua">Custom User Agent</label>
                <input id="log-ua" aria-label="Custom User Agent" className="glass-input" placeholder="contains…" value={customUa} onChange={e => { setCustomUa(e.target.value); setBotFilter('All'); }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="metric-label mb-2 block" htmlFor="log-path">Path Contains</label>
                <input id="log-path" aria-label="Path Contains" className="glass-input" placeholder="/apostas/" value={pathFilter} onChange={e => setPathFilter(e.target.value)} />
              </div>
              <div>
                <label className="metric-label mb-2 block" htmlFor="log-ip">IP Address</label>
                <input id="log-ip" aria-label="IP Address" className="glass-input" placeholder="66.249." value={ipFilter} onChange={e => setIpFilter(e.target.value)} />
              </div>
            </div>
            <div className="mt-3" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Table shows <strong style={{ color: 'var(--text-strong)' }}>{filteredRows.length.toLocaleString()}</strong> from the <strong style={{ color: 'var(--text-strong)' }}>{sampleRows.length.toLocaleString()}</strong>-row sample
              {realStatusCount !== null && (
                <> — full {statusFilter} count across all data: <strong style={{ color: '#dc2626' }}>{realStatusCount.toLocaleString()}</strong></>
              )}
              {' '}— <strong style={{ color: 'var(--text-strong)' }}>Export CSV</strong> streams all matching entries from the source
            </div>
          </div>

          {/* Charts row 1 */}
          {isBotFiltered && (
            <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(226,0,113,0.1)', border: '1px solid rgba(226,0,113,0.3)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Charts show full-dataset aggregations for <strong style={{ color: 'var(--text-strong)' }}>{botFilter}</strong> only ({(analytics?.bot_aggregations?.[botFilter]?.status_data || []).reduce((s, d) => s + d.value, 0).toLocaleString()} hits).
              Clear the bot filter to restore all-traffic view.
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="glass-panel" style={{ height: 320 }}>
              <h4 className="mb-4">Status Code Distribution</h4>
              <ResponsiveContainer width="100%" height="85%">
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={4} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--surface)', color: 'var(--text-strong)', border: '1px solid rgb(var(--ink) / 0.1)', boxShadow: 'var(--shadow-lg)', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="glass-panel" style={{ height: 320 }}>
              <h4 className="mb-4">Top 10 Requested Paths</h4>
              <ResponsiveContainer width="100%" height="85%">
                <BarChart data={topPathsData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="path" type="category" width={160} tick={{ fill: '#64748b', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: 'var(--surface)', color: 'var(--text-strong)', border: '1px solid rgb(var(--ink) / 0.1)', boxShadow: 'var(--shadow-lg)', borderRadius: 8 }} />
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
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e7ee" />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#64748b' }} />
                <Tooltip contentStyle={{ background: 'var(--surface)', color: 'var(--text-strong)', border: '1px solid rgb(var(--ink) / 0.1)', boxShadow: 'var(--shadow-lg)', borderRadius: 8 }} />
                <Line type="monotone" dataKey="hits" stroke="#0891b2" strokeWidth={2.5} dot={{ r: 3, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 7 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Bot Breakdown */}
          {botBreakdown.length > 0 && (
            <div className="glass-panel" style={{ height: 280 }}>
              <h4 className="mb-1 flex items-center gap-2"><Bot size={18} color="#7c3aed" /> Bot / Crawler Breakdown</h4>
              <p className="mb-4" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Across all {analytics.total_hits.toLocaleString()} loaded entries
              </p>
              <ResponsiveContainer width="100%" height="75%">
                <BarChart data={botBreakdown} margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                  <XAxis dataKey="bot" tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#64748b' }} />
                  <Tooltip contentStyle={{ background: 'var(--surface)', color: 'var(--text-strong)', border: '1px solid rgb(var(--ink) / 0.1)', boxShadow: 'var(--shadow-lg)', borderRadius: 8 }} />
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
