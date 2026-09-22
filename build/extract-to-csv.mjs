/* ============================================================================
   One-off: recover the full wine list OUT of the already-built index.html
   (the baked `const DATA={...}` blob) into a flat CSV — our Vinify-independent
   safety net and the seed for the new spreadsheet master.
   Run: node build/extract-to-csv.mjs
   Output: build/weinkarte-master.csv
   ============================================================================ */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');

/* find `const DATA=` and walk balanced braces to grab the object literal */
const start = html.indexOf('const DATA=');
if (start < 0) throw new Error('const DATA= not found');
const braceStart = html.indexOf('{', start);
let depth = 0, i = braceStart, inStr = false, strCh = '', esc = false;
for (; i < html.length; i++) {
  const c = html[i];
  if (inStr) {
    if (esc) { esc = false; }
    else if (c === '\\') { esc = true; }
    else if (c === strCh) { inStr = false; }
  } else {
    if (c === '"' || c === "'") { inStr = true; strCh = c; }
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
  }
}
const literal = html.slice(braceStart, i);
// It's a JS object literal (unquoted keys) — eval it safely in Node.
const DATA = new Function('return (' + literal + ')')();

/* flatten categories -> groups -> wines into rows, preserving order */
const rows = [];
DATA.categories.forEach(cat => {
  (cat.groups || []).forEach(g => {
    (g.wines || []).forEach(w => {
      rows.push({
        Category: cat.name || '',
        Country: w.co || g.co || '',
        Region: w.re || g.name || '',
        Producer: w.p || '',
        Wine: w.n || '',
        Vintage: w.v || '',
        Volume: w.vol || '',
        Price: (w.pr === null || w.pr === undefined) ? '' : w.pr,
        ArtCode: w.code || ''
      });
    });
  });
});

const cols = ['Category', 'Country', 'Region', 'Producer', 'Wine', 'Vintage', 'Volume', 'Price', 'ArtCode'];
const esc2 = v => {
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const csv = [cols.join(',')].concat(rows.map(r => cols.map(c => esc2(r[c])).join(','))).join('\r\n');
writeFileSync(join(here, 'weinkarte-master.csv'), '﻿' + csv, 'utf8'); // BOM so Excel opens UTF-8 cleanly

console.log('Extracted ' + rows.length + ' wines across ' + DATA.categories.length + ' categories.');
console.log('Categories: ' + DATA.categories.map(c => c.name + ' (' + c.groups.reduce((n, g) => n + g.wines.length, 0) + ')').join(', '));
