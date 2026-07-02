import { useState } from 'react';
import { Zap, Bug, Server, GitBranch, TrendingUp, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import CwvAnalysis from './CwvAnalysis';
import ScreamingFrog from './ScreamingFrog';
import LogAnalyzer from './LogAnalyzer';

const TABS = [
  { id: 'cwv',   label: 'Core Web Vitals', Icon: Zap    },
  { id: 'crawl', label: 'Crawl Audit',      Icon: Bug    },
  { id: 'logs',  label: 'Log Analysis',     Icon: Server },
];

function BrokenRedirectAudit({ sfResult }) {
  if (!sfResult?.data) return null;

  const redirectRows = sfResult.data.filter(row => {
    const s = String(row['Status Code'] ?? '');
    return s.startsWith('3') && s !== '304';
  });

  if (redirectRows.length === 0) {
    return (
      <div className="glass-panel">
        <h3 className="flex items-center gap-2 mb-3" style={{ fontSize: '1rem' }}>
          <GitBranch size={18} color="#4ade80" /> Redirect Audit
        </h3>
        <p style={{ color: '#4ade80', fontSize: '0.85rem' }}>No redirects (3xx) detected in this crawl.</p>
      </div>
    );
  }

  const cols = sfResult.columns || [];
  const addrCol = cols.find(c => ['Address', 'URL', 'Source URL'].includes(c)) || 'Address';
  const destCol = cols.find(c => ['Redirect URL', 'Redirect To', 'Final URL', 'Destination'].includes(c));

  const srcSet = new Set(redirectRows.map(r => r[addrCol]));

  const chains = redirectRows.filter(r => {
    const dst = destCol ? r[destCol] : null;
    return dst && srcSet.has(dst);
  });

  const count301 = redirectRows.filter(r => String(r['Status Code']) === '301').length;
  const count302 = redirectRows.filter(r => String(r['Status Code']) === '302').length;

  return (
    <div className="glass-panel">
      <h3 className="flex items-center gap-2 mb-4" style={{ fontSize: '1rem' }}>
        <GitBranch size={18} color="#f59e0b" /> Redirect Audit
        <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 99, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', fontWeight: 700 }}>
          {redirectRows.length} redirects
        </span>
        {chains.length > 0 && (
          <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 99, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontWeight: 700 }}>
            {chains.length} chains
          </span>
        )}
      </h3>

      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Total Redirects',  value: redirectRows.length, color: '#f59e0b' },
          { label: '301 Permanent',    value: count301,            color: '#00f2fe' },
          { label: '302 Temporary',    value: count302,            color: '#8b5cf6' },
          { label: 'Redirect Chains',  value: chains.length,       color: chains.length > 0 ? '#f87171' : '#4ade80' },
        ].map(m => (
          <div key={m.label} className="glass-panel interactive" style={{ padding: 16 }}>
            <div className="metric-label">{m.label}</div>
            <div className="metric-value" style={{ color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {chains.length > 0 && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', fontSize: '0.82rem', color: '#fca5a5' }}>
          <AlertTriangle size={13} style={{ display: 'inline', marginRight: 6 }} />
          {chains.length} redirect chain{chains.length !== 1 ? 's' : ''} detected — each extra hop wastes crawl budget and may dilute link equity.
        </div>
      )}

      <div className="data-table-container" style={{ maxHeight: 360, overflowY: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-dark)' }}>
            <tr>
              <th>Source URL</th>
              <th>Status</th>
              {destCol && <th>Destination</th>}
              <th>Chain?</th>
            </tr>
          </thead>
          <tbody>
            {redirectRows.slice(0, 200).map((row, i) => {
              const dst = destCol ? row[destCol] : null;
              const isChain = dst && srcSet.has(dst);
              return (
                <tr key={i}>
                  <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row[addrCol]}
                  </td>
                  <td>
                    <span className={`tag status-${row['Status Code']}`}>{row['Status Code']}</span>
                  </td>
                  {destCol && (
                    <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                      {dst || '—'}
                    </td>
                  )}
                  <td>
                    {isChain
                      ? <span style={{ color: '#f87171', fontSize: '0.78rem', fontWeight: 600 }}>Chain</span>
                      : <span style={{ color: '#4ade80', fontSize: '0.78rem' }}>OK</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {redirectRows.length > 200 && (
          <div className="mt-3" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {redirectRows.length - 200} more rows not shown
          </div>
        )}
      </div>
    </div>
  );
}

function CrawlBudgetAnalysis({ analytics }) {
  if (!analytics) return null;

  const gbData = analytics.bot_aggregations?.Googlebot;
  const totalGb = analytics.googlebot_hits || 0;

  if (!gbData || totalGb === 0) {
    return (
      <div className="glass-panel">
        <h3 className="flex items-center gap-2 mb-3" style={{ fontSize: '1rem' }}>
          <TrendingUp size={18} color="#4ade80" /> Crawl Budget Analysis
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No Googlebot activity found in the loaded log files.</p>
      </div>
    );
  }

  const statusData = gbData.status_data || [];
  const okHits = statusData.find(d => d.name === '200')?.value ?? 0;
  const errorHits = statusData
    .filter(d => d.name.startsWith('4') || d.name.startsWith('5'))
    .reduce((s, d) => s + d.value, 0);
  const redirectHits = statusData
    .filter(d => d.name.startsWith('3'))
    .reduce((s, d) => s + d.value, 0);
  const efficiency = totalGb > 0 ? Math.round((okHits / totalGb) * 100) : 0;
  const wastedPct = totalGb > 0 ? Math.round(((errorHits + redirectHits) / totalGb) * 100) : 0;

  const efficiencyColor = efficiency >= 80 ? '#4ade80' : efficiency >= 60 ? '#f59e0b' : '#f87171';

  const topPaths = (gbData.top_paths || []).slice(0, 8).map(p => ({
    path: p.path.length > 42 ? p.path.substring(0, 42) + '…' : p.path,
    hits: p.hits,
  }));

  return (
    <div className="glass-panel">
      <h3 className="flex items-center gap-2 mb-4" style={{ fontSize: '1rem' }}>
        <TrendingUp size={18} color="#4ade80" /> Crawl Budget Analysis
      </h3>

      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Googlebot Hits',   value: totalGb.toLocaleString(),   color: '#4ade80', sub: `${analytics.googlebot_rate}% of total traffic` },
          { label: 'Crawl Efficiency', value: `${efficiency}%`,           color: efficiencyColor, sub: `${okHits.toLocaleString()} valid out of ${totalGb.toLocaleString()}` },
          { label: 'Wasted Budget',    value: `${wastedPct}%`,            color: wastedPct > 20 ? '#f87171' : '#f59e0b', sub: `${(errorHits + redirectHits).toLocaleString()} non-200 hits` },
          { label: 'Error Hits',       value: errorHits.toLocaleString(), color: errorHits > 0 ? '#f87171' : '#4ade80', sub: '4xx + 5xx served to Googlebot' },
        ].map(m => (
          <div key={m.label} className="glass-panel interactive" style={{ padding: 16 }}>
            <div className="metric-label">{m.label}</div>
            <div className="metric-value" style={{ color: m.color }}>{m.value}</div>
            {m.sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>{m.sub}</div>}
          </div>
        ))}
      </div>

      {wastedPct > 20 && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', fontSize: '0.82rem', color: '#fca5a5' }}>
          <AlertTriangle size={13} style={{ display: 'inline', marginRight: 6 }} />
          {wastedPct}% of crawl budget wasted on non-200 responses. Fix 4xx/5xx errors and redirect chains to free up budget for new content.
        </div>
      )}

      {topPaths.length > 0 && (
        <div style={{ height: 260 }}>
          <h4 className="mb-3" style={{ fontSize: '0.88rem' }}>Top Paths Crawled by Googlebot</h4>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={topPaths} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis dataKey="path" type="category" width={190} tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 8 }} />
              <Bar dataKey="hits" fill="#4ade80" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {statusData.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-3" style={{ fontSize: '0.88rem' }}>Googlebot Status Code Breakdown</h4>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {statusData.map(s => {
              const pct = totalGb > 0 ? ((s.value / totalGb) * 100).toFixed(1) : 0;
              return (
                <div key={s.name} style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <span className={`tag status-${s.name}`}>{s.name}</span>
                  <span style={{ marginLeft: 8, fontWeight: 700 }}>{s.value.toLocaleString()}</span>
                  <span style={{ marginLeft: 4, color: 'var(--text-muted)', fontSize: '0.78rem' }}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TechnicalAudit() {
  const [activeTab, setActiveTab] = useState('cwv');
  const [sfResult, setSfResult] = useState(null);
  const [logAnalytics, setLogAnalytics] = useState(null);

  return (
    <div className="flex-col gap-6">
      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 8 }}>
        {TABS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '10px 18px', borderRadius: 8, fontWeight: 600, fontSize: '0.9rem',
                cursor: 'pointer', transition: 'all 0.15s',
                ...(isActive
                  ? { background: 'var(--primary)', color: 'white', border: '1px solid var(--primary)', boxShadow: '0 0 14px rgba(226,0,113,0.35)' }
                  : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)' }),
              }}
            >
              <Icon size={15} /> {label}
            </button>
          );
        })}
      </div>

      {/* CWV Tab — always mounted, hidden when inactive to preserve state */}
      <div style={{ display: activeTab === 'cwv' ? 'flex' : 'none', flexDirection: 'column', gap: '1.5rem' }}>
        <CwvAnalysis />
      </div>

      {/* Crawl Audit Tab */}
      <div style={{ display: activeTab === 'crawl' ? 'flex' : 'none', flexDirection: 'column', gap: '1.5rem' }}>
        <ScreamingFrog onData={setSfResult} />
        <BrokenRedirectAudit sfResult={sfResult} />
      </div>

      {/* Log Analysis Tab */}
      <div style={{ display: activeTab === 'logs' ? 'flex' : 'none', flexDirection: 'column', gap: '1.5rem' }}>
        <LogAnalyzer onData={setLogAnalytics} />
        <CrawlBudgetAnalysis analytics={logAnalytics} />
      </div>
    </div>
  );
}
