import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Globe, CheckCircle, AlertCircle, ArrowUpDown, ExternalLink, Filter, Map, ChevronDown, ChevronRight, ToggleLeft, ToggleRight, ShieldAlert, RefreshCw, Link2 } from 'lucide-react';

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
        <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', margin: 0 }}>
          Each cell is one day — hover for details. Top row shows site-wide totals.{urlResults?.length > 0 && ' Click a URL to expand day-by-day stats.'}
        </p>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Gradient strip — indexed */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ display: 'flex', gap: 1 }}>
              {[0.18, 0.35, 0.52, 0.7, 1.0].map((op, i) => (
                <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: `rgba(74,222,128,${op})` }} />
              ))}
            </div>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Indexed (low → high traffic)</span>
          </div>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', color: 'var(--text-muted)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.05)', display: 'inline-block' }} />
            Not in GSC
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', color: 'var(--text-muted)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(226,0,113,0.55)', display: 'inline-block' }} />
            Site-wide
          </span>
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

                  {/* ── Expanded site page list ── */}
                  {siteExpanded && pages.length > 0 && (
                    <tr style={{ background: 'rgba(0,0,0,0.18)' }}>
                      <td colSpan={dates.length + 2} style={{ padding: '0 0 0 20px' }}>
                        <div style={{ padding: '14px 20px 14px 0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(226,0,113,0.9)' }}>
                              All indexed pages
                            </span>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{pages.length.toLocaleString()} total</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                              <Filter size={12} color="var(--text-muted)" />
                              <input
                                className="glass-input"
                                placeholder="Filter by URL…"
                                value={siteFilter}
                                onChange={e => setSiteFilter(e.target.value)}
                                onClick={e => e.stopPropagation()}
                                style={{ fontSize: '0.75rem', padding: '4px 8px', width: 200 }}
                              />
                              {siteFilter && (
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                  {filteredPages.length.toLocaleString()} shown
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ overflowX: 'auto', maxHeight: 380, overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                                  {['Page URL', 'Clicks', 'Impressions', 'CTR', 'Avg. Pos'].map(h => (
                                    <th key={h} style={{ padding: '5px 12px 5px 0', textAlign: h === 'Page URL' ? 'left' : 'center', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {filteredPages.slice(0, 200).map((p, i) => (
                                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <td style={{ padding: '5px 12px 5px 0', maxWidth: 360 }}>
                                      <a href={p.page} target="_blank" rel="noopener noreferrer"
                                        onClick={e => e.stopPropagation()}
                                        style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--primary)', textDecoration: 'none', fontSize: '0.73rem' }}>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.page}>{shortPath(p.page)}</span>
                                        <ExternalLink size={9} style={{ flexShrink: 0, opacity: 0.4 }} />
                                      </a>
                                    </td>
                                    <td style={{ textAlign: 'center', padding: '5px 12px', fontVariantNumeric: 'tabular-nums', color: (p.clicks || 0) > 0 ? '#4ade80' : 'var(--text-dim)', fontWeight: (p.clicks || 0) > 0 ? 700 : 400 }}>{(p.clicks || 0).toLocaleString()}</td>
                                    <td style={{ textAlign: 'center', padding: '5px 12px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{(p.impressions || 0).toLocaleString()}</td>
                                    <td style={{ textAlign: 'center', padding: '5px 12px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{p.impressions > 0 ? `${((p.clicks || 0) / p.impressions * 100).toFixed(1)}%` : '—'}</td>
                                    <td style={{ textAlign: 'center', padding: '5px 12px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{p.position != null ? Number(p.position).toFixed(1) : '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {filteredPages.length > 200 && (
                            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 10 }}>
                              Showing 200 of {filteredPages.length.toLocaleString()} — use the filter to narrow down
                            </p>
                          )}
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
            {(urlResults || []).map(row => {
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
                      const indexed = d?.indexed;
                      const intensity = indexed
                        ? Math.max(0.18, 0.18 + ((d.impressions || 0) / maxImpressions) * 0.82)
                        : 0;
                      const isFirst = monthStarts.has(date);

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
                              background: indexed ? `rgba(74,222,128,${intensity.toFixed(2)})` : 'rgba(255,255,255,0.05)',
                              border: `1px solid ${indexed ? `rgba(74,222,128,${Math.min(0.42, intensity * 0.5).toFixed(2)})` : 'rgba(255,255,255,0.04)'}`,
                              transition: 'box-shadow 0.1s, transform 0.1s',
                            }}
                            onMouseOver={e => {
                              e.currentTarget.style.boxShadow = indexed ? '0 0 0 2px rgba(74,222,128,0.5)' : '0 0 0 2px rgba(255,255,255,0.18)';
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
                                  {['Date', 'Status', 'Impressions', 'Clicks', 'CTR', 'Avg. Pos'].map(h => (
                                    <th key={h} style={{ padding: '5px 12px 5px 0', textAlign: h === 'Date' ? 'left' : 'center', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {row.daily.map(d => (
                                  <tr key={d.date} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <td style={{ padding: '5px 12px 5px 0', color: '#d8d8e6', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{d.date}</td>
                                    <td style={{ textAlign: 'center', padding: '5px 12px' }}>
                                      {d.indexed
                                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', fontWeight: 700, color: '#4ade80' }}><CheckCircle size={10} /> Indexed</span>
                                        : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', fontWeight: 600, color: 'rgba(245,158,11,0.75)' }}><AlertCircle size={10} /> Not in GSC</span>}
                                    </td>
                                    <td style={{ textAlign: 'center', padding: '5px 12px', fontVariantNumeric: 'tabular-nums', color: d.indexed ? '#d8d8e6' : 'var(--text-dim)' }}>{d.indexed ? (d.impressions || 0).toLocaleString() : '—'}</td>
                                    <td style={{ textAlign: 'center', padding: '5px 12px', fontVariantNumeric: 'tabular-nums', color: (d.clicks || 0) > 0 ? '#4ade80' : 'var(--text-dim)', fontWeight: (d.clicks || 0) > 0 ? 700 : 400 }}>{d.indexed ? (d.clicks || 0).toLocaleString() : '—'}</td>
                                    <td style={{ textAlign: 'center', padding: '5px 12px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{d.indexed && d.impressions > 0 ? `${((d.clicks || 0) / d.impressions * 100).toFixed(1)}%` : '—'}</td>
                                    <td style={{ textAlign: 'center', padding: '5px 12px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{d.indexed && d.position != null ? d.position : '—'}</td>
                                  </tr>
                                ))}
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
          ) : tip.d?.indexed ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#4ade80', fontWeight: 600, marginBottom: 7, fontSize: '0.71rem' }}>
                <CheckCircle size={11} /> Indexed
              </div>
              {[
                ['Impressions', (tip.d.impressions || 0).toLocaleString(), '#fff'],
                ['Clicks', (tip.d.clicks || 0).toLocaleString(), (tip.d.clicks || 0) > 0 ? '#4ade80' : '#fff'],
                ...(tip.d.position != null ? [['Avg. position', String(tip.d.position), 'rgba(255,255,255,0.65)']] : []),
              ].map(([lbl, val, col]) => (
                <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', gap: 18, fontSize: '0.7rem', marginBottom: 2 }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>{lbl}</span>
                  <span style={{ color: col, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{val}</span>
                </div>
              ))}
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#f59e0b', fontWeight: 600, fontSize: '0.71rem' }}>
              <AlertCircle size={11} /> Not in GSC
            </div>
          )}

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

export default function IndexationControl() {
  const [sites, setSites]                   = useState([]);
  const [siteSearch, setSiteSearch]         = useState('');
  const [selectedSite, setSelectedSite]     = useState('');
  const [searchType, setSearchType]         = useState('web');
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
          search_type: searchType,
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
          <div>
            <label className="metric-label mb-2 block">Search type</label>
            <select
              className="glass-input"
              value={searchType}
              onChange={e => setSearchType(e.target.value)}
              style={{ fontSize: '0.82rem' }}
            >
              {['web', 'image', 'video', 'news', 'discover', 'googleNews'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
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

        {/* URLs textarea */}
        <label className="metric-label mb-2 block">URLs to check (optional — one per line)</label>
        <textarea
          className="glass-input mb-4"
          rows={4}
          placeholder={"https://example.com/page1\nhttps://example.com/page2\nLeave empty to see daily totals for the site"}
          value={urlsText}
          onChange={e => setUrlsText(e.target.value)}
          style={{ resize: 'vertical', fontSize: '0.82rem' }}
        />

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
              <strong style={{ color: '#60a5fa' }}>Note:</strong> "Indexed" = appeared in GSC (≥1 impression). "Index Verdict" = Google's actual index verdict from the URL Inspection API (separate from GSC impression data).
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
