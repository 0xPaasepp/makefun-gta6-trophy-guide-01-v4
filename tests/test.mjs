// LEONIDA LEDGER v4 — Playwright tests (node:test). Every feature, plus the README test.
// Serves app/ via serve.ts on a local port. Run: node --test tests/test.mjs
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const PORT = 8092;
const BASE = `http://127.0.0.1:${PORT}/`;
const DATA = JSON.parse(readFileSync(join(root, 'app/data/trophies.json'), 'utf8'));
const VERBATIM_DESC = 'Build an offline web app that guides and tracks all 55 GTA 6 trophies: the official list with saved progress, filters and a spoiler setting, a roadmap to the platinum, and a guide to each that cites its sources; an AI judge compares the guides two at a time, places go by win rate, and the 50 best share $250.';

let server, browser;

before(async () => {
  server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: root, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(BASE + 'index.html'); if (r.ok) break; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.kill();
});

async function newPage() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('requestfailed', (r) => errors.push('failed: ' + r.url()));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.trow');
  return { page, errors };
}

function showingCount(page) {
  return page.locator('#showing-line').innerText().then((t) => Number(/Showing (\d+) of/.exec(t)[1]));
}
async function clickFilter(page, key) {
  await page.click(`.chip[data-filter="${key}"]`);
  await page.waitForTimeout(100);
}

describe('load + data', () => {
  test('loads with 0 console errors and 0 failed requests', async () => {
    const { page, errors } = await newPage();
    assert.deepEqual(errors, []);
    await page.close();
  });
  test('header shows 0/55, grade counts, 0/1350 PSN pts', async () => {
    const { page } = await newPage();
    assert.equal(await page.locator('#earned-count').innerText(), '0/55 (0%)');
    assert.equal(await page.locator('#grade-counts').innerText(), 'P 0/1 · G 0/2 · S 0/6 · B 0/46');
    assert.equal(await page.locator('#psn-points').innerText(), '0/1350 PSN pts');
    await page.close();
  });
  test('data: 55 trophies, 28 hidden, 26 counters, PSN 1350', async () => {
    assert.equal(DATA.trophies.length, 55);
    assert.equal(DATA.trophies.filter((t) => t.hidden).length, 28);
    assert.equal(DATA.trophies.filter((t) => t.counter).length, 26);
    assert.equal(DATA.trophies.reduce((a, t) => a + t.psnPoints, 0), 1350);
    assert.equal(new Set(DATA.trophies.map((t) => t.roadmapOrder)).size, 55);
    assert.deepEqual(
      { p: 1, g: 2, s: 6, b: 46 },
      {
        p: DATA.trophies.filter((t) => t.grade === 'platinum').length,
        g: DATA.trophies.filter((t) => t.grade === 'gold').length,
        s: DATA.trophies.filter((t) => t.grade === 'silver').length,
        b: DATA.trophies.filter((t) => t.grade === 'bronze').length,
      });
  });
  test('every step citation resolves to a source listed for that trophy (0 mismatches)', async () => {
    let total = 0, mism = 0;
    for (const t of DATA.trophies) for (const s of t.steps) {
      total++;
      for (const c of s.cites) if (!t.sources.includes(c)) mism++;
      assert.ok(s.cites.length > 0, 'trophy ' + t.id + ' has an uncited step');
    }
    assert.equal(total, 197);
    assert.equal(mism, 0);
  });
  test('difficulty on 55/55, timeMin on 54/55 (#49 null), IN SHORT on all 55', async () => {
    assert.ok(DATA.trophies.every((t) => t.difficulty >= 1 && t.difficulty <= 5));
    assert.deepEqual(DATA.trophies.filter((t) => t.timeMin === null).map((t) => t.id), [49]);
    assert.ok(DATA.trophies.every((t) => t.short && t.short.length > 10));
  });
  test('audit strip numbers match trophies.json (recomputed independently)', async () => {
    const { page } = await newPage();
    const text = await page.locator('#audit-strip').innerText();
    const steps = DATA.trophies.reduce((a, t) => a + t.steps.length, 0);
    assert.ok(text.includes('55 official · 1P 2G 6S 46B · 28 hidden'));
    assert.ok(text.includes('55/55 guides cite a source'));
    assert.ok(text.includes(steps + '/' + steps + ' steps cited'));
    assert.ok(text.includes('8 sources read 20 Nov 2026'));
    assert.ok(text.includes('1 possibly missable · 6 watch · 2 unconfirmed · 3 single-source · 16 disagree'));
    await page.close();
  });
  test('CITED BY strip matches trophies.json per-source guides-citing', async () => {
    const { page } = await newPage();
    const text = await page.locator('#cited-by-strip').innerText();
    const expected = { 1: 55, 2: 50, 3: 50, 4: 32, 5: 50, 6: 0, 7: 20, 8: 50 };
    for (const s of DATA.sources) {
      assert.ok(text.includes('[' + s.id + '] ' + s.name + ' ' + expected[s.id] + '/55'), 'source ' + s.id);
    }
    await page.close();
  });
  test('confidence counts are 39 green · 16 amber (computed)', async () => {
    const green = DATA.trophies.filter((t) => t.sources.length >= 2 && t.disagreements.length === 0 && !t.unconfirmed).length;
    assert.equal(green, 39);
    assert.equal(55 - green, 16);
    const { page } = await newPage();
    await page.click('.tab[data-tab="matrix"]');
    const legend = await page.locator('#confidence-legend').innerText();
    assert.ok(legend.includes('39 green · 16 amber'));
    await page.close();
  });
});

