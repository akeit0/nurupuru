// Full-image quadrature oracle for regional mask sampling.
// Keep the double sample before its Float32 weight store for the centre sums.
function fullSample(ctx,mw,mh){
  const data=ctx.getImageData(0,0,mw,mh).data;
  const channel=ctx.canvas.dataset?.maskChannel==='red'?0:3;
  const rx=mw/this.cols*.24,ry=mh/this.rows*.24;
  const at=(x,y)=>{
    x=Math.min(mw-1,Math.max(0,x));y=Math.min(mh-1,Math.max(0,y));
    const ix=Math.floor(x),iy=Math.floor(y),jx=Math.min(mw-1,ix+1),jy=Math.min(mh-1,iy+1),u=x-ix,v=y-iy;
    return ((data[(iy*mw+ix)*4+channel]*(1-u)+data[(iy*mw+jx)*4+channel]*u)*(1-v)
          +(data[(jy*mw+ix)*4+channel]*(1-u)+data[(jy*mw+jx)*4+channel]*u)*v)/255;
  };
  let sum=0,cx=0,cy=0;
  for(let k=0;k<this.n;k++){
    const x=this.uv[2*k]*(mw-1),y=this.uv[k*2+1]*(mh-1);
    const v=(at(x-rx,y-ry)+at(x+rx,y-ry)+at(x-rx,y+ry)+at(x+rx,y+ry))*.25;
    this.weight[k]=v;sum+=v;cx+=v*this.x0[k];cy+=v*this.y0[k];
  }
  this.maskCenterX=sum?cx/sum:this.w/2;this.maskCenterY=sum?cy/sum:this.h/2;
  this.cacheKey='';this.moving=true;this.quiet=0;
}
module.exports={fullSample};
