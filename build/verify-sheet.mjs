/* Verify the Google-Sheet content against the canonical CSV, cell by cell.
   Reads the downloaded tool-result JSON (base64 CSV in .content), decodes it,
   parses both CSVs, and reports any differences. */
import { readFileSync } from 'node:fs';

const RESULT = 'C:\\Users\\fabio.terranova\\.claude\\projects\\C--dev-Weinkarte\\95dda13e-b033-423e-9c4d-53064d78501c\\tool-results\\mcp-claude_ai_Google_Drive-download_file_content-1790069382963.txt';
const CANON = new URL('./weinkarte-master.csv', import.meta.url);

const dl = JSON.parse(readFileSync(RESULT, 'utf8'));
const sheetCsv = Buffer.from(dl.content, 'base64').toString('utf8');
let canonCsv = readFileSync(CANON, 'utf8');
if (canonCsv.charCodeAt(0) === 0xFEFF) canonCsv = canonCsv.slice(1); // strip BOM

/* minimal RFC-4180 CSV parser -> array of rows (array of fields) */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', i = 0, inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

const A = parseCsv(canonCsv);   // canonical
const B = parseCsv(sheetCsv);   // from Google Sheet

console.log('Canonical rows (incl header): ' + A.length);
console.log('Sheet rows     (incl header): ' + B.length);

const norm = s => (s == null ? '' : String(s)).normalize('NFC').trim();
let diffs = 0;
const max = Math.max(A.length, B.length);
for (let r = 0; r < max; r++) {
  const a = A[r] || [], b = B[r] || [];
  const cols = Math.max(a.length, b.length);
  for (let c = 0; c < cols; c++) {
    if (norm(a[c]) !== norm(b[c])) {
      diffs++;
      if (diffs <= 40) {
        console.log(`DIFF row ${r + 1} col ${c + 1}: canon=[${JSON.stringify(a[c])}] sheet=[${JSON.stringify(b[c])}]`);
      }
    }
  }
}
console.log(diffs === 0
  ? '✅ IDENTICAL — every cell matches (after NFC + trim).'
  : `❌ ${diffs} differing cell(s).`);

/* spot-print the most expensive tail rows for a human eyeball too */
const tail = B.filter(r => ['21500', '20000', '19500', '19000', '12375'].includes((r[7] || '').trim()));
console.log('\nHigh-value rows in sheet:');
tail.forEach(r => console.log('  ' + r.slice(3).join(' | ')));
