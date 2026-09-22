/* Deep-compare the DATA blobs baked into two index.html files. */
import { readFileSync } from 'node:fs';
function extractData(p) {
  const html = readFileSync(p, 'utf8');
  const s = html.indexOf('const DATA=');
  const b = html.indexOf('{', s);
  let d = 0, i = b, q = false, e = false, ch = '';
  for (; i < html.length; i++) {
    const c = html[i];
    if (q) { if (e) e = false; else if (c === '\\') e = true; else if (c === ch) q = false; }
    else { if (c === '"' || c === "'") { q = true; ch = c; } else if (c === '{') d++; else if (c === '}') { d--; if (d === 0) { i++; break; } } }
  }
  return new Function('return (' + html.slice(b, i) + ')')();
}
const A = extractData(process.argv[2]), B = extractData(process.argv[3]);
const diffs = [];
function eq(p, a, b) { if (a !== b) diffs.push(p + ': A=' + JSON.stringify(a) + ' B=' + JSON.stringify(b)); }
eq('title', A.title, B.title); eq('currency', A.currency, B.currency);
eq('priceMin', A.priceMin, B.priceMin); eq('priceMax', A.priceMax, B.priceMax);
eq('countries', JSON.stringify(A.countries), JSON.stringify(B.countries));
eq('volumes', JSON.stringify(A.volumes), JSON.stringify(B.volumes));
eq('#cats', A.categories.length, B.categories.length);
const mc = Math.max(A.categories.length, B.categories.length);
for (let ci = 0; ci < mc; ci++) {
  const ac = A.categories[ci] || { groups: [] }, bc = B.categories[ci] || { groups: [] };
  eq(`cat[${ci}].name`, ac.name, bc.name); eq(`cat[${ci}].#grp`, ac.groups.length, bc.groups.length);
  const mg = Math.max(ac.groups.length, bc.groups.length);
  for (let gi = 0; gi < mg; gi++) {
    const ag = ac.groups[gi] || { wines: [] }, bg = bc.groups[gi] || { wines: [] };
    eq(`cat[${ci}].grp[${gi}].name`, ag.name, bg.name); eq(`cat[${ci}].grp[${gi}].co`, ag.co, bg.co);
    eq(`cat[${ci}].grp[${gi}].#w`, ag.wines.length, bg.wines.length);
    const mw = Math.max(ag.wines.length, bg.wines.length);
    for (let wi = 0; wi < mw; wi++) {
      const aw = ag.wines[wi] || {}, bw = bg.wines[wi] || {};
      ['p','n','v','vol','pr','co','re','code'].forEach(k => eq(`cat[${ci}].grp[${gi}].w[${wi}].${k}`, aw[k], bw[k]));
    }
  }
}
console.log('Total differences: ' + diffs.length);
diffs.forEach(d => console.log('  ' + d));
