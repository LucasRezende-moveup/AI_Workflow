import { useState, useEffect } from 'react';
import { Download, Globe, MousePointerClick, Eye, TrendingUp, BarChart2, MessageSquare, Sparkles, Search, Link, Users, Star, X, ArrowUp, ArrowDown, Minus, ExternalLink, MapPin } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const SINGLE_CUTS = [
  { label: 'Query',   value: 'query' },
  { label: 'Page',    value: 'page' },
  { label: 'Date',    value: 'date' },
  { label: 'Country', value: 'country' },
  { label: 'Device',  value: 'device' },
];

// Two-dimension breakdowns (served via /gsc/{site}/{cut})
const COMBO_CUTS = [
  { label: 'Page × Country',   value: 'page_country' },
  { label: 'Page × Device',    value: 'page_device' },
  { label: 'Country × Device', value: 'country_device' },
  { label: 'Query × Page',     value: 'query_page' },
  { label: 'Query × Country',  value: 'query_country' },
  { label: 'Query × Device',   value: 'query_device' },
];

const DIM_LABEL = { query: 'Query', page: 'Page', country: 'Country', device: 'Device', date: 'Date' };

// Which dimension columns a cut renders
function dimsForCut(cut) {
  if (cut === 'query') return ['query', 'page'];   // classic query cut carries the page too
  if (cut === 'date')  return ['date'];
  if (['page', 'country', 'device'].includes(cut)) return [cut];
  return cut.split('_');   // 'page_country' → ['page','country'], 'query_device' → ['query','device']
}

function dimValue(row, dim) {
  if (dim === 'date') return row.date_key || row.date || row.report_date || '—';
  return row[dim] || '—';
}

const SEARCH_TYPES = [
  { label: 'Web',   value: 'web' },
  { label: 'Image', value: 'image' },
  { label: 'Video', value: 'video' },
  { label: 'News',  value: 'news' },
];

