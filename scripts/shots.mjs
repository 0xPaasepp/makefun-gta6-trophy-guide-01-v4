// LEONIDA LEDGER v4 — screenshot script (Playwright). Serves app/ via serve.ts,
// opens each view at 1280x720 in the LIGHT theme, and writes 4 JPEGs (quality 80)
// into screenshots/. Usage: node scripts/shots.mjs [--port 8091]
import { spawn } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = portIndex === -1 ? 8091 : Number(args[portIndex + 1]);
const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));

const server = spawn('node', ['serve.ts', '--port', String(port)], { cwd: root, stdio: 'pipe' });
let serverOut = '';
server.stdout.on('data', (d) => { serverOut += d; });
server.stderr.on('data', (d) => { serverOut += d; });

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/index.html`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('serve.ts did not come up: ' + serverOut);
}

try {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('requestfailed', (r) => errors.push('failed request: ' + r.url()));

  for (const shot of shots) {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.trow');
    if (shot.tab !== 'checklist') {
      await page.click(`.tab[data-tab="${shot.tab}"]`);
      await page.waitForTimeout(300);
    }
    if (shot.openDetail) {
      await page.click(`.trow[data-id="${shot.openDetail}"]`);
      await page.waitForSelector('#detail:not([hidden])');
      await page.waitForTimeout(300);
    }
    const path = join(root, 'screenshots', shot.file);
    await page.screenshot({ path, type: 'jpeg', quality: 80 });
    const bytes = statSync(path).size;
    if (bytes > 262144) throw new Error(shot.file + ' is ' + bytes + ' bytes, over the 256 KiB cap');
    console.log('wrote ' + shot.file);
  }
  if (errors.length) {
    console.error('PAGE ERRORS:\n' + errors.join('\n'));
    process.exitCode = 1;
  }
  await browser.close();
} finally {
  server.kill();
}
console.log('done');
