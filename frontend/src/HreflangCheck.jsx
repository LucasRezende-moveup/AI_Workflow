import { useState, useEffect } from 'react';
import { Languages, Sparkles, FileText, Table, AlertTriangle, Check } from 'lucide-react';

// Hreflang checker — finds pages that exist in several locale subfolders and reports where the
// annotations linking them are missing or broken.
//
// The point of the tool is the pages that *should* be linked and are not, so the suggested tag
// block is the deliverable: it is shown per page set and exported ready to paste.

const SEVERITY = {
  high:   { color: '#dc2626', label: 'high' },
  medium: { color: '#b45309', label: 'medium' },
  low:    { color: '#64748b', label: 'low' },
  ok:     { color: '#15803d', label: 'ok' },
};

const ISSUE_LABEL = {
  missing_entirely:       'No hreflang at all',
  missing_on_page:        'Missing on this page',
  not_reciprocal:         'One-way (not reciprocal)',
  missing_alternate:      'Alternate not declared',
  missing_self_reference: 'No self-reference',
  invalid_code:           'Invalid hreflang code',
  canonical_conflict:     'Canonical conflict',
  lang_mismatch:          'html lang disagrees',
  missing_x_default:      'No x-default',
};

function hostOf(url) {
  try { return new URL(/^https?:\/\//.test(url || '') ? url : `https://${url}`).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

function tagsToHtml(tags) {
  return (tags || []).map(t => `<link rel="alternate" hreflang="${t.hreflang}" href="${t.href}" />`).join('\n');
}

export default function HreflangCheck() {
  const [sites, setSites]             = useState({});
  const [selectedSite, setSelectedSite] = useState('');
  const [domain, setDomain]           = useState('');
  const [maxPages, setMaxPages]       = useState(120);
  const [result, setResult]           = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [copied, setCopied]           = useState(null);

  useEffect(() => {
    fetch('/api/sites').then(r => r.json()).then(data => {
      setSites(data || {});
      const first = Object.keys(data || {})[0];
      if (first) { setSelectedSite(first); setDomain(hostOf(data[first]?.url)); }
    }).catch(() => {});
  }, []);

  const pickSite = (name) => {
    setSelectedSite(name);
    if (sites[name]?.url) setDomain(hostOf(sites[name].url));
    setResult(null); setError('');
  };

  const run = async () => {
    if (!domain.trim()) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch('/api/hreflang/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ domain: domain.trim(), max_pages: maxPages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Check failed');
      setResult(data);
    } catch (e) {
      setError(e.message || 'Request failed.');
    } finally {
      setLoading(false);
    }
  };

  const copy = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    }).catch(() => {});
  };

  // One row per issue — the form a dev or a ticket needs.
  const issuesCsv = () => {
    const cell = v => {
      const t = v == null ? '' : String(v);
      return /[",;\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const rows = [['Path', 'Locales', 'Severity', 'Issue', 'Affected locale', 'URL', 'Detail']];
    (result.groups || []).forEach(g => (g.issues || []).forEach(i => rows.push([
      g.path, g.locales.join(' '), i.severity, ISSUE_LABEL[i.type] || i.type,
      i.locale || '', i.url || '', i.detail,
    ])));
    (result.missing_pairs || []).forEach(p => rows.push([
      `${p.path_a} ↔ ${p.path_b}`, `${p.locale_a} ${p.locale_b}`, 'high', 'Content match, not linked',
      '', p.url_a, `${Math.round(p.confidence * 100)}% confidence (${p.method})${p.ai_why ? ' — ' + p.ai_why : ''}`,
    ]));
    return '\ufeff' + rows.map(r => r.map(cell).join(',')).join('\r\n');
  };

  // The tag blocks themselves, grouped by page set, ready to paste into each <head>.
  const tagsTxt = () => {
    const L = [
      `# hreflang tags for ${result.domain}`,
      `# Generated ${new Date(result.generated_at).toLocaleString()} from ${result.pages_fetched} pages`,
      `#`,
      `# Every page in a set must carry the WHOLE block, including the tag pointing at itself.`,
      `# Google ignores a set where the references are not reciprocal.`,
      ``,
    ];
    (result.groups || []).filter(g => g.severity !== 'ok').forEach(g => {
      L.push(`# ${'='.repeat(70)}`, `# ${g.path}  (${g.locales.join(', ')})`);
      (g.issues || []).forEach(i => L.push(`#   ${i.severity}: ${ISSUE_LABEL[i.type] || i.type} — ${i.detail}`));
      L.push(`# Put this in the <head> of every URL above:`, tagsToHtml(g.suggested_tags), ``);
    });
    (result.missing_pairs || []).forEach(p => {
      L.push(`# ${'='.repeat(70)}`,
        `# CONTENT MATCH, NOT LINKED — ${Math.round(p.confidence * 100)}% confidence (${p.method})`,
        `#   ${p.locale_a}: ${p.url_a}`, `#   ${p.locale_b}: ${p.url_b}`);
      if (p.ai_why) L.push(`#   AI: ${p.ai_why}`);
      L.push(tagsToHtml(p.suggested_tags), ``);
    });
    return L.join('\n');
  };

  const download = (kind) => {
    const isCsv = kind === 'csv';
    const blob = new Blob([isCsv ? issuesCsv() : tagsTxt()],
      { type: isCsv ? 'text/csv;charset=utf-8;' : 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hreflang-${result.domain}-${new Date().toISOString().slice(0, 10)}.${isCsv ? 'csv' : 'txt'}`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const s = result?.summary || {};
  const problemGroups = (result?.groups || []).filter(g => g.severity !== 'ok');

  return (
    <div className="glass-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="flex items-center gap-2" style={{ marginBottom: 4 }}>
            <Languages size={20} color="var(--primary)" /> Hreflang Checker
          </h2>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Crawls the locale subfolders in a site's sitemap, finds pages that are the same content in
            different languages, and reports where the hreflang linking them is missing or broken.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {result && !loading && (
            <>
              <button type="button" onClick={() => download('txt')} className="btn-secondary"
                title="The suggested tag blocks, ready to paste"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', fontSize: '0.8rem' }}>
                <FileText size={14} aria-hidden="true" /> tags.txt
              </button>
              <button type="button" onClick={() => download('csv')} className="btn-secondary"
                title="One row per issue"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', fontSize: '0.8rem' }}>
                <Table size={14} aria-hidden="true" /> .csv
              </button>
            </>
          )}
          <button type="button" onClick={run} disabled={loading || !domain.trim()} className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', fontSize: '0.84rem' }}>
            <Sparkles size={14} aria-hidden="true" style={{ animation: loading ? 'spin 1.4s linear infinite' : 'none' }} />
            {loading ? 'Crawling…' : result ? 'Re-check' : 'Check hreflang'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4" style={{ marginTop: 16 }}>
        <div>
          <label className="metric-label mb-2 block" htmlFor="hl-site">Site</label>
          <select id="hl-site" className="glass-input glass-select" value={selectedSite}
            onChange={e => pickSite(e.target.value)}>
            {Object.keys(sites).map(x => <option key={x} value={x}>{x}</option>)}
            <option value="">Custom domain…</option>
          </select>
        </div>
        <div>
          <label className="metric-label mb-2 block" htmlFor="hl-domain">Domain</label>
          <input id="hl-domain" className="glass-input" value={domain} placeholder="example.com"
            onChange={e => { setDomain(e.target.value); setSelectedSite(''); }} />
        </div>
        <div>
          <label className="metric-label mb-2 block" htmlFor="hl-max">Pages to crawl</label>
          <select id="hl-max" className="glass-input glass-select" value={maxPages}
            onChange={e => setMaxPages(Number(e.target.value))}>
            {[60, 120, 240, 400].map(n => <option key={n} value={n}>{n} pages</option>)}
          </select>
        </div>
      </div>

      {error && (
        <div role="alert" style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, fontSize: '0.82rem',
          background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#dc2626' }}>
          {error}
        </div>
      )}

      {loading && (
        <div role="status" style={{ marginTop: 16, textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
          Reading {domain}'s sitemap, then fetching up to {maxPages} pages across its locale folders…
        </div>
      )}

      {result && !loading && (
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* What was crawled */}
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', padding: '12px 16px',
            borderRadius: 10, background: 'rgb(var(--ink) / 0.03)', border: '1px solid rgb(var(--ink) / 0.08)' }}>
            {[
              ['Locales', (result.locales_found || []).length],
              ['Pages crawled', result.pages_fetched],
              ['Page sets', result.groups_total],
              ['Sets with issues', s.groups_with_issues],
              ['Unlinked matches', s.content_matches_unlinked],
            ].map(([l, v]) => (
              <span key={l} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)' }}>{l}</span>
                <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>{v ?? 0}</span>
              </span>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {(result.locales_found || []).map(l => `${l.locale} (${l.urls_in_sitemap})`).join(' · ')}
            </span>
          </div>

          {result.ai_note && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{result.ai_note}</div>
          )}

          {/* Issue tally */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.78rem' }}>
            {[
              ['missing_entirely', 'no hreflang at all'],
              ['not_reciprocal', 'one-way'],
              ['missing_alternate', 'alternate missing'],
              ['invalid_code', 'invalid codes'],
              ['canonical_conflict', 'canonical conflicts'],
              ['missing_self_reference', 'no self-reference'],
              ['lang_mismatch', 'lang mismatches'],
            ].filter(([k]) => (s[k] || 0) > 0).map(([k, label]) => (
              <span key={k} style={{ color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--text-strong)', fontSize: '0.95rem' }}>{s[k]}</strong> {label}
              </span>
            ))}
          </div>

          {/* Content matches that nothing links together — the tool's headline finding */}
          {(result.missing_pairs || []).length > 0 && (
            <div>
              <h3 style={{ fontSize: '0.88rem', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 7 }}>
                <AlertTriangle size={16} color="#dc2626" /> Same content, no hreflang between them
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.missing_pairs.map((p, i) => (
                  <div key={i} style={{ border: '1px solid rgb(var(--ink) / 0.08)', borderLeft: '3px solid #dc2626',
                    borderRadius: 8, padding: '11px 14px' }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 5 }}>
                      <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                        color: '#dc2626', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.35)',
                        padding: '2px 8px', borderRadius: 20 }}>
                        {Math.round(p.confidence * 100)}% match
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{p.method}{p.ai_same ? ' + AI confirmed' : ''}</span>
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-strong)' }}>
                      <div>[{p.locale_a}] {p.title_a || p.path_a}</div>
                      <div>[{p.locale_b}] {p.title_b || p.path_b}</div>
                    </div>
                    {(p.signals || []).length > 0 && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>{p.signals.join(' · ')}</div>
                    )}
                    {p.ai_why && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 3 }}>{p.ai_why}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Page sets with annotation problems */}
          {problemGroups.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: '#15803d', fontSize: '0.86rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Check size={17} /> Every page set found has correct, reciprocal hreflang.
            </div>
          ) : (
            <div>
              <h3 style={{ fontSize: '0.88rem', marginBottom: 8 }}>
                Page sets with issues ({problemGroups.length} of {result.groups_total})
              </h3>
              <div style={{ maxHeight: 520, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {problemGroups.map((g, i) => {
                  const sev = SEVERITY[g.severity] || SEVERITY.low;
                  const block = tagsToHtml(g.suggested_tags);
                  return (
                    <div key={i} style={{ border: '1px solid rgb(var(--ink) / 0.08)', borderLeft: `3px solid ${sev.color}`,
                      borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 7 }}>
                        <code style={{ fontSize: '0.82rem', fontWeight: 650, color: 'var(--text-strong)' }}>{g.path}</code>
                        <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                          color: sev.color, background: `${sev.color}1a`, border: `1px solid ${sev.color}55`,
                          padding: '2px 8px', borderRadius: 20 }}>{sev.label}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{g.locales.join(' · ')}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 9 }}>
                        {(g.issues || []).map((issue, j) => (
                          <div key={j} style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            <strong style={{ color: SEVERITY[issue.severity]?.color || 'var(--text-strong)' }}>
                              {ISSUE_LABEL[issue.type] || issue.type}
                            </strong>
                            {issue.locale ? ` (${issue.locale})` : ''} — {issue.detail}
                          </div>
                        ))}
                      </div>
                      <div style={{ position: 'relative' }}>
                        <pre style={{ fontSize: '0.72rem', background: 'rgb(var(--ink) / 0.04)', padding: '9px 11px',
                          borderRadius: 6, overflowX: 'auto', margin: 0, color: 'var(--text-strong)' }}>{block}</pre>
                        <button type="button" onClick={() => copy(block, i)}
                          style={{ position: 'absolute', top: 6, right: 6, fontSize: '0.68rem', padding: '3px 8px',
                            borderRadius: 5, cursor: 'pointer', background: 'var(--surface)',
                            border: '1px solid rgb(var(--ink) / 0.15)', color: 'var(--text-muted)' }}>
                          {copied === i ? 'copied' : 'copy'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
            Crawled {result.pages_fetched} of {result.sitemap_urls} sitemap URLs
            {result.urls_without_locale ? ` · ${result.urls_without_locale} URLs sit outside any locale folder` : ''}
            {result.pages_failed ? ` · ${result.pages_failed} failed to fetch` : ''}.
            Every page in a set needs the whole block, self-reference included — Google discards sets that are not reciprocal.
          </div>
        </div>
      )}
    </div>
  );
}
