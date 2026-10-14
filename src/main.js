import { clamp, TAU } from './math.js';
import { SoftMesh } from './physics.js';
import { PHYSICS_BACKENDS, DEFAULT_BACKEND } from './physics-wasm.js';
import { GLRenderer } from './renderer.js';
import { createDemo } from './demo.js';
import { MaskHistory } from './mask-history.js';
import { DEFAULT_PARAMS, MATERIAL_PRESETS } from './settings.js';
import { readPreference, writePreference } from './preferences.js';
import { t, getLanguage, setLanguage, translateUI } from './i18n.js';
import { decodeImageFile } from './image-file.js';
import { initEditorLayout } from './editor-layout.js';
import { initLegalUI } from './legal.js';
import { writeProject, readProject } from './project-file.js';
import { initExport } from './export.js';
import { createModal } from './modal.js';
import { APP_VERSION, initAppInfo } from './app-info.js';

const $=id=>document.getElementById(id);
const appInfo=initAppInfo(t);
const stage=$('stage'), viewport=$('glcanvas'), cursor=$('brushCursor'), fileInput=$('fileInput');
const params={...DEFAULT_PARAMS,physicsBackend:DEFAULT_BACKEND};
let editorLayout=null;
let legalUI=null;
let imageCanvas=null,maskCanvas=null,mctx=null,maskHistory=null,analysis=null,mesh=null,renderer=null;
let backgroundCanvas=null,stageBackground='checker',backgroundLoad=0;
const backgroundPosition={x:0,y:0,scale:1};let panTarget='canvas';
let imageW=960,imageH=720,maskW=960,maskH=720,maskScale=1;
let demoVariant='plain',cursorVisible=readPreference('cursor-visible')!=='false',maskControlsVisible=readPreference('mask-controls-visible')!=='false';
let autoMaskVisibility=readPreference('auto-mask-visibility')!=='false';
let zoom=1,panX=0,panY=0,maskRevision=0,pendingMaskRect=null,lastMaskRect=null;
// Inertial view motion is independent of the local grab constraint.
let viewCoast=null;
let rafId=0,stageWidth=1,stageHeight=1;
let cursorRafId=0;
let needsRender=true,lastFrame=0,accum=0,simTime=0,fps=60,frameCount=0,fpsStamp=0;
// Zero-strength playback can sleep while its logical phase keeps advancing.
// Hidden pages and painting pause that phase.
let idleAutoClock=null;
const pointers=new Map();let action=null,spaceDown=false,hoverPointer=null;
// Hint dismissal lasts for this page visit, independently for each tool.
const usedTools=new Set();
const helpDialog=createModal({id:'helpModal',closeButton:'closeHelp',opener:'btnHelp',beforeOpen(){closeMaskPalette();closeDemoMenu();}});
const undoStack=[],redoStack=[];const HISTORY_LIMIT=12;
let backgroundWheelBefore=null,backgroundWheelTimer=0,backgroundScaleBefore=null;
let exportUI=null;
let previousDocument=null,documentLoad=0;
let toastTimer;
function toast(msg){const el=$('toast');el.textContent=t(msg);el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3200);}
function eventDownload(blob,filename){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);}
function baseName(){const file=$('fileLabel').textContent||'nurupuru';return file.replace(/\.[^.]+$/,'').replace(/[^\w\-ぁ-んァ-ン一-龠]/g,'_')||'nurupuru';}


function wakeIdleClock(){
  if(!idleAutoClock)return;
  const now=performance.now(),total=idleAutoClock.remainder+Math.max(0,(now-idleAutoClock.stamp)/1000);
  const ticks=Math.floor(total*120);simTime+=ticks/120;accum=total-ticks/120;
  lastFrame=now;idleAutoClock=null;
}
function requestRedraw(){wakeIdleClock();needsRender=true;if(!rafId&&!document.hidden)rafId=requestAnimationFrame(frame);}
function unionDirty(a,b){if(!a)return {...b};return {x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),x2:Math.max(a.x2,b.x2),y2:Math.max(a.y2,b.y2)};}
function dirtyMaskImage(x,y,r){const s=maskScale,rect={x:clamp((x-r)*s-3,0,maskW),y:clamp((y-r)*s-3,0,maskH),x2:clamp((x+r)*s+3,0,maskW),y2:clamp((y+r)*s+3,0,maskH)};maskHistory?.markDirty(rect);if(action?.type==='paint')action.maskRect=unionDirty(action.maskRect,rect);pendingMaskRect=unionDirty(pendingMaskRect,rect);requestRedraw();}
function dirtyEntireMask(){pendingMaskRect={x:0,y:0,x2:maskW,y2:maskH};maskHistory?.markDirty(pendingMaskRect);requestRedraw();}
function flushMask(){if(!pendingMaskRect)return;maskRevision++;lastMaskRect=pendingMaskRect;pendingMaskRect=null;}
function resizeStage(){const rect=stage.getBoundingClientRect();stageWidth=rect.width;stageHeight=rect.height;const dpr=Math.min(window.devicePixelRatio||1,2);const width=Math.max(1,Math.round(rect.width*dpr)),height=Math.max(1,Math.round(rect.height*dpr));if(viewport.width!==width||viewport.height!==height){viewport.width=width;viewport.height=height;requestRedraw();}}
function fitView(){if(!mesh)return;viewCoast=null;const w=stage.clientWidth,h=stage.clientHeight,insets=editorLayout?.viewInsets()||{top:0,bottom:0};zoom=Math.min((w-60)/imageW,(h-insets.top-insets.bottom-60)/imageH);zoom=clamp(zoom,.04,8);panX=0;panY=(insets.top-insets.bottom)/2;syncZoom();requestRedraw();}
function syncZoom(){$('zoomText').textContent=Math.round(zoom*100)+'%';showPointerCursor();}
function zoomAt(factor,x=stage.clientWidth/2,y=stage.clientHeight/2){let oldZoom=zoom;zoom=clamp(zoom*factor,.05,12);let cx=stage.clientWidth/2,cy=stage.clientHeight/2;panX=(x-cx)-(x-cx-panX)*zoom/oldZoom;panY=(y-cy)-(y-cy-panY)*zoom/oldZoom;syncZoom();requestRedraw();showPointerCursor();}
function screenToImage(x,y){return {x:(x-stage.clientWidth/2-panX)/zoom+imageW/2,y:(y-stage.clientHeight/2-panY)/zoom+imageH/2};}
function pointerScreen(ev){let r=stage.getBoundingClientRect();return {x:ev.clientX-r.left,y:ev.clientY-r.top};}
function insideImage(p){return p.x>=0&&p.y>=0&&p.x<=imageW&&p.y<=imageH;}
function brushRadius(){return params.brushSize*Math.min(imageW,imageH)/710;}
// Selecting an inspector tab never changes the active tool or playback state.
function setWorkspace(which){
  if(!['paint','motion','material'].includes(which))return;
  if(params.workspace!==which)$('inspector').scrollTop=0;
  params.workspace=which;requestRedraw();
  $('paintPanel').hidden=which!=='paint';$('motionPanel').hidden=which!=='motion';$('materialPanel').hidden=which!=='material';
  for(const el of document.querySelectorAll('[data-workspace]')){
    const active=el.dataset.workspace===which;el.classList.toggle('active',active);el.setAttribute('aria-selected',String(active));el.tabIndex=active?0:-1;
  }
}
function syncStageHint(){$('stageTip').hidden=usedTools.has(params.tool);}
function dismissToolHint(tool=params.tool){usedTools.add(tool);syncStageHint();}
function showHelp(show){
  helpDialog.show(show);
}
function syncToolSettings(mode){
  document.querySelectorAll('[data-context]').forEach(section=>{
    section.hidden=!section.dataset.context.split(' ').includes(mode);
  });
  $('paintAdvanced').hidden=mode!=='brush'&&mode!=='erase';
  $('brushSectionTitle').textContent=t(mode==='erase'?'消しゴム設定':'ブラシ設定');
  $('brushContextHint').textContent=t(mode==='erase'?'なぞった部分を動きやすさ 0 に戻します。':'なぞった部分を指定した動きやすさにします。低い値で上塗りすると固定を強められます。');
  $('brushStrengthControl').hidden=mode==='erase';
  $('tabPaint').textContent=t(mode==='grab'?'つかみ設定':mode==='move'?'移動揺れ':mode==='pan'?'画面移動':mode==='fit'?'輪郭設定':mode==='erase'?'消しゴム':'ブラシ設定');
  syncPanControls();
  editorLayout?.sync();
}
function syncToolHint(){
  const names={brush:['ブラシ','ドラッグで塗る・クリックで1回塗る'],erase:['消しゴム','ドラッグで消す・クリックで1回消す'],grab:['つかむ','塗った部分を引っぱる'],move:['移動揺れ','画面を移動して慣性でぷるぷるさせる'],fit:['輪郭フィット','画像内をクリックして選択'],pan:['移動',panTarget==='background'?'ドラッグで背景を移動':'ドラッグでキャンバスを移動']};
  $('modeName').textContent=t(names[params.tool][0]);$('modeHint').textContent=t(names[params.tool][1]);syncStageHint();
}
function isMaskTool(mode){return mode==='brush'||mode==='erase'||mode==='fit';}
function setMode(mode){
  const wasEditing=isMaskTool(params.tool),editing=isMaskTool(mode);
  params.tool=mode;
  syncToolSettings(mode);
  if(autoMaskVisibility&&wasEditing!==editing&&params.mask!==editing){params.mask=editing;syncMaskVisibility();}
  for(const el of document.querySelectorAll('[data-tool]')){
    const active=el.dataset.tool===mode;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));
  }
  syncToolHint();
  stage.style.cursor=mode==='grab'?'grab':mode==='move'||mode==='pan'?'move':'crosshair';showPointerCursor();
}
function syncMaskVisibility(){
  const el=$('maskToggle');el.classList.toggle('active',params.mask);el.setAttribute('aria-pressed',String(params.mask));
  el.setAttribute('aria-label',t(params.mask?'マスクを非表示にする':'マスクを表示する'));
  $('maskToggleText').textContent=t(params.mask?'マスク表示中':'マスク非表示');requestRedraw();
}
function toggleMask(){params.mask=!params.mask;syncMaskVisibility();}
function syncMaskColor(){
  const strength=params.maskView==='strength';
  $('maskColorDot').style.background=strength?'linear-gradient(90deg,#408cff,#ffdf51,#ff5266)':params.maskColor;
  $('maskView').value=params.maskView;$('maskSwatches').hidden=strength;$('maskLegend').hidden=!strength;
  $('maskCustomColor').value=params.maskColor.toLowerCase();
  for(const b of document.querySelectorAll('[data-mask-color]'))b.classList.toggle('active',b.dataset.maskColor.toLowerCase()===params.maskColor.toLowerCase());
  $('maskOpacityOut').textContent=params.maskOpacity+'%';
  $('maskOpacity').style.setProperty('--val',((params.maskOpacity-15)/80*100)+'%');
  requestRedraw();
}
function closeMaskPalette(){ $('maskPalette').hidden=true;$('maskColorButton').setAttribute('aria-expanded','false'); }
function toggleMaskPalette(){const hidden=!$('maskPalette').hidden; if(hidden)closeMaskPalette();else{$('maskPalette').hidden=false;$('maskColorButton').setAttribute('aria-expanded','true');}}

