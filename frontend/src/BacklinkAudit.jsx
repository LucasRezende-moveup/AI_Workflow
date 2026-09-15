import { useState, useEffect } from 'react';
import { Link as LinkIcon, Sparkles, FileText, Table } from 'lucide-react';

// Backlink audit — which links point here, and is any of them worth disavowing.
//
// Split out of the log analyser: backlinks have nothing to do with server logs, and tying the
// audit to the log-site list meant only sites with log credentials could be audited. This owns
// its own domain field, prefilled from the configured sites but editable, so any domain can be
// checked — including a competitor's.
export default function BacklinkAudit() {
  const [sites, setSites]             = useState({});
  const [selectedSite, setSelectedSite] = useState('');
  const [domain, setDomain]           = useState('');
  const [audit, setAudit]             = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError]   = useState('');
  const [auditLimit, setAuditLimit]   = useState(200);

  useEffect(() => {
    fetch('/api/sites')
      .then(r => r.json())
      .then(data => {
        setSites(data || {});
        const first = Object.keys(data || {})[0];
        if (first) { setSelectedSite(first); setDomain(hostOf(data[first]?.url)); }
      })
      .catch(() => {});
  }, []);

  // Picking a configured site prefills the domain; typing over it is allowed, and the picker
  // falls back to "custom" so the two never silently disagree.
  const pickSite = (name) => {
    setSelectedSite(name);
    if (sites[name]?.url) setDomain(hostOf(sites[name].url));
    setAudit(null); setAuditError('');
  };

  // ── Backlink audit / disavow candidates ─────────────────────────────────────
  // The domain comes from the selected log site's own host — these log endpoints live on the
  // sites themselves, so no separate domain picker is needed.
  const runBacklinkAudit = async () => {
    if (!domain.trim()) return;
    setAuditLoading(true); setAuditError(''); setAudit(null);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch('/api/backlinks/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ domain: domain.trim(), limit: auditLimit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Audit failed');
      setAudit(data);
    } catch (e) {
      setAuditError(e.message || 'Request failed.');
    } finally {
      setAuditLoading(false);
    }
  };

  // Google's disavow format: one `domain:` line each, comments with #. Only the domains the
  // review actually called for disavow go in — a file built from raw spam scores would
  // disavow this site's own fan blogs.
  const disavowTxt = () => {
    if (!audit) return '';
    const picked = (audit.candidates || []).filter(c => c.call === 'disavow');
    const L = [
      `# Disavow candidates for ${audit.domain}`,
      `# Generated ${new Date(audit.generated_at).toLocaleString()} from ${audit.analysed_links} scored links`,
      `# of ${(audit.total_referring || 0).toLocaleString()} referring domains.`,
      `#`,
      `# REVIEW EVERY LINE BEFORE UPLOADING. Disavowing a legitimate link destroys real link`,
      `# equity and is slow to undo. Google advises most sites never to file this at all.`,
      `#`,
    ];
    if (!picked.length) {
      L.push(`# Nothing here was judged manipulative — no domains to disavow.`);
      return L.join('\n');
    }
    picked.forEach(c => {
      L.push(``, `# risk ${c.risk}/100 · spam ${c.spam_score} · rank ${c.domain_rank} — ${c.why || (c.reasons || [])[0] || ''}`);
      L.push(`domain:${c.domain_from}`);
    });
    return L.join('\n');
  };

  const auditCsv = () => {
    if (!audit) return '';
    const cell = v => {
      const t = v == null ? '' : String(v);
      return /[",;\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const rows = [['Domain', 'Call', 'Risk', 'Spam score', 'Domain rank', 'Dofollow', 'Anchor',
                   'Why (review)', 'Measured reasons', 'Example linking page']];
    (audit.candidates || []).forEach(c => rows.push([
      c.domain_from, c.call, c.risk, c.spam_score, c.domain_rank,
      c.dofollow ? 'yes' : 'no', c.anchor || '', c.why || '',
      (c.reasons || []).join('; '), c.url_from || '',
    ]));
    return '\ufeff' + rows.map(r => r.map(cell).join(',')).join('\r\n');
  };

  const downloadAudit = (kind) => {
    const isTxt = kind === 'txt';
    const blob = new Blob([isTxt ? disavowTxt() : auditCsv()],
      { type: isTxt ? 'text/plain;charset=utf-8' : 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = isTxt
      ? `disavow-${audit.domain}-${new Date().toISOString().slice(0, 10)}.txt`
      : `backlink-audit-${audit.domain}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="glass-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="flex items-center gap-2" style={{ marginBottom: 4 }}>
            <LinkIcon size={20} color="var(--primary)" /> Backlinks &amp; Disavow
          </h2>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Scores the links pointing at a domain and flags any that look manipulative.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {audit && !auditLoading && (
            <>
              <button type="button" onClick={() => downloadAudit('txt')} className="btn-secondary"
                title="Google disavow file — only the domains judged manipulative"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', fontSize: '0.8rem' }}>
                <FileText size={14} aria-hidden="true" /> disavow.txt
              </button>
              <button type="button" onClick={() => downloadAudit('csv')} className="btn-secondary"
                title="Every flagged domain with its evidence"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', fontSize: '0.8rem' }}>
                <Table size={14} aria-hidden="true" /> .csv
              </button>
            </>
          )}
          <button type="button" onClick={runBacklinkAudit} disabled={auditLoading || !domain.trim()} className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', fontSize: '0.84rem' }}>
            <Sparkles size={14} aria-hidden="true" style={{ animation: auditLoading ? 'spin 1.4s linear infinite' : 'none' }} />
            {auditLoading ? 'Auditing…' : audit ? 'Re-audit' : 'Analyse backlinks'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4" style={{ marginTop: 16 }}>
        <div>
          <label className="metric-label mb-2 block" htmlFor="bl-site">Site</label>
          <select id="bl-site" className="glass-input glass-select" value={selectedSite}
            onChange={e => pickSite(e.target.value)}>
            {Object.keys(sites).map(s => <option key={s} value={s}>{s}</option>)}
            <option value="">Custom domain…</option>
          </select>
        </div>
        <div>
          <label className="metric-label mb-2 block" htmlFor="bl-domain">Domain</label>
          <input id="bl-domain" className="glass-input" value={domain} placeholder="example.com"
            onChange={e => { setDomain(e.target.value); setSelectedSite(''); }} />
        </div>
        <div>
          <label className="metric-label mb-2 block" htmlFor="bl-limit">Referring domains to score</label>
          <select id="bl-limit" className="glass-input glass-select" value={auditLimit}
            onChange={e => setAuditLimit(Number(e.target.value))}>
            {[100, 200, 500, 1000].map(n => <option key={n} value={n}>{n} domains</option>)}
          </select>
        </div>
      </div>

        {auditError && (
          <div role="alert" style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, fontSize: '0.82rem',
            background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#dc2626' }}>
            {auditError}
          </div>
        )}

        {auditLoading && (
          <div role="status" style={{ marginTop: 16, textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
            Pulling referring domains for {domain} and reviewing the flagged ones…
          </div>
        )}

        {audit && !auditLoading && (() => {
          const VERDICT = {
            clean:         { label: 'Profile looks clean', color: '#15803d' },
            monitor:       { label: 'Worth monitoring',    color: '#b45309' },
            action_needed: { label: 'Action needed',       color: '#dc2626' },
          }[audit.verdict] || { label: audit.verdict || 'Reviewed', color: 'var(--text-muted)' };
          const CALL = {
            disavow: { label: 'disavow', color: '#dc2626' },
            review:  { label: 'review',  color: '#b45309' },
            keep:    { label: 'keep',    color: '#15803d' },
          };
          return (
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center', padding: '12px 16px', borderRadius: 10,
                background: 'rgb(var(--ink) / 0.03)', border: '1px solid rgb(var(--ink) / 0.08)' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: VERDICT.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {VERDICT.label}
                </span>
                {[
                  ['Referring domains', (audit.profile.referring_domains || 0).toLocaleString()],
                  ['Backlinks', (audit.profile.backlinks || 0).toLocaleString()],
                  ['Profile spam score', `${audit.profile.spam_score ?? '—'}/100`],
                  ['Domain rank', audit.profile.rank ?? '—'],
                  ['Scored', `${audit.analysed_links} worst`],
                ].map(([l, v]) => (
                  <span key={l} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)' }}>{l}</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                  </span>
                ))}
                <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-dim)' }}>${audit.cost} spent</span>
              </div>

              {audit.summary && (
                <p style={{ fontSize: '0.88rem', color: 'var(--text-strong)', lineHeight: 1.6, maxWidth: '76ch' }}>{audit.summary}</p>
              )}

              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.8rem' }}>
                {['disavow', 'review', 'keep'].map(k => (
                  <span key={k} style={{ color: 'var(--text-muted)' }}>
                    <strong style={{ color: CALL[k].color, fontSize: '1rem' }}>{audit.tally?.[k] ?? 0}</strong> {CALL[k].label}
                  </span>
                ))}
              </div>

              {audit.parse_failed && audit.raw && (
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{audit.raw}</pre>
              )}

              {(audit.candidates || []).length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Nothing flagged — none of the {audit.analysed_links} worst-scoring links crossed the risk threshold.
                </div>
              ) : (
                <div style={{ maxHeight: 460, overflowY: 'auto', border: '1px solid rgb(var(--ink) / 0.08)', borderRadius: 8 }}>
                  {(audit.candidates || []).map((c, i) => {
                    const call = CALL[c.call] || CALL.review;
                    return (
                      <div key={i} style={{ padding: '11px 14px', borderBottom: '1px solid rgb(var(--ink) / 0.05)',
                        borderLeft: `3px solid ${call.color}`, background: c.call === 'disavow' ? 'rgba(220,38,38,0.04)' : 'transparent' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em',
                            color: call.color, background: `${call.color}1a`, border: `1px solid ${call.color}55`, padding: '2px 8px', borderRadius: 20 }}>
                            {call.label}
                          </span>
                          <a href={c.url_from} target="_blank" rel="noopener noreferrer"
                            style={{ fontWeight: 650, fontSize: '0.86rem', color: 'var(--text-strong)', textDecoration: 'none' }}>
                            {c.domain_from}
                          </a>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontVariantNumeric: 'tabular-nums' }}>
                            risk {c.risk} · spam {c.spam_score} · rank {c.domain_rank} · {c.dofollow ? 'dofollow' : 'nofollow'}
                          </span>
                        </div>
                        {c.why && <div style={{ fontSize: '0.8rem', color: 'var(--text-strong)', marginBottom: 3 }}>{c.why}</div>}
                        {(c.reasons || []).length > 0 && (
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{(c.reasons || []).join(' · ')}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                Risk scores are computed from measured link attributes; the keep/review/disavow call is AI judgement on top.
                <strong style={{ color: '#b45309' }}> Review every line before uploading a disavow file</strong> — disavowing a real link destroys its equity and is slow to undo.
              </div>
            </div>
          );
        })()}
      </div>

  );
}

function hostOf(url) {
  try { return new URL(/^https?:\/\//.test(url || '') ? url : `https://${url}`).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}
