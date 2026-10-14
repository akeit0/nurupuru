const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {launchBrowser,appUrl,collectBrowserErrors}=require('./helpers.cjs');

(async()=>{
  const browser=await launchBrowser(),errors=[];
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});collectBrowserErrors(page,errors);
    await page.goto(appUrl());await page.waitForFunction(()=>window.nurupuru?.mesh);await page.evaluate(()=>window.nurupuru.pauseClock());
    assert.equal(await page.locator('#fileLabel').textContent(),'jelly-demo.png','Plain is the startup sample');
    assert.equal(await page.locator('[data-demo=plain]').getAttribute('class'),'chosen');
    const folder=path.resolve(__dirname,'../test-results/screenshots');fs.mkdirSync(folder,{recursive:true});
    const settled=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const state=()=>page.evaluate(()=>{const lab=window.nurupuru;lab.pauseClock();lab.render();return {params:{...lab.params},mask:lab.mask.toDataURL(),positions:[...lab.mesh.px,...lab.mesh.py],view:lab.view,history:lab.historyDiagnostics()};});
    const noScroll=async()=>assert.deepEqual(await page.evaluate(()=>({width:document.documentElement.scrollWidth<=innerWidth,height:document.documentElement.scrollHeight<=innerHeight,top:scrollY})),{width:true,height:true,top:0});
    const inViewport=async(selector)=>{for(const box of await page.locator(selector).evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})))assert.ok(box.x>=0&&box.y>=0&&box.x+box.w<=await page.evaluate(()=>innerWidth)&&box.y+box.h<=await page.evaluate(()=>innerHeight),`${selector}: within viewport ${JSON.stringify(box)}`);};
    for(const [width,height] of [[320,568],[360,640],[390,844],[430,932],[768,1024],[844,390]]){
      await page.setViewportSize({width,height});await settled();await noScroll();
      await inViewport('.brand');assert.equal(await page.locator('.brand b').isVisible(),true);assert.equal(await page.locator('.brand span').isVisible(),true);
      await inViewport('.rail .tool');await inViewport('#quickControls');await inViewport('#btnExport');
      assert.equal((await page.locator('#quickControls').boundingBox()).height+(await page.locator('.rail').boundingBox()).height,104,'bottom editing controls use two compact rows');
      const playBox=await page.locator('#btnPlay').boundingBox(),maskBox=await page.locator('#maskToggle').boundingBox();assert.ok(Math.abs(playBox.y-maskBox.y)<=1,'Animate and mask controls share one row');
      const actions=['#btnPlay','#btnResetMotion','#btnMotionDetails','#btnMaterialDetails'];
      const boxes=await Promise.all(actions.map(selector=>page.locator(selector).boundingBox()));
      for(let i=1;i<boxes.length;i++){assert.ok(Math.abs(boxes[i].y-boxes[0].y)<=1);assert.ok(Math.abs(boxes[i].x-boxes[i-1].x-boxes[i-1].width-(width<=380?3:6))<=1,'Animate, Reset, Motion and Material use consistent left-aligned gaps');}
      await inViewport('#btnMaterialDetails');await inViewport('#maskColorButton');
      assert.ok((await page.locator('#stage').boundingBox()).height>=height*.45,'canvas gets usable editing space');
      for(const selector of ['.rail .tool','#btnBottomTools','#btnViewMenu','#btnUpload','#btnExport','#btnResetMotion','#btnMotionDetails','#btnMaterialDetails','#btnToolDetails','#maskToggle','#maskColorButton']){
        for(const box of await page.locator(selector).evaluateAll(nodes=>nodes.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height}))))assert.ok(box.w>=44&&box.h>=44,`${selector}: touch target at ${width}×${height}`);
      }
      const expanded=await state(),arrowBox=await page.locator('#btnBottomTools').boundingBox();
      await page.locator('#btnBottomTools').tap();assert.equal(await page.locator('#btnBottomTools').getAttribute('aria-expanded'),'false');assert.equal(await page.locator('#quickControls').isVisible(),false);assert.equal(await page.locator('.rail .tool').first().isVisible(),false);assert.equal(await page.locator('#btnPlay').isVisible(),false,'Hide also hides the Animate/mask row by default');assert.equal(await page.locator('#maskToggle').isVisible(),false);
      assert.deepEqual(await page.locator('#btnBottomTools').boundingBox(),arrowBox,'restore arrow stays in its original position');assert.deepEqual(await state(),expanded,'hiding tools preserves exact editing state');
      assert.equal(await page.evaluate(()=>document.elementFromPoint(20,innerHeight-25).id),'glcanvas','hidden toolbar lets canvas receive touches');
      await noScroll();await page.locator('#btnBottomTools').tap();assert.equal(await page.locator('#btnBottomTools').getAttribute('aria-expanded'),'true');assert.equal(await page.locator('#quickControls').isVisible(),true);assert.equal(await page.locator('.rail .tool').first().isVisible(),true);assert.equal(await page.locator('#btnPlay').isVisible(),true);assert.equal(await page.locator('#maskToggle').isVisible(),true);assert.deepEqual(await state(),expanded,'restoring tools preserves exact editing state');
      await page.locator('#btnMaterialDetails').click();assert.equal(await page.locator('#tabMaterial').getAttribute('aria-selected'),'true');await page.locator('#anchor').scrollIntoViewIfNeeded();
      await noScroll();await inViewport('#closeSettings');await page.locator('#closeSettings').click();
    }
    await page.setViewportSize({width:390,height:844});await settled();
    await page.locator('#btnViewMenu').tap();assert.equal(await page.locator('#hideTopWithTools').isChecked(),true);await page.locator('#hideTopWithTools').uncheck();await page.locator('#closeViewSheet').tap();
    const optionalState=await state();await page.locator('#btnBottomTools').tap();assert.equal(await page.locator('#btnPlay').isVisible(),true,'Menu can keep the Animate row visible');assert.equal(await page.locator('#quickControls').isVisible(),false);assert.deepEqual(await state(),optionalState);await page.locator('#btnBottomTools').tap();await page.locator('#btnViewMenu').tap();await page.locator('#hideTopWithTools').check();await page.locator('#closeViewSheet').tap();
    // The main brush parameter stays in reach without opening settings.
    await page.locator('[data-quick=brushStrength]').tap();
    await page.locator('#quickRange').evaluate(el=>{el.value=73;el.dispatchEvent(new Event('input'));});
    assert.equal(await page.evaluate(()=>window.nurupuru.params.brushStrength),73);assert.equal(await page.locator('#brushStrength').inputValue(),'73');
    await page.locator('[data-tool=erase]').tap();assert.equal(await page.locator('#quickParameters [aria-pressed=true]').getAttribute('data-quick'),'brushSize');
    await page.locator('[data-tool=brush]').tap();assert.equal(await page.locator('#quickParameters [aria-pressed=true]').getAttribute('data-quick'),'brushStrength');
    await page.locator('#btnToolDetails').tap();await page.locator('#brushStrength').evaluate(el=>{el.value=192;el.dispatchEvent(new Event('input'));});
    assert.equal(await page.locator('#quickRange').inputValue(),'192','detail input updates quick control');
    for(let i=0;i<20;i++){await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>!!document.activeElement.closest('#settingsSheet')),'sheet contains keyboard focus');}
    await page.keyboard.press('p');assert.equal(await page.evaluate(()=>window.nurupuru.params.autoPlaying),false,'tool shortcuts do not run behind a sheet');
    await page.locator('#btnSheetPlay').tap();assert.equal(await page.locator('#btnSheetPlay').getAttribute('aria-pressed'),'true');
    await page.locator('#btnSheetPlay').tap();assert.equal(await page.locator('#btnSheetPlay').getAttribute('aria-pressed'),'false');
    await page.keyboard.press('Escape');assert.equal(await page.locator('#settingsSheet').evaluate(el=>el.open),false);assert.equal(await page.evaluate(()=>document.activeElement.id),'btnToolDetails');
    for(const [tool,key] of [['grab','grabRadius'],['fit','contourTolerance'],['pan',null],['move',null]]){
      await page.locator(`[data-tool=${tool}]`).tap();assert.equal(await page.locator('#quickRange').isVisible(),!!key);if(key)assert.equal(await page.locator('#quickParameters [aria-pressed=true]').getAttribute('data-quick'),key);
    }
    await page.locator('[data-tool=brush]').tap();await page.locator('#btnViewMenu').tap();await page.locator('[data-select=language] [data-value=en]').tap();assert.match(await page.locator('[data-quick=brushStrength]').textContent(),/Movement/);assert.equal(await page.locator('[data-quick=brushStrength]').getAttribute('aria-label'),'Movement strength');
    assert.equal(await page.locator('#viewSamples [data-demo=plain]').isVisible(),true);await page.locator('#viewSamples [data-demo=plain]').tap();assert.equal(await page.locator('#viewSheet').evaluate(el=>el.open),false);
    await page.locator('#maskColorButton').tap();assert.equal(await page.locator('[data-select=maskView]').isVisible(),true);assert.equal(await page.locator('#autoMaskVisibility').isVisible(),true);await page.locator('#autoMaskVisibility').uncheck();assert.equal(await page.locator('#autoMaskVisibility').isChecked(),false);await page.locator('#autoMaskVisibility').check();await page.locator('[data-select=maskView] [data-value=single]').tap();assert.equal(await page.evaluate(()=>window.nurupuru.params.maskView),'single');
    assert.ok(await page.locator('[data-mask-color]').first().textContent());await page.locator('[data-select=maskView] [data-value=strength]').tap();await page.locator('#closeMaskSheet').tap();
    await page.locator('#btnViewMenu').tap();await page.locator('#btnHelp').tap();assert.equal(await page.locator('#viewSheet').evaluate(el=>el.open),false);assert.equal(await page.locator('#helpModal').isVisible(),true);await page.locator('#closeHelp').tap();
    await page.locator('#btnMotionDetails').tap();assert.ok(await page.locator('#settingsSheet').evaluate(el=>{const color=getComputedStyle(el).backgroundColor;return color.startsWith('rgba(')&&+color.split(',').at(-1).replace(')','')<=.56;}),'sheet background uses lower opacity');assert.ok(await page.locator('#presetGroup button').evaluateAll(nodes=>nodes.every(node=>{const color=getComputedStyle(node).backgroundColor;return color.startsWith('rgba(')&&+color.split(',').at(-1).replace(')','')<.7;})),'all motion type buttons are translucent on mobile');await page.screenshot({path:path.join(folder,'ux-mobile-motion.png')});await page.locator('#closeSettings').tap();
    await page.screenshot({path:path.join(folder,'ux-mobile-editor.png')});await page.locator('#btnViewMenu').tap();await page.screenshot({path:path.join(folder,'ux-mobile-view.png')});
    assert.equal(await page.locator('#stageBg').isVisible(),true,'longer background list uses a dropdown');
    if(await page.evaluate(()=>CSS.supports('appearance','base-select'))){
      await page.locator('#stageBg').tap();assert.equal(await page.locator('#stageBg').evaluate(el=>el.matches(':open')),true,'styled picker opens in the sheet');
      await inViewport('#stageBg option');
      assert.equal(await page.locator('#stageBg').evaluate(el=>getComputedStyle(el,'::picker(select)').backgroundColor),await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--panel').trim()==='#11151d'?'rgb(17, 21, 29)':'rgb(255, 255, 255)'));
      assert.equal(await page.locator('#stageBg option[value=image]').evaluate(el=>getComputedStyle(el).opacity),'0.5');
      await page.screenshot({path:path.join(folder,'ux-mobile-dropdown.png')});await page.locator('#stageBg option[value=white]').tap();assert.equal(await page.evaluate(()=>window.nurupuru.backgroundMode),'white');
      await page.locator('#stageBg').tap();await page.locator('#stageBg option[value=checker]').tap();
    }
    await page.locator('#closeViewSheet').tap();
    await page.setViewportSize({width:320,height:568});await settled();await noScroll();await inViewport('#btnMaterialDetails');await inViewport('#maskColorButton');
    assert.equal(await page.locator('.brand b').textContent(),'ぬるぷる');assert.equal(await page.locator('.brand span').textContent(),'Nurupuru');await inViewport('.brand');
    await page.locator('#btnMaterialDetails').tap();assert.equal(await page.locator('#materialPanel').isVisible(),true);assert.equal(await page.evaluate(()=>nurupuru.params.autoPlaying),false,'Material opens without starting animation');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'btnMaterialDetails');
    await page.setViewportSize({width:390,height:844});await settled();
    await page.locator('#btnBottomTools').tap();await settled();await page.screenshot({path:path.join(folder,'ux-mobile-tools-hidden.png')});await page.locator('#btnBottomTools').tap();
    assert.deepEqual(await page.locator('.modal,.mask-palette,.mask-color-trigger,.mask-view-toggle').evaluateAll(nodes=>[...new Set(nodes.map(n=>getComputedStyle(n).backdropFilter))]),['none']);
    // Only DOM presentation changes when going between compact and wide layouts.
    await page.evaluate(()=>{window.nurupuru.mesh.reset();window.nurupuru.pauseClock();});const before=await state();
    await page.setViewportSize({width:1280,height:900});await settled();assert.deepEqual(await state(),before);
    assert.equal(await page.locator('#language').isVisible(),true);assert.equal(await page.locator('#inspector').isVisible(),true);
    assert.equal(await page.locator('#btnMotionDetails').isVisible(),false);assert.equal(await page.locator('#btnMaterialDetails').isVisible(),false);
    const originalWidth=(await page.locator('#stage').boundingBox()).width;await page.locator('#btnInspector').tap();await settled();
    assert.ok((await page.locator('#stage').boundingBox()).width>originalWidth+250);assert.equal(await page.locator('#inspector').isVisible(),false);assert.deepEqual(await state(),before);
    await page.screenshot({path:path.join(folder,'ux-desktop-canvas.png')});await page.locator('#btnInspector').tap();await settled();
    assert.equal(await page.locator('#inspector').isVisible(),true);assert.deepEqual(await state(),before);await page.screenshot({path:path.join(folder,'ux-desktop-editor.png')});
    if(await page.evaluate(()=>CSS.supports('appearance','base-select'))){
      await page.locator('#language').click();assert.equal(await page.locator('#language').evaluate(el=>el.matches(':open')),true);
      await page.keyboard.press('e');await page.keyboard.press('p');assert.equal(await page.evaluate(()=>window.nurupuru.params.tool),before.params.tool,'dropdown typeahead does not select an editor tool');assert.equal(await page.evaluate(()=>window.nurupuru.params.autoPlaying),before.params.autoPlaying,'dropdown typeahead does not start playback');await page.keyboard.press('Escape');
    }
    await page.setViewportSize({width:390,height:844});await settled();await page.locator('#btnToolDetails').tap();
    const maskBefore=await page.evaluate(()=>window.nurupuru.mask.toDataURL());await page.mouse.click(10,10);assert.equal(await page.locator('#settingsSheet').evaluate(el=>el.open),false);assert.equal(await page.evaluate(()=>window.nurupuru.mask.toDataURL()),maskBefore,'dismissing sheet does not paint');
    assert.deepEqual(errors,[]);console.log('PASS: viewport editing at six phone/tablet/landscape sizes, touch targets, quick/detail parameter sync, sheet focus/dismissal, locales, desktop collapse and exact editing-state preservation');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
