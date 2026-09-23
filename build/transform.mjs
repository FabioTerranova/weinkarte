/* ============================================================================
   Kulm Weinkarte — canonical data transform: Google-Sheet CSV -> DATA
   ----------------------------------------------------------------------------
   ONE source of truth, used in TWO places:
     1) build.mjs (Node) — the scheduled GitHub Action rebuilds index.html.
     2) Inlined into the page — the "Aktualisieren" button re-parses the sheet.
   Written in ES5 style (var / function, no arrow / ?? / optional chaining) so
   the inlined browser copy runs on older iPad Safari too.

   The master list now lives in a Google Sheet published as CSV (the vinify
   partnership ended). Columns (header row, matched by NAME):
     Category, Country, Region, Producer, Wine, Vintage, Volume, Price, ArtCode

   SAFETY: csvToData throws on structurally-bad input (unknown category, or a
   non-numeric value in a numeric column — the classic "shifted column" mistake).
   Both callers abort on a throw, so a mangled sheet can NEVER overwrite the last
   good published list; the tablets simply keep showing the previous version.
   ============================================================================ */

/* the 7 category names the book knows (raw values as stored in the sheet).
   An unknown category = a typo or a column shift -> refuse to publish. */
var KNOWN_CATEGORIES = ['Sparkling', 'White wine', 'Rose', 'Red wine', 'Sweet wine', 'Cider', 'Alcohol free'];

function _clean(s) {
  return (s === null || s === undefined) ? '' : String(s).trim();
}

