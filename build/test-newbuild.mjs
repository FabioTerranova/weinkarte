/* Prove the new CSV transform reproduces the SAME DATA as the current live
   index.html. Compares every category/group/wine field. The ONLY differences
   expected are the 3 exotic-whitespace chars Google normalized in the sheet
   (U+202F ->space x2 in "Schloss Salenegg"; a TAB ->space in "Rocca Rubia"). */
import { readFileSync } from 'node:fs';
import { csvToData } from './transform.mjs';

/* ---- current live DATA out of index.html ---- */
function extractData(html) {
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

const OLD = extractData(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
const csv = readFileSync(process.argv[2], 'utf8');
const NEW = csvToData(csv);

const diffs = [];
function eq(path, a, b) { if (a !== b) diffs.push(path + ': OLD=' + JSON.stringify(a) + ' NEW=' + JSON.stringify(b)); }

/* top-level scalars & arrays */
eq('title', OLD.title, NEW.title);
eq('currency', OLD.currency, NEW.currency);
eq('priceMin', OLD.priceMin, NEW.priceMin);
eq('priceMax', OLD.priceMax, NEW.priceMax);
eq('countries', JSON.stringify(OLD.countries), JSON.stringify(NEW.countries));
eq('volumes', JSON.stringify(OLD.volumes), JSON.stringify(NEW.volumes));
eq('#categories', OLD.categories.length, NEW.categories.length);

function countWines(D){let n=0;D.categories.forEach(c=>c.groups.forEach(g=>n+=g.wines.length));return n;}
eq('#wines', countWines(OLD), countWines(NEW));

const maxC = Math.max(OLD.categories.length, NEW.categories.length);
for (let ci = 0; ci < maxC; ci++) {
  const oc = OLD.categories[ci] || { groups: [] }, nc = NEW.categories[ci] || { groups: [] };
  eq(`cat[${ci}].name`, oc.name, nc.name);
  eq(`cat[${ci}].#groups`, oc.groups.length, nc.groups.length);
  const maxG = Math.max(oc.groups.length, nc.groups.length);
  for (let gi = 0; gi < maxG; gi++) {
    const og = oc.groups[gi] || { wines: [] }, ng = nc.groups[gi] || { wines: [] };
    eq(`cat[${ci}].grp[${gi}].name`, og.name, ng.name);
    eq(`cat[${ci}].grp[${gi}].co`, og.co, ng.co);
    eq(`cat[${ci}].grp[${gi}].#wines`, og.wines.length, ng.wines.length);
    const maxW = Math.max(og.wines.length, ng.wines.length);
    for (let wi = 0; wi < maxW; wi++) {
      const ow = og.wines[wi] || {}, nw = ng.wines[wi] || {};
      ['p','n','v','vol','pr','co','re','code'].forEach(k => {
        eq(`cat[${ci}].grp[${gi}].wine[${wi}].${k}`, ow[k], nw[k]);
      });
    }
  }
}

console.log('OLD wines: ' + countWines(OLD) + ' | NEW wines: ' + countWines(NEW));
console.log('Total differences: ' + diffs.length);
diffs.forEach(d => console.log('  ' + d));
if (diffs.length === 0) console.log('✅ NEW transform output is IDENTICAL to the current live DATA.');