function pointerCursorMode(){
  if(!cursorVisible||!hoverPointer||document.hidden||pointers.size>=2||action?.type==='pinch')return null;
  const mode=(spaceDown||action?.type==='pan'||action?.type==='viewJiggle')?'pan':params.tool;
  return ['brush','erase','grab','fit'].includes(mode)?mode:null;
}
function hidePointerCursor(){
  if(cursorRafId)cancelAnimationFrame(cursorRafId);cursorRafId=0;
  if(cursor.style.display!=='none')cursor.style.display='none';
}
function showPointerCursor(){
  if(!pointerCursorMode()){hidePointerCursor();return;}
  // Cursor-only work must not wake physics or redraw the image. Every input
  // sample still paints/moves/grabs synchronously in the original handlers.
  if(!cursorRafId)cursorRafId=requestAnimationFrame(updatePointerCursor);
}
function updatePointerCursor(){
  cursorRafId=0;const mode=pointerCursorMode();if(!mode){hidePointerCursor();return;}
  const diameter=mode==='fit'?28:(mode==='grab'?params.grabRadius*Math.min(imageW,imageH)/720:brushRadius())*zoom*2;
  const size=Math.max(4,diameter)+'px',transform=`translate(${hoverPointer.x}px,${hoverPointer.y}px) translate(-50%,-50%)`;
  if(cursor.style.width!==size)cursor.style.width=size;
  if(cursor.style.height!==size)cursor.style.height=size;
  if(cursor.style.transform!==transform)cursor.style.transform=transform;
  const className='cursor-ring '+mode;if(cursor.className!==className)cursor.className=className;
  if(cursor.style.display!=='block')cursor.style.display='block';
}
function historySnapshot(){if(!mctx)return null;return maskHistory.snapshot();}
function pushHistory(shot){if(!shot)return;undoStack.push(shot);if(undoStack.length>HISTORY_LIMIT)undoStack.shift();redoStack.length=0;historyButtons();}
function saveHistory(){finishBackgroundWheel();pushHistory(historySnapshot());}
function historyButtons(){$('btnUndo').disabled=!undoStack.length&&!backgroundWheelBefore;$('btnRedo').disabled=!redoStack.length;const shots=[...undoStack,...redoStack].filter(shot=>shot?.type!=='background');if(action?.paintSnapshot)shots.push(action.paintSnapshot);maskHistory?.prune(shots);}
function restoreMask(img){const rect=maskHistory.restore(img);mesh.sampleMask(mctx,maskW,maskH,rect);if(rect)pendingMaskRect=unionDirty(pendingMaskRect,rect);requestRedraw();}
function backgroundSnapshot(){return {type:'background',position:{...backgroundPosition}};}
function finishBackgroundChange(before){if(before&&Object.keys(backgroundPosition).some(key=>before[key]!==backgroundPosition[key]))pushHistory({type:'background',position:before});}
function finishBackgroundWheel(){clearTimeout(backgroundWheelTimer);backgroundWheelTimer=0;const before=backgroundWheelBefore;backgroundWheelBefore=null;finishBackgroundChange(before);}
function forgetBackgroundHistory(){finishBackgroundWheel();for(const stack of [undoStack,redoStack])for(let i=stack.length-1;i>=0;i--)if(stack[i]?.type==='background')stack.splice(i,1);historyButtons();}
function restoreHistory(shot){if(shot?.type!=='background')restoreMask(shot);else{Object.assign(backgroundPosition,shot.position);syncPanControls();requestRedraw();}}
function undo(){finishBackgroundWheel();if(!undoStack.length)return;const shot=undoStack.pop();redoStack.push(shot?.type==='background'?backgroundSnapshot():historySnapshot());restoreHistory(shot);historyButtons();toast('元に戻しました');}
function redo(){finishBackgroundWheel();if(!redoStack.length)return;const shot=redoStack.pop();undoStack.push(shot?.type==='background'?backgroundSnapshot():historySnapshot());restoreHistory(shot);historyButtons();toast('やり直しました');}
function applyDab(x,y,erase,pressure=1){if(!insideImage({x,y})||!mctx)return;const r=brushRadius()*(params.pressure?pressure:1);
  // Opaque red stores uint8 movement, green stores painted coverage. This
  // distinguishes a visible strength-0 stroke from an erased/unpainted area.
  // Source-over onto an opaque field gives old*(1-coverage)+target*coverage.
  const target=erase?0:clamp(Math.round(params.brushStrength),0,255),coverage=erase?0:255;
  const s=maskScale,cx=x*s,cy=y*s,rad=r*s,inner=rad*(erase?.98:.8);
  mctx.save();mctx.globalAlpha=1;mctx.globalCompositeOperation='source-over';
  const grad=mctx.createRadialGradient(cx,cy,inner,cx,cy,Math.max(inner+.02,rad));
  grad.addColorStop(0,`rgba(${target},${coverage},0,1)`);grad.addColorStop(1,`rgba(${target},${coverage},0,0)`);
  mctx.fillStyle=grad;mctx.beginPath();mctx.arc(cx,cy,rad,0,TAU);mctx.fill();
  mctx.restore();dirtyMaskImage(x,y,r);
}
function dabSegment(from,to,erase,pressure){let dx=to.x-from.x,dy=to.y-from.y,dist=Math.hypot(dx,dy),spacing=Math.max(2,brushRadius()*.24),n=Math.max(1,Math.ceil(dist/spacing));for(let a=1;a<=n;a++){const f=a/n;applyDab(from.x+dx*f,from.y+dy*f,erase,pressure);}}
function startPainting(){
  if(action?.type!=='paint'||!action.pending)return;
  finishBackgroundWheel();
  action.paintSnapshot=historySnapshot();action.pending=false;
  mesh.reset();
  applyDab(action.lastImage.x,action.lastImage.y,action.erase,action.pressure);
  dismissToolHint(action.erase?'erase':'brush');
}
function finishPainting(){
  // A stationary press paints once on release, for every pointer type.
  startPainting();
  if(action?.type==='paint'&&action.paintSnapshot){
    undoStack.push(action.paintSnapshot);if(undoStack.length>HISTORY_LIMIT)undoStack.shift();
    redoStack.length=0;action.paintSnapshot=null;historyButtons();
  }
  if(mesh){mesh.sampleMask(mctx,maskW,maskH,action?.maskRect);requestRedraw();}
}
function cancelPainting(){
  if(action?.type==='paint'&&action.paintSnapshot){restoreMask(action.paintSnapshot);action.paintSnapshot=null;historyButtons();}
}
function beginPinch(){
  const pts=[...pointers.values()];
  action={type:'pinch',distance:pts.length>=2?Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y):0,
    mid:pts.length>=2?{x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2}:null};
  stage.style.cursor='grabbing';showPointerCursor();
}
function fillMask(){saveHistory();mctx.fillStyle=`rgb(${clamp(Math.round(params.brushStrength),0,255)},255,0)`;mctx.fillRect(0,0,maskW,maskH);mesh.sampleMask(mctx,maskW,maskH);dirtyEntireMask();toast(t('画像全体を動きやすさ {value} にしました',{value:params.brushStrength}));}
function clearMask(){saveHistory();mctx.fillStyle='black';mctx.fillRect(0,0,maskW,maskH);mesh.reset();mesh.sampleMask(mctx,maskW,maskH);dirtyEntireMask();toast('マスクを消去しました');}
function makeAnalysis(){const canvas=document.createElement('canvas');const s=Math.min(1,700/Math.max(imageW,imageH));canvas.width=Math.max(1,Math.round(imageW*s));canvas.height=Math.max(1,Math.round(imageH*s));const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(imageCanvas,0,0,canvas.width,canvas.height);const data=c.getImageData(0,0,canvas.width,canvas.height);
  let transp=0,total=0;for(let i=3;i<data.data.length;i+=4*19){total++;if(data.data[i]<96)transp++;}
  analysis={w:canvas.width,h:canvas.height,pixels:data.data,transparency:transp/total>.007};
}
function outlineFit(point){if(!insideImage(point))return;if(!analysis)makeAnalysis();const a=analysis,w=a.w,h=a.h,img=a.pixels;
  const px=clamp(Math.floor(point.x/imageW*w),0,w-1),py=clamp(Math.floor(point.y/imageH*h),0,h-1),seed=py*w+px;
  const base=seed*4,alpha=img[base+3];
  const fitMode=params.fitMethod==='auto'?(a.transparency?'alpha':'color'):params.fitMethod;
  const alphaGate=clamp(alpha*.72,36,185);
  if(fitMode==='alpha'&&!a.transparency){toast('画像に透明境界がありません。「色の近さ」を選択してください');return;}
  if(alpha<50){toast('透明な部分です。選択したい物体の内側をクリックしてください');return;}
  const total=w*h,visited=new Uint8Array(total),queue=new Int32Array(total),selected=new Uint8Array(total);
  const red=img[base],green=img[base+1],blue=img[base+2];
  const allowedThreshold=(10+params.contourTolerance*1.55);const t2=allowedThreshold*allowedThreshold;
  let head=0,tail=1,area=0;queue[0]=seed;visited[seed]=1;
  while(head<tail){const idx=queue[head++],off=idx*4,al=img[off+3];
    let ok=false;
    if(fitMode==='alpha')ok=al>=alphaGate;
    else{
      const dr=img[off]-red,dg=img[off+1]-green,db=img[off+2]-blue;
      // On transparent images, colour-fit remains confined to visible pixels.
      ok=al>=30&&(dr*dr*.30+dg*dg*.59+db*db*.11)<t2;
    }
    if(!ok)continue;selected[idx]=255;area++;
    if(fitMode==='color'&&area>total*.92){toast('広い範囲が選ばれています。色の許容幅を下げてください');return;}
    const x=idx%w,y=(idx-x)/w;
    if(x>0&&!visited[idx-1]){visited[idx-1]=1;queue[tail++]=idx-1;}
    if(x<w-1&&!visited[idx+1]){visited[idx+1]=1;queue[tail++]=idx+1;}
    if(y>0&&!visited[idx-w]){visited[idx-w]=1;queue[tail++]=idx-w;}
    if(y<h-1&&!visited[idx+w]){visited[idx+w]=1;queue[tail++]=idx+w;}
  }
  if(area<6){toast('輪郭を抽出できませんでした。許容幅を調整するかブラシをお試しください');return;}
  saveHistory();const c=document.createElement('canvas');c.width=w;c.height=h;const temp=c.getContext('2d');const layer=temp.createImageData(w,h);
  for(let i=0;i<total;i++){if(selected[i]){let p=i*4;layer.data[p]=255;layer.data[p+1]=255;layer.data[p+2]=255;layer.data[p+3]=255;}}
  temp.putImageData(layer,0,0);mctx.save();mctx.filter='blur(.6px)';mctx.imageSmoothingEnabled=true;mctx.drawImage(c,0,0,maskW,maskH);mctx.restore();
  mesh.sampleMask(mctx,maskW,maskH);dirtyEntireMask();dismissToolHint('fit');toast(t('{method}から {value}% の範囲を追加しました',{method:t(fitMode==='alpha'?'透過境界':'色の近さ'),value:Math.round(area/total*100)}));
}
function changeQuality(){if(!imageCanvas)return;mesh=new SoftMesh(imageW,imageH,params.quality,params.physicsBackend);mesh.sampleMask(mctx,maskW,maskH);renderer.updateMesh(mesh);exportUI?.updateMesh(mesh);
  syncMeshInfo();requestRedraw();}
