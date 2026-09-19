// Parse a Screaming Frog crawl in the browser.
//
// Why here and not on the server: a Vercel function rejects any request body over 4.5 MB, and
// a database-mode .dbseospider crawl is routinely hundreds of megabytes — the upload was
// refused at the edge before our code ever ran, which the UI reported as "Network Error".
//
// The server only ever needed four counts and the first 500 rows out of that file, so the
// browser opens it, extracts exactly that, and posts a few kilobytes instead.

import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { unzipSync } from 'fflate';
import Papa from 'papaparse';

let sqlPromise = null;
const getSql = () => (sqlPromise ??= initSqlJs({ locateFile: () => wasmUrl }));

// Screaming Frog's own table names first, then anything that looks like crawl data.
const PRIORITY_TABLES = ['internal_all', 'internal_html', 'crawled_urls', 'internal_links'];
const ADDRESS_KEYS = ['address', 'url', 'uri'];

// Mirrors the server's normalisation so a client-parsed crawl and an uploaded CSV produce
// identically shaped reports.
const RENAME = {
  address: 'Address', url: 'Address', uri: 'Address',
  status_code: 'Status Code', status: 'Status Code',
  title_1: 'Title 1', title: 'Title 1', page_title: 'Title 1',
  meta_description_1: 'Meta Description 1', meta_description: 'Meta Description 1',
  h1_1: 'H1-1', h1: 'H1-1', content: 'Content Type', content_type: 'Content Type',
};

const normaliseKey = (c) => RENAME[String(c).toLowerCase().replace(/[ -]/g, '_')] || c;

function pickTable(db) {
  const res = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  const tables = res.length ? res[0].values.map((r) => r[0]) : [];
  if (!tables.length) return { table: null, tables };

  for (const name of PRIORITY_TABLES) {
    if (tables.includes(name)) return { table: name, tables };
  }
  // Otherwise the biggest table that has something URL-shaped in it.
  let best = null, bestRows = -1;
  for (const t of tables) {
    try {
      const cols = db.exec(`PRAGMA table_info("${t}")`);
      const names = cols.length ? cols[0].values.map((r) => String(r[1]).toLowerCase()) : [];
      if (!names.some((n) => ADDRESS_KEYS.includes(n))) continue;
      const cnt = db.exec(`SELECT COUNT(*) FROM "${t}"`);
      const rows = cnt.length ? Number(cnt[0].values[0][0]) : 0;
      if (rows > bestRows) { bestRows = rows; best = t; }
    } catch { /* unreadable table — skip */ }
  }
  return { table: best, tables };
}

/** Counts computed over the WHOLE crawl, not just the sample the server sees. */
function summarise(columns, rows) {
  const find = (...names) => columns.find((c) => names.includes(c)) ?? null;
  const addrCol = find('Address', 'URL');
  const statusCol = find('Status Code', 'Status');
  const titleCol = find('Title 1', 'Title');
  const descCol = find('Meta Description 1', 'Meta Description');

  const idx = (c) => (c ? columns.indexOf(c) : -1);
  const si = idx(statusCol), ti = idx(titleCol), di = idx(descCol);
  const blank = (v) => v === null || v === undefined || String(v).trim() === '';

  let status200 = 0, missingTitles = 0, missingDesc = 0;
  for (const r of rows) {
    if (si >= 0 && Number(r[si]) === 200) status200++;
    if (ti >= 0 && blank(r[ti])) missingTitles++;
    if (di >= 0 && blank(r[di])) missingDesc++;
  }
  return {
    metrics: { total_urls: rows.length, status_200: status200,
               missing_titles: missingTitles, missing_desc: missingDesc },
    cols_used: [addrCol, statusCol, titleCol, descCol],
  };
}

const toRecords = (columns, rows, limit) =>
  rows.slice(0, limit).map((r) => {
    const o = {};
    columns.forEach((c, i) => {
      const v = r[i];
      // JSON has no NaN. Letting one through is what crashed the server-side path.
      o[c] = (typeof v === 'number' && !Number.isFinite(v)) ? null
           : (v instanceof Uint8Array) ? '[binary]' : v;
    });
    return o;
  });

async function fromSqlite(bytes) {
  const SQL = await getSql();
  let db;
  try {
    db = new SQL.Database(bytes);
  } catch {
    throw new Error('That file is not a readable SQLite database — it may be encrypted or a different Screaming Frog format.');
  }
  const { table, tables } = pickTable(db);
  if (!table) {
    db.close();
    throw new Error(`No crawl table found in the file. Tables present: ${tables.join(', ') || 'none'}.`);
  }
  const out = db.exec(`SELECT * FROM "${table}"`);
  db.close();
  if (!out.length) throw new Error(`Table "${table}" is empty.`);

  const columns = out[0].columns.map(normaliseKey);
  const rows = out[0].values;
  return { columns, rows, table };
}

function fromZip(bytes) {
  const files = unzipSync(bytes);
  const names = Object.keys(files);
  const dbName = names.find((n) => n.endsWith('crawl.db')) || names.find((n) => n.endsWith('.db'));
  if (!dbName) throw new Error(`No SQLite database inside the archive. Contents: ${names.slice(0, 8).join(', ')}`);
  return files[dbName];
}

function fromCsv(text) {
  const parsed = Papa.parse(text.trim(), { skipEmptyLines: true });
  if (!parsed.data.length) throw new Error('The CSV is empty.');
  // Screaming Frog CSV exports sometimes carry a title line before the header row.
  let header = parsed.data[0];
  let start = 1;
  if (header.length < 2 && parsed.data.length > 1) { header = parsed.data[1]; start = 2; }
  return { columns: header.map(normaliseKey), rows: parsed.data.slice(start), table: 'csv' };
}

/**
 * Parse any supported crawl file entirely client-side.
 * Returns the payload /api/sf/analyze-parsed expects.
 */
export async function parseCrawlFile(file, { sampleRows = 500 } = {}) {
  const name = (file.name || '').toLowerCase();
  let parsed;

  if (name.endsWith('.dbseospider')) {
    parsed = await fromSqlite(new Uint8Array(await file.arrayBuffer()));
  } else if (name.endsWith('.seospider')) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Memory-mode saves are a zip around the same SQLite database; database-mode ones are
    // already raw SQLite even with this extension, so fall through rather than fail.
    parsed = await fromSqlite(bytes[0] === 0x50 && bytes[1] === 0x4b ? fromZip(bytes) : bytes);
  } else if (name.endsWith('.csv')) {
    parsed = fromCsv(await file.text());
  } else {
    throw new Error('Upload a .dbseospider, .seospider or .csv crawl export.');
  }

  const { columns, rows, table } = parsed;
  const { metrics, cols_used } = summarise(columns, rows);
  return {
    filename: file.name,
    metrics,
    columns,
    cols_used,
    data: toRecords(columns, rows, sampleRows),
    table,
  };
}