// one test per filter chip, with the expected live count
const FILTER_CASES = [
  ['all', 55], ['story', 12], ['missable', 7], ['collectibles', 5], ['activities', 8],
  ['online', 0], ['side', 7], ['feats', 15], ['crime', 7], ['riddles', 4],
  ['money', 6], ['mystery', 5], ['unconfirmed', 2], ['todo', 55], ['earned', 0], ['quick', 6],
];
describe('filters', () => {
  for (const [key, count] of FILTER_CASES) {
    test('filter ' + key + ' shows ' + count, async () => {
      const { page } = await newPage();
      await clickFilter(page, key);
      assert.equal(await showingCount(page), count);
      assert.equal(await page.locator('#checklist .trow').count(), count);
      await page.close();
    });
  }
  test('grade dropdown silver shows 6', async () => {
    const { page } = await newPage();
    await page.selectOption('#grade-select', 'silver');
    assert.equal(await showingCount(page), 6);
    await page.close();
  });
  test('search finds meditation trophies and updates the count', async () => {
    const { page } = await newPage();
    await page.fill('#search-input', 'meditat');
    assert.equal(await showingCount(page), 1);
    assert.ok((await page.locator('#checklist .trow .name').first().innerText()).includes('Positive Mental Attitude'));
    await page.close();
  });
  test('sort A–Z puts A Classic Blitz Play first, difficulty puts the easiest first', async () => {
    const { page } = await newPage();
    await page.selectOption('#sort-select', 'az');
    assert.ok((await page.locator('#checklist .trow .name').first().innerText()).includes('A Classic Blitz Play'));
    await page.click('#spoiler-toggle');
    await page.selectOption('#sort-select', 'difficulty');
    const first = await page.locator('#checklist .trow').first().innerText();
    assert.ok(first.includes('Difficulty 1/5'));
    await page.close();
  });
});

