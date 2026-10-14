const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launchBrowser, appUrl, readStandalone, collectBrowserErrors } = require('./helpers.cjs');

(async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const errors = [];collectBrowserErrors(page, errors);
    await page.setContent(readStandalone());
    const checks = await page.evaluate(() => {
      const lab = window.nurupuru;lab.pauseClock();
      const Mesh = lab.mesh.constructor,p = { ...lab.params, driveAuto: false, autoPlaying: false };
      const make = (quality = 'eco') => {
        const m = new Mesh(960, 720, quality);m.weight.fill(1);m.material(p);return m;
      };
      const masses = [];
      for (const quality of ['eco', 'balanced', 'fine']) {
        const m = make(quality);
        for (let k = 0; k < m.n; k++) { m.px[k] += 20 / m.scale; }
        m.initVBD();
        for (let k = 0; k < m.n; k++) {
          m.quadK[k] = m.mass[k] * m.omega ** 2;m.targetX[k] = m.X[k];m.targetY[k] = m.Y[k];
        }
        masses.push({ residual: m.residual(), expected: 20 * m.omega ** 2 });
      }
      const m = make();
      for (let k = 0; k < m.n; k++) if (m.invMass[k]) {
        const r2 = (m.X[k] - 2 / 3) ** 2 + (m.Y[k] - .5) ** 2;
        m.px[k] += .025 * Math.exp(-r2 / .04);
      }
      m.initVBD();m.oldX.set(m.px);m.oldY.set(m.py);m.prepareTargets(1 / 360, .1, p);m.residual();
      const derivativeErrors = [];
      const node = Math.floor(m.rows / 2) * (m.cols + 1) + Math.floor(m.cols / 2);
      for (const k of [node, node + 3, node + m.cols + 1]) for (const axis of ['px', 'py']) {
        const positions = m[axis],analytic = axis === 'px' ? m.gradientX[k] : m.gradientY[k];
        const original = positions[k],epsilon = 1e-6;
        positions[k] = original + epsilon;const plus = m.objective();
        positions[k] = original - epsilon;const minus = m.objective();positions[k] = original;
        derivativeErrors.push(Math.abs((plus - minus) / (2 * epsilon) - analytic));
      }
      const cachedEnergyError = Math.abs(m.objective(true) - m.objective());
      const beforeEnergy = m.objective();const warmAccepted = m.warmStart(1 / 360);
      const afterEnergy = m.objective(),minimumJacobian = Math.min(...m.jac);
      const stressed = [];
      for (const [softness, areaKeep, radius] of [[0, 100, 35], [90, 40, 140]]) {
        lab.params.grabRadius = radius;
        const s = make(), settings = { ...p, softness, areaKeep, grip: 100 };
        if (!s.beginGrab(480, 360, 'grab', lab.params)) throw Error('Cannot begin stress grab');
        const fixedBefore = [...s.px].filter((_, k) => !s.invMass[k]);
        for (let step = 0; step < 24; step++) {
          s.grab(480, 360, 480 + 160 * (step + 1) / 24, 400);s.step(1 / 120, step / 120, settings);
        }
        s.endGrab();for (let step = 0; step < 48; step++) s.step(1 / 120, .2 + step / 120, settings);
        const fixedAfter = [...s.px].filter((_, k) => !s.invMass[k]);
        stressed.push({ ...s.diagnostics(), fixedUnchanged: fixedBefore.every((x, z) => x === fixedAfter[z]) });
      }
      lab.params.grabRadius = p.grabRadius;
      const blockedCases = [];
      for (const limit of [2, 4, 6, 8]) {
        const blocked = make();
        for (let k = 0; k < blocked.n; k++) if (blocked.invMass[k]) blocked.px[k] += .001 * Math.sin(blocked.X[k] * 3) * Math.sin(blocked.Y[k] * Math.PI);
        blocked.initVBD();blocked.warmStart = () => false;blocked.sweepVertices = () => {};
        blocked.step(1 / 120, 0, { ...p, iterations: limit });blockedCases.push({ limit, ...blocked.diagnostics() });
      }
      const sweepDescent=[];
      for(const backend of ['js','wasm-scalar'])for(const softness of [0,68,90]){
        const s=new Mesh(960,720,'eco',backend);s.weight.fill(1);
        const settings={...p,softness,areaKeep:83,driveAuto:true,preset:'shake',intensity:40};s.material(settings);
        for(let k=0;k<s.n;k++)if(s.invMass[k]){
          const envelope=Math.sin(Math.PI*s.X[k]*.75)*Math.sin(Math.PI*s.Y[k]);
          s.px[k]+=.035*envelope;s.py[k]-=.02*envelope;
        }
        s.initVBD();s.oldX.set(s.px);s.oldY.set(s.py);s.prepareTargets(1/360,.15,settings);
        for(let iter=0;iter<4;iter++){
          const before=s.objective();s.sweepVertices(iter&1);const after=s.objective();
          sweepDescent.push({backend,softness,before,after,logsSkipped:s.stats.logSkipped,
            cacheError:Math.abs(after-s.objective(true)),minJ:Math.min(...s.jac),failed:s.stats.failed});
        }
      }
      return { masses, derivativeErrors, cachedEnergyError, warmAccepted, beforeEnergy, afterEnergy, minimumJacobian, stressed, blockedCases, sweepDescent };
    });
    for (const { residual, expected } of checks.masses) assert.ok(Math.abs(residual / expected - 1) < 1e-7, 'mass-normalized residual has the same physical units at all mesh densities');
    for (const error of checks.derivativeErrors) assert.ok(error < 1e-6, 'assembled global gradient agrees with finite-difference objective gradient');
    assert.ok(checks.cachedEnergyError < 1e-10, 'cached deformation gives the same objective');
    assert.equal(checks.warmAccepted, true);assert.ok(checks.afterEnergy < checks.beforeEnergy);assert.ok(checks.minimumJacobian > 1e-9);
    for (const row of checks.stressed) {
      assert.equal(row.folds, 0);assert.equal(row.failed, false);assert.equal(row.fixedUnchanged, true);
      if (row.solverResidual > row.solverTolerance) assert.equal(row.solverConverged, false, 'unconverged results are reported honestly');
    }
    for (const blocked of checks.blockedCases) {
      assert.equal(blocked.solverConverged, false);assert.equal(blocked.solverIterations, blocked.limit);assert.ok(blocked.solverLimitHits > 0);
    }
    for(const row of checks.sweepDescent){
      assert.equal(row.failed,false);assert.ok(row.minJ>1e-9);
      assert.ok(row.after<=row.before+1e-12,'optimized sweep decreases the independently evaluated logarithmic objective');
      assert.ok(row.cacheError<1e-9,'optimized sweeps keep triangle caches consistent');
      assert.ok(row.logsSkipped>0,'exercise conservative bound acceptance in every backend/material');
    }
    assert.deepEqual(errors, []);
    console.log('PASS: residual units, independent gradient check, cached objective, descending feasible initialization, hard/soft grab stability, fixed vertices, iteration-limit diagnostics');
    console.log('Stress limit hits:', checks.stressed.map(row => row.solverLimitHits).join(', '));
  } finally { await browser.close(); }
})().catch(error => { console.error(error);process.exitCode = 1; });
