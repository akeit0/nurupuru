const {spawnSync}=require('node:child_process');
const path=require('node:path');
const files=[
  "backends.test.cjs",
  "background-position.test.cjs",
  "background.test.cjs",
  "build.test.cjs",
  "editor-features.test.cjs",
  "layout.test.cjs",
  "legal.test.cjs",
  "mask-sampling.test.cjs",
  "renderer.test.cjs",
  "solver.test.cjs",
  "ui.test.cjs",
  "warm-start.test.cjs",
  "workflow.test.cjs"
];
for(const file of files){console.log('Running '+file);const result=spawnSync(process.execPath,[path.join(__dirname,file)],{stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);}