describe('checklist persistence + export/import', () => {
  test('mark earned persists across reload; in-progress persists too', async () => {
    const { page } = await newPage();
    await page.click('#checklist .trow[data-id="2"] .state-btn');
    await page.click('#checklist .trow[data-id="2"] .state-btn');
    await page.click('#checklist .trow[data-id="3"] .state-btn');
    assert.equal(await page.locator('#earned-count').innerText(), '1/55 (2%)');
    assert.equal(await page.locator('#in-progress').innerText(), '1 in progress');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.trow');
    assert.equal(await page.locator('#earned-count').innerText(), '1/55 (2%)');
    assert.equal(await page.locator('#in-progress').innerText(), '1 in progress');
    await page.close();
  });
  test('export → reset → import round-trip restores progress', async () => {
    const { page } = await newPage();
    await page.click('#checklist .trow[data-id="2"] .state-btn');
    await page.click('#checklist .trow[data-id="2"] .state-btn');
    const download = page.waitForEvent('download');
    await page.click('#export-btn');
    const dl = await download;
    const path = await dl.path();
    const exported = readFileSync(path, 'utf8');
    assert.ok(exported.includes('"2": "earned"'));
    page.on('dialog', (d) => d.accept());
    await page.click('#reset-btn');
    assert.equal(await page.locator('#earned-count').innerText(), '0/55 (0%)');
    await page.setInputFiles('#import-input', { name: 'progress.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
    await page.waitForTimeout(200);
    assert.equal(await page.locator('#earned-count').innerText(), '1/55 (2%)');
    await page.close();
  });
  test('counters step correctly and clamp at the target and at 0', async () => {
    const { page } = await newPage();
    const row = page.locator('#checklist .trow[data-id="28"]');
    await row.locator('.counter button').nth(1).click();
    await row.locator('.counter button').nth(1).click();
    assert.ok((await row.locator('.count-val').innerText()).startsWith('2/18'));
    await row.locator('.counter button').nth(0).click();
    assert.ok((await row.locator('.count-val').innerText()).startsWith('1/18'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.trow');
    assert.ok((await page.locator('#checklist .trow[data-id="28"] .count-val').innerText()).startsWith('1/18'));
    await page.close();
  });
});

describe('spoilers, theme, banner, next up', () => {
  test('spoiler toggle hides hidden rows; per-row Reveal works', async () => {
    const { page } = await newPage();
    assert.ok((await page.locator('#checklist .trow[data-id="2"] .name').innerText()).includes('Hidden trophy'));
    await page.click('.tab[data-tab="checklist"]');
    await page.click('#checklist .trow[data-id="2"] button:has-text("Reveal")');
    assert.ok((await page.locator('#checklist .trow[data-id="2"] .name').innerText()).includes('Just Like Paradise'));
    await page.click('#spoiler-toggle');
    assert.equal(await page.locator('#spoiler-toggle').innerText(), 'Spoilers: shown');
    assert.ok((await page.locator('#checklist .trow[data-id="3"] .name').innerText()).includes('Paradise Lost'));
    await page.close();
  });
  test('missable banner Show it opens the #28 detail', async () => {
    const { page } = await newPage();
    assert.ok(await page.locator('#missable-banner').isVisible());
    assert.ok((await page.locator('#missable-text').innerText()).includes('Positive Mental Attitude'));
    await page.click('#missable-show');
    assert.ok(await page.locator('#detail:not([hidden])').isVisible());
    assert.ok((await page.locator('#detail h2').innerText()).includes('Positive Mental Attitude'));
    await page.close();
  });
  test('NEXT UP recomputes after earning the first item', async () => {
    const { page } = await newPage();
    await page.click('.tab[data-tab="nextup"]');
    const firstBefore = await page.locator('#nextup-list li').first().innerText();
    assert.ok(firstBefore.includes('Positive Mental Attitude'));
    await page.click('#nextup-list li:first-child');
    await page.click('#detail-mark');
    await page.click('#detail .close');
    await page.click('.tab[data-tab="nextup"]');
    const firstAfter = await page.locator('#nextup-list li').first().innerText();
    assert.ok(!firstAfter.includes('Positive Mental Attitude'));
    assert.ok(firstAfter.includes('This Was No Boat Accident'));
    await page.close();
  });
  test('theme toggle switches light/dark and persists across reload', async () => {
    const { page } = await newPage();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
    await page.click('#theme-toggle');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.trow');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    await page.close();
  });
  test('roadmap tab shows 8 stages; progress tab shows 0%; missables tab lists 7', async () => {
    const { page } = await newPage();
    await page.click('.tab[data-tab="roadmap"]');
    assert.equal(await page.locator('#roadmap .stage-block').count(), 8);
    await page.click('.tab[data-tab="progress"]');
    assert.ok((await page.locator('#progress-view').innerText()).includes('0 of 55 trophies earned (0%)'));
    await page.click('.tab[data-tab="missables"]');
    assert.equal(await page.locator('#missables .trow').count(), 7);
    await page.close();
  });
  test('source matrix counts match trophies.json (recomputed independently)', async () => {
    const { page } = await newPage();
    await page.click('.tab[data-tab="matrix"]');
    const rows = page.locator('#matrix table.matrix tr');
    assert.equal(await rows.count(), 9); // header + 8 sources
    for (const s of DATA.sources) {
      const guides = DATA.trophies.filter((t) => t.sources.includes(s.id)).length;
      const steps = DATA.trophies.reduce((a, t) => a + t.steps.reduce((b, st) => b + (st.cites.includes(s.id) ? 1 : 0), 0), 0);
      const rowText = await rows.nth(s.id).innerText();
      assert.ok(rowText.includes(guides + '/55'), 'matrix guides for source ' + s.id);
      assert.ok(rowText.includes(String(steps)), 'matrix steps for source ' + s.id);
    }
    await page.close();
  });
});

describe('detail panel', () => {
  test('detail opens for every trophy (all 55) with IN SHORT and cited steps', async () => {
    const { page } = await newPage();
    for (const t of DATA.trophies) {
      await page.click('#checklist .trow[data-id="' + t.id + '"]');
      await page.waitForSelector('#detail:not([hidden])');
      assert.equal(await page.locator('#detail h2').innerText(), t.name);
      assert.ok(await page.locator('#detail .inshort').isVisible(), 'trophy ' + t.id + ' IN SHORT');
      const stepCount = await page.locator('#detail ol.steps li').count();
      assert.equal(stepCount, t.steps.length, 'trophy ' + t.id + ' step count');
      assert.ok((await page.locator('#detail .foot').innerText()).includes('trophy ' + t.id + ' of 55'));
      await page.click('#detail .close');
    }
    await page.close();
  });
  test('detail #28 shows MISSABLE box, D1 resolved note, and both D2/D5 boxes', async () => {
    const { page } = await newPage();
    await page.click('#checklist .trow[data-id="28"]');
    const text = await page.locator('#detail').innerText();
    assert.ok(text.includes('MISSABLE? POSSIBLY'));
    assert.ok(text.includes('RESOLVED — NOT A LIVE DISAGREEMENT'));
    assert.ok(text.includes('D2'));
    assert.ok(text.includes('D5'));
    assert.ok(text.includes('18 for the trophy'));
    await page.close();
  });
  test('detail #49 shows NOT PINNED DOWN YET and no time badge value', async () => {
    const { page } = await newPage();
    await page.click('#checklist .trow[data-id="49"]');
    const text = await page.locator('#detail').innerText();
    assert.ok(text.includes('NOT PINNED DOWN YET'));
    assert.ok(text.includes('no time yet') || text.includes('time: not pinned down'));
    await page.close();
  });
  test('detail #44 shows SINGLE SOURCE box and D7', async () => {
    const { page } = await newPage();
    await page.click('#checklist .trow[data-id="44"]');
    const text = await page.locator('#detail').innerText();
    assert.ok(text.includes('SINGLE SOURCE'));
    assert.ok(text.includes('D7'));
    await page.close();
  });
});

describe('revision pass (v4 fixes)', () => {
  test('detail #49 shows Difficulty 1/5 and time: not pinned down badges', async () => {
    const { page } = await newPage();
    await page.click('#checklist .trow[data-id="49"]');
    const text = await page.locator('#detail').innerText();
    assert.ok(text.includes('Difficulty 1/5'));
    assert.ok(text.includes('time: not pinned down'));
    await page.close();
  });
  test("pressing / focuses the search box", async () => {
    const { page } = await newPage();
    await page.keyboard.press('/');
    const focused = await page.evaluate(() => document.activeElement.id);
    assert.equal(focused, 'search-input');
    await page.close();
  });
  test('import rejects a foreign app export', async () => {
    const { page } = await newPage();
    const result = await page.evaluate(() => {
      try { importProgress('{"app":"some-other-app","status":{}}'); return 'no-throw'; }
      catch (e) { return 'threw'; }
    });
    assert.equal(result, 'threw');
    await page.close();
  });
  test('serve.ts answers POST with 405', async () => {
    const res = await fetch(BASE + 'index.html', { method: 'POST' });
    assert.equal(res.status, 405);
  });
});

describe('README', () => {
  test('description line equals the verbatim competition summary and Run block is exactly node serve.ts', async () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    assert.ok(readme.includes(VERBATIM_DESC), 'verbatim description line');
    assert.ok(readme.includes('## Run it\n\n```sh\nnode serve.ts\n```'), 'Run block exactly node serve.ts');
    const req = JSON.parse(readFileSync(join(here, '..', '..', 'requirements.json'), 'utf8'));
    const template = req.how_to_submit.readme_template;
    const expected = template
      .replaceAll('{repo}', 'makefun-gta6-trophy-guide-01-v4')
      .replaceAll('{owner}', '0xPaasepp')
      .replaceAll('{description}', VERBATIM_DESC)
      .replaceAll('{run}', 'node serve.ts')
      .replaceAll('{referral_code}', 'ddn7bre1');
    assert.equal(readme, expected, 'README byte-exact vs server template');
  });
});
