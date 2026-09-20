// Crawl audit — turns a Screaming Frog export into a prioritised list of things to fix.
//
// Runs over the WHOLE crawl in the browser. The server only ever receives the findings, so a
// 200,000-URL export is audited in full rather than from the 500-row sample that fits in a
// request body.
//
// Priorities mean something specific here, so the list can be worked top-down:
//   P0  Google cannot index the page, or indexes the wrong one. Traffic is being lost now.
//   P1  The page is indexable but competes badly — duplicate or missing signals, thin content,
//       buried in the architecture.
//   P2  Real but marginal. Worth doing when P0 and P1 are clear.
//
// Every rule reports how many URLs it hit, a sample to check, why it matters and what to
// change. A rule whose column is missing from the export is skipped rather than reported as
// zero, because "0 broken pages" and "we could not tell" are different statements.

const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2 };

// Screaming Frog column names vary by version and by export tab; each entry lists the aliases
// seen in the wild, first match wins.
const COLS = {
  address:      ['Address', 'URL', 'url', 'address'],
  status:       ['Status Code', 'Status code', 'status_code', 'Status'],
  contentType:  ['Content Type', 'content_type'],
  indexability: ['Indexability'],
  indexStatus:  ['Indexability Status'],
  title:        ['Title 1', 'Title', 'title_1'],
  titleLen:     ['Title 1 Length', 'Title Length'],
  desc:         ['Meta Description 1', 'Meta Description', 'meta_description_1'],
  descLen:      ['Meta Description 1 Length', 'Meta Description Length'],
  h1:           ['H1-1', 'H1 1', 'h1_1', 'H1'],
  h2:           ['H2-1', 'H2 1'],
  metaRobots:   ['Meta Robots 1', 'Meta Robots'],
  canonical:    ['Canonical Link Element 1', 'Canonical Link Element', 'Canonical'],
  wordCount:    ['Word Count', 'word_count'],
  textRatio:    ['Text Ratio'],
  size:         ['Size (bytes)', 'Size'],
  responseTime: ['Response Time', 'response_time'],
  depth:        ['Crawl Depth', 'Depth'],
  inlinks:      ['Inlinks', 'Unique Inlinks'],
  uniqueInlinks:['Unique Inlinks'],
  outlinks:     ['Outlinks'],
  redirectUrl:  ['Redirect URL', 'Redirect Url'],
  redirectType: ['Redirect Type'],
  hreflang:     ['Hreflang 1', 'hreflang_1'],
  readability:  ['Flesch Reading Ease Score', 'Readability'],
};

const blank = (v) => v === null || v === undefined || String(v).trim() === '';
const num = (v) => { const n = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : null; };
const isHtml = (ct) => !ct || /html/i.test(String(ct));

function buildAccessor(columns) {
  const index = {};
  for (const [key, aliases] of Object.entries(COLS)) {
    const found = aliases.find((a) => columns.includes(a));
    index[key] = found ? columns.indexOf(found) : -1;
  }
  return {
    has: (key) => index[key] >= 0,
    get: (row, key) => (index[key] >= 0 ? row[index[key]] : undefined),
  };
}

/**
 * @param {{columns: string[], rows: any[][]}} crawl
 * @returns {{issues: object[], stats: object, skipped: string[]}}
 */
