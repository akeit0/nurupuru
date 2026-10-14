import { t } from './i18n.js';

export async function decodeImageFile(file){
  if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error(t('PNG / JPEG / WebP の静止画像を選択してください'));
  if(file.size>45*1024*1024)throw Error(t('画像は45MB以下にしてください'));
  const bitmap=await createImageBitmap(file);
  try{
    if(bitmap.width<2||bitmap.height<2)throw Error(t('画像サイズが小さすぎます'));
    const limit=((navigator.deviceMemory&&navigator.deviceMemory<=4)||innerWidth<=700)?2048:2800;
    const ratio=Math.min(1,limit/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    return {canvas,limit,resized:ratio<1};
  }finally{bitmap.close?.();}
}
