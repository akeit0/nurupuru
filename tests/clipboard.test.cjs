const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { launchBrowser, collectBrowserErrors } = require('./helpers.cjs');

(async () => {
  const { createDevServer } = await import('../scripts/dev-server.mjs');
  const server = createDevServer();await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await launchBrowser(), errors = [];
  const paste = (page, target, name) => page.evaluate(async ({ target, name }) => {
    const c = document.createElement('canvas');c.width = 64;c.height = 48;
    const data = new DataTransfer();data.items.add(new File([await new Promise(resolve => c.toBlob(resolve))], name, { type: 'image/png' }));
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    document.getElementById(target).dispatchEvent(event);return event.defaultPrevented;
  }, { target, name });
  try {
    // Desktop uses native paste, including the user's file: distribution mode.
    const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });collectBrowserErrors(desktop, errors);
    await desktop.addInitScript(() => {
      window.reads = 0;
      Object.defineProperty(navigator, 'clipboard', { value: { read: () => { window.reads++;throw Error('Desktop must not request clipboard permission'); } } });
    });
    await desktop.goto(pathToFileURL(path.resolve(__dirname, '../dist/nurupuru.html')).href);await desktop.waitForFunction(() => window.nurupuru?.mesh);
    assert.equal(await desktop.locator('#btnPasteImage').isVisible(), false);
    assert.equal(await desktop.locator('#btnPasteBackground').isVisible(), false);
    assert.equal(await desktop.locator('#pasteDestination').inputValue(), 'foreground');
    assert.equal(await paste(desktop, 'brushSize', 'foreground-paste.png'), true, 'paste works after adjusting a slider');
    await desktop.waitForFunction(() => document.getElementById('fileLabel').textContent === 'foreground-paste.png');
    const foreground = await desktop.evaluate(() => [nurupuru.image.toDataURL(), nurupuru.mask.toDataURL()]);
    await desktop.locator('#pasteDestination').selectOption('background');
    assert.equal(await paste(desktop, 'pasteDestination', 'background-paste.png'), true, 'paste works while the target selector has focus');
    await desktop.waitForFunction(() => !!nurupuru.background);
    assert.deepEqual(await desktop.evaluate(() => [nurupuru.image.toDataURL(), nurupuru.mask.toDataURL()]), foreground, 'background paste preserves foreground and mask');
    assert.equal(await desktop.evaluate(() => reads), 0, 'desktop paste never invokes the read API');
    await desktop.evaluate(() => { const input = document.createElement('input');input.id = 'clipboardText';document.body.append(input); });
    assert.equal(await paste(desktop, 'clipboardText', 'ignored.png'), false, 'text fields retain native paste');
    await desktop.locator('#clipboardText').evaluate(el => el.remove());
    for (const language of ['en', 'ja']) {
      await desktop.locator('#language').selectOption(language);
      assert.equal(await desktop.locator('#pasteDestination option[value=background]').textContent(), language === 'en' ? 'Background' : '背景');
      for (const width of [811, 900, 1280]) {
        await desktop.setViewportSize({ width, height: 900 });
        const box = await desktop.locator('.paste-destination').boundingBox();assert.ok(box.x >= 0 && box.x + box.width <= width);
      }
      await desktop.locator('#btnHelp').click();assert.equal(await paste(desktop, 'closeHelp', 'ignored.png'), false, 'help blocks image replacement');
      assert.match(await desktop.locator('.help-list').textContent(), /Ctrl \/ ⌘ \+ V/);await desktop.locator('#closeHelp').click();
      assert.match(await desktop.locator('#shortcutHelp').textContent(), language === 'en' ? /selected foreground or background/ : /選択した前景・背景/);
    }
    // Mobile buttons read only on a user gesture. The test supplies an isolated
    // image payload and never reads or overwrites the user's system clipboard.
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });collectBrowserErrors(mobile, errors);
    await mobile.addInitScript(() => {
      window.reads = 0;window.mode = 'image';
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read: async () => {
        window.reads++;
        if (!navigator.userActivation.isActive || document.activeElement?.disabled) throw Error('Read lost activation');
        if (mode === 'denied') throw new DOMException('Denied', 'NotAllowedError');
        if (mode === 'empty') return [];
        const c = document.createElement('canvas');c.width = 64;c.height = 48;
        const g = c.getContext('2d');g.fillStyle = '#7755cc';g.fillRect(8, 8, 32, 24);
        const blob = await new Promise(resolve => c.toBlob(resolve));
        return [{ types: ['text/html', 'image/png'], getType: async () => blob }];
      } } });
    });
    await mobile.goto('http://127.0.0.1:' + server.address().port);await mobile.waitForFunction(() => window.nurupuru?.mesh);
    assert.equal(await mobile.evaluate(() => reads), 0);await mobile.locator('#btnViewMenu').tap();
    assert.equal(await mobile.locator('.paste-destination').isVisible(), false);
    await mobile.locator('#btnPasteImage').tap();await mobile.waitForFunction(() => document.getElementById('fileLabel').textContent === 'pasted-image.png');
    assert.deepEqual(await mobile.evaluate(() => [...nurupuru.image.getContext('2d').getImageData(0, 0, 1, 1).data]), [0, 0, 0, 0], 'alpha is preserved');
    const image = await mobile.evaluate(() => nurupuru.image.toDataURL());await mobile.locator('#btnPasteBackground').tap();await mobile.waitForFunction(() => !!nurupuru.background);
    assert.equal(await mobile.evaluate(() => nurupuru.image.toDataURL()), image);assert.equal(await mobile.locator('#viewSheet').evaluate(el => el.open), true);
    for (const mode of ['empty', 'denied']) {
      await mobile.evaluate(mode => { window.mode = mode; }, mode);await mobile.locator('#btnPasteBackground').tap();await mobile.waitForFunction(() => !document.getElementById('btnPasteBackground').disabled);
      assert.match(await mobile.locator('#toast').textContent(), mode === 'empty' ? /画像がありません/ : /貼り付けできませんでした/);
      assert.equal(await mobile.locator('#toast').evaluate(el => !!el.closest('#viewSheet')), true);
      assert.equal(await mobile.evaluate(() => nurupuru.image.toDataURL()), image);
    }
    for (const language of ['en', 'ja']) {
      await mobile.locator('#language').evaluate((el, value) => { el.value = value;el.dispatchEvent(new Event('change')); }, language);
      for (const width of [320, 390, 768]) {
        await mobile.setViewportSize({ width, height: 844 });
        for (const id of ['btnPasteImage', 'btnPasteBackground']) {
          await mobile.locator('#' + id).scrollIntoViewIfNeeded();const box = await mobile.locator('#' + id).boundingBox();
          assert.ok(box.x >= 0 && box.x + box.width <= width && box.height >= 44);
          assert.equal(await mobile.locator('#' + id).evaluate(el => el.scrollWidth <= el.clientWidth), true);
        }
      }
    }
    assert.deepEqual(errors, []);
    console.log('PASS: desktop foreground/background native paste without API permission, mobile button paste, input/modal guards, locales and layout');
  } finally { await browser.close();await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error);process.exitCode = 1; });