function syncMeshInfo(){if(mesh)$('meshInfo').textContent=t('{value} 点 · {cols}×{rows}',{value:mesh.n.toLocaleString(getLanguage()==='ja'?'ja-JP':'en-US'),cols:mesh.cols,rows:mesh.rows});}
function setPhysicsBackend(backend){
  if(!PHYSICS_BACKENDS.includes(backend))throw Error(`Unknown physics backend: ${backend}`);
  if(mesh){
    const next=new SoftMesh(imageW,imageH,params.quality,backend);
    next.sampleMask(mctx,maskW,maskH);next.material(params);next.initVBD();
    for(const name of ['px','py','vx','vy'])next[name].set(mesh[name]);
    next.gripState=mesh.gripState;next.sweep=mesh.sweep;next.refreshElements();
    next.version++;next.buildVertices();mesh=next;renderer.updateMesh(mesh);
    exportUI?.updateMesh(mesh);
  }
  params.physicsBackend=backend;$('physicsBackend').value=backend;syncPhysicsStats();requestRedraw();
}
function exportSettings(){return exportUI.settings();}
function captureDocument(){if(!imageCanvas)return null;finishBackgroundWheel();cancelPainting();if(mesh?.gripState)mesh.endGrab();return {image:imageCanvas,mask:maskCanvas,maskHistory,mesh,name:$('fileLabel').textContent,params:{...params},background:backgroundCanvas,backgroundPosition:{...backgroundPosition},stageBackground,panTarget,view:{zoom,panX,panY},time:simTime,undo:undoStack.slice(),redo:redoStack.slice(),demo:demoVariant,exports:exportSettings()};}
function syncDocumentUI(exports){
  for(const key of ['substeps','iterations','quality','physicsBackend','fitMethod','grabFalloff','renderMode'])$(key).value=String(params[key]);$('pressure').checked=params.pressure;
  for(const selector of ['#stageBg option[value=image]','#stageBg option[value=clear]','#exportBg option[value=image]','#exportFrame option[value=background]'])document.querySelector(selector).disabled=!backgroundCanvas;
  exportUI.restoreSettings(exports);
  $('restoreDocument').disabled=!previousDocument;
  const visible=params.mask;setStageBackground(stageBackground);setMode(params.tool);params.mask=visible;setWorkspace(params.workspace);syncMaskColor();syncMeshInfo();syncZoom();applyLanguage();requestRedraw();
}
function restorePreviousDocument(){if(!previousDocument)return;const saved=previousDocument,current=captureDocument();exportUI.stopRecording();previousDocument=current;documentLoad++;backgroundLoad++;if(rafId)cancelAnimationFrame(rafId);rafId=0;action=null;pointers.clear();viewCoast=null;idleAutoClock=null;accum=0;lastFrame=0;
  imageCanvas=saved.image;maskCanvas=saved.mask;mctx=maskCanvas.getContext('2d',{willReadFrequently:true});maskHistory=saved.maskHistory;mesh=saved.mesh;imageW=imageCanvas.width;imageH=imageCanvas.height;maskW=maskCanvas.width;maskH=maskCanvas.height;maskScale=maskW/imageW;
  Object.assign(params,saved.params);backgroundCanvas=saved.background;Object.assign(backgroundPosition,saved.backgroundPosition);stageBackground=saved.stageBackground;panTarget=saved.panTarget;zoom=saved.view.zoom;panX=saved.view.panX;panY=saved.view.panY;simTime=saved.time;demoVariant=saved.demo;
  undoStack.splice(0,undoStack.length,...saved.undo);redoStack.splice(0,redoStack.length,...saved.redo);maskRevision=0;pendingMaskRect=lastMaskRect=null;analysis=null;
  renderer.updateImage(imageCanvas,maskCanvas,mesh,maskRevision);renderer.updateBackground(backgroundCanvas);exportUI.invalidateDocument();
  $('fileLabel').textContent=saved.name;$('dimensionsLabel').textContent=`${imageW} × ${imageH} px`;historyButtons();syncDocumentUI(saved.exports);toast('前の編集を復元しました');
}
function installImage(c,name,isDemo=false){
  exportUI.stopRecording();previousDocument=captureDocument();$('restoreDocument').disabled=!previousDocument;documentLoad++;
  resetBackgroundPosition();
  action=null;viewCoast=null;pointers.clear();idleAutoClock=null;accum=0;lastFrame=0;simTime=0;imageCanvas=c;imageW=c.width;imageH=c.height;const ratio=Math.min(1,(innerWidth<=700?768:1024)/Math.max(imageW,imageH));maskW=Math.max(1,Math.round(imageW*ratio));maskH=Math.max(1,Math.round(imageH*ratio));maskScale=maskW/imageW;
  maskCanvas=document.createElement('canvas');maskCanvas.width=maskW;maskCanvas.height=maskH;mctx=maskCanvas.getContext('2d',{willReadFrequently:true});
  maskCanvas.dataset.maskChannel='red';mctx.fillStyle='black';mctx.fillRect(0,0,maskW,maskH);
  maskHistory=new MaskHistory(mctx);
  if(isDemo){mctx.save();let cx=480*maskScale,cy=413*maskScale;mctx.translate(cx,cy);mctx.scale(1,.83);const r=224*maskScale;let g=mctx.createRadialGradient(0,0,r*.30,0,0,r);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.66,'rgba(255,255,255,.98)');g.addColorStop(1,'rgba(255,255,255,0)');mctx.fillStyle=g;mctx.beginPath();mctx.arc(0,0,r,0,TAU);mctx.fill();mctx.restore();}
  mesh=new SoftMesh(imageW,imageH,params.quality,params.physicsBackend);mesh.sampleMask(mctx,maskW,maskH);analysis=null;
  maskRevision=0;pendingMaskRect=null;lastMaskRect=null;undoStack.length=redoStack.length=0;historyButtons();
  params.autoPlaying=false;syncPlayButton();
  if(!renderer){renderer=new GLRenderer(viewport);}renderer.updateImage(imageCanvas,maskCanvas,mesh,maskRevision);
  exportUI.invalidateDocument();
  $('fileLabel').textContent=name;$('dimensionsLabel').textContent=`${imageW} × ${imageH} px`;
  syncMeshInfo();
  const installedGeneration=documentLoad;setTimeout(()=>{if(documentLoad!==installedGeneration||imageCanvas!==c)return;fitView();if(isDemo&&innerWidth<=550)zoomAt(1.28);},0);requestRedraw();
}
async function loadFile(file){if(!file)return;
  const job=++documentLoad;try{const {canvas,limit,resized}=await decodeImageFile(file);if(job!==documentLoad)return;installImage(canvas,file.name,false);setWorkspace('paint');
    toast(resized?t('読み込みました。負荷軽減のため長辺を{limit}px以下に縮小しました。',{limit}):t('読み込みました。動かしたい部分を塗ってください。'));
  }catch(err){toast(t('画像を読み込めませんでした: {error}',{error:err.message}));}
}
function setStageBackground(mode){
  if(!['checker','dark','white','image'].includes(mode)||mode==='image'&&!backgroundCanvas)return;
  if(mode!=='image'&&panTarget==='background')setPanTarget('canvas');
  stageBackground=mode;$('stageBg').value=mode;
  stage.classList.remove('bg-checker','bg-white','bg-dark');stage.classList.add('bg-'+(mode==='image'?'checker':mode));requestRedraw();
}
function syncPanControls(){
  for(const button of document.querySelectorAll('[data-pan-target]')){button.disabled=button.dataset.panTarget==='background'&&!backgroundCanvas;button.setAttribute('aria-pressed',String(button.dataset.panTarget===panTarget));}
  for(const button of document.querySelectorAll('[data-reset-background]'))button.disabled=!backgroundCanvas||panTarget!=='background';
  const scale=$('backgroundScale');scale.disabled=!backgroundCanvas||panTarget!=='background';scale.value=backgroundPosition.scale*100;scale.style.setProperty('--val',((+scale.value-5)/1195*100)+'%');$('backgroundScaleOut').textContent=Math.round(backgroundPosition.scale*100)+'%';
}
function setPanTarget(target){
  if(!['canvas','background'].includes(target)||target==='background'&&!backgroundCanvas)return;
  finishBackgroundWheel();panTarget=target;if(target==='background')setStageBackground('image');
  syncPanControls();syncToolHint();requestRedraw();
}
function resetBackgroundPosition(){backgroundPosition.x=backgroundPosition.y=0;backgroundPosition.scale=1;syncPanControls();requestRedraw();}
function zoomBackgroundAt(factor,x,y){
  if(!backgroundWheelBefore)backgroundWheelBefore={...backgroundPosition};clearTimeout(backgroundWheelTimer);backgroundWheelTimer=setTimeout(finishBackgroundWheel,250);
  const point=screenToImage(x,y),old=backgroundPosition.scale,next=clamp(old*factor,.05,12),ratio=next/old;
  backgroundPosition.x=point.x-imageW/2-(point.x-imageW/2-backgroundPosition.x)*ratio;
  backgroundPosition.y=point.y-imageH/2-(point.y-imageH/2-backgroundPosition.y)*ratio;
  backgroundPosition.scale=next;syncPanControls();historyButtons();requestRedraw();
}
async function loadBackgroundFile(file){
  if(!file)return;const job=++backgroundLoad;
  try{const {canvas}=await decodeImageFile(file);if(job!==backgroundLoad)return;
    forgetBackgroundHistory();backgroundCanvas=canvas;resetBackgroundPosition();renderer?.updateBackground(canvas);syncPanControls();
    for(const selector of ['#stageBg option[value=image]','#stageBg option[value=clear]','#exportBg option[value=image]','#exportFrame option[value=background]'])document.querySelector(selector).disabled=false;
    setStageBackground('image');$('exportBg').value='image';toast('背景画像を読み込みました');
  }catch(err){if(job===backgroundLoad)toast(t('画像を読み込めませんでした: {error}',{error:err.message}));}
}
function clearBackground(){
  forgetBackgroundHistory();
  setPanTarget('canvas');resetBackgroundPosition();
  backgroundLoad++;backgroundCanvas=null;renderer?.updateBackground(null);exportUI.removeBackground();
  syncPanControls();for(const selector of ['#stageBg option[value=image]','#stageBg option[value=clear]','#exportBg option[value=image]','#exportFrame option[value=background]'])document.querySelector(selector).disabled=true;
  if($('exportFrame').value==='background')$('exportFrame').value='foreground';
  if($('exportBg').value==='image')$('exportBg').value=exportUI.format==='png'?'transparent':'white';
  if(stageBackground==='image')setStageBackground('checker');else $('stageBg').value=stageBackground;
  toast('背景画像を削除しました');
}
function pointerDown(e){
  if(!mesh||exportUI.recording)return;
  if(e.button>2||e.target.closest('button,input,select,a,.mask-palette'))return;
  // Secondary-button gestures are explicit: erase in Brush, Inertia in Grab.
  const rightInertia=e.button===2&&params.tool==='grab';
  if(e.button===2&&params.tool!=='brush'&&!rightInertia)return;
  e.preventDefault();const p=pointerScreen(e);hoverPointer=p;stage.setPointerCapture?.(e.pointerId);pointers.set(e.pointerId,p);
  finishBackgroundWheel();
  if(pointers.size>=2){if(action?.type==='grab')mesh.endGrab();if(action?.type==='backgroundPan')finishBackgroundChange(action.before);cancelPainting();viewCoast=null;beginPinch();return;}
  viewCoast=null;
  if(e.button===1||spaceDown||e.altKey||params.tool==='pan'&&panTarget==='canvas'){action={type:'pan',last:p};stage.style.cursor='grabbing';return;}
  if(params.tool==='pan'&&panTarget==='background'){action={type:'backgroundPan',before:{...backgroundPosition}};stage.style.cursor='grabbing';return;}
  if(params.tool==='move'||rightInertia){
    // Move-jiggle pans the viewport (even outside the image), not the mask.
    action={type:'viewJiggle',tool:params.tool,last:p,time:performance.now(),vx:0,vy:0};
    stage.style.cursor='grabbing';showPointerCursor();return;
  }
  const img=screenToImage(p.x,p.y);if(!insideImage(img))return;
  if(params.tool==='fit'){action={type:'fitPending',point:img};return;}
  if(params.tool==='brush'||params.tool==='erase'){
    // Paint into the undisplaced source; no brush-induced physics forces.
    const erase=params.tool==='erase'||e.button===2;
    // Defer the first dab until dragging or release; pressing alone never paints.
    action={type:'paint',lastImage:img,erase,pending:true,start:p,
      dragThreshold:e.pointerType==='touch'?8:3,pressure:e.pointerType==='pen'?clamp(e.pressure,.2,1):1};
    requestRedraw();
  }
  else if(params.tool==='grab'){
    if(!mesh.beginGrab(img.x,img.y,'grab',params))return;
    action={type:'grab',lastImage:img};stage.style.cursor='grabbing';requestRedraw();
  }
}
function pointerMove(e){const p=pointerScreen(e);hoverPointer=p;const old=pointers.get(e.pointerId);if(pointers.has(e.pointerId))pointers.set(e.pointerId,p);showPointerCursor();
  if(pointers.size>=2){const pts=[...pointers.values()];let mx=(pts[0].x+pts[1].x)/2,my=(pts[0].y+pts[1].y)/2,d=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
    if(action?.type!=='pinch')action={type:'pinch',distance:d,mid:{x:mx,y:my}};
    if(action.distance>0&&d>0){const oldMid=action.mid;panX+=mx-oldMid.x;panY+=my-oldMid.y;zoomAt(d/action.distance,mx,my);if(mx!==oldMid.x||my!==oldMid.y||d!==action.distance)dismissToolHint('pan');requestRedraw();}
    action.distance=d;action.mid={x:mx,y:my};return;
  }
  if(!action||!old)return;
  if(action.type==='backgroundPan'){backgroundPosition.x+=(p.x-old.x)/zoom;backgroundPosition.y+=(p.y-old.y)/zoom;requestRedraw();return;}
  if(action.type==='pan'||action.type==='pinch'){panX+=p.x-old.x;panY+=p.y-old.y;if(p.x!==old.x||p.y!==old.y)dismissToolHint('pan');requestRedraw();return;}
  if(action.type==='viewJiggle'){
    const dx=p.x-old.x,dy=p.y-old.y;
    if(dx||dy){
      dismissToolHint(action.tool);
      panX+=dx;panY+=dy;
      const now=performance.now(),dt=clamp((now-action.time)/1000,.008,.06);
      const rawX=clamp(dx/dt,-2400,2400),rawY=clamp(dy/dt,-2400,2400);
      const a=1-Math.exp(-dt*30);
      const vx=action.vx+(rawX-action.vx)*a;
      const vy=action.vy+(rawY-action.vy)*a;
      mesh.applyViewAcceleration(vx-action.vx,vy-action.vy,zoom);
      action.vx=vx;action.vy=vy;action.time=now;
      requestRedraw();
    }
    return;
  }
  const img=screenToImage(p.x,p.y);
  if(action.type==='paint'){
    if(action.pending){if(Math.hypot(p.x-action.start.x,p.y-action.start.y)<action.dragThreshold)return;startPainting();}
    dabSegment(action.lastImage,img,action.erase,e.pointerType==='pen'?clamp(e.pressure,.2,1):1);action.lastImage=img;
  }else if(action.type==='grab'){mesh.grab(action.lastImage.x,action.lastImage.y,img.x,img.y);if(p.x!==old.x||p.y!==old.y)dismissToolHint('grab');action.lastImage=img;requestRedraw();}
}
function pointerUp(e){
  if(!pointers.has(e.pointerId))return;
  pointers.delete(e.pointerId);
  if(action?.type==='backgroundPan'){if(e.type==='pointercancel'){Object.assign(backgroundPosition,action.before);syncPanControls();}else finishBackgroundChange(action.before);}
  if(action?.type==='grab')mesh?.endGrab();
  if(action?.type==='paint'){if(e.type==='pointercancel')cancelPainting();else finishPainting();}
  if(action?.type==='fitPending'&&e.type!=='pointercancel')outlineFit(action.point);
  if(action?.type==='pinch'&&pointers.size>0){beginPinch();return;}
  if(action?.type==='viewJiggle'){
    const elapsed=(performance.now()-action.time)/1000;
    const fade=Math.exp(-Math.max(0,elapsed-.025)*17);
    const vx=action.vx*fade,vy=action.vy*fade;
    if(Math.hypot(vx,vy)>20)viewCoast={vx,vy};
    else mesh?.applyViewAcceleration(-action.vx,-action.vy,zoom);
  }
  action=null;
  if(e.pointerType==='touch')hoverPointer=null;
  showPointerCursor();
  stage.style.cursor=params.tool==='grab'?'grab':params.tool==='move'||params.tool==='pan'?'move':'crosshair';
  requestRedraw();
}
function syncPlayButton(){
  $('playIcon').textContent=params.autoPlaying?'■':'▶';
  $('playText').textContent=t(params.autoPlaying?'停止':'揺らす');
  $('btnPlay').classList.toggle('playing',params.autoPlaying);
  $('btnPlay').setAttribute('aria-pressed',String(params.autoPlaying));
  editorLayout?.sync();
  $('btnPlay').title=t(params.autoPlaying?'自動揺れを止める (P)':'自動で揺らす (P)');requestRedraw();
}
function syncPhysicsStats(){
  if(!mesh||!$('engineAdvanced').open)return;
  const d=mesh.diagnostics();
  $('physicsStats').textContent=t('計算時間  {ms} ms\n最大反復  {iterations} 回 / 上限 {limit} 回\n計算精度  {status}{error}',{ms:d.cpuMS.toFixed(2),iterations:d.solverIterations,limit:params.iterations,status:t(d.solverConverged?'目標に到達':'上限で終了'),error:d.failed?t('\nリセットしてください'):''});
}

