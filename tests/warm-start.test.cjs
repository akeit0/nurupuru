const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {launchBrowser,readStandalone}=require('./helpers.cjs');

(async()=>{const browser=await launchBrowser();try{
  const page=await browser.newPage();await page.setContent(readStandalone());
  const result=await page.evaluate(()=>{
    const lab=window.nurupuru;lab.pauseClock();const Mesh=lab.mesh.constructor,rows=[];
    const arrays=['f00','f01','f10','f11','jac'];
    const decisions={accepted:0,infeasible:0,inconclusive:0};
    function inspect(m){
      const original=m.warmStartBound;
      m.warmStartBound=()=>{
        const candidateX=m.px.slice(),candidateY=m.py.slice(),cached=arrays.map(name=>m[name].slice());
        const minJ=m.stats.minJ,maxJ=m.stats.maxJ;
        m.px.set(m.oldX);m.py.set(m.oldY);
        const baseline=m.objective(true),uncachedBaseline=m.objective();
        m.px.set(candidateX);m.py.set(candidateY);const candidate=m.objective();
        const decision=original();
        if(decision>0){
          decisions.accepted++;
          if(!(Number.isFinite(candidate)&&candidate<baseline&&candidate<=uncachedBaseline+1e-12))throw Error('Warm bound accepted a non-descending exact objective');
          const acceptedCaches=arrays.map(name=>m[name].slice());m.refreshElements();
          for(let i=0;i<arrays.length;i++)for(let e=0;e<m.nt;e++)if(m[arrays[i]][e]!==acceptedCaches[i][e])throw Error('Accepted candidate caches are not exact');
        }else{
          if(decision<0){decisions.infeasible++;if(candidate!==Infinity)throw Error('Feasibility rejection differs from exact objective');}
          else decisions.inconclusive++;
          for(let i=0;i<arrays.length;i++)for(let e=0;e<m.nt;e++)if(m[arrays[i]][e]!==cached[i][e])throw Error('Failed bound overwrote baseline caches');
          if(m.stats.minJ!==minJ||m.stats.maxJ!==maxJ)throw Error('Failed bound changed Jacobian diagnostics');
        }
        return decision;
      };
    }
    for(const quality of ['eco','fine'])for(const scenario of ['release','grab80','grab','drive']){
      const p={...lab.params,softness:scenario==='drive'?0:scenario==='grab80'?35:68,
        iterations:scenario==='grab80'?2:4,substeps:scenario==='grab80'?2:3,driveAuto:scenario==='drive',preset:'shake',intensity:40};
      const meshes=[new Mesh(960,720,quality,'wasm-scalar'),new Mesh(960,720,quality,'wasm-scalar')];
      for(const m of meshes){
        if(scenario.startsWith('grab')){m.sampleMask(lab.mask.getContext('2d'),lab.mask.width,lab.mask.height);if(!m.beginGrab(480,413,'grab',p))throw Error('Cannot start warm-start grab');}
        else{m.weight.fill(1);for(let k=0;k<m.n;k++)if(m.invMass[k])m.px[k]+=40/720*Math.exp(-((m.X[k]-2/3)**2+(m.Y[k]-.5)**2)/(2*.14**2));}
        m.material(p);m.initVBD();
      }
      inspect(meshes[0]);meshes[1].warmStartBound=null;
      let errorPX=0,accepted=0,rejected=0;
      for(let step=0;step<80;step++){
        if(step===25){p.areaKeep=83;for(const m of meshes)m.cacheKey='';}
        for(const m of meshes){
          if(scenario.startsWith('grab')&&step<40)m.grab(480,413,480+(scenario==='grab80'?80:600)*Math.min(1,(step+1)/12),413);
          if(scenario.startsWith('grab')&&step===40)m.endGrab();
          const warmStart=m.warmStart;
          m.warmStart=function(h){const answer=warmStart.call(this,h);if(this===meshes[0])answer?accepted++:rejected++;return answer;};
          m.step(1/120,step/120,p);m.warmStart=warmStart;
          if(m.stats.failed||m.stats.folds||!(m.stats.minJ>1e-9))throw Error('Invalid warm-start state');
        }
        for(const field of ['px','py','vx','vy'])for(let k=0;k<meshes[0].n;k++)errorPX=Math.max(errorPX,720*Math.abs(meshes[0][field][k]-meshes[1][field][k]));
        for(const field of ['solverIterations','solverConverged','solverLimitHits','solverResidual','solverTolerance','lineSearch','logSkipped','logEvaluated'])
          if(meshes[0].stats[field]!==meshes[1].stats[field])throw Error(`Warm start changed ${field} at ${quality}/${scenario}/${step}`);
      }
      if(errorPX!==0)throw Error(`Warm-start motion/velocity differs: ${errorPX}`);
      rows.push({quality,scenario,errorPX,accepted,rejected,attempts:meshes[0].stats.warmBoundAttempts,
        boundAccepted:meshes[0].stats.warmBoundAccepted,boundRejected:meshes[0].stats.warmBoundRejected,exactChecks:meshes[0].stats.warmObjectiveChecks});
    }
    // Deliberately inconclusive states exercise lazy exact-baseline evaluation,
    // second-trial fallback and complete rejected-candidate restoration.
    for(const [w,h] of [[720,720],[4096,200],[200,4096]]){
      const meshes=[new Mesh(w,h,'eco','wasm-scalar'),new Mesh(w,h,'eco','wasm-scalar')];
      for(const m of meshes){m.weight.fill(1);m.material(lab.params);m.initVBD();m.oldX.set(m.px);m.oldY.set(m.py);m.prepareTargets(1/360,0,{...lab.params,driveAuto:false});m.residual();}
      inspect(meshes[0]);meshes[1].warmStartBound=null;
      const k=meshes[0].cols+2;
      meshes[0].px[k]+=.0001;
      if(meshes[0].warmStartBound()!==0)throw Error('Uphill candidate should use exact fallback');
      meshes[0].px.set(meshes[0].oldX);meshes[0].py.set(meshes[0].oldY);
      for(const m of meshes){m.gradientX.fill(0);m.gradientY.fill(0);m.gradientX[k]=.0001;}
      const answers=meshes.map(m=>m.warmStart(1/360));
      if(answers.some(Boolean)||meshes[0].stats.warmObjectiveChecks!==3)throw Error('Expected both exact trials to reject');
      for(const m of meshes){
        if(m.px.some((v,i)=>v!==m.oldX[i])||m.py.some((v,i)=>v!==m.oldY[i]))throw Error('Rejected candidates were not restored');
        const before=arrays.map(name=>m[name].slice());m.refreshElements();
        for(let i=0;i<arrays.length;i++)if(m[arrays[i]].some((v,e)=>v!==before[i][e]))throw Error('Restored caches differ');
      }
    }
    if(!decisions.accepted||!decisions.infeasible||!decisions.inconclusive)throw Error('Missing bound decision coverage');
    return {rows,decisions};
  });
  assert.ok(result.rows.every(row=>row.errorPX===0));
  fs.mkdirSync(path.resolve(__dirname,'../test-results'),{recursive:true});
  fs.writeFileSync(path.resolve(__dirname,'../test-results/warm-start-accuracy.json'),JSON.stringify(result,null,2));
  console.table(result.rows);console.log(result.decisions);
  console.log('PASS: exact energy descent, feasibility rejection, cache preservation/restoration, exact fallback, shape limits, material changes and unchanged default-backend trajectories');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