/* strip Swiss thousands separators / stray spaces so "1'500" parses as 1500 */
function _stripNum(s) {
  return _clean(s).replace(/['’  \s]/g, '');
}
function _num(s) {
  s = _stripNum(s);
  if (s === '') return 0;
  var v = Number(s);
  return isNaN(v) ? 0 : v;
}
/* true if the raw cell is a clean number after separator-stripping */
function _isNum(s) {
  s = _stripNum(s);
  return s !== '' && !isNaN(Number(s));
}

/* Minimal RFC-4180 CSV parser -> array of rows (each row an array of fields).
   Handles quoted fields, "" escapes, and CR/LF line endings. */
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip BOM
  var rows = [], row = [], field = '', i = 0, inQ = false;
  var n = text.length;
  while (i < n) {
    var c = text.charAt(i);
    if (inQ) {
      if (c === '"') {
        if (text.charAt(i + 1) === '"') { field += '"'; i += 2; continue; }
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
  // drop fully-empty rows (e.g. a trailing newline)
  var out = [];
  for (var r = 0; r < rows.length; r++) {
    var rr = rows[r];
    var empty = true;
    for (var k = 0; k < rr.length; k++) { if (_clean(rr[k]) !== '') { empty = false; break; } }
    if (!empty) out.push(rr);
  }
  return out;
}

/* full sheet CSV text -> the DATA structure the page renders from.
   Categories, groups (country+region), and wines keep their row order.
   Throws on structurally-invalid input (see SAFETY note above). */
function csvToData(csvText) {
  var rows = parseCsv(csvText);
  if (!rows.length) throw new Error('empty CSV');

  // Find the header row by NAME (it may not be row 0 — an "Anleitung" block can
  // sit above it). The header is the first row that contains all 9 columns.
  var required = ['category', 'country', 'region', 'producer', 'wine', 'vintage', 'volume', 'price', 'artcode'];
  var hdr = -1;
  for (var hr = 0; hr < rows.length; hr++) {
    var have = {};
    for (var hc = 0; hc < rows[hr].length; hc++) have[_clean(rows[hr][hc]).toLowerCase()] = 1;
    var all = true;
    for (var rq = 0; rq < required.length; rq++) { if (!have[required[rq]]) { all = false; break; } }
    if (all) { hdr = hr; break; }
  }
  if (hdr < 0) throw new Error('CSV header row not found (need columns: ' + required.join(', ') + ')');
  var head = rows[hdr], idx = {};
  for (var h = 0; h < head.length; h++) idx[_clean(head[h]).toLowerCase()] = h;
  function col(row, name) { var i = idx[name]; return (i === undefined) ? '' : row[i]; }

  var knownCat = {};
  for (var kc = 0; kc < KNOWN_CATEGORIES.length; kc++) knownCat[KNOWN_CATEGORIES[kc]] = 1;

  var categories = [], catByName = {};
  var lastCat = null, lastGroup = null, lastKey = null;
  var badCats = {}, badNums = []; // collected problems -> reported together

  for (var i = hdr + 1; i < rows.length; i++) {
    var row = rows[i];
    var catName = _clean(col(row, 'category'));
    if (catName === '') continue; // skip stray blank rows (e.g. an Anleitung spacer)

    if (!knownCat[catName]) badCats[catName] = (badCats[catName] || 0) + 1;

    var priceRaw = _clean(col(row, 'price'));
    var volRaw = _clean(col(row, 'volume'));
    var vintRaw = _clean(col(row, 'vintage'));
    var where = '"' + _clean(col(row, 'producer')) + (_clean(col(row, 'artcode')) ? ' / Art.' + _clean(col(row, 'artcode')) : '') + '"';
    // a NON-EMPTY value that isn't a number in a numeric column = column shift
    if (priceRaw !== '' && !_isNum(priceRaw)) badNums.push(where + ' Price="' + priceRaw + '"');
    if (volRaw !== '' && !_isNum(volRaw)) badNums.push(where + ' Volume="' + volRaw + '"');
    if (vintRaw !== '' && !_isNum(vintRaw)) badNums.push(where + ' Vintage="' + vintRaw + '"');

    var country = _clean(col(row, 'country'));
    var region = _clean(col(row, 'region'));
    // vinify had an EMPTY region when a wine had no sub-region; there the
    // group name was just the country. The CSV stores Region = Country in that
    // case, so collapse Region==Country back to an empty region for parity.
    var re = (region === country) ? '' : region;

    // Optional columns (sommelier may add these to the sheet later; absent = ''):
    // "grapes"/"rebsorten" and "classification"/"klassifikation".
    var grapes = _clean(col(row, 'grapes')) || _clean(col(row, 'rebsorten'));
    var classif = _clean(col(row, 'classification')) || _clean(col(row, 'klassifikation'));

    var wine = {
      p: _clean(col(row, 'producer')),
      n: _clean(col(row, 'wine')),
      v: _num(vintRaw),
      vol: _num(volRaw),
      pr: (priceRaw === '') ? null : _num(priceRaw),
      co: country,
      re: re,
      code: _clean(col(row, 'artcode'))
    };
    if (grapes) wine.gr = grapes;   // kept out of the object when empty to keep the inlined JSON lean
    if (classif) wine.cl = classif;

    if (!lastCat || lastCat.name !== catName) {
      lastCat = catByName[catName];
      if (!lastCat) { lastCat = { name: catName, groups: [] }; categories.push(lastCat); catByName[catName] = lastCat; }
      lastGroup = null; lastKey = null;
    }

    var groupName = re ? (country + ', ' + re) : country;
    var key = catName + ' ' + country + ' ' + re;
    if (!lastGroup || key !== lastKey) {
      lastGroup = { name: groupName, co: country, wines: [] };
      lastCat.groups.push(lastGroup);
      lastKey = key;
    }
    lastGroup.wines.push(wine);
  }

  // ---- SAFETY GATE: refuse to publish structurally-broken data ----
  var problems = [];
  var badCatNames = Object.keys(badCats);
  if (badCatNames.length) {
    problems.push('Unknown category value(s): ' + badCatNames.map(function (n) { return '"' + n + '" (x' + badCats[n] + ')'; }).join(', ') +
      '. Allowed: ' + KNOWN_CATEGORIES.join(', ') + '.');
  }
  if (badNums.length) {
    problems.push('Non-numeric value in a number column (likely a shifted column): ' + badNums.slice(0, 6).join('; ') + (badNums.length > 6 ? ' … (+' + (badNums.length - 6) + ' more)' : '') + '.');
  }
  if (problems.length) throw new Error('Sheet validation failed — ' + problems.join('  |  '));

  // derived aggregates (countries drives the search filter; the rest are kept
  // for format parity with the original build).
  var countriesSet = {}, volumesSet = {}, prices = [];
  categories.forEach(function (c) {
    c.groups.forEach(function (g) {
      g.wines.forEach(function (w) {
        if (w.co) countriesSet[w.co] = 1;
        if (w.vol) volumesSet[w.vol] = 1;
        if (w.pr !== null && w.pr !== undefined) prices.push(w.pr);
      });
    });
  });
  var countries = Object.keys(countriesSet).sort();
  var volumes = Object.keys(volumesSet).map(Number).sort(function (a, b) { return a - b; });

  return {
    title: 'Master-Weinkarte',
    currency: 'CHF',
    categories: categories,
    countries: countries,
    volumes: volumes,
    priceMin: prices.length ? Math.min.apply(null, prices) : 0,
    priceMax: prices.length ? Math.max.apply(null, prices) : 0
  };
}

export { csvToData, parseCsv, KNOWN_CATEGORIES };
