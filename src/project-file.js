import { DEFAULT_PARAMS } from './settings.js';
import { t } from './i18n.js';

const choices={workspace:['paint','motion','material'],tool:['brush','erase','fit','grab','move','pan'],maskView:['strength','single'],renderMode:['smooth','nearest'],grabFalloff:['linear','quadratic','gaussian'],fitMethod:['auto','alpha','color'],quality:['eco','balanced','fine'],preset:['circle','circle-reverse','sway','bounce','pulse','shake']};
const limits={brushSize:[6,160],brushStrength:[0,255],softness:[0,100],areaKeep:[0,100],returnSpeed:[0,100],damping:[0,100],anchor:[0,100],grip:[0,100],grabRadius:[35,300],substeps:[2,5],iterations:[2,8],intensity:[0,100],speed:[1,1000],driveAngle:[-180,180],contourTolerance:[5,100],maskOpacity:[15,95]};
const invalid=()=>new Error(t('編集データの形式が正しくありません'));
const number=(value,min,max,fallback)=>{if(value===undefined)return fallback;if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw invalid();return value;};
function settings(raw={}){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw invalid();
  const result={...DEFAULT_PARAMS};
  for(const key of Object.keys(result)){
    const value=raw[key];if(value===undefined)continue;
    if(limits[key])result[key]=number(value,...limits[key],result[key]);
    else if(choices[key]){if(!choices[key].includes(value))throw invalid();result[key]=value;}
    else if(key==='maskColor'){if(typeof value!=='string'||!/^#[\da-f]{6}$/i.test(value))throw invalid();result[key]=value;}
    else if(key==='physicsBackend'){if(typeof value!=='string'||value.length>64)throw invalid();result[key]=value;}
    else if(typeof value!==typeof result[key])throw invalid();else result[key]=value;
  }
  return result;
}
async function png(data,maxSize){
  if(typeof data!=='string'||data.length>64*1024*1024||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(data))throw invalid();
  const encoded=data.slice(22),head=Uint8Array.from(atob(encoded.slice(0,44)),c=>c.charCodeAt(0));
  if(head.length<24||[137,80,78,71,13,10,26,10].some((n,i)=>head[i]!==n)||String.fromCharCode(...head.slice(12,16))!=='IHDR')throw invalid();
  const v=new DataView(head.buffer),w=v.getUint32(16),h=v.getUint32(20);if(w<1||h<1||w>maxSize||h>maxSize)throw invalid();
  const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],{type:'image/png'}));
  try{if(bitmap.width!==w||bitmap.height!==h)throw invalid();const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(bitmap,0,0);return canvas;}finally{bitmap.close();}
}
function encode(canvas){if(!canvas)return Promise.resolve(null);return new Promise((resolve,reject)=>canvas.toBlob(blob=>{if(!blob){reject(invalid());return;}const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);},'image/png'));}
export async function writeProject(state){
  const [foreground,mask,background]=await Promise.all([encode(state.image),encode(state.mask),encode(state.background)]);
  return new Blob([JSON.stringify({format:'nurupuru-project',version:1,name:state.name,foreground,mask,background,params:state.params,backgroundPosition:state.backgroundPosition,stageBackground:state.stageBackground,panTarget:state.panTarget,view:state.view,time:state.time,pose:state.pose,exportSettings:state.exportSettings})],{type:'application/json'});
}
export async function readProject(file){
  if(file.size>128*1024*1024)throw new Error(t('編集データは128MB以下にしてください'));
  const raw=JSON.parse(await file.text());if(raw?.format!=='nurupuru-project'||raw.version!==1)throw invalid();
  const params=settings(raw.params),p=raw.backgroundPosition||{},view=raw.view||{},pose=raw.pose;
  if(pose)for(const key of ['px','py','vx','vy'])if(!Array.isArray(pose[key])||pose[key].length>12321||pose[key].some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1e6))throw invalid();
  const position={x:number(p.x,-1e6,1e6,0),y:number(p.y,-1e6,1e6,0),scale:number(p.scale,.05,12,1)};
  const camera={zoom:number(view.zoom,.04,12,1),panX:number(view.panX,-1e6,1e6,0),panY:number(view.panY,-1e6,1e6,0)};
  const image=await png(raw.foreground,2800),mask=await png(raw.mask,1024),background=raw.background?await png(raw.background,2800):null;
  if(mask.width>image.width||mask.height>image.height||Math.abs(mask.width*image.height-mask.height*image.width)>image.width+image.height)throw invalid();
  if(!['checker','dark','white','image'].includes(raw.stageBackground)||!['canvas','background'].includes(raw.panTarget))throw invalid();
  return {image,mask,background,name:typeof raw.name==='string'?raw.name.slice(0,256):'project.png',params,backgroundPosition:position,view:camera,time:number(raw.time,0,1e9,0),pose,stageBackground:raw.stageBackground==='image'&&!background?'checker':raw.stageBackground,panTarget:background?raw.panTarget:'canvas',exportSettings:raw.exportSettings||{}};
}
