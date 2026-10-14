const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {launchBrowser,appUrl,collectBrowserErrors}=require('./helpers.cjs');

(async()=>{
 const browser=await launchBrowser(),errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});collectBrowserErrors(page,errors);await page.goto(appUrl());await page.waitForFunction(()=>window.nurupuru?.mesh);
  await page.selectOption('#language','en');
  const bg=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#00ff00';ctx.fillRect(32,32,64,64);nurupuru.installImage(c,'workflow.png');nurupuru.params.renderMode='nearest';nurupuru.pauseClock();const b=document.createElement('canvas');b.width=256;b.height=128;const g=b.getContext('2d');g.fillStyle='#ff0000';g.fillRect(0,0,128,128);g.fillStyle='#0000ff';g.fillRect(128,0,128,128);return b.toDataURL().split(',')[1];});
  await page.locator('#backgroundInput').setInputFiles({name:'bg.png',mimeType:'image/png',buffer:Buffer.from(bg,'base64')});await page.waitForFunction(()=>nurupuru.backgroundMode==='image');
  await page.locator('#brushStrength').evaluate(el=>{el.value=73;el.dispatchEvent(new Event('input'));});await page.locator('#btnFill').click();
  const painted=await page.evaluate(()=>nurupuru.mask.toDataURL());
  await page.locator('[data-tool=pan]').click();await page.locator('[data-context=pan] [data-pan-target=background]').click();
  const box=await page.locator('#stage').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+40,box.y+box.height/2+20);await page.mouse.up();
  const moved=await page.evaluate(()=>nurupuru.backgroundPosition);assert.ok(moved.x>0);
  await page.locator('#backgroundScale').evaluate(el=>{el.value=150;el.dispatchEvent(new Event('input'));el.dispatchEvent(new Event('change'));});assert.equal(await page.locator('#backgroundScaleOut').textContent(),'150%');
  await page.locator('#btnUndo').click();assert.equal(await page.evaluate(()=>nurupuru.backgroundPosition.scale),1);assert.equal(await page.evaluate(()=>nurupuru.mask.toDataURL()),painted);
  await page.locator('#btnUndo').click();assert.equal(await page.evaluate(()=>nurupuru.backgroundPosition.x),0);assert.equal(await page.evaluate(()=>nurupuru.mask.toDataURL()),painted);
  await page.locator('#btnUndo').click();assert.notEqual(await page.evaluate(()=>nurupuru.mask.toDataURL()),painted,'third Undo reaches the earlier mask operation');
  for(let i=0;i<3;i++)await page.locator('#btnRedo').click();assert.equal(await page.evaluate(()=>nurupuru.backgroundPosition.scale),1.5);assert.equal(await page.evaluate(()=>nurupuru.mask.toDataURL()),painted);
  await page.evaluate(()=>{const lab=nurupuru;lab.pauseClock();lab.params.mask=false;lab.params.softness=47;lab.setWorkspace('material');lab.mesh.beginGrab(64,64,'grab',lab.params);lab.mesh.grab(64,64,80,72);lab.tick();lab.mesh.endGrab();lab.mesh.moving=false;lab.pauseClock();});
  const state=()=>page.evaluate(()=>{nurupuru.pauseClock();return {name:document.getElementById('fileLabel').textContent,image:nurupuru.image.toDataURL(),mask:nurupuru.mask.toDataURL(),background:nurupuru.background?.toDataURL(),position:nurupuru.backgroundPosition,view:nurupuru.view,params:{...nurupuru.params},pose:[...nurupuru.mesh.px,...nurupuru.mesh.py]};});
  const sameDocument=(actual,expected,label)=>{const {pose:a,...am}=actual,{pose:b,...bm}=expected;assert.deepEqual(am,bm,label);assert.equal(a.length,b.length,label);assert.ok(a.every((n,i)=>n===b[i]),`${label}: pose delta ${Math.max(...a.map((n,i)=>Math.abs(n-b[i])))}`);};
  const saved=await state();
  const projectEvent=page.waitForEvent('download');await page.locator('#saveProject').click();const project=await projectEvent,bytes=fs.readFileSync(await project.path());assert.match(project.suggestedFilename(),/\.nurupuru$/);
  await page.evaluate(()=>{nurupuru.loadDemo('plain');nurupuru.pauseClock();});assert.notEqual(await page.evaluate(()=>nurupuru.mask.toDataURL()),painted);
  await page.locator('#restoreDocument').click();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));sameDocument(await state(),saved,'document recovery preserves pixels, deformation, settings, transforms, view and history');
  await page.evaluate(()=>{nurupuru.loadDemo('outline');nurupuru.pauseClock();});
  await page.locator('#projectInput').setInputFiles({name:'workflow.nurupuru',mimeType:'application/json',buffer:bytes});await page.waitForFunction(()=>document.getElementById('fileLabel').textContent==='workflow.png');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
  const reopened=await state();sameDocument(reopened,saved,'saved project restores editable images/mask, pose, settings and camera');
  await page.locator('#projectInput').setInputFiles({name:'invalid.nurupuru',mimeType:'application/json',buffer:Buffer.from('{"format":"other"}')});await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('Could not open project'));sameDocument(await state(),reopened,'invalid projects leave the current document intact');
  await page.locator('#btnExport').click();assert.equal(await page.locator('#closeExport').evaluate(el=>el===document.activeElement),true);assert.equal(await page.locator('#app').evaluate(el=>el.inert),true);
  for(let i=0;i<25;i++){await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>!!document.activeElement.closest('#exportModal')),'export contains keyboard focus');}
  await page.locator('[data-export-format=png]').click();await page.locator('#exportFrame').selectOption('background');
  await page.waitForFunction(()=>document.getElementById('exportDimensions').textContent==='384 × 192 px');assert.ok(await page.locator('#exportPreview').evaluate(el=>el.width>0&&el.height>0));
  const event=page.waitForEvent('download');await page.locator('#startExport').click();const png=fs.readFileSync(await (await event).path());assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[384,192]);
  const preview=await page.locator('#exportPreview').evaluate(c=>{const g=c.getContext('2d');return [.1,.9].map(x=>[...g.getImageData(Math.floor(c.width*x),Math.floor(c.height*.1),1,1).data]);});
  const pixels=await page.evaluate(async base64=>{const b=await createImageBitmap(new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],{type:'image/png'})),c=document.createElement('canvas');c.width=b.width;c.height=b.height;const g=c.getContext('2d');g.drawImage(b,0,0);b.close();return [.1,.9].map(x=>[...g.getImageData(Math.floor(c.width*x),Math.floor(c.height*.1),1,1).data]);},png.toString('base64'));assert.deepEqual(preview,pixels,'export thumbnail shows the saved composition');
  await page.locator('[data-export-format=webm]').click();await page.locator('#exportBg').selectOption('white');await page.evaluate(()=>{nurupuru.params.intensity=0;nurupuru.mesh.moving=false;nurupuru.pauseClock();});await page.locator('#startExport').click();
  for(const selector of ['[data-export-format=png]','#exportBg','#exportDuration','#exportFrame','#exportSize'])assert.equal(await page.locator(selector).isDisabled(),true,'recording locks all configuration');
  await page.locator('[data-export-format=png]').evaluate(el=>el.click());assert.equal(await page.locator('#exportBg').inputValue(),'white');assert.equal(await page.locator('[data-export-format=webm]').getAttribute('class'),'choice active');
  await page.waitForTimeout(1200);const videoEvent=page.waitForEvent('download',{timeout:10000});await page.locator('#startExport').click();assert.ok(fs.statSync(await (await videoEvent).path()).size>0);
  for(const failure of ['constructor','start']){
   const recovered=await page.evaluate(failure=>{const Native=window.MediaRecorder,capture=HTMLCanvasElement.prototype.captureStream,log=console.error;let stream;const message='expected recorder failure';
    try{HTMLCanvasElement.prototype.captureStream=function(...args){stream=capture.apply(this,args);return stream;};window.MediaRecorder=class extends Native{constructor(...args){if(failure==='constructor')throw Error(message);super(...args);}start(){throw Error(message);}};console.error=error=>{if(error.message!==message)log(error);};nurupuru.params.autoPlaying=false;document.getElementById('startExport').click();return {ended:stream.getTracks().every(track=>track.readyState==='ended'),playing:nurupuru.params.autoPlaying,locked:document.getElementById('exportFrame').disabled,badge:document.getElementById('recBadge').classList.contains('show'),error:document.getElementById('toast').textContent};}
    finally{window.MediaRecorder=Native;HTMLCanvasElement.prototype.captureStream=capture;console.error=log;}
   },failure);assert.deepEqual({...recovered,error:undefined},{ended:true,playing:false,locked:false,badge:false,error:undefined},`${failure} failure releases capture tracks and restores playback/controls`);assert.match(recovered.error,/Could not start recording/);
  }
  await page.keyboard.press('Escape');assert.equal(await page.locator('#app').evaluate(el=>el.inert),false);assert.equal(await page.locator('#btnExport').evaluate(el=>el===document.activeElement),true);
  for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
   await page.setViewportSize(viewport);await page.locator('#btnExport').click();
   for(const selector of ['#startExport','#closeExport','#recordStatus']){const b=await page.locator(selector).boundingBox();assert.ok(b.y>=0&&b.y+b.height<=viewport.height,`${selector} remains visible on short screens`);}
   await page.locator('.export-body').evaluate(el=>el.scrollTop=el.scrollHeight);const b=await page.locator('#closeExport').boundingBox();assert.ok(b.y>=0);await page.locator('#closeExport').click();
  }
  await page.setViewportSize({width:390,height:844});await page.locator('[data-tool=pan]').click();await page.locator('#quickPanTargets [data-pan-target=background]').click();await page.locator('#btnToolDetails').click();assert.equal(await page.locator('#backgroundScale').isVisible(),true);await page.locator('#backgroundScale').evaluate(el=>{el.value=80;el.dispatchEvent(new Event('input'));el.dispatchEvent(new Event('change'));});assert.equal(await page.evaluate(()=>nurupuru.backgroundPosition.scale),.8,'touch details provides background scaling without a wheel');await page.locator('#closeSettings').click();
  assert.deepEqual(errors,[]);console.log('PASS: chronological mask/background Undo, touch scaling, document recovery/project roundtrip, export preview, focus, recording locks and sticky actions');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
