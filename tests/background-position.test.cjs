const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {launchBrowser,appUrl,collectBrowserErrors}=require('./helpers.cjs');

(async()=>{
 const browser=await launchBrowser(),errors=[];
 const folder=path.resolve(__dirname,'../test-results/screenshots');fs.mkdirSync(folder,{recursive:true});
 try{
  for(const width of [1280,320]){
   const page=await browser.newPage({viewport:{width,height:844},hasTouch:true,isMobile:width===320});collectBrowserErrors(page,errors);
   await page.goto(appUrl());await page.waitForFunction(()=>window.nurupuru?.mesh);
   assert.equal(await page.locator('[data-pan-target=background]').first().isDisabled(),true);
   assert.equal(await page.locator('#exportFrame option[value=background]').isDisabled(),true);
   const base64=await page.evaluate(()=>{
    const lab=window.nurupuru,c=document.createElement('canvas');c.width=c.height=256;
    const ctx=c.getContext('2d');ctx.fillStyle='#00ff00';ctx.fillRect(96,96,64,64);lab.installImage(c,'foreground.png');lab.params.mask=false;lab.params.renderMode='nearest';lab.pauseClock();lab.mesh.reset();lab.setWorkspace('material');
    const bg=document.createElement('canvas');bg.width=512;bg.height=256;const b=bg.getContext('2d');b.fillStyle='#ff0000';b.fillRect(0,0,256,256);b.fillStyle='#0000ff';b.fillRect(256,0,256,256);return bg.toDataURL().split(',')[1];
   });
   const file={name:'background.png',mimeType:'image/png',buffer:Buffer.from(base64,'base64')};
   await page.locator('#backgroundInput').setInputFiles(file);await page.waitForFunction(()=>window.nurupuru.backgroundMode==='image');
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const state=()=>page.evaluate(()=>{const lab=window.nurupuru;lab.pauseClock();return {view:lab.view,zoom:document.getElementById('zoomText').textContent,params:{...lab.params},mask:lab.mask.toDataURL(),positions:[...lab.mesh.px,...lab.mesh.py],history:lab.historyDiagnostics()};});
   const controls=page.locator(width===320?'#quickPanTargets':'[data-context=pan]');
   const begin=async()=>{const workspace=await page.evaluate(()=>window.nurupuru.params.workspace);await page.locator('[data-tool=pan]').click();assert.equal(await page.evaluate(()=>window.nurupuru.params.workspace),workspace,'Pan selection preserves settings tab');if(width===1280)await page.locator('#tabPaint').click();await controls.locator('[data-pan-target=background]').click();};
   await begin();const before=await state();
   const metrics=await page.evaluate(()=>{const lab=window.nurupuru;lab.render();lab.pauseClock();const r=document.getElementById('stage').getBoundingClientRect(),g=lab.renderer.gl;
    const upload=g.texImage2D;window.positionUploads=0;g.texImage2D=function(...args){positionUploads++;return upload.apply(this,args);};
    return {x:r.x+r.width/2,y:r.y+r.height/2,zoom:g.getUniform(lab.renderer.program,lab.renderer.uni.u_zoom)};
   });
   if(width===320){
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:metrics.x,y:metrics.y,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:metrics.x+40*metrics.zoom,y:metrics.y+40*metrics.zoom,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
   }else{
    await page.mouse.move(metrics.x,metrics.y);await page.mouse.down();await page.mouse.move(metrics.x+40*metrics.zoom,metrics.y+40*metrics.zoom,{steps:8});await page.mouse.up();
   }
   const moved=await page.evaluate(()=>window.nurupuru.backgroundPosition);assert.ok(Math.abs(moved.x-40)<.01&&Math.abs(moved.y-40)<.01,'mouse/touch drag moves only background in source coordinates');
   const sameEditingState=async label=>{const a=await state(),{history:ah,...as}=a,{history:bh,...bs}=before;assert.deepEqual(as,bs,label);assert.equal(ah.storedBytes,bh.storedBytes,'background history does not allocate mask buffers');};
   await sameEditingState('background drag preserves foreground, mask, physics, view and settings tab');
   assert.equal(await page.evaluate(()=>positionUploads),0,'repositioning reuses GPU texture');
   const samples=[[32,16],[32,80],[146,80],[224,80],[128,128],[184,80]];
   const readPreview=async samples=>page.evaluate(samples=>{const lab=window.nurupuru;lab.render();lab.pauseClock();const r=lab.renderer,g=r.gl,box=document.getElementById('stage').getBoundingClientRect(),z=g.getUniform(r.program,r.uni.u_zoom),v=lab.view;
    return samples.map(([x,y])=>{const sx=Math.floor((box.width/2+v.panX+(x-128)*z)*g.canvas.width/box.width),sy=Math.floor((box.height/2-v.panY-(y-128)*z)*g.canvas.height/box.height);if(sx<0||sy<0||sx>=g.canvas.width||sy>=g.canvas.height)throw Error('Preview sample outside canvas: '+JSON.stringify({x,y,sx,sy,width:g.canvas.width,height:g.canvas.height,zoom:z}));const pixel=new Uint8Array(4);g.readPixels(sx,sy,1,1,g.RGBA,g.UNSIGNED_BYTE,pixel);return [...pixel];});
   },samples);
   let preview=await readPreview(samples);
   assert.deepEqual(preview,[[0,0,0,0],[255,0,0,255],[255,0,0,255],[0,0,255,255],[0,255,0,255],[0,0,255,255]],'shifted background reveals transparent edges and leaves foreground fixed');
   assert.deepEqual(await readPreview([[266,128]]),[[0,0,255,255]],'background remains visible beyond the foreground image boundary');
   assert.deepEqual(await readPreview([[184,80]]),[[0,0,255,255]]);
   const pivot={x:96,y:64},anchorX=metrics.x+before.view.panX+(pivot.x-128)*metrics.zoom,anchorY=metrics.y+before.view.panY+(pivot.y-128)*metrics.zoom;
   await page.evaluate(()=>document.getElementById('stage').addEventListener('wheel',e=>{window.backgroundWheelPoint={x:e.clientX,y:e.clientY};},{once:true}));
   await page.mouse.move(anchorX,anchorY);await page.mouse.wheel(0,-Math.log(1.5)/.0014);await page.waitForFunction(()=>window.nurupuru.backgroundPosition.scale>1.49);
   const actual=await page.evaluate(()=>backgroundWheelPoint),point={x:128+(actual.x-metrics.x-before.view.panX)/metrics.zoom,y:128+(actual.y-metrics.y-before.view.panY)/metrics.zoom};
   const texturePoint=position=>({u:.5+(point.x-128-position.x)/(512*position.scale),v:.5+(point.y-128-position.y)/(256*position.scale)});
   const scaled=await page.evaluate(()=>window.nurupuru.backgroundPosition),oldUV=texturePoint(moved),newUV=texturePoint(scaled);
   assert.ok(Math.abs(scaled.scale-1.5)<.001,'wheel scales selected background');
   assert.ok(Math.abs(oldUV.u-newUV.u)<1e-5&&Math.abs(oldUV.v-newUV.v)<1e-5,'background zoom keeps the texture point under the pointer fixed');
   await sameEditingState('background zoom preserves viewport, foreground, mask, physics and settings');
   assert.deepEqual(await readPreview([[184,80]]),[[255,0,0,255]],'background scaling changes rendered pixels');
   preview=await readPreview(samples);assert.equal(await page.evaluate(()=>positionUploads),0,'background scaling reuses GPU texture');
   await controls.screenshot({path:path.join(folder,`background-position-${width}.png`)});
   const box=await controls.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width&&(width!==320||box.height<=70),'Pan controls fit mobile without vertical text');
   await page.locator('#language').evaluate(el=>{el.value='en';el.dispatchEvent(new Event('change'));});
   assert.equal(await controls.locator('[data-pan-target=background]').textContent(),'Background');
   const englishBox=await controls.boundingBox();assert.ok(englishBox.x>=0&&englishBox.x+englishBox.width<=width&&(width!==320||englishBox.height<=70),'English Pan controls fit mobile');
   await controls.screenshot({path:path.join(folder,`background-position-en-${width}.png`)});
   await controls.locator('[data-pan-target=canvas]').click();assert.equal(await page.evaluate(()=>window.nurupuru.backgroundPosition.target),'canvas');
   assert.equal(await page.evaluate(()=>window.nurupuru.params.workspace),before.params.workspace);
   const zoomBefore=await page.locator('#zoomText').textContent(),positionBefore=await page.evaluate(()=>window.nurupuru.backgroundPosition);
   await page.mouse.move(anchorX,anchorY);await page.mouse.wheel(0,120);await page.waitForFunction(previous=>document.getElementById('zoomText').textContent!==previous,zoomBefore);
   assert.deepEqual(await page.evaluate(()=>window.nurupuru.backgroundPosition),positionBefore,'Canvas target wheel leaves background transform unchanged');
   await page.mouse.wheel(0,-120);await page.waitForFunction(previous=>document.getElementById('zoomText').textContent===previous,zoomBefore);
   await page.locator('#btnExport').click();await page.locator('[data-export-format=png]').click();
   assert.equal(await page.locator('#exportFrame').inputValue(),'foreground','foreground framing is the default');
   const event=page.waitForEvent('download');await page.locator('#startExport').click();const png=fs.readFileSync(await (await event).path());
   const exported=await page.evaluate(async({base64,samples})=>{const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],{type:'image/png'})),c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();return samples.map(([x,y])=>[...ctx.getImageData(x,y,1,1).data]);},{base64:png.toString('base64'),samples});
   assert.deepEqual(exported,preview,'foreground-framed PNG matches shifted preview');
   await page.locator('#exportFrame').selectOption('background');
   const frame=await page.evaluate(()=>{const lab=window.nurupuru,p=lab.backgroundPosition,s=Math.max(lab.image.width/lab.background.width,lab.image.height/lab.background.height)*p.scale,w=lab.background.width*s,h=lab.background.height*s;return {x:(lab.image.width-w)/2+p.x,y:(lab.image.height-h)/2+p.y,w,h};});
   const exportBackground=async size=>{
    await page.locator('#exportSize').selectOption(size);const event=page.waitForEvent('download');await page.locator('#startExport').click();const png=fs.readFileSync(await (await event).path()),w=png.readUInt32BE(16),h=png.readUInt32BE(20),scale=Math.min(w/frame.w,h/frame.h);
    const points=[[8,8],[w-8,8],...[[128,128],[128,266]].map(([x,y])=>[Math.floor(w/2+(x-frame.x-frame.w/2)*scale),Math.floor(h/2+(y-frame.y-frame.h/2)*scale)])];
    const pixels=await page.evaluate(async({base64,points})=>{const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],{type:'image/png'})),c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();return points.map(([x,y])=>[...ctx.getImageData(x,y,1,1).data]);},{base64:png.toString('base64'),points});
    return {w,h,points,pixels};
   };
   const full=await exportBackground('original');assert.deepEqual([full.w,full.h],[768,384],'background frame uses the full scaled background dimensions');
   assert.deepEqual(full.pixels,[[255,0,0,255],[0,0,255,255],[0,255,0,255],[255,0,0,255]],'full background frame retains both edges, foreground placement and pixels beyond foreground bounds');
   const capped=await exportBackground('720');assert.deepEqual([capped.w,capped.h],[720,360],'resolution limit applies to the selected background frame');assert.deepEqual(capped.pixels,full.pixels);
   await page.locator('#closeExport').click();
   if(width===1280){
    await page.locator('#btnExport').click();await page.locator('[data-export-format=webm]').click();
    assert.equal(await page.locator('#exportFrame').inputValue(),'background','frame choice survives format switches');
    await page.evaluate(()=>{window.nurupuru.params.intensity=0;const g=document.querySelector('body > canvas').getContext('webgl2'),draw=g.drawArrays;window.positionVideoDraws=0;g.drawArrays=function(...args){positionVideoDraws++;return draw.apply(this,args);};});
    await page.locator('#startExport').click();await page.waitForFunction(()=>positionVideoDraws>0);
    assert.equal(await page.locator('#exportFrame').isDisabled(),true);assert.equal(await page.locator('#exportSize').isDisabled(),true);
    const video=await page.evaluate(points=>{const g=document.querySelector('body > canvas').getContext('webgl2');return {w:g.canvas.width,h:g.canvas.height,pixels:points.map(([x,y])=>{const pixel=new Uint8Array(4);g.readPixels(x,g.canvas.height-1-y,1,1,g.RGBA,g.UNSIGNED_BYTE,pixel);return [...pixel];})};},capped.points);
    assert.deepEqual(video,{w:capped.w,h:capped.h,pixels:capped.pixels},'background-framed video matches PNG composition and dimensions');
    await page.waitForTimeout(1200);const event=page.waitForEvent('download',{timeout:5000});await page.locator('#startExport').click();
    let download;try{download=await event;}catch{throw Error(JSON.stringify(await page.evaluate(()=>({toast:document.getElementById('toast').textContent,status:document.getElementById('recordStatus').textContent,draws:positionVideoDraws})))+' '+errors.join(';'));}
    assert.ok(fs.statSync(await download.path()).size>0);assert.equal(await page.locator('#exportFrame').isDisabled(),false);await page.locator('#closeExport').click();
   }
   await begin();await page.keyboard.press('b');assert.equal(await page.evaluate(()=>window.nurupuru.params.tool),'brush');assert.equal(await page.evaluate(()=>window.nurupuru.backgroundPosition.x),scaled.x);
   await begin();
   if(width===320){
    const cdp=await page.context().newCDPSession(page),x=metrics.x,y=metrics.y;
    const before=await page.evaluate(()=>({position:window.nurupuru.backgroundPosition,view:window.nurupuru.view}));
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-30,y,id:1},{x:x+30,y,id:2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-40,y:y+16,id:1},{x:x+40,y:y+16,id:2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
    assert.deepEqual(await page.evaluate(()=>window.nurupuru.backgroundPosition),before.position,'two-finger canvas movement preserves background placement');
    assert.notDeepEqual(await page.evaluate(()=>window.nurupuru.view),before.view,'two fingers still pan/zoom the whole canvas');
   }else{
    const position=await page.evaluate(()=>window.nurupuru.backgroundPosition);await page.locator('#glcanvas').focus();await page.keyboard.down('Space');
    await page.mouse.move(metrics.x,metrics.y);await page.mouse.down();await page.mouse.move(metrics.x+24,metrics.y+24);await page.mouse.up();await page.keyboard.up('Space');
    assert.deepEqual(await page.evaluate(()=>window.nurupuru.backgroundPosition),position,'Space drag still moves the whole canvas');
   }
   await controls.locator('[data-reset-background]').click();assert.deepEqual(await page.evaluate(()=>window.nurupuru.backgroundPosition),{x:0,y:0,scale:1,target:'background'});
   await page.mouse.move(metrics.x,metrics.y);await page.mouse.down();await page.mouse.move(metrics.x+1000*metrics.zoom,metrics.y);await page.mouse.up();
   const hidden=await page.evaluate(()=>{const lab=window.nurupuru;lab.render();lab.pauseClock();const r=lab.renderer,pixel=new Uint8Array(4);r.gl.readPixels(10,10,1,1,r.gl.RGBA,r.gl.UNSIGNED_BYTE,pixel);return {pixel:[...pixel],separate:r.backgroundProgram!==r.program,error:r.gl.getError()};});
   assert.deepEqual(hidden,{pixel:[0,0,0,0],separate:true,error:0},'background has its own shader and the viewport clips offscreen geometry');
   await controls.locator('[data-reset-background]').click();
   await page.locator('[data-tool=grab]').click();assert.equal(await page.evaluate(()=>window.nurupuru.backgroundPosition.target),'background','Pan remembers its selected target between tools');assert.equal(await page.evaluate(()=>window.nurupuru.params.workspace),before.params.workspace);
   await begin();await page.mouse.move(metrics.x,metrics.y);await page.mouse.down();await page.mouse.move(metrics.x+20,metrics.y+20);await page.mouse.up();
   await page.locator('#backgroundInput').setInputFiles(file);await page.waitForFunction(()=>window.nurupuru.backgroundPosition.x===0);
   assert.deepEqual(await page.evaluate(()=>window.nurupuru.backgroundPosition),{x:0,y:0,scale:1,target:'background'},'replacement resets position and scale');
   if(width===320)await page.locator('#btnViewMenu').click();await page.locator('#btnClearBackground').click();assert.equal(await controls.locator('[data-pan-target=background]').isDisabled(),true);assert.equal(await page.evaluate(()=>window.nurupuru.backgroundPosition.target),'canvas');assert.equal(await page.locator('#exportFrame option[value=background]').isDisabled(),true);assert.equal(await page.locator('#exportFrame').inputValue(),'foreground');
   await page.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS: target-aware background pan/zoom, pointer anchor, viewport independence, unclipped pixels, PNG/video parity, texture reuse and unchanged editing state');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
