const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {launchBrowser,collectBrowserErrors}=require('./helpers.cjs');

(async()=>{
  const {createDevServer}=await import('../scripts/dev-server.mjs');
  const server=createDevServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`,browser=await launchBrowser(),errors=[];
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900}});collectBrowserErrors(page,errors);await page.goto(origin);
    await page.evaluate(()=>{const lab=window.nurupuru;lab.pauseClock();lab.mesh.reset();lab.setWorkspace('motion');lab.pauseClock();});
    const state=()=>page.evaluate(()=>{const lab=window.nurupuru;lab.pauseClock();return {params:{...lab.params},positions:[...lab.mesh.px,...lab.mesh.py],mask:lab.mask.toDataURL(),view:lab.view,history:lab.historyDiagnostics()};});
    const before=await state();
    for(const language of ['en','ja','en']){
      await page.selectOption('#language',language);assert.deepEqual(await state(),before,'language switch preserves editing/physics state');
      assert.equal(await page.locator('html').getAttribute('lang'),language);
      assert.equal(await page.locator('#language').inputValue(),language);
    }
    assert.equal(await page.evaluate(()=>localStorage.getItem('nurupuru-language')),'en');
    assert.equal(await page.locator('#playText').textContent(),'Animate');
    assert.equal(await page.locator('#intensity').getAttribute('max'),'100');
    await page.locator('#intensity').evaluate(el=>{el.value=100;el.dispatchEvent(new Event('input'));window.nurupuru.pauseClock();});
    assert.equal(await page.evaluate(()=>window.nurupuru.params.intensity),100);assert.equal(await page.locator('#intensityOut').textContent(),'100%');
    assert.equal(await page.locator('#driveWarning').isVisible(),true,'existing high-strength warning remains visible');
    await page.locator('#intensity').evaluate(el=>{el.value=12.5;el.dispatchEvent(new Event('input'));window.nurupuru.mesh.reset();window.nurupuru.pauseClock();});
    const japanese=()=>page.evaluate(()=>{
      const results=[],walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
      for(let n=walker.nextNode();n;n=walker.nextNode())if(!n.parentElement.closest('script,style,[data-i18n-skip]')&&/[\u3040-\u30ff\u3400-\u9fff]/.test(n.textContent))results.push(n.textContent.trim());
      for(const el of document.querySelectorAll('[title],[aria-label]'))for(const name of ['title','aria-label'])if(/[\u3040-\u30ff\u3400-\u9fff]/.test(el.getAttribute(name)||''))results.push(el.getAttribute(name));
      return results;
    });
    for(const mode of ['brush','erase','fit','grab','move','pan']){
      await page.evaluate(mode=>{window.nurupuru.setMode(mode);window.nurupuru.pauseClock();},mode);assert.deepEqual(await japanese(),[],`complete English copy for ${mode}`);
    }
    await page.evaluate(()=>window.nurupuru.setWorkspace('motion'));
    assert.deepEqual(await page.locator('#presetGroup button').evaluateAll(buttons=>buttons.map(b=>b.textContent.trim())),['Circle ↻','Circle ↺','Sway','Bounce','Pulse','Shake']);
    for(const button of await page.locator('#presetGroup button').all())assert.ok(await button.locator('svg').evaluate(svg=>svg.getBoundingClientRect().height>=32),'motion SVG is visible');
    await page.locator('#driveAngle').evaluate(el=>{el.value=90;el.dispatchEvent(new Event('input'));});
    assert.equal(await page.locator('#driveAngleOut').textContent(),'90°');
    await page.locator('[data-preset=pulse]').click();assert.equal(await page.locator('#driveAngle').isDisabled(),true);
    assert.match(await page.locator('#driveAngleHint').textContent(),/radial/);
    await page.locator('[data-preset=bounce]').click();assert.equal(await page.locator('#driveAngle').isDisabled(),false);assert.equal(await page.locator('#driveAngle').inputValue(),'90');
    assert.equal(await page.locator('#presetGroup [aria-pressed=true]').count(),1);
    await page.locator('#resetDriveAngle').click();assert.equal(await page.locator('#driveAngle').inputValue(),'0');
    await page.locator('#btnHelp').click();assert.deepEqual(await japanese(),[]);await page.locator('#closeHelp').click();
    await page.reload();await page.waitForFunction(()=>window.nurupuru?.mesh);assert.equal(await page.locator('html').getAttribute('lang'),'en','language survives reload');
    await page.evaluate(()=>{window.nurupuru.setWorkspace('motion');window.nurupuru.pauseClock();});
    const folder=path.resolve(__dirname,'../test-results/screenshots');fs.mkdirSync(folder,{recursive:true});
    for(const language of ['en','ja']){
      await page.setViewportSize({width:1280,height:900});
      await page.selectOption('#language',language);
      for(const width of [1280,390,360]){
        await page.setViewportSize({width,height:900});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${language}/${width}: no page overflow`);
        if(width<=810){await page.locator('#btnViewMenu').click();assert.ok(await page.locator('[data-select=language]').isVisible());await page.locator('#closeViewSheet').click();}
        else assert.ok(await page.locator('#language').isVisible());
        assert.ok(await page.locator('#btnExport').isVisible());
        await page.screenshot({path:path.join(folder,`editor-${language}-${width}.png`),fullPage:true});
      }
    }
    const blocked=await browser.newContext();await blocked.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw Error('Storage unavailable');}}));
    const noStorage=await blocked.newPage();collectBrowserErrors(noStorage,errors);await noStorage.goto(origin);await noStorage.selectOption('#language','en');assert.equal(await noStorage.locator('html').getAttribute('lang'),'en');
    await noStorage.locator('#maskColorButton').click();await noStorage.locator('#autoMaskVisibility').uncheck();await noStorage.evaluate(()=>nurupuru.setMode('grab'));assert.equal(await noStorage.evaluate(()=>nurupuru.params.mask),true,'auto visibility option works when preference storage is unavailable');await blocked.close();
    assert.deepEqual(errors,[]);
    console.log('PASS: full EN/JA copy, state preservation, persistence/storage fallback, visible SVG presets, angle UX and mobile layouts');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
