import { TAU } from './math.js';

export function createDemo(outline=false){const c=document.createElement('canvas');c.width=960;c.height=720;const x=c.getContext('2d');
  x.clearRect(0,0,c.width,c.height);
  // A transparent-background demo makes deformation easy to evaluate.
  x.save(); // No baked cast shadow: alpha-fit should follow the actual silhouette.
  const gradient=x.createLinearGradient(260,220,680,610);gradient.addColorStop(0,'#ddc4ff');gradient.addColorStop(.38,'#b397ff');gradient.addColorStop(.8,'#8774dc');gradient.addColorStop(1,'#6659ba');
  const path=new Path2D();path.moveTo(483,194);path.bezierCurveTo(570,183,642,255,671,326);path.bezierCurveTo(715,418,689,509,635,558);path.bezierCurveTo(591,603,392,607,339,558);path.bezierCurveTo(255,501,253,400,303,305);path.bezierCurveTo(340,224,405,193,483,194);path.closePath();
  x.fillStyle=gradient;x.fill(path);x.restore();
  if(outline){x.save();x.strokeStyle='#30253f';x.lineWidth=11;x.lineJoin='round';x.stroke(path);x.restore();}
  x.save();x.clip(path);const light=x.createRadialGradient(381,294,5,454,394,310);light.addColorStop(0,'#ffffffa8');light.addColorStop(.52,'#ffffff17');light.addColorStop(1,'#ffffff00');x.fillStyle=light;x.fillRect(240,180,500,440);
  x.strokeStyle='#ffffff70';x.lineWidth=9;x.lineCap='round';x.beginPath();x.moveTo(327,383);x.bezierCurveTo(333,295,401,238,472,237);x.stroke();
  x.fillStyle='#ffffff25';x.beginPath();x.ellipse(501,538,146,34,-.02,0,TAU);x.fill();x.restore();
  x.fillStyle='#35304f';x.beginPath();x.ellipse(416,430,13,19,-.13,0,TAU);x.ellipse(544,430,13,19,.13,0,TAU);x.fill();
  x.strokeStyle='#413552';x.lineWidth=8;x.lineCap='round';x.beginPath();x.arc(483,453,24,.18,Math.PI-.18);x.stroke();
  x.fillStyle='#ff8dad91';x.beginPath();x.ellipse(375,467,20,10,0,0,TAU);x.ellipse(582,467,20,10,0,0,TAU);x.fill();
  x.save();x.clip(path);x.strokeStyle='#ddcaff';x.lineWidth=2;x.lineCap='round';x.beginPath();x.moveTo(285.3,456.1);x.bezierCurveTo(292.2,492.7,312.1,525.2,347.6,549.3);x.bezierCurveTo(362.6,563.1,389.9,572.5,421.9,577.6);x.stroke();x.restore();
  if(outline){
    // Internal ink strokes expose edge stretching, rather than hiding it.
    x.strokeStyle='#3e3159';x.lineCap='round';x.lineJoin='round';
    x.lineWidth=7;x.beginPath();x.moveTo(382,393);x.quadraticCurveTo(410,375,439,395);x.moveTo(520,395);x.quadraticCurveTo(548,375,578,393);x.stroke();
    x.lineWidth=5;x.beginPath();x.moveTo(358,349);x.bezierCurveTo(372,331,387,329,404,333);x.moveTo(552,332);x.bezierCurveTo(575,323,593,338,606,351);x.stroke();
    x.strokeStyle='#f8e4ff';x.lineWidth=3;x.beginPath();x.moveTo(328,476);x.quadraticCurveTo(346,517,370,531);x.moveTo(584,537);x.quadraticCurveTo(612,513,621,480);x.stroke();
  }
  return c;
}
