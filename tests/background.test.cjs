const assert=require('node:assert/strict');
const fs=require('node:fs');
const {launchBrowser,readStandalone,collectBrowserErrors}=require('./helpers.cjs');

(async()=>{
  const browser=await launchBrowser(),errors=[];
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900}});collectBrowserErrors(page,errors);await page.setContent(readStandalone());
    const background=await page.evaluate(()=>{
      const lab=window.nurupuru,c=document.createElement('canvas');c.width=c.height=256;
      const ctx=c.getContext('2d');ctx.fillStyle='#00ff00';ctx.fillRect(96,96,64,64);lab.installImage(c,'foreground.png');lab.pauseClock();lab.mesh.reset();lab.params.mask=false;
      const bg=document.createElement('canvas');bg.width=128;bg.height=64;const b=bg.getContext('2d');b.fillStyle='#ff0000';b.fillRect(0,0,64,64);b.fillStyle='#0000ff';b.fillRect(64,0,64,64);return bg.toDataURL().split(',')[1];
    });
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const physics=()=>page.evaluate(()=>{const lab=window.nurupuru;lab.pauseClock();return {positions:[...lab.mesh.px,...lab.mesh.py],weights:[...lab.mesh.weight],mask:lab.mask.toDataURL(),history:lab.historyDiagnostics()};});
    const before=await physics();
    await page.locator('#backgroundInput').setInputFiles({name:'background.png',mimeType:'image/png',buffer:Buffer.from(background,'base64')});
    await page.waitForFunction(()=>window.nurupuru.backgroundMode==='image');assert.deepEqual(await physics(),before,'background does not alter physics/mask/history');
    assert.equal(await page.locator('#stageBg').inputValue(),'image');assert.equal(await page.locator('#exportBg').inputValue(),'image');
    const preview=await page.evaluate(()=>{
      const lab=window.nurupuru;lab.render();lab.pauseClock();const r=lab.renderer,g=r.gl,box=document.getElementById('stage').getBoundingClientRect();
      const zoom=parseInt(document.getElementById('zoomText').textContent)/100;
      // Sample well inside the source frame, away from crop/foreground edges.
      const samples=[[-70,-70],[70,-70],[0,0]].map(([dx,dy])=>{
        const pixel=new Uint8Array(4);g.readPixels(Math.round((box.width/2+dx*zoom)*g.canvas.width/box.width),Math.round((box.height/2-dy*zoom)*g.canvas.height/box.height),1,1,g.RGBA,g.UNSIGNED_BYTE,pixel);return [...pixel];
      });
      const upload=g.texImage2D;window.backgroundUploads=0;g.texImage2D=function(...args){backgroundUploads++;return upload.apply(this,args);};
      for(let i=0;i<3;i++)lab.render();
      return {samples,uploads:backgroundUploads,error:g.getError()};
    });
    assert.deepEqual(preview.samples,[[255,0,0,255],[0,0,255,255],[0,255,0,255]]);assert.equal(preview.uploads,0);assert.equal(preview.error,0);
    await page.locator('#btnExport').click();await page.locator('[data-export-format=png]').click();assert.equal(await page.locator('#exportBg').inputValue(),'image');
    const exportPixels=async()=>{
      const event=page.waitForEvent('download');await page.locator('#startExport').click();const download=await event;
      const png=fs.readFileSync(await download.path());assert.equal(png.readUInt32BE(16),256);assert.equal(png.readUInt32BE(20),256);
      return page.evaluate(async base64=>{
        const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],{type:'image/png'}));
        const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
        return [[32,32],[224,32],[128,128]].map(([x,y])=>[...ctx.getImageData(x,y,1,1).data]);
      },png.toString('base64'));
    };
    assert.deepEqual(await exportPixels(),preview.samples,'background crop and compositing match the preview');
    await page.locator('#exportBg').selectOption('transparent');assert.deepEqual((await exportPixels()).slice(0,2),[[0,0,0,0],[0,0,0,0]],'transparent export excludes the chosen background');
    await page.locator('[data-export-format=webm]').click();assert.equal(await page.locator('#exportBg').inputValue(),'image');
    await page.evaluate(()=>{const lab=window.nurupuru;lab.params.intensity=0;lab.mesh.reset();lab.pauseClock();const g=document.querySelector('body > canvas').getContext('webgl2'),draw=g.drawArrays;window.recordedBackgroundDraws=0;g.drawArrays=function(...args){recordedBackgroundDraws++;return draw.apply(this,args);};});
    await page.locator('#startExport').click();await page.waitForTimeout(1200);
    assert.ok(await page.evaluate(()=>recordedBackgroundDraws>0),'recording draws the background into its capture canvas');
    const videoEvent=page.waitForEvent('download',{timeout:5000});await page.locator('#startExport').click();
    let video;try{video=await videoEvent;}catch{throw Error(JSON.stringify(await page.evaluate(()=>({toast:document.getElementById('toast').textContent,status:document.getElementById('recordStatus').textContent,draws:recordedBackgroundDraws})))+' '+errors.join(';'));}
    assert.ok(fs.statSync(await video.path()).size>0,'background video is recorded');
    await page.locator('#closeExport').click();await page.locator('#stageBg').selectOption('checker');assert.equal(await page.evaluate(()=>!!window.nurupuru.background),true,'background can be hidden without losing it');
    await page.locator('#stageBg').selectOption('image');await page.locator('#stageBg').selectOption('clear');assert.equal(await page.evaluate(()=>window.nurupuru.background),null);
    assert.equal(await page.evaluate(()=>window.nurupuru.renderer.background),null,'removal frees preview resources');
    assert.equal(await page.locator('#exportBg option[value=image]').isDisabled(),true);
    assert.deepEqual(await physics(),before);
    await page.locator('#backgroundInput').setInputFiles({name:'invalid.gif',mimeType:'image/gif',buffer:Buffer.from('invalid')});
    await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('PNG'));
    assert.equal(await page.evaluate(()=>window.nurupuru.background),null,'failed load does not install a partial background');
    assert.deepEqual(errors,[]);
    console.log('PASS: user background upload, cover crop, preview/PNG compositing, video capture, transparency, reuse/removal and unchanged editor/physics state');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
