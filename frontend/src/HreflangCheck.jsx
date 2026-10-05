import { useState, useEffect, useRef } from 'react';
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
  // Domains come from the tracking projects — the registered-domain list — not from the log
  // sites. hreflang is read from sitemaps, so requiring log credentials would have limited the
  // tool to the handful of sites that happen to ship us their access logs.
  const [projects, setProjects]       = useState([]);
  const [selectedSite, setSelectedSite] = useState('');
  const [domain, setDomain]           = useState('');
  const [sitemapUrl, setSitemapUrl]   = useState('');
  const [maxPages, setMaxPages]       = useState(1000);
  const [result, setResult]           = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [copied, setCopied]           = useState(null);
  const [phase, setPhase]             = useState('');
  const [progress, setProgress]       = useState(null);
  const stopRef                       = useRef(false);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    fetch('/api/tracking/projects', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        const list = (d.projects || []).filter(p => p.domain);
        setProjects(list);
        if (list.length) { setSelectedSite(list[0].domain); setDomain(list[0].domain); }
      })
      .catch(() => {});
  }, []);

  const pickSite = (dom) => {
    setSelectedSite(dom);
    if (dom) setDomain(dom);
    setResult(null); setError('');
  };

  // Pasting a sitemap URL is enough on its own — the domain the report is about is derivable
  // from it, so it fills in rather than being asked for twice.
  const onSitemapChange = (v) => {
    setSitemapUrl(v);
    const h = hostOf(v);
    if (h && !domain.trim()) { setDomain(h); setSelectedSite(''); }
  };

  // start -> step until drained -> result.
  //
  // One request can only ever do ~300s of work before Vercel kills it, so the crawl is driven
  // from here in short steps. Each step is bounded by wall clock on the server and persists
  // what it fetched, which means a slow site costs more steps rather than the whole result,
  // and a refresh mid-crawl loses nothing — the pages are already in Postgres.
  const api = (path, opts = {}) => {
    const token = localStorage.getItem('auth_token');
    return fetch(path, { ...opts, headers: { 'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
  };

  const run = async () => {
    if (!domain.trim()) return;
    stopRef.current = false;
    setLoading(true); setError(''); setResult(null); setProgress(null);
    setPhase('Reading the sitemap and detecting locales…');
    try {
      const sres = await api('/api/hreflang/crawl/start', {
        method: 'POST',
        body: JSON.stringify({ domain: domain.trim(), sitemap_url: sitemapUrl.trim() || null,
                               max_pages: maxPages }),
      });
      const start = await sres.json();
      if (!sres.ok) throw new Error(start.detail || 'Could not start the crawl');

      setPhase(`${(start.locales_found || []).length} locales · ${start.pages_queued} pages queued`);
      let last = null;
      // Guard the loop: a step that fetches nothing and reports nothing pending would
      // otherwise spin forever against a site that refuses every request.
      for (let i = 0; i < 400 && !stopRef.current; i++) {
        const stres = await api('/api/hreflang/crawl/step', {
          method: 'POST',
          body: JSON.stringify({ crawl_id: start.crawl_id, budget_s: 45 }),
        });
        const step = await stres.json();
        if (!stres.ok) throw new Error(step.detail || 'A crawl step failed');
        last = step;
        setProgress(step);
        setPhase(`Fetched ${step.pages_done} of ${step.pages_queued} pages` +
                 (step.pages_failed ? ` · ${step.pages_failed} failed` : ''));
        if (step.complete) break;
        if (step.fetched_this_step === 0 && step.failed_this_step === 0) break;
      }

      setPhase('Matching equivalent pages across locales…');
      const rres = await api(`/api/hreflang/crawl/${start.crawl_id}?ai_confirm=true`);
      const report = await rres.json();
      if (!rres.ok) throw new Error(report.detail || 'Could not build the report');
      // start carries the locale discovery detail the report does not repeat.
      setResult({ ...start, ...report,
                  stopped_early: !!(last && !last.complete) });
    } catch (e) {
      setError(e.message || 'Request failed.');
    } finally {
      setLoading(false); setPhase('');
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
          <label className="metric-label mb-2 block" htmlFor="hl-site">Registered domain</label>
          <select id="hl-site" className="glass-input glass-select" value={selectedSite}
            onChange={e => pickSite(e.target.value)}>
            {projects.map(p => <option key={p.id} value={p.domain}>{p.domain}</option>)}
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
            {[120, 400, 1000, 2500, 5000].map(n => <option key={n} value={n}>{n} pages</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label className="metric-label mb-2 block" htmlFor="hl-sitemap">
          Sitemap URL <span style={{ textTransform: 'none', letterSpacing: 0 }}>— optional, and the way to fix “no sitemap found”</span>
        </label>
        <input id="hl-sitemap" className="glass-input" value={sitemapUrl} style={{ width: '100%' }}
          placeholder="https://example.com/sitemap_index.xml — leave blank to read robots.txt and the usual paths"
          onChange={e => onSitemapChange(e.target.value)} />
        <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: 4 }}>
          Sitemap indexes and gzipped (.xml.gz) sitemaps are both followed.
        </div>
      </div>

      {error && (
        <div role="alert" style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, fontSize: '0.82rem',
          background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#dc2626' }}>
          {error}
        </div>
      )}

      {loading && (
        <div role="status" style={{ marginTop: 16, padding: '18px 16px', borderRadius: 10,
          background: 'rgb(var(--ink) / 0.03)', border: '1px solid rgb(var(--ink) / 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-strong)' }}>{phase || 'Working…'}</span>
            <button type="button" onClick={() => { stopRef.current = true; }} className="btn-secondary"
              style={{ fontSize: '0.76rem', padding: '5px 12px' }}>
              Stop and report on what's crawled
            </button>
          </div>
          {progress && progress.pages_queued > 0 && (
            <>
              <div style={{ height: 6, borderRadius: 4, background: 'rgb(var(--ink) / 0.08)', marginTop: 12, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 4, background: 'var(--primary)',
                  width: `${Math.min(100, Math.round((progress.pages_done + progress.pages_failed) / progress.pages_queued * 100))}%`,
                  transition: 'width 0.3s' }} />
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 6 }}>
                {progress.pages_pending} still queued · each step runs ~45s server-side, so a slow site simply takes more steps
              </div>
            </>
          )}
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

          {/* Locale editions that exist but are absent from the sitemap — a finding in itself */}
          {(result.unsitemapped_locales || []).length > 0 && (
            <div style={{ padding: '11px 14px', borderRadius: 9, fontSize: '0.79rem',
              background: 'rgba(180,83,9,0.08)', border: '1px solid rgba(180,83,9,0.28)', color: 'var(--text-strong)' }}>
              <strong>{result.unsitemapped_locales.length} locale edition{result.unsitemapped_locales.length !== 1 ? 's' : ''} missing from the sitemap.</strong>{' '}
              Found by probing, not by crawling — Google is far less likely to discover them either.
              <div style={{ marginTop: 5, color: 'var(--text-muted)', fontSize: '0.74rem' }}>
                {result.unsitemapped_locales.map(u => `/${u.segment}/ → ${u.locale} (lang="${u.html_lang}")`).join(' · ')}
              </div>
            </div>
          )}

          {result.root_locale && (
            <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
              Site root treated as <strong style={{ color: 'var(--text-strong)' }}>{result.root_locale}</strong>, from its html lang — the default language usually lives at / with no prefix.
            </div>
          )}

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
            {result.stopped_early || result.pages_pending ? 'Stopped before the queue was drained — ' : ''}
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