function frame(now){
  rafId=0;
  if(!mesh||!renderer||document.hidden){lastFrame=0;return;}
  const elapsed=lastFrame?Math.min(.05,(now-lastFrame)/1000):1/120;lastFrame=now;
  if(viewCoast){
    const oldX=viewCoast.vx,oldY=viewCoast.vy;
    const decay=Math.exp(-8.5*elapsed);
    viewCoast.vx*=decay;viewCoast.vy*=decay;
    panX+=(oldX+viewCoast.vx)*.5*elapsed;
    panY+=(oldY+viewCoast.vy)*.5*elapsed;
    mesh.applyViewAcceleration(viewCoast.vx-oldX,viewCoast.vy-oldY,zoom);
    if(Math.hypot(viewCoast.vx,viewCoast.vy)<8){
      mesh.applyViewAcceleration(-viewCoast.vx,-viewCoast.vy,zoom);
      viewCoast=null;
    }
    needsRender=true;
  }
  flushMask();
  const painting=action?.type==='paint';
  const autoRequested=params.autoPlaying||exportUI.recording;
  params.driveAuto=!painting&&autoRequested&&params.intensity>0;
  const animating=!painting&&(params.driveAuto||mesh.moving||!!mesh.gripState||!!viewCoast);
  if(animating||(!painting&&autoRequested)){
    accum+=elapsed;let n=0;
    while(accum>=1/120&&n<6){if(animating)mesh.step(1/120,simTime,params);simTime+=1/120;accum-=1/120;n++;}
    if(n===6)accum=0;
    if(animating)needsRender=true;
  }else accum=0;
  const didRender=needsRender;
  if(needsRender){
    renderer.ensureMask(maskCanvas,maskRevision,lastMaskRect);
    renderer.draw(mesh,stageWidth,stageHeight,zoom,panX,panY,params.mask,stageBackground==='image'?'image':'transparent',params,backgroundPosition);
    needsRender=false;
  }
  exportUI.update(now,didRender);
  if(now-fpsStamp>700){
    fps=frameCount/(now-fpsStamp||1000)*1000;fpsStamp=now;frameCount=0;
    $('fpsLabel').textContent=animating?Math.round(fps)+' fps':t('待機');
    syncPhysicsStats();
  }
  frameCount++;
  if((!painting&&(params.driveAuto||mesh.moving||mesh.gripState||viewCoast))||exportUI.recording){
    if(!rafId)rafId=requestAnimationFrame(frame);
  }else{
    // A callback queued inside this frame (e.g. stopping a recording) still
    // needs to paint its UI change before entering the dormant clock state.
    if(!rafId){
      if(!painting&&params.autoPlaying)idleAutoClock={stamp:now,remainder:accum};
      lastFrame=0;accum=0;
    }
    $('fpsLabel').textContent=t('待機');
  }
}
// Set up accessible, progressively disclosed controls.
const sliders=['intensity','speed','driveAngle','softness','damping','areaKeep','returnSpeed','brushSize','brushStrength','contourTolerance','anchor','grabRadius','grip'];
function syncSlider(key){
  const el=$(key),out=$(key+'Out');el.value=params[key];
  el.style.setProperty('--val',((params[key]-+el.min)/(+el.max-+el.min)*100)+'%');
  out.textContent=key==='returnSpeed'?t('{value} Hz目安',{value:(.35+params[key]*.022).toFixed(2)}):key==='intensity'?params[key]+'%':key==='speed'?(params[key]/100).toFixed(2)+' Hz':key==='driveAngle'?params[key]+'°':key==='brushStrength'?params[key]+' / 255':el.value+(key==='brushSize'||key==='grabRadius'?' px':'%');
  if(key==='intensity')$('driveWarning').hidden=params.intensity<40;
  editorLayout?.sync();
}
for(const key of sliders){const el=$(key),update=()=>{params[key]=+el.value;syncSlider(key);if(key==='driveAngle')syncMotionUI();
  if(mesh&&!['brushSize','brushStrength','contourTolerance','grabRadius'].includes(key)){if(!['intensity','speed','driveAngle'].includes(key))mesh.cacheKey='';mesh.moving=true;}requestRedraw();showPointerCursor();};el.addEventListener('input',update);syncSlider(key);}


