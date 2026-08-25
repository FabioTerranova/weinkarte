/* ============================================================================
   Kulm Weinkarte — build step (run by the scheduled GitHub Action).
   Fetches the live vinify list, transforms it, inlines the shared transform,
   and writes ../index.html (what GitHub Pages serves to the tablets).
   No dependencies — uses Node's built-in fetch (Node 18+).
   ============================================================================ */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { vinifyToData, extractNextData } from './transform.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const VINIFY_URL = 'https://vinify.app/pdf-wine-list/570277';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function countWines(data) {
  return data.categories.reduce((a, c) => a + c.groups.reduce((b, g) => b + g.wines.length, 0), 0);
}

async function main() {
  const res = await fetch(VINIFY_URL, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error('vinify fetch failed: HTTP ' + res.status);
  const html = await res.text();

  const data = vinifyToData(extractNextData(html));

  // Sanity gate: never publish a broken/empty list over a good one.
  const total = countWines(data);
  if (total < 100) throw new Error('Sanity check failed: only ' + total + ' wines parsed');
  if (data.categories.length < 3) throw new Error('Sanity check failed: only ' + data.categories.length + ' categories');

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
