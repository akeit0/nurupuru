const assert=require('node:assert/strict');
const {launchBrowser,appUrl,collectBrowserErrors}=require('./helpers.cjs');

(async()=>{const browser=await launchBrowser(),errors=[];try{
  const page=await browser.newPage();collectBrowserErrors(page,errors);await page.goto(appUrl());
  await page.waitForFunction(()=>window.nurupuru?.mesh);
  assert.deepEqual(await page.locator('#physicsBackend option').evaluateAll(options=>options.map(option=>option.value)),['wasm-scalar','js']);
  assert.equal(await page.locator('#physicsBackend').inputValue(),'wasm-scalar');
  const rows=await page.evaluate(()=>{
    const lab=nurupuru;lab.pauseClock();const Mesh=lab.mesh.constructor,rows=[];
    for(const quality of ['eco','fine'])for(const preset of ['circle','circle-reverse','sway','bounce','pulse','shake']){
      const meshes=['js','wasm-scalar'].map(backend=>new Mesh(960,720,quality,backend));
      const p={...lab.params,preset,driveAuto:true,driveAngle:35,intensity:12.5};
      for(const m of meshes)m.sampleMask(lab.mask.getContext('2d'),lab.mask.width,lab.mask.height);
      let position=0,velocity=0;
      for(let tick=0;tick<36;tick++){
        for(const m of meshes){
          if(tick===8&&!m.beginGrab(480,413,'grab',p))throw Error('Cannot start grab');
          if(tick>=8&&tick<20)m.grab(480,413,480-150*(tick-7)/12,413+100*(tick-7)/12);
          if(tick===20)m.endGrab();
          m.step(1/120,tick/120,p);
          if(m.stats.failed||m.stats.folds||m.px.some(x=>!Number.isFinite(x)))throw Error('Invalid physics state');
        }
        for(let k=0;k<meshes[0].n;k++){
          position=Math.max(position,720*Math.abs(meshes[0].px[k]-meshes[1].px[k]),720*Math.abs(meshes[0].py[k]-meshes[1].py[k]));
          velocity=Math.max(velocity,720*Math.abs(meshes[0].vx[k]-meshes[1].vx[k]),720*Math.abs(meshes[0].vy[k]-meshes[1].vy[k]));
        }
      }
      const isolated=new Mesh(960,720,quality,'wasm-scalar');isolated.step(1/120,0,p);
      const saved=meshes[1].px.slice();isolated.reset();
      if(saved.some((x,k)=>x!==meshes[1].px[k]))throw Error('Shared mutable WASM memory');
      rows.push({quality,preset,position,velocity});
    }
    return rows;
  });
  for(const row of rows){assert.ok(row.position<1e-5,JSON.stringify(row));assert.ok(row.velocity<1e-3,JSON.stringify(row));}
  for(const unavailable of ['missing','compile','instance']){
    const fallback=await browser.newPage();collectBrowserErrors(fallback,errors);
    await fallback.addInitScript(unavailable=>{
      if(unavailable==='missing')window.WebAssembly=undefined;
      else if(unavailable==='compile')WebAssembly.Module=function(){throw Error('Unavailable');};
      else WebAssembly.Instance=function(){throw Error('Unavailable');};
    },unavailable);
    await fallback.goto(appUrl());await fallback.waitForFunction(()=>nurupuru?.mesh);
    assert.equal(await fallback.evaluate(()=>{nurupuru.tick();nurupuru.pauseClock();return nurupuru.mesh.backend;}),'js');
    await fallback.close();
  }
  assert.equal(await page.evaluate(()=>{try{nurupuru.setPhysicsBackend('unsupported');return false;}catch{return true;}}),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: JS/WASM motion, angles, grabs, release, memory isolation and fallback');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