for(const b of document.querySelectorAll('[data-material]'))b.onclick=()=>{
  const values=MATERIAL_PRESETS[b.dataset.material];
  for(const [key,value] of Object.entries(values)){$(key).value=value;$(key).dispatchEvent(new Event('input'));}
  document.querySelectorAll('[data-material]').forEach(el=>el.classList.toggle('active',el===b));
};
for(const key of ['substeps','iterations','quality','physicsBackend','fitMethod','grabFalloff','renderMode'])$(key).value=String(params[key]);
$('pressure').checked=params.pressure;
for(const key of ['substeps','iterations'])$(key).addEventListener('change',e=>{params[key]=+e.target.value;if(mesh)mesh.moving=true;requestRedraw();});
$('engineAdvanced').addEventListener('toggle',syncPhysicsStats);
$('pressure').addEventListener('change',e=>{params.pressure=e.target.checked;});
$('fitMethod').addEventListener('change',e=>{params.fitMethod=e.target.value;});
$('grabFalloff').addEventListener('change',e=>{params.grabFalloff=e.target.value;requestRedraw();});
$('maskToggle').addEventListener('click',toggleMask);
$('btnHelp').onclick=()=>showHelp(true);
$('maskColorButton').addEventListener('click',toggleMaskPalette);
for(const b of document.querySelectorAll('[data-mask-color]'))b.addEventListener('click',()=>{params.maskColor=b.dataset.maskColor;syncMaskColor();});
$('maskCustomColor').addEventListener('input',e=>{params.maskColor=e.target.value;syncMaskColor();});
$('maskOpacity').addEventListener('input',e=>{params.maskOpacity=+e.target.value;syncMaskColor();});
$('maskView').addEventListener('change',e=>{params.maskView=e.target.value;syncMaskColor();});
$('autoMaskVisibility').checked=autoMaskVisibility;
$('autoMaskVisibility').addEventListener('change',e=>{autoMaskVisibility=e.target.checked;writePreference('auto-mask-visibility',String(autoMaskVisibility));});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#maskFloating,#maskPalette,#maskSheet'))closeMaskPalette();});
$('renderMode').addEventListener('change',e=>{params.renderMode=e.target.value;requestRedraw();});

