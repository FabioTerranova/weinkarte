# Kulm Hotel St. Moritz — Weinkarte (Tablet-Ausgabe)

Live auf den Tablets: **https://fabioterranova.github.io/weinkarte/**

## Für den Sommelier — so pflegst du die Weinkarte

Du arbeitest **ausschließlich in vinify.app**, genau wie bisher: Weine hinzufügen,
Preise ändern, Jahrgänge aktualisieren, Weine entfernen. Mehr musst du nicht tun.

Die Tablet-Weinkarte holt sich diese Änderungen **automatisch alle 30 Minuten**.
Wenn du etwas gerade geändert hast und es **sofort** auf dem Tablet sehen willst:
in der Weinkarte unten auf das **↻-Symbol** (Aktualisieren) tippen — die neuesten
Daten aus vinify werden dann direkt geladen.

Kein Code, kein GitHub, keine App-Installation nötig.

## Auf ein Tablet bringen

1. Im Browser (Safari / Chrome) die Adresse oben öffnen.
2. Menü „Teilen" → **„Zum Home-Bildschirm hinzufügen"**.
3. Es erscheint ein App-Symbol, das die Weinkarte im Vollbild startet.

## Wie es technisch funktioniert (für später)

- Quelle der Wahrheit: `https://vinify.app/pdf-wine-list/570277`
- `build/transform.mjs` — wandelt die vinify-Daten in das Kartenformat (`DATA`) um.
  Dieselbe Funktion wird auch im Browser für den ↻-Knopf verwendet.
- `build/build.mjs` — holt vinify, baut `index.html` (was GitHub Pages ausliefert).
- `build/template.html` — die Karte mit Platzhaltern (`/*__DATA__*/`, `/*__TRANSFORM__*/`).
- `.github/workflows/sync.yml` — GitHub Action, die alle 30 Min neu baut und
  veröffentlicht (nur bei echten Änderungen). Manuell startbar im Actions-Tab.

Lokal neu bauen: `node build/build.mjs` (erzeugt `index.html`).
