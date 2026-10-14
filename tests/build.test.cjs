const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launchBrowser, readStandalone } = require('./helpers.cjs');

(async () => {
  const { createDevServer } = await import('../scripts/dev-server.mjs');
  const server = createDevServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const html = readStandalone();
    assert.ok(!/<script\b[^>]*\bsrc=|<link\b[^>]*\brel="stylesheet"/i.test(html), 'standalone has no external scripts or CSS');
    assert.ok(html.includes('released into the public domain'), 'standalone includes Unlicense');
    assert.equal((await fetch(origin + '/.git/config')).status, 404);
    assert.equal((await fetch(origin + '/src/missing.js')).status, 404);
    browser = await launchBrowser();
    const errors = [];
    const check = async (url, offline = false) => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      if (offline) await context.setOffline(true);
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      const requests = [];page.on('request', request => requests.push(request.url()));
      {
        await page.goto(url);
        await page.waitForFunction(() => window.nurupuru?.mesh && window.nurupuru?.renderer);
        assert.equal(await page.locator('#startupError').count(), 0, 'startup completes without a hidden caught error');
        assert.equal(await page.title(), 'ぬるぷる | Nurupuru');
        assert.equal(await page.locator('.brand b').textContent(), 'ぬるぷる');
      }
      const state = await page.evaluate(() => {
        const app = window.nurupuru;app.pauseClock();
        const m = app.mesh;m.reset();
        const image = app.image.toDataURL();
        if (!m.beginGrab(480, 413, 'grab', app.params)) throw Error('Cannot start build parity grab');
        for (let step = 0; step < 12; step++) {
          m.grab(480, 413, 480 + 80 * (step + 1) / 12, 413);
          m.step(1 / 120, step / 120, app.params);
        }
        m.endGrab();for (let step = 0; step < 24; step++) m.step(1 / 120, .1 + step / 120, app.params);
        return { params: { ...app.params }, nodes: m.n, positions: [...m.px, ...m.py], image,
          folds: m.stats.folds, failed: m.stats.failed };
      });
      assert.equal(state.folds, 0);assert.equal(state.failed, false);
      if (offline) assert.equal(requests.some(request => /^https?:/.test(request)), false, 'offline file makes no network requests');
      if (!offline) assert.ok(requests.some(request => request.endsWith('/src/physics.js')), 'development app uses separate modules');
      await context.close();return state;
    };
    const dev = await check(origin + '/');
    // Use the artifact URL directly regardless of the UI-test URL override.
    const { pathToFileURL } = require('node:url');
    const built = await check(pathToFileURL(path.resolve(__dirname, '../dist/nurupuru.html')).href, true);
    assert.deepEqual(built, dev, 'development source and offline artifact produce identical image and physics');
    assert.deepEqual(errors, []);
    console.log('PASS: modular development, offline single HTML, naming, license, image and physics parity');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error);process.exitCode = 1; });