document.querySelectorAll('[data-workspace]').forEach(b=>b.addEventListener('click',()=>setWorkspace(b.dataset.workspace)));
document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.tool)));
function syncMotionUI(){
  for(const button of document.querySelectorAll('[data-preset]')){
    const active=button.dataset.preset===params.preset;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
    button.querySelector('svg').style.transform=`rotate(${button.dataset.preset==='pulse'?0:params.driveAngle}deg)`;
    if(active)$('motionDescription').textContent=button.title;
  }
  const radial=params.preset==='pulse';$('driveAngle').disabled=radial;$('resetDriveAngle').disabled=radial;
  $('driveAngleHint').textContent=t(radial?'Pulseは放射状のため、角度は変わりません。':params.preset.startsWith('circle')?'Circleの開始角度を変えます。':'揺れ方の向きを回転します。0°は元の向きです。');
}
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{params.preset=b.dataset.preset;syncMotionUI();requestRedraw();}));
$('resetDriveAngle').onclick=()=>{$('driveAngle').value=0;$('driveAngle').dispatchEvent(new Event('input'));};
$('quality').addEventListener('change',e=>{params.quality=e.target.value;changeQuality();});
$('physicsBackend').addEventListener('change',e=>{
  try{setPhysicsBackend(e.target.value);}
  catch(error){$('physicsBackend').value=params.physicsBackend;toast(t('この計算方式は利用できません: {error}',{error:error.message}));}
});
function syncCursorToggle(){
  const button=$('cursorToggle'),label=t(cursorVisible?'操作範囲の円を非表示にする':'操作範囲の円を表示する');
  button.setAttribute('aria-pressed',String(cursorVisible));button.setAttribute('aria-label',label);button.title=label;
  showPointerCursor();
}
$('cursorToggle').addEventListener('click',()=>{
  cursorVisible=!cursorVisible;syncCursorToggle();
  writePreference('cursor-visible',String(cursorVisible));
});
syncCursorToggle();
function syncMaskControls(){
  const button=$('maskControlsToggle'),label=t(maskControlsVisible?'マスク操作を非表示にする':'マスク操作を表示する');
  $('maskFloating').hidden=!maskControlsVisible;
  button.setAttribute('aria-pressed',String(maskControlsVisible));button.setAttribute('aria-label',label);button.title=label;
  if(!maskControlsVisible)closeMaskPalette();
}
$('maskControlsToggle').addEventListener('click',()=>{
  maskControlsVisible=!maskControlsVisible;syncMaskControls();
  writePreference('mask-controls-visible',String(maskControlsVisible));
});
syncMaskControls();
$('theme').value=document.documentElement.dataset.theme;
$('theme').addEventListener('change',e=>{
  document.documentElement.dataset.theme=e.target.value;
  writePreference('theme',e.target.value);
});
$('stageBg').addEventListener('change',e=>{
  const choice=e.target.value;
  if(choice==='upload'){$('stageBg').value=stageBackground;$('backgroundInput').click();}
  else if(choice==='clear')clearBackground();else setStageBackground(choice);
});
$('backgroundInput').onchange=async()=>{await loadBackgroundFile($('backgroundInput').files?.[0]);$('backgroundInput').value='';};
for(const button of document.querySelectorAll('[data-pan-target]'))button.onclick=()=>setPanTarget(button.dataset.panTarget);
for(const button of document.querySelectorAll('[data-reset-background]'))button.onclick=()=>{finishBackgroundWheel();const before={...backgroundPosition};resetBackgroundPosition();finishBackgroundChange(before);};
const backgroundScale=$('backgroundScale');
backgroundScale.addEventListener('pointerdown',()=>{finishBackgroundWheel();backgroundScaleBefore={...backgroundPosition};});
backgroundScale.addEventListener('input',()=>{const before={...backgroundPosition};backgroundPosition.scale=clamp(+backgroundScale.value/100,.05,12);syncPanControls();requestRedraw();if(!backgroundScaleBefore)finishBackgroundChange(before);});
backgroundScale.addEventListener('change',()=>{finishBackgroundChange(backgroundScaleBefore);backgroundScaleBefore=null;});
backgroundScale.addEventListener('pointerup',()=>{finishBackgroundChange(backgroundScaleBefore);backgroundScaleBefore=null;});
backgroundScale.addEventListener('pointercancel',()=>{if(backgroundScaleBefore){Object.assign(backgroundPosition,backgroundScaleBefore);syncPanControls();requestRedraw();}backgroundScaleBefore=null;});
function applyLanguage(){
  $('language').value=getLanguage();translateUI();appInfo.syncLanguage();syncToolSettings(params.tool);syncToolHint();syncMaskVisibility();syncCursorToggle();syncMaskControls();syncPlayButton();syncMeshInfo();syncMotionUI();
  for(const key of sliders)syncSlider(key);syncPhysicsStats();
  exportUI.syncLanguage();
  if(!mesh?.moving&&!params.autoPlaying)$('fpsLabel').textContent=t('待機');
  legalUI?.syncLanguage();
}
$('language').addEventListener('change',e=>{setLanguage(e.target.value);applyLanguage();});
$('btnFill').onclick=fillMask;$('btnClear').onclick=clearMask;$('btnFitClear').onclick=clearMask;$('btnFitBrush').onclick=()=>setMode('brush');$('btnUndo').onclick=undo;$('btnRedo').onclick=redo;
$('btnPlay').onclick=()=>{params.autoPlaying=!params.autoPlaying;syncPlayButton();};$('btnResetMotion').onclick=()=>{mesh?.reset();requestRedraw();toast('変形だけをリセットしました');};
$('btnZoomIn').onclick=()=>zoomAt(1.25);$('btnZoomOut').onclick=()=>zoomAt(.8);$('btnFitView').onclick=fitView;$('btnZoom100').onclick=()=>{zoom=1;panX=panY=0;syncZoom();requestRedraw();};
  function loadDemo(kind=demoVariant){
  demoVariant=kind;const isOutline=kind==='outline';
  installImage(createDemo(isOutline),isOutline?'jelly-demo-outline.png':'jelly-demo.png',true);
  setWorkspace('paint');closeDemoMenu();
  document.querySelectorAll('[data-demo]').forEach(b=>b.classList.toggle('chosen',b.dataset.demo===kind));
}
const demoMenu=$('demoMenu');
// Portalling to body avoids header overflow, stacking-context, and mobile
// clipping bugs. The anchor is still the button in the toolbar.
document.body.appendChild(demoMenu);
function positionDemoMenu(){
  const rect=$('btnDemoMenu').getBoundingClientRect();
  const width=Math.min(window.innerWidth-16,240);
  const left=clamp(rect.right-width,8,Math.max(8,window.innerWidth-width-8));
  const top=Math.min(rect.bottom+8,Math.max(8,window.innerHeight-185));
  demoMenu.style.width=width+'px';demoMenu.style.left=left+'px';demoMenu.style.top=top+'px';
}
function closeDemoMenu(){demoMenu.hidden=true;$('btnDemoMenu').setAttribute('aria-expanded','false');}
$('btnDemo').onclick=()=>loadDemo();
$('btnDemoMenu').onclick=()=>{const open=demoMenu.hidden;
  if(open)positionDemoMenu();demoMenu.hidden=!open;$('btnDemoMenu').setAttribute('aria-expanded',String(open));};
