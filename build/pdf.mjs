/* ============================================================================
   Kulm Weinkarte — PDF export (A4) for the printable/PC version.
   Renders the already-built index.html in "?print" mode with headless Chrome
   and writes ../weinkarte.pdf. Run by the GitHub Action right after build.mjs,
   ONLY when the list actually changed, so the PDF at the fixed Pages URL
   (…/weinkarte.pdf) is always current without anyone doing anything.

   The page itself turns into a continuous A4 stack in print mode (see the
   .print-mode CSS + the ?print branch in template.html): one book page = one
   A4 page, no nav/swipe chrome. Guests (tablets) never use this; it is purely
   for the printed/PC copy linked from the Google Sheet.

   Chrome comes from CHROME_PATH (the CI installs it via browser-actions/
   setup-chrome and passes the path); locally you can point it at your own
   Chrome. Uses puppeteer-core (no bundled Chromium download).
   ============================================================================ */
import puppeteer from 'puppeteer-core';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');                 // site/
const INDEX = join(ROOT, 'index.html');
const OUT = join(ROOT, 'weinkarte.pdf');
const URL = pathToFileURL(INDEX).href + '?print';

const CHROME = process.env.CHROME_PATH;
if (!CHROME) { console.error('PDF FAILED: set CHROME_PATH to a Chrome/Chromium binary.'); process.exit(1); }

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });
  try {
    const page = await browser.newPage();
    // A4 at 96dpi so the page's vw/vh-based paddings resolve like on screen.
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.goto(URL, { waitUntil: 'networkidle0', timeout: 120000 });
    // Wait until pagination is done AND fonts are loaded (set in template.html).
    await page.waitForFunction('window.__printReady === true', { timeout: 120000 });
    const pages = await page.$$eval('.page', (els) => els.length);
    if (pages < 5) throw new Error('only ' + pages + ' pages rendered — print layout broken?');
    await page.pdf({
      path: OUT,
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });
    console.log('Wrote weinkarte.pdf — ' + pages + ' A4 pages.');
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error('PDF FAILED:', e.message); process.exit(1); });