export function auditCrawl({ columns, rows }) {
  const A = buildAccessor(columns);
  const issues = [];
  const skipped = [];

  // Consider only HTML pages for content rules; assets drown the signal otherwise.
  const pages = rows.filter((r) => isHtml(A.get(r, 'contentType')));
  const total = rows.length;
  const htmlTotal = pages.length || 1;

  const add = (issue) => { if (issue.count > 0) issues.push(issue); };
  const sample = (matched, n = 8) =>
    matched.slice(0, n).map((r) => String(A.get(r, 'address') ?? '')).filter(Boolean);

  const rule = ({ id, title, priority, category, need, test, scope, why, fix, note }) => {
    const missing = (need || []).filter((k) => !A.has(k));
    if (missing.length) {
      skipped.push(`${title} — needs the ${missing.map((m) => COLS[m][0]).join(', ')} column`);
      return;
    }
    const base = scope === 'all' ? rows : pages;
    const matched = base.filter(test);
    add({
      id, title, priority, category,
      count: matched.length,
      pct: Math.round((matched.length / (scope === 'all' ? total || 1 : htmlTotal)) * 1000) / 10,
      why, fix, note: note || null,
      samples: sample(matched),
    });
  };

  // ── P0 — not indexed, or the wrong page is ────────────────────────────────
  rule({
    id: 'server-errors', title: 'Server errors (5xx)', priority: 'P0', category: 'Availability',
    need: ['status'], scope: 'all',
    test: (r) => { const s = num(A.get(r, 'status')); return s >= 500 && s < 600; },
    why: 'Google drops URLs that repeatedly return 5xx, and a sustained rate slows crawling of the whole site.',
    fix: 'Check server logs for these paths, fix the underlying error, then request validation in Search Console.',
  });

  rule({
    id: 'broken-pages', title: 'Broken pages (4xx)', priority: 'P0', category: 'Availability',
    need: ['status'], scope: 'all',
    test: (r) => { const s = num(A.get(r, 'status')); return s >= 400 && s < 500; },
    why: 'These were found by following internal links, so the site is spending crawl budget on dead URLs and passing users to them.',
    fix: 'Fix or remove the internal links pointing here. Redirect the URL if it had traffic or backlinks; otherwise let it 410.',
  });

  rule({
    id: 'noindex-pages', title: 'Pages set to noindex', priority: 'P0', category: 'Indexability',
    need: ['indexStatus'],
    test: (r) => /noindex/i.test(String(A.get(r, 'indexStatus') ?? '')),
    why: 'A noindex page cannot rank at all. On a template-wide mistake this silently removes whole sections from search.',
    fix: 'Confirm each one is deliberate. Remove the noindex from anything that should rank.',
  });

  rule({
    id: 'robots-blocked', title: 'Blocked by robots.txt', priority: 'P0', category: 'Indexability',
    need: ['indexStatus'],
    test: (r) => /robots\.txt/i.test(String(A.get(r, 'indexStatus') ?? '')),
    why: 'Google cannot read these pages, so it cannot see their content or follow their links — and a blocked page can still be indexed URL-only, with no snippet.',
    fix: 'Narrow the Disallow rules so genuine content is crawlable. Use noindex, not robots.txt, to keep pages out of the index.',
  });

  rule({
    id: 'canonicalised-away', title: 'Canonicalised to another URL', priority: 'P0', category: 'Indexability',
    need: ['indexStatus'],
    test: (r) => /canonicalis|canonicaliz/i.test(String(A.get(r, 'indexStatus') ?? '')),
    why: 'These pages tell Google to rank a different URL instead. Correct for duplicates, but a template bug here hands away pages that should rank on their own.',
    fix: 'Check the canonical target is genuinely the same content. Self-reference anything that is unique.',
  });

  rule({
    id: 'redirect-chains', title: 'Redirects found in the crawl (3xx)', priority: 'P0', category: 'Architecture',
    need: ['status'], scope: 'all',
    test: (r) => { const s = num(A.get(r, 'status')); return s >= 300 && s < 400; },
    why: 'Every internal link to a redirect wastes crawl budget and dilutes the signal passed through. Chains of two or more compound it.',
    fix: 'Repoint internal links and sitemap entries at the final destination so the redirect is only ever hit by external traffic.',
  });

  rule({
    id: 'missing-title', title: 'Missing page title', priority: 'P0', category: 'Content',
    need: ['title'],
    test: (r) => blank(A.get(r, 'title')) && num(A.get(r, 'status')) === 200,
    why: 'The title is the single strongest on-page signal and the headline in the result. Without one Google invents text from the page.',
    fix: 'Add a unique title describing the page, with the primary term near the front.',
  });

  // ── P1 — indexable but competing badly ───────────────────────────────────
  const dupes = (key, label, priority, why, fix, id) => {
    if (!A.has(key)) {
      skipped.push(`${label} — needs the ${COLS[key][0]} column`);
      return;
    }
    const seen = new Map();
    for (const r of pages) {
      const v = String(A.get(r, key) ?? '').trim().toLowerCase();
      if (!v) continue;
      if (num(A.get(r, 'status')) !== 200) continue;
      if (!seen.has(v)) seen.set(v, []);
      seen.get(v).push(r);
    }
    const groups = [...seen.entries()].filter(([, rs]) => rs.length > 1)
      .sort((a, b) => b[1].length - a[1].length);
    const affected = groups.reduce((n, [, rs]) => n + rs.length, 0);
    if (!affected) return;
    issues.push({
      id, title: label, priority, category: 'Content',
      count: affected,
      pct: Math.round((affected / htmlTotal) * 1000) / 10,
      why, fix,
      note: `${groups.length} distinct values are shared by more than one page. Worst: "${groups[0][0].slice(0, 70)}" on ${groups[0][1].length} pages.`,
      samples: groups.slice(0, 3).flatMap(([, rs]) => rs.slice(0, 3)
        .map((r) => String(A.get(r, 'address') ?? ''))).filter(Boolean).slice(0, 8),
    });
  };

  dupes('title', 'Duplicate page titles', 'P1',
    'Pages sharing a title compete with each other and give Google no reason to prefer one. It is the most common cause of the wrong page ranking.',
    'Make each title unique and specific. Where pages really are duplicates, canonicalise instead of rewriting.',
    'duplicate-titles');

  dupes('desc', 'Duplicate meta descriptions', 'P1',
    'Duplicate descriptions get ignored and rewritten by Google, costing control of the snippet and click-through.',
    'Write a distinct description per page, or generate one from page-specific fields.',
    'duplicate-descriptions');

  dupes('h1', 'Duplicate H1s', 'P1',
    'A repeated H1 usually means templated headings that describe the template rather than the page.',
    'Make the H1 reflect the specific page, matching the intent the title promises.',
    'duplicate-h1');

  rule({
    id: 'missing-desc', title: 'Missing meta description', priority: 'P1', category: 'Content',
    need: ['desc'],
    test: (r) => blank(A.get(r, 'desc')) && num(A.get(r, 'status')) === 200,
    why: 'Google writes its own snippet when none exists, which is rarely the pitch you would choose.',
    fix: 'Add a 120–155 character description that states the benefit and earns the click.',
  });

  rule({
    id: 'missing-h1', title: 'Missing H1', priority: 'P1', category: 'Content',
    need: ['h1'],
    test: (r) => blank(A.get(r, 'h1')) && num(A.get(r, 'status')) === 200,
    why: 'The H1 confirms what the page is about and anchors its structure for both readers and crawlers.',
    fix: 'Add exactly one H1 per page, aligned with the title.',
  });

  rule({
    id: 'thin-content', title: 'Thin content', priority: 'P1', category: 'Content',
    need: ['wordCount'],
    test: (r) => { const w = num(A.get(r, 'wordCount')); return w !== null && w < 250 && num(A.get(r, 'status')) === 200; },
    why: 'Pages with little unique text rarely satisfy a query, and in volume they drag down how the whole site is assessed.',
    fix: 'Expand, consolidate into a stronger page, or noindex where the page exists for users rather than search.',
  });

  rule({
    id: 'orphan-ish', title: 'Pages with almost no internal links', priority: 'P1', category: 'Architecture',
    need: ['uniqueInlinks'],
    test: (r) => { const i = num(A.get(r, 'uniqueInlinks')); return i !== null && i <= 1 && num(A.get(r, 'status')) === 200; },
    why: 'Internal links are how importance is distributed. A page with one link in is being told it barely matters.',
    fix: 'Link to these from relevant hub pages and related content, not just from a sitemap.',
  });

  rule({
    id: 'deep-pages', title: 'Pages buried four or more clicks deep', priority: 'P1', category: 'Architecture',
    need: ['depth'],
    test: (r) => { const d = num(A.get(r, 'depth')); return d !== null && d >= 4 && num(A.get(r, 'status')) === 200; },
    why: 'Crawl depth tracks perceived importance. Pages this far from the home page are crawled less often and rank worse.',
    fix: 'Flatten the path with category hubs and contextual links so important pages sit within three clicks.',
  });

  rule({
    id: 'slow-pages', title: 'Slow server response', priority: 'P1', category: 'Performance',
    need: ['responseTime'],
    test: (r) => { const t = num(A.get(r, 'responseTime')); return t !== null && t > 1; },
    why: 'Response time caps how much of the site Google can crawl per visit, and it is the part of page speed the server fully controls.',
    fix: 'Profile these paths — usually uncached queries or slow upstream calls — and put the common ones behind a cache.',
  });

  rule({
    id: 'missing-canonical', title: 'No canonical tag', priority: 'P1', category: 'Indexability',
    need: ['canonical'],
    test: (r) => blank(A.get(r, 'canonical')) && num(A.get(r, 'status')) === 200,
    why: 'Without a self-referencing canonical, parameter and variant URLs can be indexed in place of the real page.',
    fix: 'Emit a self-referencing canonical on every indexable page.',
  });

  // ── P2 — worth doing once the above is clear ─────────────────────────────
  rule({
    id: 'title-length', title: 'Title too long or too short', priority: 'P2', category: 'Content',
    need: ['title'],
    test: (r) => {
      const t = String(A.get(r, 'title') ?? '').trim();
      if (!t || num(A.get(r, 'status')) !== 200) return false;
      const len = A.has('titleLen') ? (num(A.get(r, 'titleLen')) ?? t.length) : t.length;
      return len > 60 || len < 30;
    },
    why: 'Over roughly 60 characters the title is truncated in results; under 30 it usually leaves relevance unclaimed.',
    fix: 'Aim for 50–60 characters with the distinguishing term first.',
  });

  rule({
    id: 'desc-length', title: 'Meta description length outside the useful range', priority: 'P2', category: 'Content',
    need: ['desc'],
    test: (r) => {
      const d = String(A.get(r, 'desc') ?? '').trim();
      if (!d || num(A.get(r, 'status')) !== 200) return false;
      const len = A.has('descLen') ? (num(A.get(r, 'descLen')) ?? d.length) : d.length;
      return len > 160 || len < 70;
    },
    why: 'Long descriptions get cut mid-sentence; very short ones waste the space available to sell the click.',
    fix: 'Target 120–155 characters and finish the sentence.',
  });

  rule({
    id: 'url-hygiene', title: 'URLs with parameters, uppercase or underscores', priority: 'P2', category: 'Architecture',
    need: ['address'], scope: 'all',
    test: (r) => {
      const u = String(A.get(r, 'address') ?? '');
      return /[?&]/.test(u) || /[A-Z]/.test(u.replace(/^https?:\/\/[^/]+/i, '')) || /_/.test(u);
    },
    why: 'Parameter and case variants create duplicate URLs for the same content and split the signals between them.',
    fix: 'Prefer lowercase hyphenated paths, and canonicalise parameter variants to the clean URL.',
  });

  rule({
    id: 'large-pages', title: 'Unusually heavy pages', priority: 'P2', category: 'Performance',
    need: ['size'],
    test: (r) => { const s = num(A.get(r, 'size')); return s !== null && s > 2_000_000; },
    why: 'Heavy HTML slows rendering and, past a point, risks the page being truncated before the content is parsed.',
    fix: 'Trim inlined payloads and move large blocks of data out of the HTML.',
  });

  rule({
    id: 'low-text-ratio', title: 'Very low text-to-code ratio', priority: 'P2', category: 'Content',
    need: ['textRatio'],
    test: (r) => { const t = num(A.get(r, 'textRatio')); return t !== null && t < 5 && num(A.get(r, 'status')) === 200; },
    why: 'Almost no text relative to markup usually means the content is rendered client-side or the page is mostly chrome.',
    fix: 'Check the page renders its main content server-side; if it does, it likely needs more substance.',
  });

  issues.sort((a, b) =>
    (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]) || (b.count - a.count));

  // ── headline numbers ──────────────────────────────────────────────────────
  const statusBuckets = {};
  if (A.has('status')) {
    for (const r of rows) {
      const s = num(A.get(r, 'status'));
      const k = s === null ? 'unknown' : `${Math.floor(s / 100)}xx`;
      statusBuckets[k] = (statusBuckets[k] || 0) + 1;
    }
  }
  let indexable = null;
  if (A.has('indexability')) {
    indexable = pages.filter((r) => /^indexable$/i.test(String(A.get(r, 'indexability') ?? '').trim())).length;
  }
  const wordCounts = A.has('wordCount')
    ? pages.map((r) => num(A.get(r, 'wordCount'))).filter((n) => n !== null) : [];

  const stats = {
    total_urls: total,
    html_pages: pages.length,
    status_buckets: statusBuckets,
    indexable,
    indexable_pct: indexable === null ? null : Math.round((indexable / htmlTotal) * 1000) / 10,
    median_word_count: wordCounts.length
      ? wordCounts.sort((a, b) => a - b)[Math.floor(wordCounts.length / 2)] : null,
    counts: { P0: 0, P1: 0, P2: 0 },
    urls_affected: { P0: 0, P1: 0, P2: 0 },
  };
  for (const i of issues) {
    stats.counts[i.priority] += 1;
    stats.urls_affected[i.priority] += i.count;
  }

  return { issues, stats, skipped, columns_detected: columns.length };
}