document.querySelectorAll('[data-demo]').forEach(b=>b.onclick=()=>loadDemo(b.dataset.demo));
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.demo-wrap,#demoMenu'))closeDemoMenu();});
window.addEventListener('resize',()=>{if(!demoMenu.hidden)positionDemoMenu();});
$('btnUpload').onclick=()=>fileInput.click();fileInput.onchange=async()=>{await loadFile(fileInput.files?.[0]);fileInput.value='';};
stage.addEventListener('pointerdown',pointerDown);stage.addEventListener('pointermove',pointerMove);stage.addEventListener('pointerup',pointerUp);stage.addEventListener('pointercancel',pointerUp);
stage.addEventListener('pointerleave',()=>{if(!pointers.size){hoverPointer=null;hidePointerCursor();}});
stage.addEventListener('contextmenu',e=>e.preventDefault());
stage.addEventListener('selectstart',e=>e.preventDefault());
stage.addEventListener('dragstart',e=>e.preventDefault());
// Suppress mobile long-press selection/callouts while preserving canvas controls.
stage.addEventListener('touchstart',e=>{if(!e.target.closest('button,input,select,label,a,.mask-palette'))e.preventDefault();},{passive:false});
stage.addEventListener('wheel',e=>{e.preventDefault();const p=pointerScreen(e),factor=Math.exp(-e.deltaY*(e.ctrlKey?.004:.0014));
  if(params.tool==='pan'&&panTarget==='background'&&backgroundCanvas&&!spaceDown&&!e.altKey&&!exportUI.recording)zoomBackgroundAt(factor,p.x,p.y);
  else zoomAt(factor,p.x,p.y);
},{passive:false});
// Global tool shortcuts work even after touching sliders, switches or buttons.
// Only actual text-editing targets retain native typing/undo semantics.
window.addEventListener('keydown',e=>{
  const key=e.key.toLowerCase(),target=e.target;
  if(document.querySelector('dialog[open]')||(CSS.supports('selector(select:open)')&&document.querySelector('select:open')))return;
  if(helpDialog.open){helpDialog.handleKey(e);return;}
  const writing=!!target?.isContentEditable||!!target?.closest?.('[contenteditable="true"],textarea,[role="textbox"],input:is([type=text],[type=search],[type=password],[type=email],[type=url],[type=number],[type=tel])');
  if(exportUI.modal.open){exportUI.modal.handleKey(e);return;}
  if(writing||e.isComposing||e.keyCode===229)return;
  const command=e.ctrlKey||e.metaKey;
  if(command&&!e.altKey&&key==='z'){e.preventDefault();if(!e.repeat)e.shiftKey?redo():undo();return;}
  if(command&&!e.altKey&&key==='y'){e.preventDefault();if(!e.repeat)redo();return;}
  if(key===' '||e.code==='Space'){
    if(!target?.closest?.('button,summary,input,select')){e.preventDefault();spaceDown=true;showPointerCursor();}
    return;
  }
  if(e.altKey||command)return;
  if(e.repeat&&['1','2','3','b','e','g','v','f','h','m','p','0'].includes(key))return;
  const tools={b:'brush',e:'erase',g:'grab',v:'move',f:'fit',h:'pan'};
  if(key in tools){e.preventDefault();setMode(tools[key]);return;}
  if(['1','2','3'].includes(key)){e.preventDefault();editorLayout.openDetails({1:'paint',2:'motion',3:'material'}[key]);return;}
  if(key==='m'){e.preventDefault();toggleMask();return;}
  if(key==='escape'){closeMaskPalette();closeDemoMenu();return;}
  if(key==='p'){e.preventDefault();params.autoPlaying=!params.autoPlaying;syncPlayButton();return;}
  if(key==='0'){e.preventDefault();fitView();return;}
  if(key==='+'||key==='='){e.preventDefault();zoomAt(1.2);return;}
  if(key==='-'){e.preventDefault();zoomAt(1/1.2);return;}
},true);
window.addEventListener('keyup',e=>{if(e.key===' '||e.code==='Space'){spaceDown=false;showPointerCursor();}});
const settingTabs=[...document.querySelectorAll('[data-workspace]')];
settingTabs.forEach((tab,index)=>tab.addEventListener('keydown',e=>{
  let next;if(e.key==='ArrowRight')next=(index+1)%settingTabs.length;
  else if(e.key==='ArrowLeft')next=(index+settingTabs.length-1)%settingTabs.length;
  else if(e.key==='Home')next=0;else if(e.key==='End')next=settingTabs.length-1;else return;
  e.preventDefault();setWorkspace(settingTabs[next].dataset.workspace);settingTabs[next].focus();
}));
window.addEventListener('blur',()=>{finishBackgroundWheel();if(action?.type==='backgroundPan')finishBackgroundChange(action.before);if(action?.type==='grab')mesh?.endGrab();cancelPainting();viewCoast=null;spaceDown=false;pointers.clear();action=null;hoverPointer=null;showPointerCursor();});
stage.addEventListener('dragover',e=>{e.preventDefault();stage.classList.add('drag-over');});stage.addEventListener('dragleave',e=>{if(!stage.contains(e.relatedTarget))stage.classList.remove('drag-over');});
stage.addEventListener('drop',e=>{e.preventDefault();stage.classList.remove('drag-over');loadFile(e.dataTransfer?.files?.[0]);});
window.addEventListener('paste',e=>{if(document.querySelector('dialog[open]')||$('exportModal').classList.contains('open')||$('helpModal').classList.contains('open'))return;const f=[...e.clipboardData?.files||[]].find(x=>x.type.startsWith('image/'));if(f)loadFile(f);});
// Resizing the backing canvas during observer delivery can feed back into layout.
let resizeRaf=0;
new ResizeObserver(()=>{if(!resizeRaf)resizeRaf=requestAnimationFrame(()=>{resizeRaf=0;resizeStage();requestRedraw();});}).observe(stage);
exportUI=initExport({
  getState:()=>({image:imageCanvas,mask:maskCanvas,mesh,maskRevision,lastMaskRect,imageW,imageH,background:backgroundCanvas,backgroundPosition,stageBackground,params}),
  flushMask,requestRedraw,toast,download:eventDownload,baseName,syncPlayback:syncPlayButton,
  beforeOpen(){closeMaskPalette();closeDemoMenu();}
});
function closeDocumentMenu(){if($('viewSheet').open){$('viewSheet').close();$('btnViewMenu').focus();}}
$('restoreDocument').onclick=()=>{closeDocumentMenu();restorePreviousDocument();};
$('openProject').onclick=()=>{closeDocumentMenu();$('projectInput').click();};
$('saveProject').onclick=async()=>{closeDocumentMenu();finishBackgroundWheel();if(!mesh)return;$('saveProject').disabled=true;
  const state={image:imageCanvas,mask:maskCanvas,background:backgroundCanvas,name:$('fileLabel').textContent,params:{...params},backgroundPosition:{...backgroundPosition},stageBackground,panTarget,view:{zoom,panX,panY},time:simTime,pose:Object.fromEntries(['px','py','vx','vy'].map(key=>[key,[...mesh[key]]])),exportSettings:exportSettings()};
  try{eventDownload(await writeProject(state),baseName()+'.nurupuru');toast('編集データを保存しました');}catch(error){toast(t('編集データを保存できませんでした: {error}',{error:error.message}));}finally{$('saveProject').disabled=false;}
};
async function loadProjectFile(file){if(!file)return;const job=++documentLoad;
  try{const saved=await readProject(file);if(job!==documentLoad)return;
    if(!PHYSICS_BACKENDS.includes(saved.params.physicsBackend))saved.params.physicsBackend=DEFAULT_BACKEND;
    for(const key of ['substeps','iterations'])if(![...$(key).options].some(option=>+option.value===saved.params[key]))throw Error(t('編集データの形式が正しくありません'));
    for(const key of sliders){const el=$(key);if(saved.params[key]<+el.min||saved.params[key]>+el.max)throw Error(t('編集データの形式が正しくありません'));}
    saved.mask.dataset.maskChannel='red';const ctx=saved.mask.getContext('2d',{willReadFrequently:true}),next=new SoftMesh(saved.image.width,saved.image.height,saved.params.quality,saved.params.physicsBackend);next.sampleMask(ctx,saved.mask.width,saved.mask.height);
    if(saved.pose){for(const key of ['px','py','vx','vy']){if(saved.pose[key].length!==next.n)throw Error(t('編集データの形式が正しくありません'));next[key].set(saved.pose[key]);}next.oldX.set(next.px);next.oldY.set(next.py);next.version++;next.buildVertices();}
    installImage(saved.image,saved.name);backgroundLoad++;backgroundCanvas=saved.background;Object.assign(params,saved.params);params.autoPlaying=false;params.driveAuto=false;mesh=next;mesh.moving=false;maskCanvas=saved.mask;mctx=ctx;maskHistory=new MaskHistory(mctx);maskW=maskCanvas.width;maskH=maskCanvas.height;maskScale=maskW/imageW;maskRevision=0;pendingMaskRect=lastMaskRect=null;Object.assign(backgroundPosition,saved.backgroundPosition);stageBackground=saved.stageBackground;panTarget=saved.panTarget;
    // A new document's deferred Fit must not overwrite its saved camera.
    const restoreCamera=()=>{zoom=saved.view.zoom;panX=saved.view.panX;panY=saved.view.panY;simTime=saved.time;syncZoom();requestRedraw();};
    renderer.updateImage(imageCanvas,maskCanvas,mesh,maskRevision);renderer.updateBackground(backgroundCanvas);syncDocumentUI(saved.exportSettings);restoreCamera();setTimeout(()=>{if(imageCanvas===saved.image)restoreCamera();},0);toast('編集データを開きました');
  }catch(error){if(job===documentLoad)toast(t('編集データを開けませんでした: {error}',{error:error.message}));}
}
$('projectInput').onchange=async()=>{await loadProjectFile($('projectInput').files?.[0]);$('projectInput').value='';};
window.addEventListener('error',e=>{console.error(e.error||e.message);toast(t('エラー: {error}',{error:e.message||t('不明')}));});
viewport.addEventListener('webglcontextlost',e=>{e.preventDefault();toast('GPUコンテキストが失われました。再読み込みしてください。');});