function MetricCard({ icon: Icon, label, value, sub, color = 'var(--primary)' }) {
  return (
    <div className="glass-panel interactive">
      <Icon className="mb-2" size={24} color={color} />
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function ErrorBanner({ msg }) {
  if (!msg) return null;
  return <div className="banner banner-error" role="alert">{msg}</div>;
}

export default function GscDashboard() {
  const [mainTab, setMainTab] = useState('gsc');

  // ── GSC ─────────────────────────────────────────
  const [gscSites, setGscSites]           = useState([]);
  const [selectedSite, setSelectedSite]   = useState('');
  const [gscCut, setGscCut]               = useState('query');
  const [gscSearchType, setGscSearchType] = useState('web');
  const defaultDate = new Date(); defaultDate.setDate(defaultDate.getDate() - 4);
  const defaultStart = new Date(); defaultStart.setDate(defaultStart.getDate() - 31);
  const [gscDateMode, setGscDateMode]     = useState('latest');   // 'latest' | 'single' | 'range'
  const [gscDate, setGscDate]             = useState(defaultDate.toISOString().split('T')[0]);
  const [gscStart, setGscStart]           = useState(defaultStart.toISOString().split('T')[0]);
  const [gscEnd, setGscEnd]               = useState(defaultDate.toISOString().split('T')[0]);
  const [gscSort, setGscSort]             = useState('clicks');   // 'clicks' | 'impressions'
  const [gscData, setGscData]             = useState([]);
  const [gscLoading, setGscLoading]       = useState(false);
  const [gscError, setGscError]           = useState('');
  const [gscTab, setGscTab]               = useState('data');

  const [queryFilter,     setQueryFilter]     = useState('');
  const [pageFilter,      setPageFilter]      = useState('');
  const [minClicks,       setMinClicks]       = useState(0);
  const [minImpressions,  setMinImpressions]  = useState(0);

  const [insights,        setInsights]        = useState('');
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [chatLog,         setChatLog]         = useState([]);
  const [chatInput,       setChatInput]       = useState('');
  const [chatLoading,     setChatLoading]     = useState(false);

  // ── Ahrefs ───────────────────────────────────────
  const [ahrefsProjects,  setAhrefsProjects]  = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [ahrefsTab,       setAhrefsTab]       = useState('overview');
  const [rankTracker,     setRankTracker]     = useState([]);
  const [ahrefsKeywords,  setAhrefsKeywords]  = useState([]);
  const [competitors,     setCompetitors]     = useState([]);
  const [ahrefsLoading,   setAhrefsLoading]   = useState(false);
  const [ahrefsError,     setAhrefsError]     = useState('');
  const [kwModal,         setKwModal]         = useState(null);   // { keyword, url, currentPos, difficulty, volume }
  const [kwHistory,       setKwHistory]       = useState([]);
  const [kwHistoryLoading, setKwHistoryLoading] = useState(false);
  const [kwModalTab,      setKwModalTab]      = useState('history');
  const [serpData,        setSerpData]        = useState([]);
  const [serpPaa,         setSerpPaa]         = useState([]);
  const [serpLoading,     setSerpLoading]     = useState(false);

  // ── SERP Research tab ────────────────────────────
  const [serpTabKeyword,   setSerpTabKeyword]   = useState('');
  const [serpTabLocation,  setSerpTabLocation]  = useState('Global (No Geolocation)');
  const [serpTabLocations, setSerpTabLocations] = useState([]);
  const [serpTabTargetUrl, setSerpTabTargetUrl] = useState('');
  const [serpTabLoading,   setSerpTabLoading]   = useState(false);
  const [serpTabData,      setSerpTabData]      = useState(null);
  const [serpTabError,     setSerpTabError]     = useState('');

  useEffect(() => {
    fetchGscSites();
    fetchAhrefsProjects();
    fetch('/api/serp/geolocations').then(r => r.json()).then(d => setSerpTabLocations(d.geolocations || [])).catch(() => {});
  }, []);

  // Close the keyword-history modal on Escape while it's open
  useEffect(() => {
    if (!kwModal) return;
    const onKeyDown = (e) => { if (e.key === 'Escape') setKwModal(null); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [kwModal]);

  const fetchGscSites = async () => {
    try {
      const data = await fetch('/api/data/gsc/sites').then(r => r.json());
      const sites = Array.isArray(data) ? data : [];
      setGscSites(sites);
      if (sites.length > 0) setSelectedSite(sites[0].site_slug);
    } catch (e) { console.error(e); }
  };

  const fetchAhrefsProjects = async () => {
    try {
      const data = await fetch('/api/data/ahrefs/projects').then(r => r.json());
      const projects = Array.isArray(data) ? data : [];
      setAhrefsProjects(projects);
      if (projects.length > 0) setSelectedProject(projects[0].project_slug);
    } catch (e) { console.error(e); }
  };

  // ── GSC handlers ─────────────────────────────────
  const handleGscFetch = async () => {
    if (!selectedSite) return;
    setGscLoading(true); setGscError(''); setGscData([]);
    setInsights(''); setChatLog([]);
    const body = { site_slug: selectedSite, cut: gscCut, search_type: gscSearchType };
    if (gscDateMode === 'single') body.date = gscDate || null;
    if (gscDateMode === 'range')  { body.start_date = gscStart; body.end_date = gscEnd; }
    // Query breakdowns default to the top 100 upstream — pull a richer set so the
    // client-side keyword / threshold / sort controls have room to work.
    if (dimsForCut(gscCut).includes('query')) body.limit = 1000;
    try {
      const res = await fetch('/api/data/gsc/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setGscError(data.detail || 'Failed to fetch data'); return; }
      const rows = Array.isArray(data) ? data : [];
      setGscData(rows);
      if (rows.length === 0) {
        setGscError(gscDateMode === 'single'
          ? 'No data for this date. GSC settles ~3 days back — try an earlier date or switch to Latest.'
          : 'No data returned for this selection.');
      }
    } catch (e) {
      setGscError('Request failed. Check network or API key.');
    } finally { setGscLoading(false); }
  };

  const gscDims = dimsForCut(gscCut);
  const filteredGsc = gscData.filter(row => {
    if (queryFilter && gscDims.includes('query') && !(row.query || '').toLowerCase().includes(queryFilter.toLowerCase())) return false;
    if (pageFilter  && gscDims.includes('page')  && !(row.page  || '').toLowerCase().includes(pageFilter.toLowerCase()))  return false;
    if ((row.clicks || 0) < minClicks) return false;
    if ((row.impressions || 0) < minImpressions) return false;
    return true;
  }).sort((a, b) => (Number(b[gscSort]) || 0) - (Number(a[gscSort]) || 0));

  const totalClicks      = filteredGsc.reduce((s, r) => s + (r.clicks || 0), 0);
  const totalImpressions = filteredGsc.reduce((s, r) => s + (r.impressions || 0), 0);
  const avgCtr           = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const avgPos           = filteredGsc.length > 0
    ? filteredGsc.reduce((s, r) => s + parseFloat(r.position || 0), 0) / filteredGsc.length : 0;

  const exportGscCsv = () => {
    if (!filteredGsc.length) return;
    const keys = Object.keys(filteredGsc[0]);
    const header = keys.join(',');
    const rows = filteredGsc.map(r => keys.map(k => `"${(r[k] ?? '').toString().replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `gsc_${selectedSite}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const getInsights = async () => {
    if (!filteredGsc.length) return;
    setInsightsLoading(true);
    try {
      const res = await fetch('/api/gsc/insights', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data_rows: filteredGsc.slice(0, 500) })
      });
      const json = await res.json();
      setInsights(json.insights || '');
    } catch (e) { console.error(e); }
    finally { setInsightsLoading(false); }
  };

  const handleChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !filteredGsc.length) return;
    const newLog = [...chatLog, { role: 'user', content: chatInput }];
    setChatLog(newLog); setChatInput(''); setChatLoading(true);
    try {
      const res = await fetch('/api/gsc/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: chatInput, data_rows: filteredGsc.slice(0, 500) })
      });
      const json = await res.json();
      setChatLog([...newLog, { role: 'assistant', content: json.response }]);
    } catch (e) { console.error(e); }
    finally { setChatLoading(false); }
  };

  // ── Keyword history modal ────────────────────────
  const toSlug = (kw) =>
    kw.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();

  const openKwHistory = async (row) => {
    setKwModal({ keyword: row.keyword, url: row.url, currentPos: row.position, difficulty: row.keyword_difficulty, volume: row.volume });
    setKwHistory([]); setSerpData([]); setSerpPaa([]);
    setKwModalTab('history');
    setKwHistoryLoading(true); setSerpLoading(true);
    const slug = toSlug(row.keyword);
    const geo  = row.country || 'BR';
    try {
      const [histRes, serpRes, paaRes] = await Promise.all([
        fetch('/api/data/ahrefs/keyword-history', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_slug: selectedProject, keyword: row.keyword })
        }),
        fetch('/api/data/serp/organic', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword_slug: slug, geo })
        }),
        fetch('/api/data/serp/related', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword_slug: slug, geo })
        }),
      ]);
      const [hist, serp, paa] = await Promise.all([histRes.json(), serpRes.json(), paaRes.json()]);
      setKwHistory(Array.isArray(hist) ? hist : []);
      setSerpData(Array.isArray(serp) ? serp : []);
      setSerpPaa(Array.isArray(paa) ? paa : []);
    } catch (e) { console.error(e); }
    finally { setKwHistoryLoading(false); setSerpLoading(false); }
  };

  // ── Ahrefs handlers ──────────────────────────────
  const handleAhrefsFetch = async (tab) => {
    if (!selectedProject) return;
    setAhrefsLoading(true); setAhrefsError('');
    const t = tab || ahrefsTab;
    // overview reuses rank-tracker data — site-metrics endpoint doesn't exist for these projects
    const endpointMap = {
      overview:    '/api/data/ahrefs/rank-tracker',
      ranker:      '/api/data/ahrefs/rank-tracker',
      keywords:    '/api/data/ahrefs/keywords',
      competitors: '/api/data/ahrefs/competitor-stats',
    };
    const setterMap = {
      overview:    setRankTracker,
      ranker:      setRankTracker,
      keywords:    setAhrefsKeywords,
      competitors: setCompetitors,
    };
    try {
      const res = await fetch(endpointMap[t], {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_slug: selectedProject })
      });
      const data = await res.json();
      if (!res.ok) { setAhrefsError(data.detail || 'Fetch failed'); return; }
      setterMap[t](Array.isArray(data) ? data : []);
    } catch (e) { setAhrefsError('Request failed.'); }
    finally { setAhrefsLoading(false); }
  };

  const switchAhrefsTab = (tab) => {
    setAhrefsTab(tab);
    const hasData = { overview: rankTracker.length > 0, ranker: rankTracker.length > 0, keywords: ahrefsKeywords.length > 0, competitors: competitors.length > 0 };
    if (!hasData[tab]) handleAhrefsFetch(tab);
  };

  const ahrefsEmpty =
    (ahrefsTab === 'overview'    && rankTracker.length === 0) ||
    (ahrefsTab === 'ranker'      && rankTracker.length === 0) ||
    (ahrefsTab === 'keywords'    && ahrefsKeywords.length === 0) ||
    (ahrefsTab === 'competitors' && competitors.length === 0);

  // ── SERP Research handler ────────────────────────
  const handleSerpSearch = async () => {
    if (!serpTabKeyword.trim()) return;
    setSerpTabLoading(true); setSerpTabData(null); setSerpTabError('');
    try {
      const res = await fetch('/api/serp/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: serpTabKeyword.trim(), location_name: serpTabLocation, target_url: serpTabTargetUrl || null })
      });
      const data = await res.json();
      if (!res.ok) { setSerpTabError(data.detail || 'Failed to fetch SERP results'); return; }
      setSerpTabData(data);
    } catch (e) { setSerpTabError('Request failed. Check network.'); }
    finally { setSerpTabLoading(false); }
  };

  // ── Render ───────────────────────────────────────
  return (
    <div className="flex-col gap-6">

      {/* Main tabs */}
      <div className="flex gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 16 }}>
        {[
          { id: 'gsc',   label: 'GSC Performance',    icon: Search },
          { id: 'ahrefs', label: 'Ahrefs Intelligence', icon: BarChart2 },
          { id: 'serp',  label: 'SERP Research',       icon: ExternalLink },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} className={`nav-item ${mainTab === id ? 'active' : ''}`}
            onClick={() => setMainTab(id)}
            style={{ background: mainTab === id ? 'var(--primary)' : 'transparent' }}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* ════════ GSC ════════ */}
      {mainTab === 'gsc' && (
        <>
          <div className="glass-panel">
            <h2 className="flex items-center gap-2 mb-4"><Globe size={20} /> Search Console</h2>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div style={{ gridColumn: 'span 2' }}>
                <label className="metric-label mb-2 block">Site</label>
                <select className="glass-input glass-select" value={selectedSite} onChange={e => setSelectedSite(e.target.value)}>
                  {gscSites.length === 0 && <option>Loading…</option>}
                  {gscSites.map(s => <option key={s.site_slug} value={s.site_slug}>{s.site || s.domain || s.site_slug}</option>)}
                </select>
              </div>
              <div>
                <label className="metric-label mb-2 block">Dimension</label>
                <select className="glass-input glass-select" value={gscCut} onChange={e => setGscCut(e.target.value)}>
                  <optgroup label="Single dimension">
                    {SINGLE_CUTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </optgroup>
                  <optgroup label="Two dimensions">
                    {COMBO_CUTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="metric-label mb-2 block">Search Type</label>
                <select className="glass-input glass-select" value={gscSearchType} onChange={e => setGscSearchType(e.target.value)}>
                  {SEARCH_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="metric-label mb-2 block">Time range</label>
                <select className="glass-input glass-select" value={gscDateMode} onChange={e => setGscDateMode(e.target.value)}>
                  <option value="latest">Latest available</option>
                  <option value="single">Single day</option>
                  <option value="range">Date range</option>
                </select>
              </div>

              {gscDateMode === 'single' && (
                <div>
                  <label className="metric-label mb-2 block">
                    Date <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>settles ≥ 3 days back</span>
                  </label>
                  <input type="date" className="glass-input" value={gscDate} onChange={e => setGscDate(e.target.value)} />
                </div>
              )}

              {gscDateMode === 'range' && (
                <>
                  <div>
                    <label className="metric-label mb-2 block">From</label>
                    <input type="date" className="glass-input" value={gscStart} onChange={e => setGscStart(e.target.value)} />
                  </div>
                  <div>
                    <label className="metric-label mb-2 block">To</label>
                    <input type="date" className="glass-input" value={gscEnd} onChange={e => setGscEnd(e.target.value)} />
                  </div>
                </>
              )}

              <div style={{ gridColumn: gscDateMode === 'range' ? 'span 1' : gscDateMode === 'single' ? 'span 2' : 'span 3' }} className="flex items-end">
                <button className="btn-primary w-full" onClick={handleGscFetch} disabled={gscLoading || !selectedSite}>
                  {gscLoading ? <><div className="loader" /> Fetching…</> : '🔍 Fetch GSC Data'}
                </button>
              </div>
            </div>
            {gscDateMode === 'latest' && (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 10 }}>
                Showing the most recent available data — no date needed.
              </p>
            )}
          </div>

          <ErrorBanner msg={gscError} />

          {gscData.length > 0 && (
            <>
              <div className="grid grid-cols-4 gap-4">
                <MetricCard icon={MousePointerClick} label="Total Clicks"      value={totalClicks.toLocaleString()}        color="#00f2fe" />
                <MetricCard icon={Eye}               label="Total Impressions" value={totalImpressions.toLocaleString()}    color="#8b5cf6" />
                <MetricCard icon={TrendingUp}        label="Avg CTR"           value={`${(avgCtr * 100).toFixed(2)}%`}     color="#4ade80" />
                <MetricCard icon={BarChart2}         label="Avg Position"      value={avgPos.toFixed(1)}                   color="#f59e0b" />
              </div>

              <div className="glass-panel">
                <h3 className="mb-4">Filters &amp; sort</h3>
                <div className="grid grid-cols-4 gap-4">
                  {gscDims.includes('query') && (
                    <div>
                      <label className="metric-label mb-2 block">Keyword contains</label>
                      <input className="glass-input" placeholder="filter queries…" value={queryFilter} onChange={e => setQueryFilter(e.target.value)} />
                    </div>
                  )}
                  {gscDims.includes('page') && (
                    <div>
                      <label className="metric-label mb-2 block">Page contains</label>
                      <input className="glass-input" placeholder="/path…" value={pageFilter} onChange={e => setPageFilter(e.target.value)} />
                    </div>
                  )}
                  <div>
                    <label className="metric-label mb-2 block">Min Clicks</label>
                    <input type="number" className="glass-input" value={minClicks} onChange={e => setMinClicks(Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="metric-label mb-2 block">Min Impressions</label>
                    <input type="number" className="glass-input" value={minImpressions} onChange={e => setMinImpressions(Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="metric-label mb-2 block">Sort by</label>
                    <select className="glass-input glass-select" value={gscSort} onChange={e => setGscSort(e.target.value)}>
                      <option value="clicks">Clicks</option>
                      <option value="impressions">Impressions</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 12 }}>
                {[{ id: 'data', label: 'Data Table', Icon: DatabaseIcon }, { id: 'insights', label: 'AI Insights', Icon: Sparkles }, { id: 'chat', label: 'AI Chat', Icon: MessageSquare }]
                  .map(({ id, label, Icon }) => (
                    <button key={id} className={`nav-item ${gscTab === id ? 'active' : ''}`}
                      onClick={() => setGscTab(id)}
                      style={{ background: gscTab === id ? 'var(--primary)' : 'transparent' }}>
                      <Icon size={16} /> {label}
                    </button>
                  ))}
              </div>

              {gscTab === 'data' && (
                <div className="glass-panel">
                  <div className="flex justify-between items-center mb-4">
                    <h4>Results <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 400 }}>({filteredGsc.length.toLocaleString()} rows)</span></h4>
                    <button className="btn-primary flex items-center gap-2" onClick={exportGscCsv} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                      <Download size={14} /> Export CSV
                    </button>
                  </div>
                  <div className="data-table-container" style={{ maxHeight: 520, overflowY: 'auto' }}>
                    <table className="data-table">
                      <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-dark)' }}>
                        <tr>
                          {gscDims.map(d => <th key={d}>{DIM_LABEL[d]}</th>)}
                          <th>Clicks</th><th>Impressions</th><th>CTR</th><th>Position</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredGsc.slice(0, 500).map((row, i) => (
                          <tr key={i}>
                            {gscDims.map(d => (
                              <td key={d} style={{ maxWidth: d === 'page' ? 300 : 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...(d === 'page' ? { fontSize: '0.78rem', color: 'var(--text-muted)' } : {}) }}>
                                {dimValue(row, d)}
                              </td>
                            ))}
                            <td>{(row.clicks || 0).toLocaleString()}</td>
                            <td>{(row.impressions || 0).toLocaleString()}</td>
                            <td>{(parseFloat(row.ctr || 0) * 100).toFixed(2)}%</td>
                            <td>{parseFloat(row.position || 0).toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filteredGsc.length > 500 && (
                      <div className="mt-3" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        Showing 500 of {filteredGsc.length.toLocaleString()} — Export CSV to see all.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {gscTab === 'insights' && (
                <div className="glass-panel">
                  {!insights ? (
                    <div className="flex flex-col items-center justify-center" style={{ padding: '60px 20px' }}>
                      <Sparkles size={48} color="var(--primary)" className="mb-4" />
                      <h3 className="mb-4 text-center">AI SEO Insights</h3>
                      <p className="text-center mb-6" style={{ color: 'var(--text-muted)' }}>Gemini will analyze your top queries and identify opportunities.</p>
                      <button className="btn-primary" onClick={getInsights} disabled={insightsLoading}>
                        {insightsLoading ? <div className="loader" /> : 'Generate Insights'}
                      </button>
                    </div>
                  ) : (
                    <div className="markdown-content" style={{ lineHeight: 1.6 }}>
                      <ReactMarkdown>{insights}</ReactMarkdown>
                    </div>
                  )}
                </div>
              )}

              {gscTab === 'chat' && (
                <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: 600 }}>
                  <div style={{ flex: 1, overflowY: 'auto', paddingRight: 12 }} className="mb-4">
                    {chatLog.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
                        <MessageSquare size={48} className="mb-4" />
                        <p>Ask anything about the current GSC data!</p>
                      </div>
                    ) : chatLog.map((msg, i) => (
                      <div key={i} className={`mb-4 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                        <div style={{ display: 'inline-block', padding: '12px 16px', borderRadius: 12, background: msg.role === 'user' ? 'var(--primary)' : 'rgba(255,255,255,0.05)', maxWidth: '80%', textAlign: 'left' }}>
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="text-left"><div style={{ display: 'inline-block', padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.05)' }}>
                        <div className="loader" style={{ width: 16, height: 16, borderWidth: 2 }} /></div></div>
                    )}
                  </div>
                  <form onSubmit={handleChat} className="flex gap-4">
                    <input className="glass-input" aria-label="Ask about the data" placeholder="Ask about the data…" value={chatInput} onChange={e => setChatInput(e.target.value)} disabled={chatLoading} />
                    <button type="submit" className="btn-primary" disabled={chatLoading || !chatInput.trim()}>Send</button>
                  </form>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ════════ AHREFS ════════ */}
      {mainTab === 'ahrefs' && (
        <>
          <div className="glass-panel">
            <h2 className="flex items-center gap-2 mb-4"><BarChart2 size={20} /> Ahrefs Intelligence</h2>
            <div className="grid grid-cols-4 gap-4">
              <div style={{ gridColumn: 'span 2' }}>
                <label className="metric-label mb-2 block">Project</label>
                <select className="glass-input glass-select" value={selectedProject}
                  onChange={e => { setSelectedProject(e.target.value); setRankTracker([]); setAhrefsKeywords([]); setCompetitors([]); }}>
                  {ahrefsProjects.length === 0 && <option>Loading…</option>}
                  {ahrefsProjects.map(p => <option key={p.project_slug} value={p.project_slug}>{p.project_name || p.project_slug} — {p.target_domain}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }} className="flex items-end">
                <button className="btn-primary w-full" onClick={() => handleAhrefsFetch(ahrefsTab)} disabled={ahrefsLoading || !selectedProject}>
                  {ahrefsLoading ? <><div className="loader" /> Loading…</> : '🚀 Fetch Data'}
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 12 }}>
            {[
              { id: 'overview',    label: 'Overview',      Icon: Globe },
              { id: 'ranker',      label: 'Rank Tracker',  Icon: TrendingUp },
              { id: 'keywords',    label: 'Keywords',      Icon: Search },
              { id: 'competitors', label: 'Competitors',   Icon: Users },
            ].map(({ id, label, Icon }) => (
              <button key={id} className={`nav-item ${ahrefsTab === id ? 'active' : ''}`}
                onClick={() => switchAhrefsTab(id)}
                style={{ background: ahrefsTab === id ? 'var(--primary)' : 'transparent' }}>
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>

          <ErrorBanner msg={ahrefsError} />

          {ahrefsLoading && (
            <div className="glass-panel flex items-center justify-center" style={{ padding: 40 }}>
              <div className="loader" style={{ width: 32, height: 32, borderWidth: 3 }} />
            </div>
          )}

          {/* Overview — derived from rank-tracker data */}
          {!ahrefsLoading && ahrefsTab === 'overview' && rankTracker.length > 0 && (() => {
            const totalKw    = rankTracker.length;
            const top3Kw     = rankTracker.filter(k => k.position <= 3).length;
            const top10Kw    = rankTracker.filter(k => k.position <= 10).length;
            const totalTraffic = rankTracker.reduce((s, k) => s + (k.traffic || 0), 0);
            const avgPos     = (rankTracker.reduce((s, k) => s + (k.position || 0), 0) / totalKw).toFixed(1);
            const reportDate = rankTracker[0]?.report_date || '—';
            const topByTraffic = [...rankTracker].sort((a, b) => (b.traffic || 0) - (a.traffic || 0)).slice(0, 10);
            return (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <MetricCard icon={Search}     label="Tracked Keywords" value={totalKw.toLocaleString()}       color="#f59e0b" sub={`as of ${reportDate}`} />
                  <MetricCard icon={Star}       label="Top-3 Positions"  value={top3Kw.toLocaleString()}         color="#4ade80" sub={`${top10Kw} in top 10`} />
                  <MetricCard icon={TrendingUp} label="Est. Traffic"     value={totalTraffic.toLocaleString()}   color="#00f2fe" sub="from tracked keywords" />
                  <MetricCard icon={BarChart2}  label="Avg. Position"    value={avgPos}                          color="#8b5cf6" />
                  <MetricCard icon={Globe}      label="Report Date"      value={reportDate}                      color="#38bdf8" sub={selectedProject} />
                  <MetricCard icon={Link}       label="Keywords w/ Traffic" value={rankTracker.filter(k => (k.traffic || 0) > 0).length.toLocaleString()} color="#E20071" />
                </div>
                <div className="glass-panel">
                  <h4 className="mb-4">Top Keywords by Traffic</h4>
                  <div className="data-table-container" style={{ maxHeight: 360, overflowY: 'auto' }}>
                    <table className="data-table">
                      <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-dark)' }}>
                        <tr><th>Pos</th><th>Keyword</th><th>Volume</th><th>Traffic</th><th>Difficulty</th></tr>
                      </thead>
                      <tbody>
                        {topByTraffic.map((row, i) => (
                          <tr key={i} onClick={() => openKwHistory(row)} style={{ cursor: 'pointer' }}
                            tabIndex={0} role="button"
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openKwHistory(row); } }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(226,0,113,0.08)'}
                            onMouseLeave={e => e.currentTarget.style.background = ''}>
                            <td><span style={{ fontWeight: 700, color: row.position <= 3 ? '#4ade80' : row.position <= 10 ? '#f59e0b' : 'var(--text-muted)' }}>#{row.position}</span></td>
                            <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.keyword}</td>
                            <td>{(row.volume || 0).toLocaleString()}</td>
                            <td>{(row.traffic || 0).toLocaleString()}</td>
                            <td><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', background: row.keyword_difficulty >= 70 ? 'rgba(248,113,113,0.2)' : row.keyword_difficulty >= 40 ? 'rgba(245,158,11,0.2)' : 'rgba(74,222,128,0.2)', color: row.keyword_difficulty >= 70 ? '#f87171' : row.keyword_difficulty >= 40 ? '#f59e0b' : '#4ade80' }}>{row.keyword_difficulty}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })()}

          {/* Rank Tracker */}
          {!ahrefsLoading && ahrefsTab === 'ranker' && rankTracker.length > 0 && (
            <div className="glass-panel">
              <div className="flex justify-between items-center mb-4">
                <h4>Rank Tracker <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.8rem' }}>({rankTracker.length} keywords)</span></h4>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Click a row to see position history</span>
              </div>
              <div className="data-table-container" style={{ maxHeight: 520, overflowY: 'auto' }}>
                <table className="data-table">
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-dark)' }}>
                    <tr><th>Pos</th><th>Keyword</th><th>Volume</th><th>Difficulty</th><th>Traffic</th><th>URL</th></tr>
                  </thead>
                  <tbody>
                    {[...rankTracker].sort((a, b) => (a.position || 999) - (b.position || 999)).map((row, i) => (
                      <tr key={i} onClick={() => openKwHistory(row)}
                        style={{ cursor: 'pointer' }}
                        tabIndex={0} role="button"
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openKwHistory(row); } }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(226,0,113,0.08)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}>
                        <td>
                          <span style={{ fontWeight: 700, color: row.position <= 3 ? '#4ade80' : row.position <= 10 ? '#f59e0b' : 'var(--text-muted)' }}>
                            #{row.position}
                          </span>
                        </td>
                        <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.keyword}</td>
                        <td>{(row.volume || 0).toLocaleString()}</td>
                        <td>
                          <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem',
                            background: row.keyword_difficulty >= 70 ? 'rgba(248,113,113,0.2)' : row.keyword_difficulty >= 40 ? 'rgba(245,158,11,0.2)' : 'rgba(74,222,128,0.2)',
                            color: row.keyword_difficulty >= 70 ? '#f87171' : row.keyword_difficulty >= 40 ? '#f59e0b' : '#4ade80' }}>
                            {row.keyword_difficulty}
                          </span>
                        </td>
                        <td>{(row.traffic || 0).toLocaleString()}</td>
                        <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{row.url}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Keywords */}
          {!ahrefsLoading && ahrefsTab === 'keywords' && ahrefsKeywords.length > 0 && (
            <div className="glass-panel">
              <h4 className="mb-4">Keyword Universe <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.8rem' }}>({ahrefsKeywords.length.toLocaleString()} keywords)</span></h4>
              <div className="data-table-container" style={{ maxHeight: 520, overflowY: 'auto' }}>
                <table className="data-table">
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-dark)' }}>
                    <tr><th>Keyword</th><th>Volume</th><th>Global Vol.</th><th>Difficulty</th><th>CPC</th><th>Parent Topic</th></tr>
                  </thead>
                  <tbody>
                    {ahrefsKeywords.slice(0, 500).map((row, i) => (
                      <tr key={i}>
                        <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.keyword}</td>
                        <td>{(row.volume || 0).toLocaleString()}</td>
                        <td>{(row.global_volume || 0).toLocaleString()}</td>
                        <td>
                          <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem',
                            background: row.difficulty >= 70 ? 'rgba(248,113,113,0.2)' : row.difficulty >= 40 ? 'rgba(245,158,11,0.2)' : 'rgba(74,222,128,0.2)',
                            color: row.difficulty >= 70 ? '#f87171' : row.difficulty >= 40 ? '#f59e0b' : '#4ade80' }}>
                            {row.difficulty}
                          </span>
                        </td>
                        <td>{row.cpc ? BRL.format(Number(row.cpc) || 0) : '—'}</td>
                        <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{row.parent_topic || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ahrefsKeywords.length > 500 && (
                  <div className="mt-3" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Showing 500 of {ahrefsKeywords.length.toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Competitors */}
          {!ahrefsLoading && ahrefsTab === 'competitors' && competitors.length > 0 && (
            <div className="glass-panel">
              <h4 className="mb-4">Competitor Stats <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.8rem' }}>({competitors.length} competitors)</span></h4>
              <div className="data-table-container" style={{ maxHeight: 520, overflowY: 'auto' }}>
                <table className="data-table">
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-dark)' }}>
                    <tr><th>Domain</th><th>Avg Position</th><th>Share of Voice</th><th>Traffic</th><th>Traffic Value</th></tr>
                  </thead>
                  <tbody>
                    {[...competitors].sort((a, b) => parseFloat(b.share_of_voice || 0) - parseFloat(a.share_of_voice || 0)).map((row, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{row.competitor_domain}</td>
                        <td>{parseFloat(row.average_position || 0).toFixed(1)}</td>
                        <td>{parseFloat(row.share_of_voice || 0).toFixed(2)}%</td>
                        <td>{(row.traffic || 0).toLocaleString()}</td>
                        <td>{BRL.format(Number(row.traffic_value) || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!ahrefsLoading && !ahrefsError && ahrefsEmpty && (
            <div className="glass-panel flex flex-col items-center justify-center" style={{ padding: '60px 20px' }}>
              <BarChart2 size={48} color="var(--primary)" className="mb-4" />
              <h3 className="mb-2 text-center">No data loaded</h3>
              <p className="text-center mb-6" style={{ color: 'var(--text-muted)' }}>
                Select a project and click Fetch Data.
              </p>
              <button className="btn-primary" onClick={() => handleAhrefsFetch(ahrefsTab)} disabled={ahrefsLoading || !selectedProject}>
                🚀 Fetch Data
              </button>
            </div>
          )}
        </>
      )}

      {/* ════════ SERP Research ════════ */}
      {mainTab === 'serp' && (
        <>
          <div className="glass-panel">
            <h2 className="flex items-center gap-2 mb-4"><ExternalLink size={20} /> SERP Research</h2>
            <p className="mb-5" style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Live Google Mobile SERP fetched via Googlebot emulation. Results may take 10–20 s.
            </p>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div style={{ gridColumn: 'span 2' }}>
                <label className="metric-label mb-2 block">Keyword</label>
                <input
                  className="glass-input"
                  placeholder="e.g. best coffee machine 2024"
                  value={serpTabKeyword}
                  onChange={e => setSerpTabKeyword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !serpTabLoading && handleSerpSearch()}
                />
              </div>
              <div>
                <label className="metric-label mb-2 block"><MapPin size={12} style={{ display: 'inline', marginRight: 4 }} />Geolocation</label>
                <select className="glass-input glass-select" value={serpTabLocation} onChange={e => setSerpTabLocation(e.target.value)}>
                  {serpTabLocations.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <button className="btn-primary w-full" onClick={handleSerpSearch} disabled={serpTabLoading || !serpTabKeyword.trim()}>
                  {serpTabLoading ? <><div className="loader" /> Fetching…</> : '🔍 Search SERP'}
                </button>
              </div>
            </div>
            <div>
              <label className="metric-label mb-2 block">Target URL <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional — enables gap analysis)</span></label>
              <input
                className="glass-input"
                placeholder="https://yoursite.com/page"
                value={serpTabTargetUrl}
                onChange={e => setSerpTabTargetUrl(e.target.value)}
              />
            </div>
          </div>

          <ErrorBanner msg={serpTabError} />

          {serpTabLoading && (
            <div className="glass-panel flex items-center justify-center" style={{ padding: 48 }}>
              <div style={{ textAlign: 'center' }}>
                <div className="loader" style={{ width: 40, height: 40, borderWidth: 4, margin: '0 auto 16px' }} />
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Emulating Googlebot Mobile… this can take up to 20 s</p>
              </div>
            </div>
          )}

          {serpTabData && !serpTabLoading && (
            <>
              {/* Related keywords */}
              {serpTabData.related_keywords?.length > 0 && (
                <div className="glass-panel">
                  <h4 className="mb-3" style={{ fontSize: '0.9rem' }}>Related Searches</h4>
                  <div className="flex flex-wrap gap-2">
                    {serpTabData.related_keywords.map((kw, i) => (
                      <button
                        key={i}
                        onClick={() => { setSerpTabKeyword(kw); setSerpTabData(null); }}
                        style={{ padding: '5px 12px', borderRadius: 20, background: 'rgba(226,0,113,0.12)', border: '1px solid rgba(226,0,113,0.3)', color: 'var(--primary)', fontSize: '0.82rem', cursor: 'pointer', transition: 'background-color 0.2s, border-color 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(226,0,113,0.25)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(226,0,113,0.12)'}
                      >
                        {kw}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Organic results */}
              {serpTabData.organic?.length > 0 && (
                <div className="glass-panel">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="flex items-center gap-2">
                      <Search size={18} /> Organic Results
                      <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-muted)' }}>
                        — {serpTabKeyword} · {serpTabLocation}
                      </span>
                    </h3>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{serpTabData.organic.length} results</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {serpTabData.organic.map((row, i) => {
                      let hostname = '';
                      try { hostname = new URL(row.link).hostname.replace('www.', ''); } catch {}
                      const isTarget = serpTabTargetUrl && row.link && serpTabTargetUrl && row.link.includes(new URL(serpTabTargetUrl.startsWith('http') ? serpTabTargetUrl : 'https://' + serpTabTargetUrl).hostname);
                      return (
                        <div key={i} style={{
                          display: 'flex', gap: 14, padding: '14px 16px', borderRadius: 10,
                          background: isTarget ? 'rgba(226,0,113,0.1)' : 'rgba(255,255,255,0.03)',
                          border: isTarget ? '1px solid rgba(226,0,113,0.4)' : '1px solid rgba(255,255,255,0.07)',
                          transition: 'background 0.2s',
                        }}
                          onMouseEnter={e => { if (!isTarget) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                          onMouseLeave={e => { if (!isTarget) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                        >
                          <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1rem', background: i < 3 ? 'rgba(226,0,113,0.2)' : 'rgba(255,255,255,0.06)', color: i < 3 ? 'var(--primary)' : 'var(--text-muted)' }}>
                            {i + 1}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="flex items-center gap-2 mb-1">
                              <span style={{ fontWeight: 600, fontSize: '0.92rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{row.title}</span>
                              {isTarget && (
                                <span style={{ flexShrink: 0, fontSize: '0.7rem', padding: '2px 8px', borderRadius: 4, background: 'var(--primary)', color: 'white', fontWeight: 700 }}>YOUR PAGE</span>
                              )}
                            </div>
                            <a href={row.link} target="_blank" rel="noopener noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', color: '#4ade80', marginBottom: 6, textDecoration: 'none' }}>
                              {hostname} <ExternalLink size={10} />
                            </a>
                            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>{row.snippet}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* AI Analysis */}
              {serpTabData.analysis && (
                <div className="glass-panel">
                  <h3 className="flex items-center gap-2 mb-4"><Sparkles size={18} color="var(--primary)" /> AI Competitive Analysis</h3>
                  <div className="markdown-content" style={{ lineHeight: 1.7 }}>
                    <ReactMarkdown>{serpTabData.analysis}</ReactMarkdown>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ════════ Keyword History Modal ════════ */}
      {kwModal && (
        <div onClick={() => setKwModal(null)} aria-hidden="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true"
            style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 820, maxHeight: '90vh', overflowY: 'auto' }}>

            {/* Header */}
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 style={{ marginBottom: 4 }}>{kwModal.keyword}</h3>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: 620, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kwModal.url}</div>
              </div>
              <button onClick={() => setKwModal(null)} aria-label="Close" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                <X size={20} />
              </button>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-4 gap-3 mb-5">
              {[
                { label: 'Current Position', value: `#${kwModal.currentPos}`, color: kwModal.currentPos <= 3 ? '#4ade80' : kwModal.currentPos <= 10 ? '#f59e0b' : 'var(--text-muted)' },
                { label: 'Best (30d)', value: kwHistory.length > 0 ? `#${Math.min(...kwHistory.map(d => d.position))}` : '—', color: '#4ade80' },
                { label: 'Search Volume', value: (kwModal.volume || 0).toLocaleString(), color: '#00f2fe' },
                { label: 'Difficulty', value: kwModal.difficulty, color: kwModal.difficulty >= 70 ? '#f87171' : kwModal.difficulty >= 40 ? '#f59e0b' : '#4ade80' },
              ].map(({ label, value, color }) => (
                <div key={label} className="glass-panel interactive" style={{ padding: '12px 14px' }}>
                  <div className="metric-label" style={{ fontSize: '0.72rem' }}>{label}</div>
                  <div className="metric-value" style={{ fontSize: '1.4rem', color }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-3 mb-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 12 }}>
              {[{ id: 'history', label: 'Position History', icon: TrendingUp }, { id: 'serp', label: 'SERP Snapshot', icon: Search }]
                .map(({ id, label, icon: Icon }) => (
                  <button key={id} className={`nav-item ${kwModalTab === id ? 'active' : ''}`}
                    onClick={() => setKwModalTab(id)}
                    style={{ background: kwModalTab === id ? 'var(--primary)' : 'transparent' }}>
                    <Icon size={14} /> {label}
                  </button>
                ))}
            </div>

            {/* ── Position History ── */}
            {kwModalTab === 'history' && (
              <>
                {kwHistory.length >= 2 && (() => {
                  const first = kwHistory[0].position;
                  const last  = kwHistory[kwHistory.length - 1].position;
                  const delta = first - last;
                  const TrendIcon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
                  const trendColor = delta > 0 ? '#4ade80' : delta < 0 ? '#f87171' : 'var(--text-muted)';
                  const trendLabel = delta > 0 ? `+${delta} positions gained` : delta < 0 ? `${Math.abs(delta)} positions lost` : 'No change';
                  return (
                    <div className="flex items-center gap-2 mb-4" style={{ fontSize: '0.85rem', color: trendColor }}>
                      <TrendIcon size={16} /><span>{trendLabel} over {kwHistory.length} data points</span>
                    </div>
                  );
                })()}
                {kwHistoryLoading ? (
                  <div className="flex items-center justify-center" style={{ height: 240 }}>
                    <div className="loader" style={{ width: 32, height: 32, borderWidth: 3 }} />
                  </div>
                ) : kwHistory.length === 0 ? (
                  <div className="flex items-center justify-center" style={{ height: 240, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No historical position data available for this keyword.
                  </div>
                ) : (
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={kwHistory} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                        <YAxis reversed tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => `#${v}`}
                          domain={['dataMin - 1', 'dataMax + 1']} allowDecimals={false} />
                        <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                          labelStyle={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}
                          formatter={v => [`#${v}`, 'Position']} labelFormatter={l => `Date: ${l}`} />
                        <ReferenceLine y={10} stroke="rgba(245,158,11,0.4)" strokeDasharray="4 4" label={{ value: 'Top 10', fill: 'rgba(245,158,11,0.6)', fontSize: 10, position: 'right' }} />
                        <ReferenceLine y={3}  stroke="rgba(74,222,128,0.4)" strokeDasharray="4 4" label={{ value: 'Top 3',  fill: 'rgba(74,222,128,0.6)',  fontSize: 10, position: 'right' }} />
                        <Line type="monotone" dataKey="position" stroke="var(--primary)" strokeWidth={2}
                          dot={{ fill: 'var(--primary)', r: 4, strokeWidth: 0 }} activeDot={{ r: 6, fill: 'white' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}

            {/* ── SERP Snapshot ── */}
            {kwModalTab === 'serp' && (
              serpLoading ? (
                <div className="flex items-center justify-center" style={{ height: 240 }}>
                  <div className="loader" style={{ width: 32, height: 32, borderWidth: 3 }} />
                </div>
              ) : serpData.length === 0 ? (
                <div className="flex items-center justify-center" style={{ height: 200, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No SERP data available for this keyword.
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 10, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {serpData.length} results · {serpData[0]?.report_date} · {serpData[0]?.geo} ·{' '}
                    <span style={{ color: 'var(--primary)' }}>{serpData.filter(r => r.is_tracked).length} tracked site(s) in SERP</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 460, overflowY: 'auto' }}>
                    {serpData.map((r) => (
                      <div key={r.position}
                        style={{ display: 'flex', gap: 12, padding: '10px 14px', borderRadius: 8,
                          background: r.is_tracked ? 'rgba(226,0,113,0.1)' : 'rgba(255,255,255,0.03)',
                          border: r.is_tracked ? '1px solid rgba(226,0,113,0.35)' : '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ flexShrink: 0, width: 32, textAlign: 'center', paddingTop: 2 }}>
                          <span style={{ fontWeight: 700, fontSize: '1rem',
                            color: r.position <= 3 ? '#4ade80' : r.position <= 10 ? '#f59e0b' : 'var(--text-muted)' }}>
                            #{r.position}
                          </span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                            <span style={{ fontWeight: 600, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                            {r.is_tracked && (
                              <span style={{ flexShrink: 0, fontSize: '0.7rem', padding: '1px 7px', borderRadius: 4, background: 'var(--primary)', color: 'white' }}>
                                {r.tracked_site_id}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.73rem', color: '#4ade80', marginBottom: 3 }}>{r.displayed_link}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{r.snippet}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {serpPaa.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 8, color: 'var(--text-muted)' }}>
                        People Also Ask ({serpPaa.length})
                      </div>
                      {serpPaa.map((q, i) => (
                        <div key={i} style={{ padding: '8px 12px', marginBottom: 4, borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', fontSize: '0.82rem' }}>
                          <div style={{ fontWeight: 600, marginBottom: 2 }}>{q.question}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.77rem' }}>{q.snippet}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DatabaseIcon({ size = 16, ...props }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5V19A9 3 0 0 0 21 19V5" />
      <path d="M3 12A9 3 0 0 0 21 12" />
    </svg>
  );
}
