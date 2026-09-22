/* ============================================================================
   Kulm Weinkarte — build step (run by the scheduled GitHub Action).
   Fetches the master list from the Google Sheet (published as CSV), transforms
   it, inlines the shared transform, and writes ../index.html (what GitHub Pages
   serves to the tablets). No dependencies — uses Node's built-in fetch.

   The list used to come from vinify.app; that partnership ended, so the master
   is now a Google Sheet the sommelier edits directly. Sheet id below; it is
   shared "Anyone with the link -> Viewer" so this CSV export is fetchable
   without auth. To move the sheet to another account later, only change SHEET_ID
   here AND in template.html (var SHEET_CSV_URL).
   ============================================================================ */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { csvToData } from './transform.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SHEET_ID = '1x5Rf-p97gt3117i-05JKqHCzhMs0BOwNvgXGnPmsMqA';
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/export?format=csv';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function countWines(data) {
  return data.categories.reduce((a, c) => a + c.groups.reduce((b, g) => b + g.wines.length, 0), 0);
}

async function main() {
  const res = await fetch(SHEET_CSV_URL, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error('sheet fetch failed: HTTP ' + res.status);
  const csv = await res.text();

  // Guard: make sure we got CSV, not an HTML error/login page (e.g. the sheet
  // is no longer shared publicly). csvToData then validates the actual content.
  if (/^\s*<(?:!doctype|html)/i.test(csv)) {
    throw new Error('Sheet returned HTML, not CSV — is it still shared "Anyone with the link -> Viewer"?');
  }

  const data = csvToData(csv);

  // Sanity gate: never publish a broken/empty list over a good one.
  const total = countWines(data);
  if (total < 100) throw new Error('Sanity check failed: only ' + total + ' wines parsed');
  if (data.categories.length < 3) throw new Error('Sanity check failed: only ' + data.categories.length + ' categories');

  // Content gate: expected English category names must be present (also catches
  // a wrong/renamed sheet or a mangled fetch before it can overwrite a good build).
  const names = data.categories.map((c) => c.name);
  if (!names.includes('Red wine') || !names.includes('Sparkling')) {
    throw new Error('Content check failed — expected categories missing, got: ' + names.join(', '));
  }

  // Inline the shared transform into the page (strip the ES-module export line).
  let transformSrc = await readFile(join(HERE, 'transform.mjs'), 'utf8');
  transformSrc = transformSrc.replace(/export\s*\{[^}]*\};?/g, '').trim();

  let tpl = await readFile(join(HERE, 'template.html'), 'utf8');
  if (tpl.indexOf('/*__DATA__*/') < 0) throw new Error('template missing /*__DATA__*/');
  if (tpl.indexOf('/*__TRANSFORM__*/') < 0) throw new Error('template missing /*__TRANSFORM__*/');
  tpl = tpl.replace('/*__DATA__*/', 'const DATA=' + JSON.stringify(data) + ';');
  tpl = tpl.replace('/*__TRANSFORM__*/', transformSrc);

  await writeFile(join(ROOT, 'index.html'), tpl);
  console.log('Built index.html — ' + total + ' wines, ' + data.categories.length + ' categories, ' + data.countries.length + ' countries.');
}

main().catch((e) => { console.error('BUILD FAILED:', e.message); process.exit(1); });