document.addEventListener('visibilitychange',()=>{
  if(document.hidden){wakeIdleClock();hidePointerCursor();if(rafId)cancelAnimationFrame(rafId);rafId=0;lastFrame=0;accum=0;}
  else {requestRedraw();showPointerCursor();}
});
// Small, explicit inspection API for deterministic tests; no network calls.
window.nurupuru={
  version:APP_VERSION,
  get view(){return {panX,panY,coasting:!!viewCoast};},
  get mesh(){return mesh;},get params(){return params;},get renderer(){return renderer;},
  get image(){return imageCanvas;},get mask(){return maskCanvas;},get background(){return backgroundCanvas;},get backgroundMode(){return stageBackground;},
  get backgroundPosition(){return {...backgroundPosition,target:panTarget};},
  setMode,setWorkspace,setPhysicsBackend,loadDemo,installImage,loadBackgroundFile,setStageBackground,loadProjectFile,restorePreviousDocument,requestRedraw,
  tick(dt=1/120){wakeIdleClock();if(mesh){mesh.step(dt,simTime,params);simTime+=dt;mesh.buildVertices();requestRedraw();}},
  render(){if(mesh&&renderer){flushMask();renderer.ensureMask(maskCanvas,maskRevision,lastMaskRect);renderer.draw(mesh,stageWidth,stageHeight,zoom,panX,panY,params.mask,stageBackground==='image'?'image':'transparent',params,backgroundPosition);}},
  pauseClock(){wakeIdleClock();if(rafId)cancelAnimationFrame(rafId);rafId=0;lastFrame=0;},
  diagnostics(){return mesh?.diagnostics();},
  historyDiagnostics(){if(!maskHistory)return null;return {...maskHistory.diagnostics(undoStack.filter(shot=>shot?.type!=='background'),redoStack.filter(shot=>shot?.type!=='background'),action?.paintSnapshot),undoEntries:undoStack.length,redoEntries:redoStack.length};}
};
if(innerWidth<=700){params.quality='eco';$('quality').value='eco';}
legalUI=initLegalUI();editorLayout=initEditorLayout({params,setWorkspace,requestRedraw});
try {
  loadDemo(demoVariant);syncMaskVisibility();syncMaskColor();syncPlayButton();applyLanguage();resizeStage();requestRedraw();
} catch (error) {
  console.error(error);
  const panel=document.createElement('div');panel.id='startupError';panel.className='startup-error';panel.setAttribute('role','alert');
  const heading=document.createElement('strong');heading.textContent=t('起動できませんでした');
  const detail=document.createElement('p');detail.textContent=t(error.message);
  panel.append(heading,detail);stage.append(panel);
}
