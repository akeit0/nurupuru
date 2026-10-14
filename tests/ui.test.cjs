// Run with Node.js and Playwright installed (Chromium or Microsoft Edge).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launchBrowser, appUrl, readStandalone, collectBrowserErrors } = require('./helpers.cjs');

(async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors = [];
    collectBrowserErrors(page, errors);
    await page.goto(appUrl());
    await page.waitForFunction(() => window.nurupuru?.mesh && window.nurupuru?.renderer);
    await page.evaluate(() => window.nurupuru.pauseClock());
    for (const [id, value] of [['quality', 'eco'], ['substeps', '2'], ['iterations', '2']]) {
      assert.equal(await page.locator('#' + id).inputValue(), value, `${id}: lightweight default is selected`);
    }
    assert.deepEqual(await page.evaluate(() => {
      const { quality, substeps, iterations } = window.nurupuru.params;
      return { quality, substeps, iterations };
    }), { quality: 'eco', substeps: 2, iterations: 2 });
    assert.equal(await page.locator('.stage-caption').count(), 0);
    assert.equal(await page.locator('#intensityOut').textContent(), '12.5%');

    const cdp = await page.context().newCDPSession(page);
    const bounds = await page.locator('#stage').boundingBox();
    const cx = Math.round(bounds.x + bounds.width / 2);
    const cy = Math.round(bounds.y + bounds.height / 2);
    const point = (id, x, y) => ({ id, x, y });
    const send = async (type, touchPoints) => {
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };
    const mask = () => page.evaluate(() => window.nurupuru.mask.toDataURL());
    const view = () => page.evaluate(() => ({ ...window.nurupuru.view, zoom: document.getElementById('zoomText').textContent }));
    const hiddenCursor = async () => assert.equal(await page.locator('#brushCursor').evaluate(el => getComputedStyle(el).display), 'none');

    await page.evaluate(() => {
      document.getElementById('btnClear').click();
      document.getElementById('toast').classList.remove('visible');
      window.nurupuru.setMode('grab');
      window.getSelection().removeAllRanges();
    });
    const emptyMask = await mask();
    const priorToast = await page.locator('#toast').textContent();
    await send('touchStart', [point(1, cx, cy)]);
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => window.getSelection().toString()), '', 'long press does not select canvas text');
    assert.equal(await page.locator('#toast').textContent(), priorToast, 'unmasked grab emits no notification');
    assert.equal(await page.locator('#toast').evaluate(el => el.classList.contains('visible')), false);
    await send('touchEnd', []);
    assert.equal(await mask(), emptyMask, 'unmasked long press does not change mask');
    assert.equal(await page.locator('#glcanvas').evaluate(el => el.dispatchEvent(new Event('contextmenu', { bubbles: true, cancelable: true }))), false, 'canvas context menu is suppressed');
    assert.equal(await page.locator('#modeHint').evaluate(el => el.dispatchEvent(new Event('selectstart', { bubbles: true, cancelable: true }))), false, 'canvas hint selection is suppressed');
    assert.equal(await page.locator('#modeHint').evaluate(el => getComputedStyle(el).userSelect), 'none');
    await page.evaluate(() => {
      document.getElementById('btnUndo').click();
      window.nurupuru.setMode('brush');
      document.getElementById('toast').classList.remove('visible');
    });

    for (const tool of ['brush', 'erase', 'fit', 'grab', 'move', 'pan']) {
      await page.evaluate(tool => window.nurupuru.setMode(tool), tool);
      const before = await mask();
      const undoBefore = await page.locator('#btnUndo').isDisabled();
      const redoBefore = await page.locator('#btnRedo').isDisabled();
      assert.equal(await page.evaluate(()=>nurupuru.params.mask),['brush','erase','fit'].includes(tool),`${tool}: tool selection sets appropriate mask visibility`);
      const viewBefore = await view();
      await send('touchStart', [point(1, cx - 30, cy)]);
      await send('touchMove', [point(1, cx - 24, cy + 8)]);
      await send('touchStart', [point(1, cx - 24, cy + 8), point(2, cx + 30, cy)]);
      assert.equal(await mask(), before, `${tool}: joining second finger must restore the mask`);
      await hiddenCursor();
      await send('touchMove', [point(1, cx - 45, cy + 22), point(2, cx + 65, cy + 22)]);
      const viewAfter = await view();
      assert.notEqual(viewAfter.zoom, viewBefore.zoom, `${tool}: pinch zoom`);
      assert.ok(Math.abs(viewAfter.panX - viewBefore.panX) + Math.abs(viewAfter.panY - viewBefore.panY) > 1, `${tool}: pan`);
      await send('touchStart', [point(1, cx - 45, cy + 22), point(2, cx + 65, cy + 22), point(3, cx, cy + 60)]);
      await hiddenCursor();
      await send('touchEnd', [point(2, cx + 65, cy + 22)]);
      await send('touchMove', [point(1, cx - 35, cy + 32), point(3, cx + 10, cy + 70)]);
      await send('touchEnd', [point(3, cx + 10, cy + 70)]);
      const oneFingerBefore = await view();
      await send('touchMove', [point(1, cx - 20, cy + 42)]);
      const oneFingerAfter = await view();
      assert.ok(Math.abs(oneFingerAfter.panX - oneFingerBefore.panX) > 1, `${tool}: remaining finger pans`);
      await hiddenCursor();
      await send('touchEnd', []);
      await hiddenCursor();
      assert.equal(await mask(), before, `${tool}: entire multi-touch gesture preserves mask`);
      assert.equal(await page.locator('#btnUndo').isDisabled(), undoBefore);
      assert.equal(await page.locator('#btnRedo').isDisabled(), redoBefore);
      await page.evaluate(() => { document.getElementById('btnFitView').click(); window.nurupuru.mesh.reset(); window.nurupuru.pauseClock(); });
    }

    for (const tool of ['brush', 'erase']) {
      await page.evaluate(tool => window.nurupuru.setMode(tool), tool);
      const beforeTap = await mask();
      await send('touchStart', [point(1, cx, cy)]);
      assert.equal(await mask(), beforeTap, `${tool}: touch down must not edit`);
      await send('touchEnd', []);
      assert.notEqual(await mask(), beforeTap, `${tool}: stationary release paints once`);
      await page.evaluate(() => document.getElementById('btnUndo').click());
      assert.equal(await mask(), beforeTap, `${tool}: undo stationary release`);
      await send('touchStart', [point(1, cx, cy)]);
      await send('touchMove', [point(1, cx + 4, cy + 4)]);
      assert.equal(await mask(), beforeTap, `${tool}: stationary touch jitter must not edit`);
      await send('touchEnd', []);
      assert.notEqual(await mask(), beforeTap, `${tool}: jittering release paints once`);
      await page.evaluate(() => document.getElementById('btnUndo').click());
      assert.equal(await mask(), beforeTap, `${tool}: undo jittering release`);
      await send('touchStart', [point(1, cx, cy)]);
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await send('touchEnd', []);
      assert.equal(await mask(), beforeTap, `${tool}: losing focus during stationary touch does not edit`);
      await send('touchStart', [point(1, cx, cy)]);
      await send('touchCancel', []);
      assert.equal(await mask(), beforeTap, `${tool}: cancelling pending tap does not edit`);
    }

    await page.evaluate(() => window.nurupuru.setMode('brush'));
    const beforePaint = await mask();
    await send('touchStart', [point(1, cx, cy)]);
    await send('touchMove', [point(1, cx + 18, cy + 10)]);
    await send('touchEnd', []);
    assert.notEqual(await mask(), beforePaint, 'single-touch painting commits');
    await page.evaluate(() => document.getElementById('btnUndo').click());
    assert.equal(await mask(), beforePaint, 'undo restores single-touch stroke');
    assert.equal(await page.locator('#btnRedo').isDisabled(), false);

    await send('touchStart', [point(1, cx, cy)]);
    await send('touchStart', [point(1, cx, cy), point(2, cx + 45, cy)]);
    await send('touchEnd', []);
    assert.equal(await mask(), beforePaint, 'cancelled multi-touch brush keeps mask');
    assert.equal(await page.locator('#btnRedo').isDisabled(), false, 'multi-touch preserves redo');
    await page.evaluate(() => document.getElementById('btnRedo').click());
    const beforeCancel = await mask();
    await send('touchStart', [point(1, cx - 18, cy)]);
    await send('touchCancel', []);
    assert.equal(await mask(), beforeCancel, 'pointercancel rolls back touch stroke');

    // Inspect the actual inertia target: image width in pixels is the drive reference,
    // even though the solver stores coordinates normalized by the shorter edge.
    const drives = await page.evaluate(() => {
      const Mesh = window.nurupuru.mesh.constructor;
      return [[960, 720], [1920, 1440], [720, 960], [960, 480]].map(([w, h]) => {
        const m = new Mesh(w, h, 'eco');
        const p = { ...window.nurupuru.params, intensity: 10, driveAuto: true, preset: 'bounce', iterations: 1 };
        m.weight.fill(1);
        m.material(p);
        m.initVBD();
        const dt = 1 / 120;
        m.prepareTargets(dt, 0.19, p);
        const k = Math.floor(m.n / 2);
        const acceleration = (m.targetY[k] - m.py[k]) * m.quadK[k] / m.mass[k];
        return acceleration * m.scale / w;
      });
    });
    for (const drive of drives.slice(1)) assert.ok(Math.abs(drive - drives[0]) < 1e-8, 'drive is proportional to width across image sizes and aspect ratios');
    assert.deepEqual(errors, [], 'no browser errors');
    // Mouse and pen presses defer the first dab just like touch presses.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => document.getElementById('btnFitView').click());
    const desktopBounds = await page.locator('#stage').boundingBox();
    const dx = desktopBounds.x + desktopBounds.width / 2;
    const dy = desktopBounds.y + desktopBounds.height / 2;
    for (const tool of ['brush', 'erase', 'fit']) {
      await page.evaluate(tool => window.nurupuru.setMode(tool), tool);
      if (tool === 'fit') await page.evaluate(() => document.getElementById('btnClear').click());
      const beforeMouse = await mask();
      await page.mouse.move(dx, dy);
      await page.mouse.down();
      assert.equal(await mask(), beforeMouse, `${tool}: mouse press does not paint`);
      await page.mouse.up();
      assert.notEqual(await mask(), beforeMouse, `${tool}: mouse release paints`);
      await page.evaluate(() => document.getElementById('btnUndo').click());
      assert.equal(await mask(), beforeMouse, `${tool}: mouse tap undo`);
      if (tool === 'fit') continue;
      await page.mouse.down();
      assert.equal(await mask(), beforeMouse, `${tool}: mouse drag begins without painting`);
      await page.mouse.move(dx + 25, dy + 10);
      assert.notEqual(await mask(), beforeMouse, `${tool}: mouse drag paints`);
      await page.mouse.up();
      await page.evaluate(() => document.getElementById('btnUndo').click());
      assert.equal(await mask(), beforeMouse, `${tool}: mouse stroke undo`);
    }
    await page.evaluate(() => window.nurupuru.setMode('brush'));
    const beforePen = await mask();
    const pen = async (type, buttons, force) => {
      await cdp.send('Input.dispatchMouseEvent', { type, x: dx, y: dy, button: 'left', buttons, pointerType: 'pen', force });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };
    await pen('mousePressed', 1, 0.7);
    assert.equal(await mask(), beforePen, 'pen press does not paint');
    await pen('mouseReleased', 0, 0);
    assert.notEqual(await mask(), beforePen, 'pen release paints');
    await page.evaluate(() => document.getElementById('btnUndo').click());
    assert.equal(await mask(), beforePen, 'pen tap undo');
    assert.deepEqual(errors, [], 'no browser errors after desktop checks');

    // Secondary-button input must not erase while manipulating the image.
    await page.evaluate(()=>{nurupuru.setMode('brush');document.getElementById('btnFill').click();nurupuru.mesh.reset();nurupuru.pauseClock();});
    const secondaryState=()=>page.evaluate(()=>{nurupuru.pauseClock();return {mask:nurupuru.mask.toDataURL(),weights:[...nurupuru.mesh.weight],history:nurupuru.historyDiagnostics(),background:nurupuru.backgroundPosition,view:nurupuru.view,positions:[...nurupuru.mesh.px,...nurupuru.mesh.py]};});
    for(const tool of ['grab','move','pan','fit','erase']){
      await page.evaluate(tool=>{document.getElementById('btnFitView').click();nurupuru.mesh.reset();nurupuru.setMode(tool);nurupuru.pauseClock();},tool);
      const before=await secondaryState();
      await page.mouse.move(dx,dy);await page.mouse.down({button:'right'});await page.mouse.move(dx+24,dy+12);
      const held=await secondaryState();
      await page.mouse.up({button:'right'});const after=await secondaryState();
      if(tool==='grab'){
        assert.ok(Math.abs(held.view.panX-before.view.panX-24)<.01);assert.ok(Math.abs(held.view.panY-before.view.panY-12)<.01,'Grab right-drag moves the canvas before release');
        assert.deepEqual({...after,view:before.view,positions:before.positions},before,'Grab right-drag preserves mask, weights, history and background position');
        assert.equal(await page.evaluate(()=>nurupuru.params.tool),'grab','temporary Inertia leaves Grab selected');
        assert.equal(await page.evaluate(()=>nurupuru.mesh.gripState),null,'right-drag does not create a grab constraint');
        await page.keyboard.press('m');assert.equal(await page.evaluate(()=>nurupuru.params.mask),true,'mask can be shown manually in Grab');
        await page.mouse.move(dx,dy);await page.mouse.down({button:'right'});await page.mouse.move(dx+12,dy);await page.mouse.up({button:'right'});
        assert.equal(await page.evaluate(()=>nurupuru.params.mask),true,'manual mask visibility persists during navigation');
      }else assert.deepEqual(after,before,`${tool}: right-drag has no editing effect`);
    }
    await page.evaluate(()=>{nurupuru.setMode('brush');document.getElementById('btnFitView').click();nurupuru.pauseClock();});
    const beforeRightErase=await secondaryState();
    await page.mouse.click(dx,dy,{button:'right'});assert.notEqual((await secondaryState()).mask,beforeRightErase.mask,'Brush right-click remains a temporary eraser');
    await page.evaluate(()=>document.getElementById('btnUndo').click());assert.equal((await secondaryState()).mask,beforeRightErase.mask,'temporary erase remains undoable');

    const choose=tool=>page.locator(`[data-tool=${tool}]`).click();
    const visible=()=>page.evaluate(()=>nurupuru.params.mask);
    await page.keyboard.press('m');assert.equal(await visible(),false);
    for(const tool of ['erase','fit','brush','brush']){await choose(tool);assert.equal(await visible(),false,'editing-group selections preserve manual hiding');}
    await page.locator('#brushStrength').evaluate(el=>{el.value=64;el.dispatchEvent(new Event('input'));});
    const hiddenBefore=await mask();await page.mouse.click(dx,dy);assert.notEqual(await mask(),hiddenBefore);assert.equal(await visible(),false,'painting preserves manual hiding');
    await page.evaluate(()=>document.getElementById('btnUndo').click());assert.equal(await mask(),hiddenBefore);
    await choose('grab');await page.keyboard.press('m');assert.equal(await visible(),true);
    for(const tool of ['move','pan','grab','grab']){await choose(tool);assert.equal(await visible(),true,'interaction-group selections preserve manual showing');}
    await page.keyboard.press('m');await choose('brush');assert.equal(await visible(),true,'crossing to editing shows the mask');
    await choose('grab');assert.equal(await visible(),false,'crossing to interaction hides the mask');
    await page.locator('#maskColorButton').click();assert.equal(await page.locator('#autoMaskVisibility').isChecked(),true);
    await page.locator('#autoMaskVisibility').uncheck();await page.locator('#maskColorButton').click();
    assert.equal(await page.evaluate(()=>localStorage.getItem('nurupuru-auto-mask-visibility')),'false');
    for(const tool of ['brush','pan','fit']){await choose(tool);assert.equal(await visible(),false,'disabled auto-switch preserves manual hiding across groups');}
    await page.keyboard.press('m');await choose('grab');assert.equal(await visible(),true,'disabled auto-switch preserves manual showing');
    await page.reload();await page.waitForFunction(()=>nurupuru?.mesh);assert.equal(await page.locator('#autoMaskVisibility').isChecked(),false,'auto-switch preference survives reload');
    await choose('grab');assert.equal(await visible(),true,'saved disabled preference applies to tool changes');
    await page.locator('#maskColorButton').click();await page.locator('#autoMaskVisibility').check();await page.locator('#maskColorButton').click();
    assert.equal(await visible(),true,'enabling auto-switch does not immediately override visibility');
    await choose('pan');assert.equal(await visible(),true);await choose('brush');await choose('grab');assert.equal(await visible(),false,'enabled auto-switch resumes on the next group crossing');

    const helpPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    collectBrowserErrors(helpPage, errors);
    await helpPage.goto(appUrl());
    await helpPage.waitForFunction(() => window.nurupuru?.mesh && window.nurupuru?.renderer);
    await helpPage.evaluate(() => window.nurupuru.pauseClock());
    const tip = helpPage.locator('#stageTip');
    assert.equal(await tip.isVisible(), true, 'initial tool hint is visible');
    const helpBounds = await helpPage.locator('#stage').boundingBox();
    const hx = helpBounds.x + helpBounds.width / 2;
    const hy = helpBounds.y + helpBounds.height / 2;
    await helpPage.mouse.move(hx, hy);
    await helpPage.mouse.down();
    assert.equal(await tip.isVisible(), true, 'pressing alone retains the hint');
    await helpPage.mouse.up();
    assert.equal(await tip.isVisible(), false, 'completed brush operation hides the hint');
    await helpPage.locator('[data-tool="erase"]').click();
    assert.equal(await tip.isVisible(), true, 'unused tool has its own hint');
    await helpPage.mouse.click(hx, hy);
    assert.equal(await tip.isVisible(), false, 'completed erase operation hides its hint');
    await helpPage.locator('[data-tool="brush"]').click();
    assert.equal(await tip.isVisible(), false, 'returning to a used tool does not restore its hint');

    await helpPage.locator('#btnHelp').click();
    assert.equal(await helpPage.locator('#helpModal').isVisible(), true, 'help opens after hints are dismissed');
    assert.equal(await helpPage.locator('#app').evaluate(el=>el.inert),true,'Help makes underlying editor controls inert');
    await helpPage.keyboard.press('g');
    assert.equal(await helpPage.evaluate(() => window.nurupuru.params.tool), 'brush', 'help blocks background shortcuts');
    await helpPage.keyboard.press('Tab');
    assert.equal(await helpPage.locator('#closeHelp').evaluate(el => el === document.activeElement), true, 'help keeps keyboard focus');
    await helpPage.keyboard.press('Escape');
    assert.equal(await helpPage.locator('#helpModal').isVisible(), false, 'Escape closes help');
    assert.equal(await helpPage.locator('#app').evaluate(el=>el.inert),false,'Help restores editor interaction');
    assert.equal(await helpPage.locator('#btnHelp').evaluate(el => el === document.activeElement), true, 'closing help restores focus');
    await helpPage.locator('#btnHelp').click();
    await helpPage.locator('#closeHelp').click();
    assert.equal(await helpPage.locator('#helpModal').isVisible(), false, 'close button closes help');
    await helpPage.locator('#btnHelp').click();
    await helpPage.mouse.click(2, 2);
    assert.equal(await helpPage.locator('#helpModal').isVisible(), false, 'backdrop closes help');

    for (const [tab, panel] of [['tabMotion', 'motionPanel'], ['tabMaterial', 'materialPanel'], ['tabPaint', 'paintPanel']]) {
      await helpPage.locator('#' + tab).click();
      assert.deepEqual(await helpPage.locator('.panel-view:not([hidden])').evaluateAll(els => els.map(el => el.id)), [panel], 'exactly one settings panel is displayed');
      assert.equal(await helpPage.locator('#' + tab).getAttribute('aria-selected'), 'true');
      assert.equal(await helpPage.evaluate(() => window.nurupuru.params.tool), 'brush', 'settings tab preserves active tool');
    }
    await helpPage.locator('#tabPaint').focus();
    await helpPage.keyboard.press('ArrowRight');
    assert.equal(await helpPage.locator('#tabMotion').getAttribute('aria-selected'), 'true');
    await helpPage.keyboard.press('ArrowRight');
    assert.equal(await helpPage.locator('#tabMaterial').getAttribute('aria-selected'), 'true');
    assert.equal(await helpPage.locator('#anchor').isVisible(), true, 'fixed force is visible without disclosure');
    assert.equal(await helpPage.locator('#anchor').evaluate(el => el.closest('details')), null, 'fixed force is outside advanced settings');
    assert.equal(await helpPage.locator('#intensity').isVisible(), false, 'material tab excludes drive controls');
    await helpPage.keyboard.press('Home');
    assert.equal(await helpPage.locator('#tabPaint').getAttribute('aria-selected'), 'true');
    await helpPage.keyboard.press('End');
    assert.equal(await helpPage.locator('#tabMaterial').getAttribute('aria-selected'), 'true');
    await helpPage.keyboard.press('2');
    assert.equal(await helpPage.locator('#intensity').isVisible(), true, 'drive tab exposes intensity');
    assert.equal(await helpPage.locator('#softness').isVisible(), false, 'drive tab excludes material controls');
    await helpPage.keyboard.press('3');
    assert.equal(await helpPage.locator('#tabMaterial').getAttribute('aria-selected'), 'true', '3 selects material tab');
    for(const workspace of ['material','motion']){
      await helpPage.locator(workspace==='material'?'#tabMaterial':'#tabMotion').click();
      for(const [key,tool] of [['b','brush'],['e','erase'],['f','fit'],['g','grab'],['v','move'],['h','pan']]){
        await helpPage.keyboard.press(key);
        assert.equal(await helpPage.evaluate(()=>window.nurupuru.params.tool),tool,'shortcut selects tool');
        assert.equal(await helpPage.evaluate(()=>window.nurupuru.params.workspace),workspace,'tool shortcut preserves settings tab');
        await helpPage.locator(`[data-tool=${tool}]`).click();
        assert.equal(await helpPage.evaluate(()=>window.nurupuru.params.workspace),workspace,'toolbar preserves settings tab');
      }
    }
    await helpPage.keyboard.press('b');await helpPage.keyboard.press('3');
    await helpPage.locator('#engineAdvanced').evaluate(el => { el.open = true; });
    await helpPage.waitForFunction(() => document.getElementById('physicsStats').textContent.includes('計算時間'));
    assert.ok((await helpPage.locator('#physicsStats').textContent()).includes('最大反復'), 'iteration usage is available even while idle');
    await helpPage.locator('#iterations').selectOption('2');
    const limitedGrab = await helpPage.evaluate(() => {
      const lab = window.nurupuru;lab.pauseClock();lab.mesh.reset();
      if(!lab.mesh.beginGrab(480, 413, 'grab', lab.params))throw Error('Cannot start the UI cap test grab');
      let maxSweeps=0,anyUnconverged=false;
      for(let step=0;step<24;step++){
        lab.mesh.grab(480, 413, 480+600*Math.min(1,(step+1)/12), 413);lab.tick();
        const d=lab.diagnostics();maxSweeps=Math.max(maxSweeps,d.solverIterations);anyUnconverged ||= !d.solverConverged;
      }
      lab.mesh.endGrab();lab.pauseClock();return { limit: lab.params.iterations,maxSweeps,anyUnconverged };
    });
    assert.equal(limitedGrab.limit, 2);assert.ok(limitedGrab.maxSweeps <= 2, 'UI cap is applied to actual mesh steps');
    assert.equal(limitedGrab.anyUnconverged, true, 'large UI grab reports incomplete convergence');
    await helpPage.locator('#iterations').selectOption('4');
    await helpPage.evaluate(() => { window.nurupuru.mesh.reset(); });
    await helpPage.locator('#engineAdvanced').evaluate(el => { el.open = false; });

    for (const id of ['theme', 'stageBg', 'cursorToggle', 'maskControlsToggle', 'btnHelp']) {
      assert.equal(await helpPage.locator('#' + id).evaluate(el => Boolean(el.closest('.stage-actions'))), true, `${id}: canvas header control`);
    }
    await helpPage.mouse.move(hx, hy);
    assert.equal(await helpPage.locator('#brushCursor').evaluate(el => getComputedStyle(el).display), 'block');
    await helpPage.locator('#cursorToggle').click();
    await helpPage.mouse.move(hx + 10, hy);
    assert.equal(await helpPage.locator('#brushCursor').evaluate(el => getComputedStyle(el).display), 'none', 'brush circle can be hidden');
    await helpPage.locator('[data-tool="grab"]').click();
    await helpPage.mouse.move(hx, hy);
    assert.equal(await helpPage.locator('#brushCursor').evaluate(el => getComputedStyle(el).display), 'none', 'hidden circle remains hidden for grab');
    await helpPage.locator('#cursorToggle').click();
    await helpPage.mouse.move(hx, hy);
    assert.equal(await helpPage.locator('#brushCursor').evaluate(el => getComputedStyle(el).display), 'block', 'grab circle can be restored');
    await helpPage.locator('#cursorToggle').click();
    await helpPage.locator('[data-tool="brush"]').click();

    const maskStateBefore = await helpPage.evaluate(() => ({ mask: window.nurupuru.mask.toDataURL(), visible: window.nurupuru.params.mask }));
    await helpPage.locator('#maskColorButton').click();
    assert.equal(await helpPage.locator('#maskPalette').isVisible(), true);
    await helpPage.locator('#maskControlsToggle').click();
    assert.equal(await helpPage.locator('#maskFloating').isVisible(), false, 'mask controls can be hidden');
    assert.equal(await helpPage.locator('#maskPalette').evaluate(el => el.hidden), true, 'hiding mask controls closes their palette');
    assert.deepEqual(await helpPage.evaluate(() => ({ mask: window.nurupuru.mask.toDataURL(), visible: window.nurupuru.params.mask })), maskStateBefore, 'hiding controls preserves mask content and visibility');
    await helpPage.keyboard.press('m');
    assert.equal(await helpPage.evaluate(() => window.nurupuru.params.mask), !maskStateBefore.visible, 'mask shortcut still works with hidden controls');
    await helpPage.keyboard.press('m');

    const appearanceBefore = await helpPage.evaluate(() => ({
      mask: window.nurupuru.mask.toDataURL(), params: { ...window.nurupuru.params }, view: { ...window.nurupuru.view }
    }));
    await helpPage.locator('#theme').selectOption('light');
    assert.equal(await helpPage.locator('html').getAttribute('data-theme'), 'light');
    assert.equal(await helpPage.locator('html').evaluate(el => getComputedStyle(el).colorScheme), 'light');
    assert.deepEqual(await helpPage.evaluate(() => ({
      mask: window.nurupuru.mask.toDataURL(), params: { ...window.nurupuru.params }, view: { ...window.nurupuru.view }
    })), appearanceBefore, 'theme changes preserve editing and simulation state');
    await helpPage.locator('#stageBg').selectOption('white');
    const whiteBackground = await helpPage.locator('#stage').evaluate(el => getComputedStyle(el).backgroundColor);
    await helpPage.locator('#theme').selectOption('dark');
    assert.equal(await helpPage.locator('#stage').evaluate(el => getComputedStyle(el).backgroundColor), whiteBackground, 'explicit canvas background is independent of theme');
    await helpPage.locator('#stageBg').selectOption('checker');
    const darkChecker = await helpPage.locator('#stage').evaluate(el => getComputedStyle(el).backgroundColor);
    assert.equal(darkChecker, 'rgb(65, 71, 85)', 'dark checkerboard is brighter');
    await helpPage.locator('#theme').selectOption('light');
    assert.notEqual(await helpPage.locator('#stage').evaluate(el => getComputedStyle(el).backgroundColor), darkChecker);

    const screenshots = path.resolve(__dirname, '../test-results/ui');
    fs.mkdirSync(screenshots, { recursive: true });
    await helpPage.evaluate(() => document.getElementById('toast').classList.remove('visible'));
    await helpPage.screenshot({ animations: 'disabled', path: path.join(screenshots, 'desktop-material-light.png') });
    await helpPage.locator('#theme').selectOption('dark');
    await helpPage.screenshot({ animations: 'disabled', path: path.join(screenshots, 'desktop-material.png') });
    await helpPage.locator('#btnHelp').click();
    await helpPage.screenshot({ animations: 'disabled', path: path.join(screenshots, 'desktop-help.png') });
    await helpPage.locator('#closeHelp').click();
    await helpPage.locator('#theme').selectOption('light');
    await helpPage.reload();
    await helpPage.waitForFunction(() => window.nurupuru?.mesh && window.nurupuru?.renderer);
    await helpPage.evaluate(() => document.getElementById('toast').classList.remove('visible'));
    assert.equal(await helpPage.locator('#theme').inputValue(), 'light', 'theme preference survives reload');
    assert.equal(await helpPage.locator('html').getAttribute('data-theme'), 'light');
    assert.equal(await tip.isVisible(), true, 'new page visit restores initial guidance');
    assert.equal(await helpPage.locator('#cursorToggle').getAttribute('aria-pressed'), 'false', 'circle preference survives reload');
    assert.equal(await helpPage.locator('#maskControlsToggle').getAttribute('aria-pressed'), 'false', 'mask control preference survives reload');
    assert.equal(await helpPage.locator('#maskFloating').isVisible(), false);
    await helpPage.setViewportSize({ width: 360, height: 800 });
    assert.equal(await tip.isVisible(), false, 'mobile tools use labels and help without covering the canvas');
    await helpPage.locator('#btnViewMenu').click();
    assert.equal(await helpPage.locator('#btnHelp').isVisible(), true, 'help button is available on mobile');
    await helpPage.locator('#closeViewSheet').click();
    for (const width of [320, 360, 390]) {
      await helpPage.setViewportSize({ width, height: 800 });
      await helpPage.locator('#btnViewMenu').click();
      for (const id of ['theme', 'stageBg', 'cursorToggle', 'maskControlsToggle', 'btnHelp']) {
        const bounds = await helpPage.locator(id==='theme'?`[data-select=${id}]`:'#'+id).boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width, `${id}: visible within ${width}px screen`);
      }
      await helpPage.locator('#closeViewSheet').click();
      assert.equal(await helpPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px layout has no horizontal overflow`);
    }
    assert.equal(await helpPage.evaluate(() => {
      const lab = window.nurupuru, m = lab.mesh;lab.pauseClock();
      if (!m.beginGrab(480, 413, 'grab', lab.params)) throw Error('Cannot start mobile reset check');
      for (let step = 0; step < 12; step++) { m.grab(480, 413, 480 + 100 * (step + 1) / 12, 413);lab.tick(); }
      m.endGrab();lab.pauseClock();
      return m.px.some((x, i) => Math.abs(x - m.X[i]) > 1e-6);
    }), true, 'mobile reset check begins with a deformed mesh');
    await helpPage.locator('#btnResetMotion').click();
    assert.equal(await helpPage.evaluate(() => {
      const m = window.nurupuru.mesh;
      return m.px.every((x, i) => x === m.X[i]) && m.py.every((y, i) => y === m.Y[i]);
    }), true, 'mobile reset restores the deformation');
    await helpPage.setViewportSize({ width: 360, height: 800 });
    await helpPage.evaluate(() => document.getElementById('toast').classList.remove('visible'));
    await helpPage.screenshot({ animations: 'disabled', path: path.join(screenshots, 'mobile-initial.png'), fullPage: true });
    await helpPage.locator('#btnToolDetails').click();await helpPage.locator('#tabMaterial').click();
    assert.equal(await helpPage.locator('#anchor').isVisible(), true, 'fixed force is accessible on mobile');
    await helpPage.screenshot({ animations: 'disabled', path: path.join(screenshots, 'mobile-material.png'), fullPage: true });
    await helpPage.locator('#closeSettings').click();await helpPage.locator('#btnViewMenu').click();
    await helpPage.locator('#maskControlsToggle').click();
    await helpPage.locator('#closeViewSheet').click();
    assert.equal(await helpPage.locator('#maskFloating').isVisible(), true, 'hidden controls can be restored on mobile');
    await helpPage.locator('#maskColorButton').click();
    await helpPage.screenshot({ animations: 'disabled', path: path.join(screenshots, 'mobile-palette-light.png'), fullPage: true });
    await helpPage.locator('#closeMaskSheet').click();
    await helpPage.locator('#btnViewMenu').click();await helpPage.locator('#btnHelp').click();
    const dialogBounds = await helpPage.locator('#helpModal .dialog').boundingBox();
    assert.ok(dialogBounds.x >= 0 && dialogBounds.x + dialogBounds.width <= 360, 'mobile help fits the viewport');
    await helpPage.screenshot({ animations: 'disabled', path: path.join(screenshots, 'mobile-help.png') });
    assert.equal(await helpPage.locator('#helpModal').isVisible(), true);
    await helpPage.locator('#closeHelp').click();
    assert.equal(await helpPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile layout has no horizontal overflow');
    assert.deepEqual(errors, [], 'no browser errors after help and settings checks');
    console.log('PASS: silent unmasked grab, long-press suppression, motion, pointer editing, multi-touch, per-tool hints, help, settings tabs, keyboard, themes, persistence and mobile layout');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
