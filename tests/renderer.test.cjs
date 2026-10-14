const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {launchBrowser,readStandalone,collectBrowserErrors}=require('./helpers.cjs');

(async()=>{const browser=await launchBrowser();try{
  fs.mkdirSync(path.resolve(__dirname,'../test-results'),{recursive:true});
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];collectBrowserErrors(page,errors);
  await page.setContent(readStandalone());await page.evaluate(()=>window.nurupuru.pauseClock());
  const result=await page.evaluate(()=>{
    const lab=window.nurupuru;lab.pauseClock();const r=lab.renderer,g=r.gl,rows=[];
    const count={uploads:0,patches:0,mipmaps:0};
    for(const [name,key] of [['texImage2D','uploads'],['texSubImage2D','patches'],['generateMipmap','mipmaps']]){
      const original=g[name];g[name]=function(...args){count[key]++;return original.apply(this,args);};
    }
    const reset=()=>{for(const key in count)count[key]=0;};
    const pixels=()=>{lab.render();lab.pauseClock();const data=new Uint8Array(g.canvas.width*g.canvas.height*4);g.readPixels(0,0,g.canvas.width,g.canvas.height,g.RGBA,g.UNSIGNED_BYTE,data);if(g.getError()!==g.NO_ERROR)throw Error('WebGL error');return data;};
    const check=name=>{
      const actual=pixels(),reused={...count};
      // The full-upload path is the pixel oracle for the same mesh.
      r.updateImage(lab.image,lab.mask,lab.mesh,r.maskRevision);const expected=pixels();
      if(actual.some((v,k)=>v!==expected[k]))throw Error(`Texture reuse changes pixels: ${name}`);
      rows.push({name,...reused,exactPixels:true});reset();
    };
    for(const mode of ['smooth','nearest']){
      lab.params.renderMode=mode;lab.params.mask=true;pixels();reset();
      // Dirty mask changes must reach the reused textures after a mesh change.
      document.getElementById('btnFill').click();lab.pauseClock();lab.setPhysicsBackend('wasm-scalar');lab.pauseClock();
      if(count.uploads||count.mipmaps)throw Error('Backend switch uploads textures');check(`${mode}/backend/dirty-mask`);
      for(const quality of ['fine','balanced','eco']){
        document.getElementById('quality').value=quality;document.getElementById('quality').dispatchEvent(new Event('change'));lab.pauseClock();
        if(count.uploads||count.mipmaps)throw Error('Quality switch uploads textures');check(`${mode}/quality/${quality}`);
      }
      const m=lab.mesh;if(!m.beginGrab(480,413,'grab',lab.params))throw Error('Cannot deform renderer mesh');
      for(let tick=0;tick<12;tick++){m.grab(480,413,480+80*(tick+1)/12,413);m.step(1/120,tick/120,lab.params);}
      m.endGrab();const positions=[...m.px,...m.py],velocities=[...m.vx,...m.vy];
      lab.setPhysicsBackend('js');lab.pauseClock();
      if([...lab.mesh.px,...lab.mesh.py].some((v,k)=>v!==positions[k])||[...lab.mesh.vx,...lab.mesh.vy].some((v,k)=>v!==velocities[k]))throw Error('Backend switch changed state');
      if(count.uploads||count.mipmaps)throw Error('Deformed backend switch uploads textures');check(`${mode}/deformed/js`);
      lab.params.mask=false;lab.setPhysicsBackend('wasm-scalar');lab.pauseClock();check(`${mode}/mask-hidden/wasm`);
    }
    const c=document.createElement('canvas');c.width=1280;c.height=960;const ctx=c.getContext('2d');ctx.fillStyle='#d24389';ctx.fillRect(0,0,c.width,c.height);
    reset();lab.installImage(c,'replacement.png',false);lab.pauseClock();
    if(count.uploads!==2||count.mipmaps!==1)throw Error('Image replacement failed to upload textures');check('image-replacement');
    return {rows};
  });
  for(const row of result.rows)assert.ok(row.exactPixels);
  // Exercise the real PNG export path and keep the canvas/context alive.
  await page.locator('#btnExport').click();await page.locator('[data-export-format="png"]').click();
  const exportPNG=async(name)=>{
    await page.evaluate(()=>{const lab=window.nurupuru;lab.mesh.moving=false;lab.params.autoPlaying=false;lab.pauseClock();});
    const event=page.waitForEvent('download');await page.locator('#startExport').click();const download=await event;
    const file=path.resolve(__dirname,`../test-results/${name}.png`);await download.saveAs(file);assert.equal(fs.readFileSync(file).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  };
  await exportPNG('renderer-first-export');
  await page.evaluate(()=>{
    const canvas=document.querySelector('body > canvas'),g=canvas.getContext('webgl2');
    window.exportAudit={canvas,g,uploads:0,mipmaps:0,programs:0,deletions:0};
    for(const [name,key] of [['texImage2D','uploads'],['generateMipmap','mipmaps'],['createProgram','programs'],['deleteProgram','deletions']]){
      const original=g[name];g[name]=function(...args){window.exportAudit[key]++;return original.apply(this,args);};
    }
    const lab=window.nurupuru;lab.setPhysicsBackend('wasm-scalar');lab.pauseClock();
    document.getElementById('quality').value='fine';document.getElementById('quality').dispatchEvent(new Event('change'));lab.pauseClock();
  });
  await page.locator('#exportSize').selectOption('720');await exportPNG('renderer-reused-export');
  const reused=await page.evaluate(()=>{const a=window.exportAudit,g=a.g;return {uploads:a.uploads,mipmaps:a.mipmaps,programs:a.programs,deletions:a.deletions,width:a.canvas.width,height:a.canvas.height,error:g.getError()};});
  assert.deepEqual(reused,{uploads:0,mipmaps:0,programs:0,deletions:0,width:720,height:540,error:0});
  const exportPixelsMatch=await page.evaluate(()=>{
    const lab=window.nurupuru,a=window.exportAudit,w=a.canvas.width,h=a.canvas.height,actual=new Uint8Array(w*h*4);
    a.g.readPixels(0,0,w,h,a.g.RGBA,a.g.UNSIGNED_BYTE,actual);
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const reference=new lab.renderer.constructor(canvas,true),g=reference.gl,expected=new Uint8Array(w*h*4);
    reference.updateImage(lab.image,lab.mask,lab.mesh);
    reference.draw(lab.mesh,w,h,w/lab.mesh.w,0,0,false,document.getElementById('exportBg').value,lab.params);
    g.readPixels(0,0,w,h,g.RGBA,g.UNSIGNED_BYTE,expected);reference.dispose();
    return actual.every((v,k)=>v===expected[k]);
  });
  assert.ok(exportPixelsMatch,'resized reused export matches a fresh renderer exactly');
  // Changing the image still replaces export resources on the next export.
  await page.evaluate(()=>{const c=document.createElement('canvas');c.width=800;c.height=600;c.getContext('2d').fillRect(0,0,800,600);window.nurupuru.installImage(c,'new-export.png');window.nurupuru.pauseClock();});
  await exportPNG('renderer-replaced-export');
  const replaced=await page.evaluate(()=>{const a=window.exportAudit;return {uploads:a.uploads,mipmaps:a.mipmaps,programs:a.programs,deletions:a.deletions,width:a.canvas.width,height:a.canvas.height};});
  assert.deepEqual(replaced,{uploads:2,mipmaps:1,programs:1,deletions:1,width:720,height:540});
  // A live recording must continue drawing into the same capture canvas.
  await page.evaluate(()=>{
    const a=window.exportAudit,g=a.g,draw=g.drawElements;a.draws=0;
    g.drawElements=function(...args){a.draws++;return draw.apply(this,args);};
  });
  await page.locator('[data-export-format="webm"]').click();await page.locator('#startExport').click();
  assert.ok(await page.locator('#recBadge').evaluate(el=>el.classList.contains('show')));
  await page.evaluate(()=>{
    const lab=window.nurupuru;lab.setPhysicsBackend('wasm-scalar');
    document.getElementById('quality').value='balanced';document.getElementById('quality').dispatchEvent(new Event('change'));
    window.exportAudit.draws=0;
  });
  await page.waitForTimeout(1200);
  const recording=await page.evaluate(()=>{const a=window.exportAudit;return {draws:a.draws,uploads:a.uploads,mipmaps:a.mipmaps,programs:a.programs,deletions:a.deletions};});
  assert.ok(recording.draws>0,'recording keeps drawing after backend/quality switches');
  assert.deepEqual({...recording,draws:0},{draws:0,uploads:2,mipmaps:1,programs:1,deletions:1});
  const stateBeforeStop=await page.evaluate(()=>({status:document.getElementById('recordStatus').textContent,recording:document.getElementById('recBadge').className,toast:document.getElementById('toast').textContent}));
  const videoEvent=page.waitForEvent('download',{timeout:5000});await page.locator('#startExport').click();let video;
  try{video=await videoEvent;}catch{throw Error(JSON.stringify({before:stateBeforeStop,after:await page.evaluate(()=>({status:document.getElementById('recordStatus').textContent,recording:document.getElementById('recBadge').className,toast:document.getElementById('toast').textContent}))}));}
  const videoPath=path.resolve(__dirname,'../test-results/renderer-recording.webm');await video.saveAs(videoPath);assert.ok(fs.statSync(videoPath).size>0);
  assert.deepEqual(errors,[]);
  fs.mkdirSync(path.resolve(__dirname,'../test-results'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../test-results/renderer-reuse.json'),JSON.stringify({...result,reused,replaced,exportPixelsMatch,recording},null,2));
  console.table(result.rows);console.log('PASS: exact pixels, dirty masks, smooth/nearest filtering, geometry/backend switches, retained deformation, PNG export reuse/replacement and live recording');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
