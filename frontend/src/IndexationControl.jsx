import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Globe, CheckCircle, AlertCircle, ArrowUpDown, ExternalLink, Filter, Map, ChevronDown, ChevronRight, ToggleLeft, ToggleRight, ShieldAlert, RefreshCw, Link2, Download } from 'lucide-react';

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtCtr(raw) {
  if (raw == null) return '—';
  const n = parseFloat(raw);
  return isNaN(n) ? '—' : (n * 100).toFixed(1) + '%';
}

function fmtPos(raw) {
  if (raw == null) return '—';
  const n = parseFloat(raw);
  return isNaN(n) ? '—' : n.toFixed(1);
}

function shortPath(url) {
  try {
    const { pathname, hostname } = new URL(url);
    const path = pathname.replace(/\/$/, '') || '/';
    return path === '/' ? hostname : path;
  } catch {
    return url.length > 60 ? url.slice(0, 57) + '…' : url;
  }
}

function pageStatus(page) {
  if ((page.clicks || 0) > 0) return 'active';
  if ((page.impressions || 0) > 0) return 'visible';
  return 'indexed';
}

function isoOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const STATUS_STYLE = {
  active:  { bg: 'rgba(34,197,94,.1)',    color: '#4ade80', label: 'Clicks'  },
  visible: { bg: 'rgba(245,158,11,.1)',   color: '#f59e0b', label: 'Visible' },
  indexed: { bg: 'rgba(255,255,255,.06)', color: '#94a3b8', label: 'Indexed' },
};

// ── sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, valueColor }) {
  return (
    <div className="glass-panel" style={{ padding: '14px 18px' }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1, color: valueColor || 'white' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function SortHeader({ col, label, current, dir, onSort }) {
  const active = current === col;
  return (
    <th onClick={() => onSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        <ArrowUpDown size={11} color={active ? 'var(--primary)' : 'rgba(255,255,255,0.25)'} />
      </span>
    </th>
  );
}

function TabBtn({ id, label, active, onClick }) {
  return (
    <button
      onClick={() => onClick(id)}
      style={{
        padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
        ...(active
          ? { background: 'var(--primary)', color: 'white', border: '1px solid var(--primary)' }
          : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)' }),
      }}
    >
      {label}
    </button>
  );
}

function CoverageBar({ pct, width = 80 }) {
  const color = pct >= 80 ? '#4ade80' : pct >= 50 ? '#f59e0b' : '#f87171';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <div style={{ width, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontSize: '0.75rem', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
    </div>
  );
}

// ── Timeline tab ─────────────────────────────────────────────────────────────

function TimelineTab({ urlResults, dates, dailySummary, pages }) {
  const [tip, setTip] = useState(null);
  const [expandedUrls, setExpandedUrls] = useState(new Set());
  const [siteExpanded, setSiteExpanded] = useState(false);
  const [siteFilter, setSiteFilter] = useState('');
  const [urlFilter, setUrlFilter] = useState('');

  const toggleExpand = useCallback((url) => {
    setExpandedUrls(prev => {
      const next = new Set(prev);
      next.has(url) ? next.delete(url) : next.add(url);
      return next;
    });
  }, []);

  const maxImpressions = useMemo(
    () => Math.max(...(urlResults || []).flatMap(r => r.daily.map(d => d.impressions || 0)), 1),
    [urlResults],
  );

  const maxSitePages = useMemo(
    () => Math.max(...(dailySummary || []).map(d => d.total_pages || 0), 1),
    [dailySummary],
  );

  const siteDayMap = useMemo(
    () => Object.fromEntries((dailySummary || []).map(d => [d.date, d])),
    [dailySummary],
  );

  // Group dates by month for the two-row header
  const monthGroups = useMemo(() => {
    const groups = [];
    let current = null;
    dates.forEach((date, i) => {
      const ym = date.slice(0, 7);
      if (ym !== current) {
        const [y, m] = ym.split('-');
        const label = new Date(Number(y), Number(m) - 1, 1).toLocaleString('en', { month: 'short' }) + " '" + y.slice(2);
        groups.push({ ym, start: i, count: 1, label });
        current = ym;
      } else {
        groups[groups.length - 1].count++;
      }
    });
    return groups;
  }, [dates]);

  const handleEnter = useCallback((e, data) => setTip({ ...data, x: e.clientX, y: e.clientY }), []);
  const handleMove  = useCallback((e) => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : t), []);
  const handleLeave = useCallback(() => setTip(null), []);

  const CELL  = 16;
  const GAP   = 2;
  const URL_W = 240;
  const BG    = 'rgba(10,18,35,0.95)';

  // Month-start date set for border rendering
  const monthStarts = useMemo(() => new Set(monthGroups.map(g => dates[g.start])), [monthGroups, dates]);

  function CoverageBar({ pct, color }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <div style={{ width: 52, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
        </div>
        <span style={{ fontSize: '0.68rem', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', minWidth: 28 }}>{pct}%</span>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>

      {/* ── Legend ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', margin: 0 }}>
            Each cell is one day — hover for details. Top row shows site-wide totals.{urlResults?.length > 0 && ' Click a URL to expand day-by-day stats.'}
          </p>
          {urlResults?.length > 0 && (
            <input
              type="text"
              placeholder="Filter URLs…"
              value={urlFilter}
              onChange={e => setUrlFilter(e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 6, padding: '4px 10px', fontSize: '0.75rem', color: '#d8d8e6',
                outline: 'none', width: 200,
              }}
            />
          )}
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {[
            { bg: 'rgba(74,222,128,0.8)',    label: 'PASS' },
            { bg: 'rgba(245,158,11,0.7)',    label: 'NEUTRAL' },
            { bg: 'rgba(248,113,113,0.7)',   label: 'FAIL' },
            { bg: 'rgba(74,222,128,0.3)',    label: 'In GSC only' },
            { bg: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.05)', label: 'Not indexed' },
            { bg: 'rgba(226,0,113,0.55)',    label: 'Site-wide' },
          ].map(({ bg, border, label }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: bg, border: border || 'none', display: 'inline-block', flexShrink: 0 }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Scrollable grid ── */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            {/* Row 1: Month group labels */}
            <tr>
              <th style={{ position: 'sticky', left: 0, zIndex: 2, background: BG, width: URL_W, minWidth: URL_W, padding: '0 12px 3px 0' }} />
              {monthGroups.map(g => (
                <th key={g.ym} colSpan={g.count} style={{
                  padding: '0 0 3px 5px',
                  textAlign: 'left',
                  fontSize: '0.6rem', fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                  color: 'rgba(255,255,255,0.32)',
                  borderLeft: '1px solid rgba(255,255,255,0.1)',
                  whiteSpace: 'nowrap',
                }}>
                  {g.label}
                </th>
              ))}
              <th />
            </tr>
            {/* Row 2: Day numbers */}
            <tr>
              <th style={{
                position: 'sticky', left: 0, zIndex: 2, background: BG,
                width: URL_W, minWidth: URL_W, padding: '0 12px 8px 0',
                textAlign: 'left', fontSize: '0.62rem', color: 'rgba(255,255,255,0.25)',
              }}>
                {dates.length > 0 && `${dates.length} days`}
              </th>
              {dates.map(date => {
                const day = parseInt(date.slice(8), 10);
                const isFirst = monthStarts.has(date);
                const showNum = day === 1 || day % 7 === 1;
                return (
                  <th key={date} style={{
                    padding: `0 ${GAP / 2}px 7px`,
                    verticalAlign: 'bottom',
                    width: CELL + GAP,
                    borderLeft: isFirst ? '1px solid rgba(255,255,255,0.1)' : undefined,
                  }}>
                    <div style={{
                      writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                      fontSize: '0.52rem', lineHeight: 1, paddingBottom: 2,
                      fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                      color: day === 1 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)',
                      fontWeight: day === 1 ? 700 : 400,
                      opacity: showNum ? 1 : 0,
                    }}>
                      {day}
                    </div>
                  </th>
                );
              })}
              <th style={{ paddingLeft: 14, paddingBottom: 7, textAlign: 'left', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(255,255,255,0.32)', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
                Coverage
              </th>
            </tr>
          </thead>
          <tbody>

            {/* ── Site-level row ── */}
            {dailySummary?.length > 0 && (() => {
              const avg = dailySummary.length > 0
                ? Math.round(dailySummary.reduce((s, d) => s + (d.total_pages || 0), 0) / dailySummary.length)
                : 0;
              const filteredPages = siteFilter
                ? pages.filter(p => p.page?.toLowerCase().includes(siteFilter.toLowerCase()))
                : pages;
              return (
                <React.Fragment>
                  <tr
                    onClick={() => setSiteExpanded(v => !v)}
                    style={{ cursor: pages.length > 0 ? 'pointer' : 'default' }}
                    onMouseEnter={e => { if (pages.length > 0) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td style={{
                      position: 'sticky', left: 0, zIndex: 1, background: siteExpanded ? 'rgba(255,255,255,0.03)' : BG,
                      paddingRight: 12, paddingTop: 4, paddingBottom: 4, width: URL_W,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 20, height: 20, borderRadius: 5,
                          background: 'rgba(226,0,113,0.14)', border: '1px solid rgba(226,0,113,0.28)',
                          flexShrink: 0,
                        }}>
                          <Globe size={11} color="rgba(226,0,113,0.9)" />
                        </span>
                        <span style={{ fontSize: '0.73rem', fontWeight: 700, color: 'rgba(226,0,113,0.95)', flex: 1 }}>All pages</span>
                        {pages.length > 0 && (
                          <span style={{ flexShrink: 0, color: 'rgba(255,255,255,0.25)', transition: 'transform 0.15s', transform: siteExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                            <ChevronDown size={12} />
                          </span>
                        )}
                      </div>
                    </td>
                    {dates.map(date => {
                      const d = siteDayMap[date];
                      const pg = d?.total_pages || 0;
                      const intensity = pg > 0 ? Math.max(0.15, pg / maxSitePages) : 0;
                      const isFirst = monthStarts.has(date);
                      return (
                        <td key={date} style={{
                          padding: `4px ${GAP / 2}px`,
                          borderLeft: isFirst ? '1px solid rgba(255,255,255,0.06)' : undefined,
                        }}>
                          <div
                            onMouseEnter={e => { e.stopPropagation(); handleEnter(e, { date, siteDay: d, url: 'site' }); }}
                            onMouseMove={e => { e.stopPropagation(); handleMove(e); }}
                            onMouseLeave={e => { e.stopPropagation(); handleLeave(); }}
                            onClick={e => e.stopPropagation()}
                            style={{
                              width: CELL, height: CELL, borderRadius: 3, cursor: 'default', boxSizing: 'border-box',
                              background: pg > 0 ? `rgba(226,0,113,${intensity.toFixed(2)})` : 'rgba(255,255,255,0.05)',
                              border: `1px solid ${pg > 0 ? `rgba(226,0,113,${Math.min(0.45, intensity * 0.55).toFixed(2)})` : 'rgba(255,255,255,0.04)'}`,
                              transition: 'box-shadow 0.1s, transform 0.1s',
                            }}
                            onMouseOver={e => {
                              e.currentTarget.style.boxShadow = pg > 0 ? '0 0 0 2px rgba(226,0,113,0.5)' : '0 0 0 2px rgba(255,255,255,0.18)';
                              e.currentTarget.style.transform = 'scale(1.18)';
                            }}
                            onMouseOut={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'scale(1)'; }}
                          />
                        </td>
                      );
                    })}
                    <td style={{ paddingLeft: 14, whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        avg <span style={{ color: 'rgba(226,0,113,0.8)', fontWeight: 600 }}>{avg.toLocaleString()}</span> pages/day
                        {pages.length > 0 && <span style={{ marginLeft: 8, color: 'rgba(255,255,255,0.25)' }}>· {pages.length.toLocaleString()} pages</span>}
                      </span>
                    </td>
                  </tr>

                  {/* ── Expanded URL×day indexed matrix ── */}
                  {siteExpanded && urlResults?.length > 0 && (
                    <tr style={{ background: 'rgba(0,0,0,0.18)' }}>
                      <td colSpan={dates.length + 2} style={{ padding: '0 0 0 4px' }}>
                        <div style={{ padding: '12px 20px 16px 0' }}>
                          {/* Header row */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(226,0,113,0.9)' }}>
                              URL × day indexed matrix
                            </span>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                              {urlResults.length} pages · {dates.length} days
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                              <Filter size={11} color="var(--text-muted)" />
                              <input
                                className="glass-input"
                                placeholder="Filter by URL…"
                                value={siteFilter}
                                onChange={e => setSiteFilter(e.target.value)}
                                onClick={e => e.stopPropagation()}
                                style={{ fontSize: '0.72rem', padding: '4px 8px', width: 190 }}
                              />
                            </div>
                          </div>

                          {/* Scrollable matrix */}
                          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 420 }}>
                            <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.72rem' }}>
                              <thead style={{ position: 'sticky', top: 0, zIndex: 3 }}>
                                <tr>
                                  <th style={{
                                    position: 'sticky', left: 0, zIndex: 4, background: 'rgba(8,14,28,0.98)',
                                    padding: '4px 12px 4px 0', textAlign: 'left', minWidth: 220, whiteSpace: 'nowrap',
                                    fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.3)',
                                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                                  }}>
                                    URL
                                  </th>
                                  {dates.map(date => (
                                    <th key={date} style={{
                                      background: 'rgba(8,14,28,0.98)',
                                      padding: '0 2px 4px', verticalAlign: 'bottom', width: 22,
                                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                                    }}>
                                      <div style={{
                                        writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                                        fontSize: '0.5rem', color: 'rgba(255,255,255,0.25)',
                                        fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                                        lineHeight: 1, paddingBottom: 2,
                                      }}>
                                        {date.slice(5).replace('-', '/')}
                                      </div>
                                    </th>
                                  ))}
                                  <th style={{
                                    background: 'rgba(8,14,28,0.98)',
                                    padding: '4px 0 4px 10px', whiteSpace: 'nowrap',
                                    fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.3)',
                                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                                  }}>
                                    Coverage
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {urlResults
                                  .filter(r => !siteFilter || r.url.toLowerCase().includes(siteFilter.toLowerCase()))
                                  .map((row, ri) => {
                                    const dayMap = Object.fromEntries(row.daily.map(d => [d.date, d]));
                                    const coverageColor = row.coverage_pct >= 80 ? '#4ade80' : row.coverage_pct >= 50 ? '#f59e0b' : '#f87171';
                                    return (
                                      <tr key={row.url} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <td style={{
                                          position: 'sticky', left: 0, zIndex: 1, background: ri % 2 === 0 ? 'rgba(8,14,28,0.98)' : 'rgba(15,22,40,0.98)',
                                          padding: '3px 12px 3px 0', maxWidth: 240,
                                        }}>
                                          <a href={row.url} target="_blank" rel="noopener noreferrer"
                                            onClick={e => e.stopPropagation()}
                                            style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--primary)', textDecoration: 'none' }}>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.url}>{shortPath(row.url)}</span>
                                            <ExternalLink size={8} style={{ flexShrink: 0, opacity: 0.4 }} />
                                          </a>
                                        </td>
                                        {dates.map(date => {
                                          const d = dayMap[date];
                                          return (
                                            <td key={date} style={{ padding: '3px 2px', textAlign: 'center' }}>
                                              {(() => {
                                                let bg, border, title;
                                                if (d?.verdict === 'PASS')    { bg = 'rgba(74,222,128,0.75)';  border = 'rgba(74,222,128,0.4)';  title = `${date} — PASS`; }
                                                else if (d?.verdict === 'NEUTRAL') { bg = 'rgba(245,158,11,0.65)'; border = 'rgba(245,158,11,0.4)';  title = `${date} — NEUTRAL`; }
                                                else if (d?.verdict === 'FAIL')    { bg = 'rgba(248,113,113,0.65)';border = 'rgba(248,113,113,0.4)';title = `${date} — FAIL`; }
                                                else if (d?.indexed)               { bg = 'rgba(74,222,128,0.3)';  border = 'rgba(74,222,128,0.2)';  title = `${date} — in GSC`; }
                                                else                               { bg = 'rgba(255,255,255,0.05)';border = 'rgba(255,255,255,0.04)';title = `${date} — not indexed`; }
                                                return <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: bg, border: `1px solid ${border}` }} title={title} />;
                                              })()}
                                            </td>
                                          );
                                        })}
                                        <td style={{ padding: '3px 0 3px 10px', whiteSpace: 'nowrap' }}>
                                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: coverageColor, fontVariantNumeric: 'tabular-nums' }}>
                                            {row.coverage_pct}%
                                          </span>
                                          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginLeft: 5, fontVariantNumeric: 'tabular-nums' }}>
                                            {row.indexed_days}/{dates.length}d
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })()}

            {/* ── Thin separator between site row and URL rows ── */}
            {dailySummary?.length > 0 && urlResults?.length > 0 && (
              <tr>
                <td colSpan={dates.length + 2} style={{ padding: 0, height: 1, background: 'rgba(255,255,255,0.07)' }} />
              </tr>
            )}

            {/* ── Per-URL rows ── */}
            {(urlResults || []).filter(r => !urlFilter || r.url.toLowerCase().includes(urlFilter.toLowerCase())).map(row => {
              const dayMap = Object.fromEntries(row.daily.map(d => [d.date, d]));
              const coveragePct = row.coverage_pct != null
                ? row.coverage_pct
                : (dates.length > 0 ? Math.round((row.indexed_days / dates.length) * 100) : 0);
              const coverageColor = coveragePct >= 80 ? '#4ade80' : coveragePct >= 50 ? '#f59e0b' : '#f87171';
              const expanded = expandedUrls.has(row.url);

              return (
                <React.Fragment key={row.url}>
                  <tr
                    onClick={() => toggleExpand(row.url)}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    {/* Sticky URL label */}
                    <td style={{
                      position: 'sticky', left: 0, zIndex: 1, background: expanded ? 'rgba(255,255,255,0.03)' : BG,
                      paddingRight: 12, paddingTop: 4, paddingBottom: 4, width: URL_W,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                          background: coverageColor, boxShadow: `0 0 5px ${coverageColor}55`,
                        }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.72)', fontSize: '0.75rem', flex: 1, minWidth: 0 }} title={row.url}>
                          {shortPath(row.url)}
                        </span>
                        <span style={{ flexShrink: 0, color: 'rgba(255,255,255,0.25)', transition: 'transform 0.15s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                          <ChevronDown size={12} />
                        </span>
                      </div>
                    </td>

                    {/* Day cells */}
                    {dates.map(date => {
                      const d = dayMap[date];
                      const isFirst = monthStarts.has(date);
                      const trafficRatio = d ? Math.max(0.2, 0.2 + ((d.impressions || 0) / maxImpressions) * 0.8) : 0;
                      let cellBg, cellBorder, glowColor;
                      if (d?.verdict === 'PASS') {
                        cellBg = `rgba(74,222,128,${trafficRatio.toFixed(2)})`; cellBorder = `rgba(74,222,128,${Math.min(0.5, trafficRatio * 0.6).toFixed(2)})`; glowColor = 'rgba(74,222,128,0.5)';
                      } else if (d?.verdict === 'NEUTRAL') {
                        cellBg = 'rgba(245,158,11,0.65)'; cellBorder = 'rgba(245,158,11,0.4)'; glowColor = 'rgba(245,158,11,0.5)';
                      } else if (d?.verdict === 'FAIL') {
                        cellBg = 'rgba(248,113,113,0.65)'; cellBorder = 'rgba(248,113,113,0.4)'; glowColor = 'rgba(248,113,113,0.5)';
                      } else if (d?.indexed) {
                        cellBg = `rgba(74,222,128,${(trafficRatio * 0.45).toFixed(2)})`; cellBorder = 'rgba(74,222,128,0.2)'; glowColor = 'rgba(74,222,128,0.35)';
                      } else {
                        cellBg = 'rgba(255,255,255,0.05)'; cellBorder = 'rgba(255,255,255,0.04)'; glowColor = 'rgba(255,255,255,0.18)';
                      }

                      return (
                        <td key={date} style={{
                          padding: `4px ${GAP / 2}px`,
                          borderLeft: isFirst ? '1px solid rgba(255,255,255,0.06)' : undefined,
                        }}>
                          <div
                            onMouseEnter={e => { e.stopPropagation(); handleEnter(e, { date, d, url: row.url }); }}
                            onMouseMove={e => { e.stopPropagation(); handleMove(e); }}
                            onMouseLeave={e => { e.stopPropagation(); handleLeave(); }}
                            onClick={e => e.stopPropagation()}
                            style={{
                              width: CELL, height: CELL, borderRadius: 3, cursor: 'default', boxSizing: 'border-box',
                              background: cellBg,
                              border: `1px solid ${cellBorder}`,
                              transition: 'box-shadow 0.1s, transform 0.1s',
                            }}
                            onMouseOver={e => {
                              e.currentTarget.style.boxShadow = `0 0 0 2px ${glowColor}`;
                              e.currentTarget.style.transform = 'scale(1.18)';
                            }}
                            onMouseOut={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'scale(1)'; }}
                          />
                        </td>
                      );
                    })}

                    {/* Coverage summary */}
                    <td style={{ paddingLeft: 14, whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <CoverageBar pct={coveragePct} color={coverageColor} />
                        <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                          {row.indexed_days}/{dates.length} days
                          {row.first_seen && <> · first <span style={{ color: '#d8d8e6' }}>{row.first_seen}</span></>}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* ── Expanded detail row ── */}
                  {expanded && (
                    <tr style={{ background: 'rgba(0,0,0,0.18)' }}>
                      <td colSpan={dates.length + 2} style={{ padding: '0 0 0 20px' }}>
                        <div style={{ padding: '14px 20px 14px 0' }}>
                          {/* URL header */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <a href={row.url} target="_blank" rel="noopener noreferrer"
                              style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--primary)', textDecoration: 'none', fontSize: '0.78rem', fontWeight: 600 }}>
                              {row.url}
                              <ExternalLink size={11} style={{ opacity: 0.6 }} />
                            </a>
                          </div>

                          {/* Summary chips */}
                          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                            {[
                              { label: 'Indexed days', value: row.indexed_days, color: coverageColor },
                              { label: 'Not in GSC', value: (dates.length - row.indexed_days), color: '#94a3b8' },
                              { label: 'Coverage', value: `${coveragePct}%`, color: coverageColor },
                              ...(row.first_seen ? [{ label: 'First seen', value: row.first_seen, color: '#d8d8e6' }] : []),
                              ...(row.last_seen ? [{ label: 'Last seen', value: row.last_seen, color: '#d8d8e6' }] : []),
                            ].map(chip => (
                              <div key={chip.label} style={{
                                padding: '4px 10px', borderRadius: 6,
                                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                                fontSize: '0.72rem',
                              }}>
                                <span style={{ color: 'var(--text-muted)', marginRight: 5 }}>{chip.label}</span>
                                <span style={{ color: chip.color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{chip.value}</span>
                              </div>
                            ))}
                          </div>

                          {/* Day-by-day table */}
                          <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                                  {['Date', 'Verdict', 'Indexed', 'Impressions', 'Clicks', 'CTR', 'Avg. Pos'].map(h => (
                                    <th key={h} style={{ padding: '5px 12px 5px 0', textAlign: h === 'Date' ? 'left' : 'center', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {row.daily.map(d => {
                                  const vs = VERDICT_STYLE[d.verdict] || null;
                                  return (
                                    <tr key={d.date} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                      <td style={{ padding: '5px 12px 5px 0', color: '#d8d8e6', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{d.date}</td>
                                      <td style={{ textAlign: 'center', padding: '5px 8px' }}>
                                        {d.verdict
                                          ? <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: 3, color: vs?.color, background: vs?.bg, border: `1px solid ${vs?.border}`, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{d.verdict}</span>
                                          : <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>—</span>}
                                      </td>
                                      <td style={{ textAlign: 'center', padding: '5px 8px' }}>
                                        {d.indexed
                                          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.7rem', fontWeight: 700, color: '#4ade80' }}><CheckCircle size={10} /> Yes</span>
                                          : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.7rem', fontWeight: 600, color: '#f87171' }}><AlertCircle size={10} /> No</span>}
                                      </td>
                                      <td style={{ textAlign: 'center', padding: '5px 12px', fontVariantNumeric: 'tabular-nums', color: '#d8d8e6' }}>{(d.impressions || 0).toLocaleString()}</td>
                                      <td style={{ textAlign: 'center', padding: '5px 12px', fontVariantNumeric: 'tabular-nums', color: (d.clicks || 0) > 0 ? '#4ade80' : 'var(--text-dim)', fontWeight: (d.clicks || 0) > 0 ? 700 : 400 }}>{(d.clicks || 0).toLocaleString()}</td>
                                      <td style={{ textAlign: 'center', padding: '5px 12px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{d.impressions > 0 ? `${((d.clicks || 0) / d.impressions * 100).toFixed(1)}%` : '—'}</td>
                                      <td style={{ textAlign: 'center', padding: '5px 12px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{d.position != null ? d.position : '—'}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Floating tooltip ── */}
      {tip && (
        <div style={{
          position: 'fixed', left: tip.x + 14, top: tip.y - 10, zIndex: 9999,
          background: 'rgba(8,14,28,0.98)', border: '1px solid rgba(255,255,255,0.11)',
          borderRadius: 10, padding: '10px 13px', fontSize: '0.75rem',
          pointerEvents: 'none', minWidth: 158,
          boxShadow: '0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
        }}>
          <div style={{ fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: 7, fontVariantNumeric: 'tabular-nums', fontSize: '0.72rem' }}>
            {tip.date}
          </div>

          {tip.siteDay ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(226,0,113,0.9)', fontWeight: 600, marginBottom: 7, fontSize: '0.71rem' }}>
                <Globe size={11} /> Site-wide
              </div>
              {[
                ['In GSC', (tip.siteDay?.total_pages || 0).toLocaleString(), '#fff'],
                ['Getting clicks', (tip.siteDay?.pages_clicking || 0).toLocaleString(), '#4ade80'],
              ].map(([lbl, val, col]) => (
                <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', gap: 18, fontSize: '0.7rem', marginBottom: 2 }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>{lbl}</span>
                  <span style={{ color: col, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{val}</span>
                </div>
              ))}
            </>
          ) : (() => {
            const d = tip.d;
            const vs = VERDICT_STYLE[d?.verdict] || null;
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                  {d?.verdict
                    ? <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 7px', borderRadius: 3, color: vs?.color, background: vs?.bg, border: `1px solid ${vs?.border}`, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d.verdict}</span>
                    : null}
                  {d?.indexed
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.71rem', fontWeight: 600, color: '#4ade80' }}><CheckCircle size={11} /> Indexed</span>
                    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.71rem', fontWeight: 600, color: '#f87171' }}><AlertCircle size={11} /> Not indexed</span>}
                </div>
                {d?.coverage_state && (
                  <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', marginBottom: 6, fontStyle: 'italic' }}>{d.coverage_state}</div>
                )}
                {[
                  ['Impressions', (d?.impressions || 0).toLocaleString(), '#fff'],
                  ['Clicks', (d?.clicks || 0).toLocaleString(), (d?.clicks || 0) > 0 ? '#4ade80' : '#fff'],
                  ...(d?.position != null ? [['Avg. position', String(d.position), 'rgba(255,255,255,0.65)']] : []),
                ].map(([lbl, val, col]) => (
                  <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', gap: 18, fontSize: '0.7rem', marginBottom: 2 }}>
                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>{lbl}</span>
                    <span style={{ color: col, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{val}</span>
                  </div>
                ))}
              </>
            );
          })()}

          {tip.url !== 'site' && (
            <div style={{ marginTop: 8, paddingTop: 7, borderTop: '1px solid rgba(255,255,255,0.07)', fontSize: '0.62rem', color: 'rgba(255,255,255,0.28)', wordBreak: 'break-all' }}>
              {shortPath(tip.url)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ── Index Verdict helpers ─────────────────────────────────────────────────────

const VERDICT_STYLE = {
  PASS:    { color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.3)'  },
  NEUTRAL: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)'  },
  FAIL:    { color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)' },
};

function VerdictBadge({ verdict }) {
  const s = VERDICT_STYLE[verdict] || { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.25)' };
  return (
    <span style={{
      fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
      textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
    }}>
      {verdict || '—'}
    </span>
  );
}

function IndexVerdict({ selectedSite }) {
  const [rows, setRows]           = useState([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [datesInfo, setDatesInfo] = useState(null);
  const [error, setError]         = useState('');
  const [verdictFilter, setVerdictFilter] = useState('');
  const [indexedFilter, setIndexedFilter] = useState('');
  const [canonicalOnly, setCanonicalOnly] = useState(false);
  const [textFilter, setTextFilter] = useState('');
  const [sortCol, setSortCol]     = useState('verdict');
  const [sortDir, setSortDir]     = useState('asc');
  const [loaded, setLoaded]       = useState(false);
  const loadedSiteRef             = useRef(null);

  const refresh = useCallback(async (site) => {
    if (!site) return;
    setLoadingRows(true);
    setError('');
    setRows([]);
    const token = localStorage.getItem('auth_token');
    try {
      const [datesRes, rowsRes] = await Promise.all([
        fetch('/api/indexation/url-inspection-dates', { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/indexation/url-inspection-site?site_slug=${encodeURIComponent(site)}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (datesRes.ok) setDatesInfo(await datesRes.json());
      if (!rowsRes.ok) {
        const d = await rowsRes.json().catch(() => ({}));
        throw new Error(d?.detail?.error || d?.detail || `HTTP ${rowsRes.status}`);
      }
      const data = await rowsRes.json();
      setRows(Array.isArray(data) ? data : []);
      setLoaded(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingRows(false);
    }
  }, []);

  // Auto-load when site changes (once per site)
  useEffect(() => {
    if (selectedSite && selectedSite !== loadedSiteRef.current) {
      loadedSiteRef.current = selectedSite;
      refresh(selectedSite);
    }
  }, [selectedSite, refresh]);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir(col === 'verdict' ? 'asc' : 'desc'); }
  };

  const filtered = useMemo(() => {
    let r = rows;
    if (verdictFilter) r = r.filter(x => x.verdict === verdictFilter);
    if (indexedFilter === 'indexed')  r = r.filter(x => x.is_indexed);
    if (indexedFilter === 'missing')  r = r.filter(x => !x.is_indexed);
    if (canonicalOnly) r = r.filter(x => x.canonical_mismatch);
    if (textFilter) {
      const q = textFilter.toLowerCase();
      r = r.filter(x => (x.page_url || '').toLowerCase().includes(q) || (x.coverage_state || '').toLowerCase().includes(q));
    }
    return [...r].sort((a, b) => {
      let va, vb;
      if (sortCol === 'verdict') {
        const order = { PASS: 0, NEUTRAL: 1, FAIL: 2 };
        va = order[a.verdict] ?? 3; vb = order[b.verdict] ?? 3;
      } else if (sortCol === 'is_indexed') {
        va = a.is_indexed ? 1 : 0; vb = b.is_indexed ? 1 : 0;
      } else if (sortCol === 'last_crawl') {
        va = a.last_crawl_time || ''; vb = b.last_crawl_time || '';
      } else {
        va = a[sortCol] || ''; vb = b[sortCol] || '';
      }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, verdictFilter, indexedFilter, canonicalOnly, textFilter, sortCol, sortDir]);

  const counts = useMemo(() => {
    if (!rows.length) return {};
    return {
      total:    rows.length,
      pass:     rows.filter(r => r.verdict === 'PASS').length,
      neutral:  rows.filter(r => r.verdict === 'NEUTRAL').length,
      fail:     rows.filter(r => r.verdict === 'FAIL').length,
      indexed:  rows.filter(r => r.is_indexed).length,
      mismatch: rows.filter(r => r.canonical_mismatch).length,
    };
  }, [rows]);

  const filterBtn = (active, label, onClick, color = 'rgba(255,255,255,0.1)', activeColor = '#E20071') => (
    <button onClick={onClick} style={{
      fontSize: '0.72rem', padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
      background: active ? `${activeColor}22` : 'rgba(255,255,255,0.04)',
      border: `1px solid ${active ? activeColor : 'rgba(255,255,255,0.1)'}`,
      color: active ? activeColor : 'var(--text-muted)', fontWeight: active ? 700 : 400,
    }}>{label}</button>
  );

  const exportCsv = () => {
    const esc = (v) => {
      const s = (v ?? '').toString();
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Page URL', 'Verdict', 'Indexed', 'Coverage reason', 'Last crawl', 'Canonical mismatch'];
    const body = filtered.map(r => [
      r.page_url, r.verdict, r.is_indexed ? 'Yes' : 'No',
      r.coverage_state, r.last_crawl_time, r.canonical_mismatch ? 'Yes' : 'No',
    ].map(esc).join(','));
    const blob = new Blob([[header.join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const label = verdictFilter || indexedFilter || 'all';
    a.download = `indexation-${label}-${selectedSite}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
          Google's per-page index verdict from the URL Inspection API, refreshed daily.
        </p>
        <button onClick={() => refresh(selectedSite)} disabled={!selectedSite || loadingRows} style={{
          display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', padding: '5px 10px',
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6, cursor: 'pointer', color: 'var(--text-muted)',
        }}>
          <RefreshCw size={12} /> {loadingRows ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Freshness bar */}
      {datesInfo && (datesInfo.page_count > 0) && (
        <div style={{
          display: 'flex', gap: 16, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 8, marginBottom: 14,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Pages</div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{datesInfo.page_count?.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Indexed</div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#4ade80', fontVariantNumeric: 'tabular-nums' }}>{datesInfo.indexed_count?.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Not indexed</div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#f59e0b', fontVariantNumeric: 'tabular-nums' }}>{datesInfo.not_indexed_count?.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Index rate</div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', fontVariantNumeric: 'tabular-nums', color: (() => { const p = datesInfo.indexed_count / datesInfo.page_count * 100; return p >= 80 ? '#4ade80' : p >= 50 ? '#f59e0b' : '#f87171'; })() }}>
              {datesInfo.page_count ? Math.round(datesInfo.indexed_count / datesInfo.page_count * 100) : 0}%
            </div>
          </div>
          {datesInfo.date && (
            <div style={{ marginLeft: 'auto', alignSelf: 'center' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>as of {datesInfo.date}</span>
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171', fontSize: '0.82rem', marginBottom: 12 }}>
          {error}
        </div>
      )}

      {!loaded && !loadingRows && !error && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          {selectedSite ? 'Loading verdict data…' : 'Select a site and run Check Indexation to load verdicts.'}
        </div>
      )}

      {loaded && rows.length > 0 && (
        <>
          {/* Summary chips */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
            {filterBtn(!verdictFilter && !indexedFilter && !canonicalOnly, `All (${counts.total})`, () => { setVerdictFilter(''); setIndexedFilter(''); setCanonicalOnly(false); })}
            {filterBtn(verdictFilter === 'PASS',    `PASS ${counts.pass}`,    () => setVerdictFilter(v => v === 'PASS'    ? '' : 'PASS'),    '#4ade80', '#4ade80')}
            {filterBtn(verdictFilter === 'NEUTRAL', `NEUTRAL ${counts.neutral}`, () => setVerdictFilter(v => v === 'NEUTRAL' ? '' : 'NEUTRAL'), '#f59e0b', '#f59e0b')}
            {filterBtn(verdictFilter === 'FAIL',    `FAIL ${counts.fail}`,    () => setVerdictFilter(v => v === 'FAIL'    ? '' : 'FAIL'),    '#f87171', '#f87171')}
            <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />
            {filterBtn(indexedFilter === 'indexed', `Indexed ${counts.indexed}`,         () => setIndexedFilter(v => v === 'indexed' ? '' : 'indexed'))}
            {filterBtn(indexedFilter === 'missing', `Not indexed ${counts.total - counts.indexed}`, () => setIndexedFilter(v => v === 'missing' ? '' : 'missing'))}
            {counts.mismatch > 0 && filterBtn(canonicalOnly, `Canonical mismatch ${counts.mismatch}`, () => setCanonicalOnly(v => !v), '#fb923c', '#fb923c')}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={exportCsv} title="Export the filtered rows as CSV" style={{
                display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', padding: '5px 11px',
                borderRadius: 7, cursor: 'pointer', color: 'var(--text-muted)',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
              }}>
                <Download size={13} /> Export CSV ({filtered.length})
              </button>
              <Filter size={13} color="var(--text-muted)" />
              <input
                className="glass-input"
                placeholder="Filter URL or reason…"
                value={textFilter}
                onChange={e => setTextFilter(e.target.value)}
                style={{ fontSize: '0.78rem', padding: '5px 9px', width: 210 }}
              />
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Page URL</th>
                  <th onClick={() => handleSort('verdict')} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      Verdict <ArrowUpDown size={11} color={sortCol === 'verdict' ? 'var(--primary)' : 'rgba(255,255,255,0.25)'} />
                    </span>
                  </th>
                  <th onClick={() => handleSort('is_indexed')} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      Indexed <ArrowUpDown size={11} color={sortCol === 'is_indexed' ? 'var(--primary)' : 'rgba(255,255,255,0.25)'} />
                    </span>
                  </th>
                  <th>Coverage reason</th>
                  <th onClick={() => handleSort('last_crawl')} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      Last crawl <ArrowUpDown size={11} color={sortCol === 'last_crawl' ? 'var(--primary)' : 'rgba(255,255,255,0.25)'} />
                    </span>
                  </th>
                  <th style={{ textAlign: 'center' }}>Canonical</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 500).map((row, i) => (
                  <tr key={i}>
                    <td style={{ maxWidth: 300 }}>
                      <a href={row.page_url} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--primary)', textDecoration: 'none', fontSize: '0.8rem' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.page_url}>
                          {shortPath(row.page_url)}
                        </span>
                        <ExternalLink size={9} style={{ flexShrink: 0, opacity: 0.5 }} />
                      </a>
                    </td>
                    <td><VerdictBadge verdict={row.verdict} /></td>
                    <td style={{ textAlign: 'center' }}>
                      {row.is_indexed
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.75rem', color: '#4ade80', fontWeight: 700 }}><CheckCircle size={12} /> Yes</span>
                        : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.75rem', color: '#f59e0b', fontWeight: 600 }}><AlertCircle size={12} /> No</span>}
                    </td>
                    <td style={{ maxWidth: 260, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }} title={row.coverage_state}>
                        {row.coverage_state || '—'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {row.last_crawl_time ? new Date(row.last_crawl_time).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {row.canonical_mismatch
                        ? (
                          <span title={`Google: ${row.google_canonical}\nDeclared: ${row.user_canonical}`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.72rem', color: '#fb923c', fontWeight: 700, cursor: 'help' }}>
                            <Link2 size={11} /> Mismatch
                          </span>
                        )
                        : <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 500 && (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 10 }}>
              Showing 500 of {filtered.length.toLocaleString()} — use the filters to narrow down
            </p>
          )}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              No results match the current filters.
            </div>
          )}
        </>
      )}
    </div>
  );
}


// ── main component ────────────────────────────────────────────────────────────

// ── Index Health panel — daily snapshot trend + alerts ─────────────────────────

function rateColor(r) {
  return r >= 80 ? '#4ade80' : r >= 50 ? '#f59e0b' : '#f87171';
}

function IndexRateSparkline({ history }) {
  const pts0 = (history || []).filter(h => h.index_rate != null).slice(-30);
  if (pts0.length < 2) return null;
  const W = 200, H = 44, pad = 4;
  const xs = pts0.map((_, i) => pad + (i / (pts0.length - 1)) * (W - 2 * pad));
  const min = Math.min(...pts0.map(h => h.index_rate));
  const max = Math.max(...pts0.map(h => h.index_rate));
  const range = (max - min) || 1;
  const yOf = v => pad + (1 - (v - min) / range) * (H - 2 * pad);
  const line = pts0.map((h, i) => `${xs[i].toFixed(1)},${yOf(h.index_rate).toFixed(1)}`).join(' ');
  const last = pts0[pts0.length - 1];
  const color = rateColor(last.index_rate);
  return (
    <svg width={W} height={H} style={{ overflow: 'visible' }}>
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs[xs.length - 1]} cy={yOf(last.index_rate)} r="3" fill={color} />
    </svg>
  );
}

function IndexHealthPanel({ site }) {
  const [history, setHistory] = useState([]);
  const [alerts, setAlerts]   = useState([]);
  const [important, setImportant] = useState([]);
  const [busy, setBusy]       = useState(false);
  const [msg, setMsg]         = useState('');

  const load = useCallback(async (s) => {
    if (!s) return;
    try {
      const [h, a] = await Promise.all([
        fetch(`/api/indexation/history?site_slug=${encodeURIComponent(s)}`).then(r => r.json()).catch(() => ({})),
        fetch(`/api/indexation/alerts?site_slug=${encodeURIComponent(s)}`).then(r => r.json()).catch(() => ({})),
      ]);
      setHistory(Array.isArray(h.history) ? h.history : []);
      setImportant(Array.isArray(h.important_not_indexed) ? h.important_not_indexed : []);
      setAlerts(Array.isArray(a.alerts) ? a.alerts : []);
    } catch { /* best-effort */ }
  }, []);

  useEffect(() => { setHistory([]); setAlerts([]); setImportant([]); setMsg(''); load(site); }, [site, load]);

  const capture = async () => {
    if (!site) return;
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/indexation/snapshot', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_slug: site }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || 'Snapshot failed');
      if (d.error) setMsg(d.error);
      await load(site);
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  };

  const dismiss = async () => {
    await fetch(`/api/indexation/alerts/seen?site_slug=${encodeURIComponent(site)}`, { method: 'POST' }).catch(() => {});
    setAlerts([]);
  };

  const testSlack = async () => {
    setMsg('');
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch('/api/indexation/test-slack', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (!d.configured) setMsg('Slack not configured — set SLACK_WEBHOOK_URL in the environment.');
      else setMsg(d.sent ? 'Test message sent to Slack ✓' : 'Slack webhook is set but the send failed.');
    } catch { setMsg('Could not reach the server.'); }
  };

  const latest  = history.length ? history[history.length - 1] : null;
  const first   = history.length ? history[0] : null;
  const delta   = latest && first && history.length > 1 ? Math.round((latest.index_rate - first.index_rate) * 10) / 10 : null;
  const unseen  = alerts.filter(a => !a.seen);
  const sevColor = { critical: '#f87171', warning: '#f59e0b', info: '#60a5fa' };

  if (!site) return null;

  return (
    <div className="glass-panel" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 3 }}>Index Health</div>
            {latest ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: '1.9rem', fontWeight: 800, lineHeight: 1, color: rateColor(latest.index_rate) }}>{latest.index_rate}%</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {latest.indexed_count.toLocaleString()}/{latest.page_count.toLocaleString()} indexed
                </span>
                {delta != null && (
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: delta > 0 ? '#4ade80' : delta < 0 ? '#f87171' : 'var(--text-muted)' }}>
                    {delta > 0 ? '+' : ''}{delta} pts
                  </span>
                )}
              </div>
            ) : (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>No history yet — capture the first snapshot.</div>
            )}
          </div>
          {history.length >= 2 && (
            <div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginBottom: 2 }}>{history.length}-day trend</div>
              <IndexRateSparkline history={history} />
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={testSlack} style={{
            fontSize: '0.72rem', padding: '7px 11px', background: 'none',
            border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, cursor: 'pointer', color: 'var(--text-muted)',
          }}>
            Test Slack
          </button>
          <button onClick={capture} disabled={busy} style={{
            display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', padding: '7px 13px',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 7, cursor: busy ? 'wait' : 'pointer', color: 'var(--text-muted)',
          }}>
            <RefreshCw size={13} /> {busy ? 'Capturing…' : 'Capture snapshot'}
          </button>
        </div>
      </div>

      {msg && <div style={{ marginTop: 10, fontSize: '0.78rem', color: '#f59e0b' }}>{msg}</div>}

      {unseen.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f87171', display: 'flex', alignItems: 'center', gap: 5 }}>
              <ShieldAlert size={13} /> {unseen.length} index alert{unseen.length !== 1 ? 's' : ''}
            </span>
            <button onClick={dismiss} style={{ fontSize: '0.7rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}>Dismiss</button>
          </div>
          {unseen.map((a, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px', borderRadius: 7, fontSize: '0.8rem',
              background: 'rgba(255,255,255,0.03)', borderLeft: `3px solid ${sevColor[a.severity] || '#60a5fa'}`,
            }}>
              <span style={{ color: sevColor[a.severity] || '#60a5fa', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.62rem', letterSpacing: '0.05em', flexShrink: 0 }}>{a.severity}</span>
              <span style={{ color: '#d8d8e6' }}>{a.message}</span>
            </div>
          ))}
        </div>
      )}

      {important.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
            <ShieldAlert size={13} /> {important.length} high-traffic page{important.length !== 1 ? 's' : ''} not indexed
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {important.slice(0, 8).map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: '0.76rem', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <a href={p.url} target="_blank" rel="noopener noreferrer" title={p.url}
                  style={{ color: 'var(--primary)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {shortPath(p.url)}
                </a>
                <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{(p.clicks || 0).toLocaleString()} clicks</span>
              </div>
            ))}
            {important.length > 8 && (
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>+{important.length - 8} more</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function IndexationControl() {
  const [sites, setSites]                   = useState([]);
  const [siteSearch, setSiteSearch]         = useState('');
  const [selectedSite, setSelectedSite]     = useState('');
  const [urlsEnabled, setUrlsEnabled]       = useState(false);
  const [urlsText, setUrlsText]             = useState('');
  const [loading, setLoading]               = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [result, setResult]                 = useState(null);
  const [error, setError]                   = useState('');
  const [activeTab, setActiveTab]           = useState('timeline');

  // Date range
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState('');

  // Sitemap toggle
  const [sitemapEnabled, setSitemapEnabled] = useState(false);
  const [sitemapUrl, setSitemapUrl]         = useState('');

  // All-pages tab
  const [filter, setFilter]   = useState('');
  const [sortBy, setSortBy]   = useState('impressions');
  const [sortDir, setSortDir] = useState('desc');

  // Sitemap coverage tab
  const [sitemapFilter, setSitemapFilter]   = useState('');
  const [sitemapStatus, setSitemapStatus]   = useState('all');
  const [smSortBy, setSmSortBy]             = useState('status');
  const [smSortDir, setSmSortDir]           = useState('asc');

  // Expandable URL rows (date range detail)
  const [expandedUrls, setExpandedUrls] = useState(new Set());

  // ── load sites, set default date range ──────────────────────────────────────

  useEffect(() => {
    setEndDate(isoOffset(-4));
    setStartDate(isoOffset(-17));

    setCatalogLoading(true);
    fetch('/api/indexation/gsc-sites')
      .then(r => r.json())
      .then(d => setSites(d.sites || []))
      .catch(() => {})
      .finally(() => setCatalogLoading(false));
  }, []);

  // ── unified check ─────────────────────────────────────────────────────────

  const handleCheck = async (overrideSitemapUrl) => {
    if (!selectedSite || !startDate || !endDate) return;
    setLoading(true);
    setResult(null);
    setError('');
    setExpandedUrls(new Set());

    const urls = urlsText.split('\n').map(u => u.trim()).filter(Boolean);
    const smUrl = overrideSitemapUrl ?? (sitemapEnabled && sitemapUrl.trim() ? sitemapUrl.trim() : null);

    try {
      const res = await fetch('/api/indexation/range-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_slug:   selectedSite,
          start_date:  startDate,
          end_date:    endDate,
          search_type: 'web',
          urls:        urls.length > 0 ? urls : null,
          sitemap_url: smUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.detail?.error || data?.detail || 'Unknown error';
        setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      } else {
        setResult(data);
        setActiveTab('timeline');
      }
    } catch (e) {
      setError('Network error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // Quick "check this sitemap" from the Sitemaps tab
  const handleSitemapQuickCheck = (smPath) => {
    setSitemapEnabled(true);
    setSitemapUrl(smPath);
    handleCheck(smPath);
  };

  // ── sort / filter ─────────────────────────────────────────────────────────

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const filteredPages = useMemo(() => {
    if (!result?.pages) return [];
    return result.pages
      .filter(p => !filter || (p.page || '').toLowerCase().includes(filter.toLowerCase()))
      .sort((a, b) => {
        const va = parseFloat(a[sortBy] ?? 0) || 0;
        const vb = parseFloat(b[sortBy] ?? 0) || 0;
        return sortDir === 'desc' ? vb - va : va - vb;
      });
  }, [result, filter, sortBy, sortDir]);

  const filteredSites = useMemo(() =>
    sites.filter(s => !siteSearch || (s.site || '').toLowerCase().includes(siteSearch.toLowerCase())).slice(0, 40),
    [sites, siteSearch]
  );

  const handleSmSort = (col) => {
    if (smSortBy === col) setSmSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSmSortBy(col); setSmSortDir(col === 'status' ? 'asc' : 'desc'); }
  };

  const filteredSitemapUrls = useMemo(() => {
    if (!result?.sitemap_result) return [];
    let rows = result.sitemap_result.url_results;
    if (sitemapFilter) rows = rows.filter(r => r.url.toLowerCase().includes(sitemapFilter.toLowerCase()));
    if (sitemapStatus === 'indexed') rows = rows.filter(r => r.in_gsc);
    if (sitemapStatus === 'missing') rows = rows.filter(r => !r.in_gsc);
    return [...rows].sort((a, b) => {
      if (smSortBy === 'status') {
        const diff = (a.in_gsc ? 1 : 0) - (b.in_gsc ? 1 : 0);
        return smSortDir === 'asc' ? diff : -diff;
      }
      const va = parseFloat(a[smSortBy] ?? 0) || 0;
      const vb = parseFloat(b[smSortBy] ?? 0) || 0;
      return smSortDir === 'desc' ? vb - va : va - vb;
    });
  }, [result, sitemapFilter, sitemapStatus, smSortBy, smSortDir]);

  function toggleExpand(url) {
    setExpandedUrls(prev => {
      const next = new Set(prev);
      next.has(url) ? next.delete(url) : next.add(url);
      return next;
    });
  }

  // ── render ────────────────────────────────────────────────────────────────

  const stats     = result?.stats;
  const smResult  = result?.sitemap_result;

  return (
    <div className="flex-col gap-6">

      {/* ── Config panel ── */}
      <div className="glass-panel">
        <h2 className="flex items-center gap-2 mb-4">
          <Globe size={22} color="var(--primary)" /> Indexation Control
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 20 }}>
          Cross-reference your URLs against Google Search Console data over a date range. See exactly which days each page was indexed.
        </p>

        {/* Site + search type */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="metric-label mb-2 block">GSC Site</label>
            <input
              className="glass-input mb-2"
              placeholder="Search sites…"
              value={siteSearch}
              onChange={e => setSiteSearch(e.target.value)}
              style={{ fontSize: '0.82rem', padding: '8px 12px' }}
            />
            <select
              className="glass-input"
              value={selectedSite}
              onChange={e => setSelectedSite(e.target.value)}
              disabled={catalogLoading}
              style={{ fontSize: '0.82rem' }}
            >
              <option value="">{catalogLoading ? 'Loading sites…' : '— Select a site —'}</option>
              {filteredSites.map(s => (
                <option key={s.site_slug} value={s.site_slug}>{s.site}</option>
              ))}
              {sites.length > 40 && <option disabled>… {sites.length - 40} more (refine search)</option>}
            </select>
          </div>
        </div>

        {/* Date range */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="metric-label mb-2 block">Start date</label>
            <input
              type="date"
              className="glass-input"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              style={{ fontSize: '0.82rem' }}
            />
          </div>
          <div>
            <label className="metric-label mb-2 block">End date <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(max 31 days range)</span></label>
            <input
              type="date"
              className="glass-input"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              style={{ fontSize: '0.82rem' }}
            />
          </div>
        </div>

        {/* Specific URLs toggle */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16, marginBottom: 16 }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none', marginBottom: urlsEnabled ? 12 : 0 }}
            onClick={() => { setUrlsEnabled(v => !v); if (urlsEnabled) setUrlsText(''); }}
          >
            {urlsEnabled
              ? <ToggleRight size={22} color="var(--primary)" />
              : <ToggleLeft  size={22} color="rgba(255,255,255,0.3)" />}
            <div>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: urlsEnabled ? 'white' : 'var(--text-muted)' }}>
                Check specific URLs
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginLeft: 8 }}>
                {urlsEnabled ? 'enabled — one URL per line' : 'disabled — shows top 100 pages'}
              </span>
            </div>
          </div>
          {urlsEnabled && (
            <textarea
              className="glass-input"
              rows={4}
              placeholder={"https://example.com/page1\nhttps://example.com/page2"}
              value={urlsText}
              onChange={e => setUrlsText(e.target.value)}
              style={{ resize: 'vertical', fontSize: '0.82rem', width: '100%' }}
            />
          )}
        </div>

        {/* Sitemap toggle section */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16, marginBottom: 20 }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setSitemapEnabled(v => !v)}
          >
            {sitemapEnabled
              ? <ToggleRight size={22} color="var(--primary)" />
              : <ToggleLeft  size={22} color="rgba(255,255,255,0.3)" />}
            <div>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: sitemapEnabled ? 'white' : 'var(--text-muted)' }}>
                Check sitemap coverage
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginLeft: 8 }}>
                {sitemapEnabled ? 'enabled' : 'disabled'}
              </span>
            </div>
          </div>

          {sitemapEnabled && (
            <div style={{ marginTop: 12 }}>
              <label className="metric-label mb-2 block" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Map size={12} color="var(--primary)" /> Sitemap URL
              </label>
              <input
                className="glass-input"
                placeholder="https://example.com/sitemap.xml"
                value={sitemapUrl}
                onChange={e => setSitemapUrl(e.target.value)}
                style={{ fontSize: '0.82rem' }}
              />
            </div>
          )}
        </div>

        {/* Single unified button — AFTER sitemap section */}
        <button
          className="btn-primary w-full"
          onClick={() => handleCheck()}
          disabled={loading || !selectedSite || !startDate || !endDate}
        >
          {loading
            ? <><div className="loader" /> Fetching GSC data…</>
            : '🔍 Check Indexation'}
        </button>

        {error && (
          <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', fontSize: '0.83rem' }}>
            {error}
          </div>
        )}
      </div>

      {/* ── Index health: daily snapshot trend + alerts ── */}
      {selectedSite && <IndexHealthPanel site={selectedSite} />}

      {/* ── Results ── */}
      {result && stats && (
        <>
          {/* Stat cards */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Date range:</span>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#d8d8e6' }}>{result.start_date} → {result.end_date}</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginLeft: 4 }}>({result.dates?.length} days)</span>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="Pages in GSC" value={stats.total_pages.toLocaleString()} sub={`on ${result.end_date}`} valueColor="var(--primary)" />
            <StatCard label="Getting clicks" value={stats.with_clicks.toLocaleString()} sub={`${stats.total_pages > 0 ? Math.round((stats.with_clicks / stats.total_pages) * 100) : 0}% of indexed pages`} valueColor="#4ade80" />
            <StatCard label="0-click pages"  value={stats.no_clicks.toLocaleString()} sub="impressions only" valueColor={stats.no_clicks > stats.with_clicks ? '#f59e0b' : '#d8d8e6'} />
            <StatCard label="Sitemaps" value={stats.sitemap_count} sub="submitted to GSC" />
          </div>

          {/* Sitemap coverage summary */}
          {smResult && (
            <div className="glass-panel" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 4 }}>Sitemap Coverage</div>
                  <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', wordBreak: 'break-all' }}>{smResult.sitemap_url}</div>
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1, color: '#4ade80' }}>{smResult.indexed_count.toLocaleString()}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>indexed</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1, color: smResult.not_indexed_count > 0 ? '#f59e0b' : '#4ade80' }}>{smResult.not_indexed_count.toLocaleString()}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>not in GSC</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1, color: 'white' }}>{smResult.total_urls.toLocaleString()}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>total in sitemap</div>
                  </div>
                </div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${smResult.coverage_pct}%`, borderRadius: 6, transition: 'width 0.6s ease',
                  background: smResult.coverage_pct >= 80 ? '#4ade80' : smResult.coverage_pct >= 50 ? '#f59e0b' : '#f87171',
                }} />
              </div>
              <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {smResult.child_sitemaps?.length > 0 && `Sitemap index → ${smResult.child_sitemaps.length} child sitemaps · `}
                  Matched against {(smResult.gsc_pages_total || 0).toLocaleString()} GSC pages · as of {result.end_date}
                </span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: smResult.coverage_pct >= 80 ? '#4ade80' : smResult.coverage_pct >= 50 ? '#f59e0b' : '#f87171' }}>
                  {smResult.coverage_pct}% indexed
                </span>
              </div>
            </div>
          )}

          {/* ── Unified results panel ── */}
          <div className="glass-panel">

            {/* Explanation note */}
            <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', fontSize: '0.78rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.55, marginBottom: 18 }}>
              <strong style={{ color: '#60a5fa' }}>Note:</strong> Timeline indexation uses the URL Inspection API verdict (PASS/NEUTRAL/FAIL). When inspection data is unavailable for a date, falls back to GSC performance presence. Impressions/clicks/position always come from GSC performance data.
            </div>

            {/* Tabs nav */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 16 }}>
              <TabBtn id="timeline" label="Timeline"                                          active={activeTab === 'timeline'} onClick={setActiveTab} />
              {result.url_results?.length > 0 && (
                <TabBtn id="range"   label={`Date Range (${result.url_results.length} URLs)`} active={activeTab === 'range'}   onClick={setActiveTab} />
              )}
              <TabBtn id="summary" label="Daily Trend"                                        active={activeTab === 'summary'} onClick={setActiveTab} />
              <TabBtn id="pages"   label={`All Pages (${stats.total_pages.toLocaleString()})`} active={activeTab === 'pages'}   onClick={setActiveTab} />
              <TabBtn id="verdict" label="Index Verdict"                                      active={activeTab === 'verdict'} onClick={setActiveTab} />
              {result.sitemaps?.length > 0 && (
                <TabBtn id="sitemaps" label={`Sitemaps (${result.sitemaps.length})`}           active={activeTab === 'sitemaps'} onClick={setActiveTab} />
              )}
              {smResult && (
                <TabBtn id="sitemap" label={`Sitemap Coverage (${smResult.total_urls.toLocaleString()})`} active={activeTab === 'sitemap'} onClick={setActiveTab} />
              )}
            </div>

            {/* ── Timeline tab ── */}
            {activeTab === 'timeline' && (
              <TimelineTab
                urlResults={result.url_results || []}
                dates={result.dates || []}
                dailySummary={result.daily_summary || []}
                pages={result.pages || []}
              />
            )}

            {/* ── Date Range tab ── */}
            {activeTab === 'range' && result.url_results?.length > 0 && (
            <div>
              <h3 style={{ fontSize: '1rem', marginBottom: 4 }}>Indexation Date Range</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                Click any row to expand the day-by-day breakdown.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>URL</th>
                      <th>Coverage</th>
                      <th style={{ textAlign: 'center' }}>Indexed days</th>
                      <th style={{ textAlign: 'center' }}>Not in GSC</th>
                      <th style={{ textAlign: 'center' }}>First seen</th>
                      <th style={{ textAlign: 'center' }}>Last seen</th>
                      <th style={{ width: 32 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.url_results.map((row) => {
                      const expanded = expandedUrls.has(row.url);
                      const coverageColor = row.coverage_pct >= 80 ? '#4ade80' : row.coverage_pct >= 50 ? '#f59e0b' : '#f87171';
                      return (
                        <React.Fragment key={row.url}>
                          <tr
                            onClick={() => toggleExpand(row.url)}
                            style={{ cursor: 'pointer' }}
                          >
                            <td style={{ maxWidth: 280 }}>
                              <a href={row.url} target="_blank" rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--primary)', textDecoration: 'none', fontSize: '0.8rem' }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.url}>{shortPath(row.url)}</span>
                                <ExternalLink size={10} style={{ flexShrink: 0, opacity: 0.6 }} />
                              </a>
                            </td>
                            <td style={{ minWidth: 130 }}>
                              <CoverageBar pct={row.coverage_pct} />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', fontWeight: 700, color: '#4ade80' }}>
                                <CheckCircle size={12} /> {row.indexed_days}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {row.not_indexed_days > 0
                                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', fontWeight: 700, color: '#f59e0b' }}>
                                    <AlertCircle size={12} /> {row.not_indexed_days}
                                  </span>
                                : <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>0</span>}
                            </td>
                            <td style={{ textAlign: 'center', fontSize: '0.8rem', color: row.first_seen ? '#d8d8e6' : 'var(--text-dim)', fontVariantNumeric: 'tabular-nums' }}>{row.first_seen || '—'}</td>
                            <td style={{ textAlign: 'center', fontSize: '0.8rem', color: row.last_seen ? '#d8d8e6' : 'var(--text-dim)', fontVariantNumeric: 'tabular-nums' }}>{row.last_seen || '—'}</td>
                            <td style={{ textAlign: 'center' }}>
                              {expanded
                                ? <ChevronDown size={14} color="var(--text-muted)" />
                                : <ChevronRight size={14} color="var(--text-dim)" />}
                            </td>
                          </tr>

                          {/* Expanded daily breakdown */}
                          {expanded && (
                            <tr style={{ background: 'rgba(0,0,0,0.15)' }}>
                              <td colSpan={7} style={{ padding: '0 0 0 24px' }}>
                                <div style={{ overflowX: 'auto', maxHeight: 340, overflowY: 'auto', padding: '10px 16px 10px 0' }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                    <thead>
                                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        <th style={{ textAlign: 'left', padding: '5px 12px 5px 0', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', fontSize: '0.68rem', textTransform: 'uppercase' }}>Date</th>
                                        <th style={{ textAlign: 'center', padding: '5px 12px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', fontSize: '0.68rem', textTransform: 'uppercase' }}>Status</th>
                                        <th style={{ textAlign: 'center', padding: '5px 12px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', fontSize: '0.68rem', textTransform: 'uppercase' }}>Impressions</th>
                                        <th style={{ textAlign: 'center', padding: '5px 12px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', fontSize: '0.68rem', textTransform: 'uppercase' }}>Clicks</th>
                                        <th style={{ textAlign: 'center', padding: '5px 12px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', fontSize: '0.68rem', textTransform: 'uppercase' }}>Avg. Pos</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {row.daily.map(d => (
                                        <tr key={d.date} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                          <td style={{ padding: '5px 12px 5px 0', color: '#d8d8e6', fontVariantNumeric: 'tabular-nums' }}>{d.date}</td>
                                          <td style={{ textAlign: 'center', padding: '5px 12px' }}>
                                            {d.indexed
                                              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 700, color: '#4ade80' }}><CheckCircle size={10} /> Indexed</span>
                                              : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 600, color: 'rgba(245,158,11,0.7)' }}><AlertCircle size={10} /> Not in GSC</span>}
                                          </td>
                                          <td style={{ textAlign: 'center', padding: '5px 12px', fontVariantNumeric: 'tabular-nums', color: d.impressions > 0 ? '#d8d8e6' : 'var(--text-dim)' }}>{d.indexed ? d.impressions.toLocaleString() : '—'}</td>
                                          <td style={{ textAlign: 'center', padding: '5px 12px', fontVariantNumeric: 'tabular-nums', color: d.clicks > 0 ? '#4ade80' : 'var(--text-dim)', fontWeight: d.clicks > 0 ? 700 : 400 }}>{d.indexed ? d.clicks.toLocaleString() : '—'}</td>
                                          <td style={{ textAlign: 'center', padding: '5px 12px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{d.indexed && d.position != null ? d.position : '—'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

            {/* ── Daily Trend tab ── */}
            {activeTab === 'summary' && result.daily_summary && (
              <div>
                <h3 style={{ fontSize: '1rem', marginBottom: 16 }}>Daily Trend — Pages in GSC</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th style={{ textAlign: 'center' }}>Total pages in GSC</th>
                        <th style={{ textAlign: 'center' }}>Getting clicks</th>
                        <th style={{ minWidth: 180 }}>Visibility bar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const maxPages = Math.max(...result.daily_summary.map(d => d.total_pages), 1);
                        return result.daily_summary.map(d => (
                          <tr key={d.date}>
                            <td style={{ fontVariantNumeric: 'tabular-nums', color: '#d8d8e6' }}>{d.date}</td>
                            <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--primary)' }}>{d.total_pages.toLocaleString()}</td>
                            <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: '#4ade80' }}>{d.pages_clicking.toLocaleString()}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${Math.round((d.total_pages / maxPages) * 100)}%`, background: 'var(--primary)', borderRadius: 3 }} />
                                </div>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', width: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                  {Math.round((d.total_pages / maxPages) * 100)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── All Pages tab ── */}
            {activeTab === 'pages' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: '1rem', margin: 0 }}>All Indexed Pages <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 400 }}>as of {result.end_date}</span></h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Filter size={14} color="var(--text-muted)" />
                    <input
                      className="glass-input"
                      placeholder="Filter by URL…"
                      value={filter}
                      onChange={e => setFilter(e.target.value)}
                      style={{ fontSize: '0.8rem', padding: '6px 10px', width: 220 }}
                    />
                    {filteredPages.length !== (result.pages?.length ?? 0) && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{filteredPages.length.toLocaleString()} shown</span>
                    )}
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Page URL</th>
                        <th style={{ textAlign: 'center' }}>Status</th>
                        <SortHeader col="clicks"      label="Clicks"      current={sortBy} dir={sortDir} onSort={handleSort} />
                        <SortHeader col="impressions" label="Impressions"  current={sortBy} dir={sortDir} onSort={handleSort} />
                        <SortHeader col="ctr"         label="CTR"         current={sortBy} dir={sortDir} onSort={handleSort} />
                        <SortHeader col="position"    label="Avg. Pos"    current={sortBy} dir={sortDir} onSort={handleSort} />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPages.slice(0, 300).map((p, i) => {
                        const st = pageStatus(p);
                        const ss = STATUS_STYLE[st];
                        return (
                          <tr key={i}>
                            <td style={{ maxWidth: 340 }}>
                              <a href={p.page} target="_blank" rel="noopener noreferrer"
                                style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--primary)', textDecoration: 'none', fontSize: '0.8rem' }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.page}>{shortPath(p.page)}</span>
                                <ExternalLink size={9} style={{ flexShrink: 0, opacity: 0.5 }} />
                              </a>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: ss.bg, color: ss.color }}>{ss.label}</span>
                            </td>
                            <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontWeight: (p.clicks || 0) > 0 ? 700 : 400 }}>{(p.clicks || 0).toLocaleString()}</td>
                            <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{(p.impressions || 0).toLocaleString()}</td>
                            <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{fmtCtr(p.ctr)}</td>
                            <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{fmtPos(p.position)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {filteredPages.length > 300 && (
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 12 }}>
                    Showing top 300 of {filteredPages.length.toLocaleString()} — refine the filter to see more
                  </p>
                )}
              </div>
            )}

            {/* ── Index Verdict tab — always mounted to preserve state ── */}
            <div style={{ display: activeTab === 'verdict' ? 'block' : 'none' }}>
              <IndexVerdict selectedSite={selectedSite} />
            </div>

            {/* ── Sitemaps tab ── */}
            {activeTab === 'sitemaps' && result.sitemaps?.length > 0 && (
              <div>
                <h3 style={{ fontSize: '1rem', marginBottom: 16 }}>Submitted Sitemaps</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Sitemap path</th>
                        <th style={{ textAlign: 'center' }}>Submitted</th>
                        <th style={{ textAlign: 'center' }}>Indexed</th>
                        <th style={{ textAlign: 'center' }}>Errors</th>
                        <th style={{ textAlign: 'center' }}>Warnings</th>
                        <th>Last downloaded</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.sitemaps.map((sm, i) => {
                        const hasErr = (sm.errors || 0) > 0;
                        return (
                          <tr key={i}>
                            <td style={{ maxWidth: 300 }}>
                              <a href={sm.path} target="_blank" rel="noopener noreferrer"
                                style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--primary)', textDecoration: 'none', fontSize: '0.78rem' }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sm.path}>{sm.path}</span>
                                <ExternalLink size={9} style={{ flexShrink: 0, opacity: 0.5 }} />
                              </a>
                            </td>
                            <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{sm.submitted ?? '—'}</td>
                            <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: sm.indexed != null ? '#4ade80' : 'var(--text-muted)' }}>{sm.indexed ?? '—'}</td>
                            <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: hasErr ? '#f87171' : 'var(--text-muted)' }}>{sm.errors ?? '—'}</td>
                            <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: (sm.warnings || 0) > 0 ? '#f59e0b' : 'var(--text-muted)' }}>{sm.warnings ?? '—'}</td>
                            <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{sm.last_downloaded ? new Date(sm.last_downloaded).toLocaleDateString() : '—'}</td>
                            <td>
                              <button
                                onClick={() => handleSitemapQuickCheck(sm.path)}
                                disabled={loading}
                                style={{
                                  fontSize: '0.72rem', padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
                                  background: 'rgba(226,0,113,0.08)', border: '1px solid rgba(226,0,113,0.3)',
                                  color: 'var(--primary)', whiteSpace: 'nowrap',
                                }}
                              >
                                {loading ? '…' : 'Check coverage'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Sitemap Coverage tab ── */}
            {activeTab === 'sitemap' && smResult && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: '1rem', margin: 0 }}>Sitemap Coverage — URL by URL</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {['all', 'indexed', 'missing'].map(s => (
                      <button
                        key={s}
                        onClick={() => setSitemapStatus(s)}
                        style={{
                          fontSize: '0.72rem', padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                          background: sitemapStatus === s ? (s === 'missing' ? 'rgba(245,158,11,0.2)' : 'rgba(34,197,94,0.15)') : 'rgba(255,255,255,0.05)',
                          border: sitemapStatus === s ? (s === 'missing' ? '1px solid #f59e0b' : '1px solid #4ade80') : '1px solid rgba(255,255,255,0.1)',
                          color: sitemapStatus === s ? (s === 'missing' ? '#f59e0b' : '#4ade80') : 'var(--text-muted)',
                          fontWeight: sitemapStatus === s ? 700 : 400,
                        }}
                      >
                        {s === 'all' ? `All (${smResult.total_urls.toLocaleString()})` : s === 'indexed' ? `Indexed (${smResult.indexed_count.toLocaleString()})` : `Not in GSC (${smResult.not_indexed_count.toLocaleString()})`}
                      </button>
                    ))}
                    <Filter size={14} color="var(--text-muted)" />
                    <input
                      className="glass-input"
                      placeholder="Filter by URL…"
                      value={sitemapFilter}
                      onChange={e => setSitemapFilter(e.target.value)}
                      style={{ fontSize: '0.8rem', padding: '6px 10px', width: 200 }}
                    />
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>URL</th>
                        <SortHeader col="status"      label="GSC Status"   current={smSortBy} dir={smSortDir} onSort={handleSmSort} />
                        <SortHeader col="clicks"      label="Clicks"       current={smSortBy} dir={smSortDir} onSort={handleSmSort} />
                        <SortHeader col="impressions" label="Impressions"  current={smSortBy} dir={smSortDir} onSort={handleSmSort} />
                        <SortHeader col="ctr"         label="CTR"          current={smSortBy} dir={smSortDir} onSort={handleSmSort} />
                        <SortHeader col="position"    label="Avg. Pos"     current={smSortBy} dir={smSortDir} onSort={handleSmSort} />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSitemapUrls.slice(0, 500).map((row, i) => (
                        <tr key={i}>
                          <td style={{ maxWidth: 340 }}>
                            <a href={row.url} target="_blank" rel="noopener noreferrer"
                              style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--primary)', textDecoration: 'none', fontSize: '0.8rem' }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.url}>{shortPath(row.url)}</span>
                              <ExternalLink size={9} style={{ flexShrink: 0, opacity: 0.5 }} />
                            </a>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {row.in_gsc
                              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 700, color: '#4ade80' }}><CheckCircle size={12} /> Indexed</span>
                              : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b' }}><AlertCircle size={12} /> Not in GSC</span>}
                          </td>
                          <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: row.clicks > 0 ? '#4ade80' : 'var(--text-muted)', fontWeight: row.clicks > 0 ? 700 : 400 }}>{row.clicks != null ? row.clicks.toLocaleString() : '—'}</td>
                          <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{row.impressions != null ? row.impressions.toLocaleString() : '—'}</td>
                          <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{fmtCtr(row.ctr)}</td>
                          <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{fmtPos(row.position)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredSitemapUrls.length > 500 && (
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 12 }}>
                    Showing 500 of {filteredSitemapUrls.length.toLocaleString()} — use the filter or status chips to narrow down
                  </p>
                )}
              </div>
            )}

          </div>{/* end unified panel */}
        </>
      )}
    </div>
  );
}
