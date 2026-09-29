import { useState } from 'react';
import { AlertOctagon, AlertTriangle, Info, ChevronDown, ChevronUp, FileText, Table, Check, MessageSquare, Eye } from 'lucide-react';

// The prioritised half of the crawl audit. Counts and priorities come from the rule engine in
// sfAudit.js; this renders them so the list can be worked top-down, and exports them in the two
// shapes people actually use — a brief to send, and a spreadsheet to assign.

const BANDS = {
  P0: {
    label: 'P0 — losing traffic now',
    blurb: 'Google cannot index the page, or is indexing the wrong one. Fix these before anything else.',
    color: '#dc2626', Icon: AlertOctagon,
  },
  P1: {
    label: 'P1 — competing badly',
    blurb: 'Indexable, but the signals are duplicated, missing or buried. This is where most ranking is won back.',
    color: '#b45309', Icon: AlertTriangle,
  },
  P2: {
    label: 'P2 — polish',
    blurb: 'Real but marginal. Worth doing once P0 and P1 are clear.',
    color: '#64748b', Icon: Info,
  },
};

function IssueCard({ issue, color }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: '1px solid rgb(var(--ink) / 0.08)', borderLeft: `3px solid ${color}`,
      borderRadius: 8, background: 'rgb(var(--ink) / 0.02)' }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' }}>
        <span style={{ minWidth: 74, textAlign: 'right', fontWeight: 800, fontSize: '1rem',
          color, fontVariantNumeric: 'tabular-nums' }}>
          {issue.count.toLocaleString()}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 620, fontSize: '0.89rem', color: 'var(--text-strong)' }}>{issue.title}</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginLeft: 8 }}>
            {issue.pct}% of pages · {issue.category}
          </span>
        </span>
        {open ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
      </button>
      {open && (
        <div style={{ padding: '0 14px 13px 100px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.82rem' }}>
          <div style={{ color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text-strong)' }}>Why it matters: </strong>{issue.why}
          </div>
          <div style={{ color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text-strong)' }}>Fix: </strong>{issue.fix}
          </div>
          {issue.note && (
            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{issue.note}</div>
          )}
          {issue.samples?.length > 0 && (
            <div>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em',
                color: 'var(--text-dim)', marginBottom: 4 }}>Examples to check</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {issue.samples.map((u) => (
                  <a key={u} href={u} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: '0.75rem', color: 'var(--primary)', textDecoration: 'none',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u}</a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CrawlAuditReport({ audit, narrative, domain, filename }) {
  const [copied, setCopied] = useState(false);
  const [showSlack, setShowSlack] = useState(false);
  if (!audit) return null;
  const { issues, stats, skipped } = audit;

  const markdown = () => {
    const L = [
      `# Crawl audit — ${domain || filename || 'site'}`,
      ``,
      `${stats.total_urls.toLocaleString()} URLs crawled · ${stats.html_pages.toLocaleString()} HTML pages` +
      (stats.indexable_pct !== null ? ` · ${stats.indexable_pct}% indexable` : '') +
      (stats.median_word_count !== null ? ` · median ${stats.median_word_count} words` : ''),
      ``,
      `| Priority | Issues | URLs affected |`,
      `|---|---|---|`,
      ...['P0', 'P1', 'P2'].map((p) => `| ${p} | ${stats.counts[p]} | ${stats.urls_affected[p].toLocaleString()} |`),
      ``,
    ];
    if (narrative?.available) {
      if (narrative.headline) L.push(`> ${narrative.headline}`, ``);
      if (narrative.summary) L.push(narrative.summary, ``);
      if (narrative.sequence?.length) {
        L.push(`## Suggested order of work`, ``);
        narrative.sequence.forEach((s, i) => {
          L.push(`${i + 1}. **${s.step}**`);
          if (s.covers) L.push(`   - Covers: ${s.covers}`);
          if (s.why_now) L.push(`   - Why now: ${s.why_now}`);
        });
        L.push(``);
      }
      if (narrative.watch_out) L.push(`**Watch out:** ${narrative.watch_out}`, ``);
    }
    for (const band of ['P0', 'P1', 'P2']) {
      const list = issues.filter((i) => i.priority === band);
      if (!list.length) continue;
      L.push(`## ${BANDS[band].label}`, ``, `_${BANDS[band].blurb}_`, ``);
      for (const i of list) {
        L.push(`### ${i.title} — ${i.count.toLocaleString()} URLs (${i.pct}%)`, ``,
          `**Why it matters:** ${i.why}`, ``, `**Fix:** ${i.fix}`, ``);
        if (i.note) L.push(`${i.note}`, ``);
        if (i.samples?.length) L.push(`Examples:`, ...i.samples.map((u) => `- ${u}`), ``);
      }
    }
    if (skipped?.length) {
      L.push(`## Not checked`, ``,
        `These need columns the export did not include — re-export with Internal: All to cover them.`, ``,
        ...skipped.map((s) => `- ${s}`), ``);
    }
    return L.join('\n');
  };

  const csv = () => {
    const cell = (v) => {
      const t = v == null ? '' : String(v);
      return /[",;\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const rows = [['Priority', 'Issue', 'Category', 'URLs affected', '% of pages',
                   'Why it matters', 'Fix', 'Detail', 'Example URLs']];
    for (const i of issues) {
      rows.push([i.priority, i.title, i.category, i.count, i.pct, i.why, i.fix,
                 i.note || '', (i.samples || []).join(' | ')]);
    }
    return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
  };

  // Slack's mrkdwn is not Markdown: bold is *single* asterisks, there are no headings and no
  // tables, and bullets have to be literal characters. A pasted # heading or **bold** shows up
  // as punctuation, so the report is rebuilt rather than reformatted.
  //
  // It is also a digest, not the whole thing. The Markdown export runs to ~12 KB; Slack
  // collapses a message that long behind "show more", which buries the P0 list — the one part
  // someone reading it in a channel needs to see.
  const slackText = ({ perBand = 6 } = {}) => {
    const n = (v) => Number(v || 0).toLocaleString();
    const EMOJI = { P0: ':red_circle:', P1: ':large_orange_circle:', P2: ':white_circle:' };
    const L = [];

    L.push(`*Crawl audit — ${domain || filename || 'site'}*`);
    L.push([`${n(stats.total_urls)} URLs`,
            `${n(stats.html_pages)} HTML`,
            stats.indexable_pct !== null ? `${stats.indexable_pct}% indexable` : null,
            stats.median_word_count !== null ? `median ${stats.median_word_count} words` : null,
           ].filter(Boolean).join(' · '));

    if (narrative?.available && narrative.headline) L.push('', `_${narrative.headline}_`);

    for (const band of ['P0', 'P1', 'P2']) {
      const list = issues.filter((i) => i.priority === band);
      if (!list.length) continue;
      L.push('', `${EMOJI[band]} *${BANDS[band].label}* — ${list.length} issue${list.length !== 1 ? 's' : ''}, ${n(stats.urls_affected[band])} URLs`);
      for (const i of list.slice(0, perBand)) {
        L.push(`• ${i.title} — *${n(i.count)}* (${i.pct}%)`);
      }
      if (list.length > perBand) L.push(`• _+${list.length - perBand} more_`);
    }

    if (narrative?.available && narrative.sequence?.length) {
      L.push('', '*Do first*');
      narrative.sequence.forEach((st, i) => {
        L.push(`${i + 1}. ${st.step}${st.why_now ? ` — _${st.why_now}_` : ''}`);
      });
    }
    if (narrative?.available && narrative.watch_out) {
      L.push('', `:warning: ${narrative.watch_out}`);
    }
    if (skipped?.length) {
      L.push('', `_${skipped.length} check${skipped.length !== 1 ? 's' : ''} could not run — the export is missing columns they need._`);
    }
    return L.join('\n');
  };

  const copySlack = async () => {
    const text = slackText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard can be blocked by permissions policy — show the text so it can be
      // selected by hand rather than silently doing nothing.
      setShowSlack(true);
    }
  };

  const download = (kind) => {
    const isCsv = kind === 'csv';
    const blob = new Blob([isCsv ? csv() : markdown()],
      { type: isCsv ? 'text/csv;charset=utf-8;' : 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crawl-audit-${(domain || 'site').replace(/[^a-z0-9.-]/gi, '_')}-${new Date().toISOString().slice(0, 10)}.${isCsv ? 'csv' : 'md'}`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Prioritised action plan</h3>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 3 }}>
            {issues.length} issue types across {stats.total_urls.toLocaleString()} crawled URLs — every rule ran over the whole crawl, not a sample.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => download('md')} className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', fontSize: '0.8rem' }}>
            <FileText size={14} aria-hidden="true" /> report.md
          </button>
          <button type="button" onClick={() => download('csv')} className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', fontSize: '0.8rem' }}>
            <Table size={14} aria-hidden="true" /> .csv
          </button>
          <button type="button" onClick={copySlack} className="btn-secondary"
            title="Copy a condensed digest formatted for Slack"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', fontSize: '0.8rem',
              ...(copied ? { color: '#15803d', borderColor: '#15803d' } : {}) }}>
            {copied ? <Check size={14} aria-hidden="true" /> : <MessageSquare size={14} aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy for Slack'}
          </button>
          <button type="button" onClick={() => setShowSlack((v) => !v)} className="btn-secondary"
            title="Preview exactly what will be pasted" aria-expanded={showSlack}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', fontSize: '0.8rem' }}>
            <Eye size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      {showSlack && (() => {
        const text = slackText();
        return (
          <div style={{ border: '1px solid rgb(var(--ink) / 0.1)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              padding: '8px 12px', background: 'rgb(var(--ink) / 0.04)', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              <span>Slack preview — {text.length.toLocaleString()} characters{text.length > 3000 ? ' (Slack will collapse this behind “show more”)' : ''}</span>
              <button type="button" onClick={copySlack}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)',
                  fontWeight: 600, fontSize: '0.74rem' }}>
                {copied ? 'copied' : 'copy'}
              </button>
            </div>
            <pre style={{ margin: 0, padding: '12px', fontSize: '0.74rem', lineHeight: 1.55,
              whiteSpace: 'pre-wrap', maxHeight: 320, overflowY: 'auto', color: 'var(--text-strong)',
              userSelect: 'all' }}>{text}</pre>
          </div>
        );
      })()}

      {/* Headline counts */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {['P0', 'P1', 'P2'].map((p) => (
          <div key={p} style={{ flex: '1 1 180px', padding: '12px 14px', borderRadius: 10,
            background: `${BANDS[p].color}0f`, border: `1px solid ${BANDS[p].color}44` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: BANDS[p].color, fontVariantNumeric: 'tabular-nums' }}>
                {stats.counts[p]}
              </span>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-strong)' }}>{p}</span>
            </div>
            <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {stats.urls_affected[p].toLocaleString()} URLs affected
            </div>
          </div>
        ))}
        <div style={{ flex: '1 1 180px', padding: '12px 14px', borderRadius: 10,
          background: 'rgb(var(--ink) / 0.03)', border: '1px solid rgb(var(--ink) / 0.09)' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>
            {stats.indexable_pct === null ? '—' : `${stats.indexable_pct}%`}
          </div>
          <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', marginTop: 2 }}>
            indexable{stats.median_word_count !== null ? ` · median ${stats.median_word_count} words` : ''}
          </div>
        </div>
      </div>

      {/* The brief, when the model was reachable */}
      {narrative?.available && (
        <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(226,0,113,0.05)',
          border: '1px solid rgba(226,0,113,0.2)' }}>
          {narrative.headline && (
            <div style={{ fontWeight: 650, fontSize: '0.92rem', color: 'var(--text-strong)', marginBottom: 6 }}>
              {narrative.headline}
            </div>
          )}
          {narrative.summary && (
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>{narrative.summary}</p>
          )}
          {narrative.sequence?.length > 0 && (
            <ol style={{ margin: '10px 0 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {narrative.sequence.map((s, i) => (
                <li key={i} style={{ fontSize: '0.82rem', color: 'var(--text-strong)' }}>
                  {s.step}
                  {(s.covers || s.why_now) && (
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {s.covers && <>Covers: {s.covers}. </>}{s.why_now}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
          {narrative.watch_out && (
            <div style={{ marginTop: 10, fontSize: '0.79rem', color: '#b45309' }}>
              <strong>Watch out:</strong> {narrative.watch_out}
            </div>
          )}
        </div>
      )}

      {/* The bands */}
      {['P0', 'P1', 'P2'].map((band) => {
        const list = issues.filter((i) => i.priority === band);
        const { label, blurb, color, Icon } = BANDS[band];
        return (
          <div key={band}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <Icon size={16} color={color} aria-hidden="true" />
              <h4 style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-strong)' }}>{label}</h4>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>{list.length} issue{list.length !== 1 ? 's' : ''}</span>
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: 8 }}>{blurb}</div>
            {list.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.8rem',
                color: '#15803d', padding: '8px 0' }}>
                <Check size={15} /> Nothing found at this level.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {list.map((i) => <IssueCard key={i.id} issue={i} color={color} />)}
              </div>
            )}
          </div>
        );
      })}

      {skipped?.length > 0 && (
        <div style={{ fontSize: '0.73rem', color: 'var(--text-dim)', lineHeight: 1.5,
          borderTop: '1px solid rgb(var(--ink) / 0.07)', paddingTop: 10 }}>
          <strong>{skipped.length} check{skipped.length !== 1 ? 's' : ''} could not run</strong> — the export is missing the
          columns they need, and reporting them as zero would be misleading. Re-export with <em>Internal: All</em> to cover them:
          <div style={{ marginTop: 4 }}>{skipped.join(' · ')}</div>
        </div>
      )}
    </div>
  );
}
