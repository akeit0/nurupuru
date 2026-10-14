const assert=require('node:assert/strict');
const {launchBrowser,appUrl,collectBrowserErrors}=require('./helpers.cjs');
const {fullSample}=require('./mask-sampling-oracle.cjs');

(async()=>{
  const browser=await launchBrowser(),errors=[];
  try{
    const page=await browser.newPage();collectBrowserErrors(page,errors);await page.goto(appUrl());
    const result=await page.evaluate(oracle=>{
      const lab=window.nurupuru;lab.pauseClock();const full=(0,eval)(`(${oracle})`),Mesh=lab.mesh.constructor;
      let checks=0,traces=0,seed=17;
      const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      const compare=(a,b,label)=>{
        for(let k=0;k<a.n;k++)if(a.weight[k]!==b.weight[k])throw Error(`${label}: weight ${k} ${a.weight[k]} != ${b.weight[k]}`);
        for(const key of ['maskCenterX','maskCenterY','cacheKey','moving','quiet'])if(a[key]!==b[key])throw Error(`${label}: ${key} differs`);
        checks++;
      };
      for(const backend of ['js','wasm-scalar'])for(const quality of ['eco','fine'])
      for(const [width,height] of [[1024,1024],[37,19],[1,57],[61,1],[1,1]])for(const channel of ['red','alpha']){
        let c=document.createElement('canvas');c.width=width;c.height=height;c.dataset.maskChannel=channel;
        let ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='rgba(53,17,199,.6)';ctx.fillRect(0,0,width,height);
        const a=new Mesh(900,700,quality,backend),b=new Mesh(900,700,quality,backend);
        const p={...lab.params,intensity:12.5,driveAuto:true,preset:'shake'};
        a.material(p);b.material(p);a.initVBD();b.initVBD();
        full.call(a,ctx,width,height);b.sampleMask(ctx,width,height,{x:0,y:0,x2:1,y2:1});compare(a,b,'first partial request');
        for(let edit=0;edit<24;edit++){
          // Exercise all corners, single pixels, fractional/clipped dirty bounds,
          // overlap, context/channel invalidation and explicit full refreshes.
          const x=edit<4?(edit&1?width-1:0):Math.floor(random()*width);
          const y=edit<4?(edit&2?height-1:0):Math.floor(random()*height);
          const w=Math.min(width-x,1+Math.floor(random()*32)),h=Math.min(height-y,1+Math.floor(random()*32));
          const pixels=ctx.createImageData(w,h);
          for(let i=0;i<pixels.data.length;i++)pixels.data[i]=Math.floor(random()*256);
          ctx.putImageData(pixels,x,y);
          const rect={x:x?x+.1:-.4,y:y?y+.1:-.4,x2:x+w-.1,y2:y+h-.1};
          if(edit===8){const copy=document.createElement('canvas');copy.width=width;copy.height=height;copy.dataset.maskChannel=channel;copy.getContext('2d',{willReadFrequently:true}).drawImage(c,0,0);c=copy;ctx=c.getContext('2d',{willReadFrequently:true});}
          if(edit===16)c.dataset.maskChannel=c.dataset.maskChannel==='red'?'alpha':'red';
          full.call(a,ctx,width,height);b.sampleMask(ctx,width,height,edit===12?null:rect);compare(a,b,`${backend}/${quality}/${width}x${height}/${channel}/${edit}`);
        }
        full.call(a,ctx,width,height);b.sampleMask(ctx,width,height,{x:3,y:2,x2:3,y2:2});compare(a,b,'empty update');
        // Resize the same context: a partial request must initialize all pixels.
        c.width=width+1;ctx.fillStyle='#bb408c';ctx.fillRect(0,0,width+1,height);
        full.call(a,ctx,width+1,height);b.sampleMask(ctx,width+1,height,{x:0,y:0,x2:1,y2:1});compare(a,b,'same-context resize');
        if(width===1024){
          for(let tick=0;tick<30;tick++){
            a.step(1/120,tick/120,p);b.step(1/120,tick/120,p);
            for(const key of ['px','py','vx','vy'])for(let k=0;k<a.n;k++)if(a[key][k]!==b[key][k])throw Error(`${backend} motion ${key}/${tick}/${k} differs`);
            if(a.energy!==b.energy||a.quiet!==b.quiet)throw Error('motion decisions differ');
          }
          traces++;
        }
      }
      return {checks,traces};
    },fullSample.toString());
    assert.deepEqual(errors,[]);assert.equal(result.checks,1080);assert.equal(result.traces,8);
    console.log(`PASS: ${result.checks} exact mask/centre cases and ${result.traces} exact 30-tick JS/WASM motion traces`);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
