/* ============================================================================
   Kulm Weinkarte — canonical data transform: vinify __NEXT_DATA__ -> DATA
   ----------------------------------------------------------------------------
   ONE source of truth, used in TWO places:
     1) build.mjs (Node) — the scheduled GitHub Action rebuilds index.html.
     2) Inlined into the page — the "Aktualisieren" button re-parses vinify live.
   Written in ES5 style (var / function, no arrow / ?? / optional chaining) so
   the inlined browser copy runs on older iPad Safari too.
   ============================================================================ */

function _clean(s) {
  return (s === null || s === undefined) ? '' : String(s).trim();
}

/* one vinify wine record -> compact DATA wine object.
   Key order MUST stay p,n,v,vol,pr,co,re,code (matches the shipped format). */
function _wineObj(r) {
  return {
    p: _clean(r.wineListManufacturerName || r.manufacturerName),
    n: _clean(r.wineListWineName || r.wineName),
    v: r.vintageNo || 0,
    vol: r.volume || 0,
    pr: (r.sellingPrice === null || r.sellingPrice === undefined) ? null : r.sellingPrice,
    co: (r.country && r.country.name) || '',
    re: (r.region && r.region.name) || '',
    code: _clean(r.purchaseNote)
  };
}

/* vinify nests category -> children(region) -> records(wines); some nodes hold
   records directly. Walk recursively: any node with records becomes a group. */
function _collectGroups(node, acc) {
  var recs = node.records || [];
  if (recs.length) {
    acc.push({
      name: node.name || '',
      co: node.countryName || (recs[0].country && recs[0].country.name) || '',
      wines: recs.map(_wineObj)
    });
  }
  var kids = node.children || [];
  for (var i = 0; i < kids.length; i++) _collectGroups(kids[i], acc);
}

/* full __NEXT_DATA__ object -> the DATA structure the page renders from. */
function vinifyToData(nextData) {
  var pp = nextData.props.pageProps;
  var wl = pp.wineList || [];
  var cs = pp.customSettings || {};

  var categories = wl.map(function (cat) {
    var groups = [];
    _collectGroups(cat, groups);
    return { name: cat.name, groups: groups };
  });

  /* derived aggregates (countries drives the search filter; the rest are kept
     for format parity with the original build). */
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
    title: cs.title || 'Master-Weinkarte',
    currency: 'CHF',
    categories: categories,
    countries: countries,
    volumes: volumes,
    priceMin: prices.length ? Math.min.apply(null, prices) : 0,
    priceMax: prices.length ? Math.max.apply(null, prices) : 0
  };
}

/* extract the __NEXT_DATA__ JSON out of a fetched vinify HTML page. */
function extractNextData(html) {
  var m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('__NEXT_DATA__ not found in vinify page');
  return JSON.parse(m[1]);
}

export { vinifyToData, extractNextData };
