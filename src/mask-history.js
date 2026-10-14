// Complete mask snapshots with shared, immutable tile versions. Painting only
// invalidates touched tiles; unchanged pixels are shared across history entries.
export class MaskHistory {
  constructor(ctx,tileSize=64){
    this.ctx=ctx;this.width=ctx.canvas.width;this.height=ctx.canvas.height;this.tileSize=tileSize;
    this.cols=Math.ceil(this.width/tileSize);this.rows=Math.ceil(this.height/tileSize);
    this.tiles=null;this.dirty=new Set();
  }
  tileRect(i){
    const x=(i%this.cols)*this.tileSize,y=Math.floor(i/this.cols)*this.tileSize;
    return {x,y,width:Math.min(this.tileSize,this.width-x),height:Math.min(this.tileSize,this.height-y)};
  }
  markDirty(rect){
    // Before the first snapshot, all pixels will be read in one operation.
    if(!this.tiles)return;
    const x=Math.max(0,Math.floor(rect.x)),y=Math.max(0,Math.floor(rect.y)),
      x2=Math.min(this.width,Math.ceil(rect.x2)),y2=Math.min(this.height,Math.ceil(rect.y2));
    if(x2<=x||y2<=y)return;
    const size=this.tileSize;
    for(let j=Math.floor(y/size);j<=Math.floor((y2-1)/size);j++)
      for(let i=Math.floor(x/size);i<=Math.floor((x2-1)/size);i++)this.dirty.add(j*this.cols+i);
  }
  snapshot(){
    const count=this.cols*this.rows;
    if(!this.tiles||this.dirty.size===count){
      // Whole-mask edits retain one read/buffer, shared by all tile records.
      // putImageData's dirty rectangle restores an individual tile from it.
      const pixels=this.ctx.getImageData(0,0,this.width,this.height);
      this.tiles=Array.from({length:count},(_,i)=>({...this.tileRect(i),pixels,full:true}));
    }else{
      for(const i of this.dirty){
        const rect=this.tileRect(i),pixels=this.ctx.getImageData(rect.x,rect.y,rect.width,rect.height);
        this.tiles[i]={...rect,pixels,full:false};
      }
    }
    this.dirty.clear();return this.tiles.slice();
  }
  restore(snapshot){
    let rect=null,full=true;const changed=[],pixels=snapshot[0].pixels;
    for(let i=0;i<snapshot.length;i++){
      const tile=snapshot[i];if(!tile.full||tile.pixels!==pixels)full=false;
      if(this.tiles?.[i]===snapshot[i]&&!this.dirty.has(i))continue;
      changed.push(tile);
      if(!rect)rect={x:tile.x,y:tile.y,x2:tile.x+tile.width,y2:tile.y+tile.height};
      else{rect.x=Math.min(rect.x,tile.x);rect.y=Math.min(rect.y,tile.y);rect.x2=Math.max(rect.x2,tile.x+tile.width);rect.y2=Math.max(rect.y2,tile.y+tile.height);}
    }
    if(rect&&full){
      // Whole-image versions restore in one blit, including fill/clear undo.
      this.ctx.putImageData(pixels,0,0,rect.x,rect.y,rect.x2-rect.x,rect.y2-rect.y);
    }else for(const tile of changed){
      if(tile.full)this.ctx.putImageData(tile.pixels,0,0,tile.x,tile.y,tile.width,tile.height);
      else this.ctx.putImageData(tile.pixels,tile.x,tile.y);
    }
    this.tiles=snapshot.slice();this.dirty.clear();return rect;
  }
  prune(snapshots){
    if(!this.tiles)return;
    // Don't retain an extra current-state RGBA buffer after undo/cancel. Cache
    // entries used only by the live canvas can be reread on the next snapshot.
    const retained=new Set();for(const shot of snapshots)for(const tile of shot)retained.add(tile);
    for(let i=0;i<this.tiles.length;i++)if(this.tiles[i]&&!retained.has(this.tiles[i])){
      this.tiles[i]=null;this.dirty.add(i);
    }
  }
  diagnostics(undo,redo,active){
    const buffers=new Set(),shots=[...undo,...redo];if(active)shots.push(active);if(this.tiles)shots.push(this.tiles);
    let tileReferences=0;
    for(const shot of shots)for(const tile of shot)if(tile){buffers.add(tile.pixels.data.buffer);tileReferences++;}
    let storedBytes=0;for(const buffer of buffers)storedBytes+=buffer.byteLength;
    return {undoEntries:undo.length,redoEntries:redo.length,storedBytes,buffers:buffers.size,tileReferences,dirtyTiles:this.dirty.size};
  }
}
