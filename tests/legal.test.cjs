const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {launchBrowser,collectBrowserErrors}=require('./helpers.cjs');

(async()=>{
  const {LEGAL,LEGAL_CONTACT,LEGAL_UPDATED,GITHUB_PRIVACY}=await import('../src/legal-content.js');
  const {createDevServer}=await import('../scripts/dev-server.mjs');
  const server=createDevServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`,browser=await launchBrowser(),errors=[];
  const folder=path.resolve(__dirname,'../test-results/screenshots');fs.mkdirSync(folder,{recursive:true});
  try{
    assert.equal((await fetch(origin+'/.git/config')).status,404);
    for(const prefix of ['','dist/'])for(const policy of ['terms','privacy']){
      const response=await fetch(origin+'/'+prefix+policy+'.html');assert.equal(response.status,200);
      assert.ok(!(await response.text()).includes('<script'),'standalone policies need no scripts');
    }
    const page=await browser.newPage({viewport:{width:1280,height:900}});collectBrowserErrors(page,errors);
    await page.goto(origin);await page.waitForFunction(()=>window.nurupuru?.mesh);
    await page.selectOption('#language','en');
    await page.evaluate(()=>{window.nurupuru.pauseClock();window.nurupuru.mesh.reset();});
    const state=()=>page.evaluate(()=>{const lab=window.nurupuru;return {params:{...lab.params},mask:lab.mask.toDataURL(),positions:[...lab.mesh.px,...lab.mesh.py],view:lab.view,history:lab.historyDiagnostics()};});
    const before=await state();
    const checkCopy=async(language,policy)=>{
      assert.equal(await page.locator('#legalSheet').getAttribute('lang'),language);
      assert.equal(await page.locator('#legalTitle').textContent(),LEGAL[language][policy].title);
      assert.deepEqual(await page.locator('#legalCopy li').evaluateAll(items=>items.map(item=>[item.querySelector('strong').textContent,item.querySelector('p').textContent])),LEGAL[language][policy].clauses);
      assert.ok((await page.locator('#legalCopy').textContent()).includes(LEGAL_UPDATED));
      assert.equal(await page.locator('#legalCopy a').last().getAttribute('href'),LEGAL_CONTACT);
      if(policy==='privacy')assert.equal(await page.locator('#legalCopy a').first().getAttribute('href'),GITHUB_PRIVACY);
    };
    for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:320,height:568},{width:740,height:360}]){
      await page.setViewportSize(viewport);const mobile=viewport.width<=810;
      if(mobile)await page.locator('#btnViewMenu').click();
      const launcher=page.locator(`${mobile?'#viewSheet':'#inspector'} [data-legal=terms]`);await launcher.click();
      assert.equal(await page.locator('dialog[open]').count(),1,'menu transfers to a single legal dialog');
      await checkCopy('en','terms');
      for(const language of ['ja','en']){
        await page.locator(`[data-legal-language=${language}]`).click();
        for(const policy of ['terms','privacy']){
          await page.locator(`[data-policy=${policy}]`).click();await checkCopy(language,policy);
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight),true,'editor never scrolls');
          assert.equal(await page.locator('#legalSheet').evaluate(el=>el.scrollWidth<=el.clientWidth),true,'no horizontal policy overflow');
          const bounds=await page.locator('#closeLegal').boundingBox();assert.ok(bounds.y>=0&&bounds.y+bounds.height<=viewport.height,'close stays visible');
          await page.locator('#legalCopy').evaluate(el=>el.scrollTop=el.scrollHeight);
          assert.ok(await page.locator('#legalCopy a').last().isVisible());
        }
      }
      assert.equal(await page.locator('html').getAttribute('lang'),'en','reading locale leaves editor language alone');
      await page.locator('#legalCopy a').last().focus();await page.keyboard.press('Tab');
      assert.equal(await page.locator('#closeLegal').evaluate(el=>el===document.activeElement),true,'Tab wraps after contact link');
      await page.screenshot({path:path.join(folder,`legal-${viewport.width}.png`)});
      await page.keyboard.press('Escape');assert.equal(await page.locator('#legalSheet').evaluate(el=>el.open),false);
      if(mobile)assert.equal(await page.locator('#btnViewMenu').evaluate(el=>el===document.activeElement),true,'mobile focus returns to Menu');
      assert.deepEqual(await state(),before,'reading policies preserves editing and physics state');
    }
    await page.close();
    const context=await browser.newContext({viewport:{width:320,height:568}});await context.setOffline(true);
    const offline=await context.newPage();collectBrowserErrors(offline,errors);const requests=[];offline.on('request',r=>requests.push(r.url()));
    {
      await offline.goto(pathToFileURL(path.resolve(__dirname,'../dist/nurupuru.html')).href);await offline.waitForFunction(()=>window.nurupuru?.mesh);
      await offline.locator('#btnViewMenu').click();await offline.locator('#viewSheet [data-legal=privacy]').click();
      assert.equal(await offline.locator('#legalCopy li').count(),5);await offline.locator('#closeLegal').click();
    }
    for(const prefix of ['','dist/'])for(const policy of ['terms','privacy']){
      await offline.goto(pathToFileURL(path.resolve(__dirname,'..',prefix,policy+'.html')).href);
      for(const language of ['ja','en']){
        assert.deepEqual(await offline.locator(`#${language} li`).evaluateAll(items=>items.map(item=>[item.querySelector('strong').textContent,item.querySelector('p').textContent])),LEGAL[language][policy].clauses);
        assert.ok((await offline.locator(`#${language}`).textContent()).includes(LEGAL_UPDATED));
      }
      assert.equal(await offline.locator('footer a').getAttribute('href'),prefix?'nurupuru.html':'index.html');
      assert.equal(await offline.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.equal(await offline.locator('#en a').last().getAttribute('href'),LEGAL_CONTACT);
    }
    assert.equal(requests.some(url=>/^https?:/.test(url)),false,'policies and editor run offline without network requests');
    await context.close();assert.deepEqual(errors,[]);
    console.log('PASS: bilingual policies, desktop/mobile dialog and focus, editing state, generated pages and offline release access');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
