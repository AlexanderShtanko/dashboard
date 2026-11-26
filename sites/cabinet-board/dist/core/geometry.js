export const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export const normalizeAngle=value=>((value+180)%360+360)%360-180;
export function resizeRotated(layout,point,sx,sy,min={w:220,h:170},proportional=false){
  const angle=layout.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  const anchor={x:layout.x-c*sx*layout.w/2+s*sy*layout.h/2,y:layout.y-s*sx*layout.w/2-c*sy*layout.h/2};
  const dx=point.x-anchor.x,dy=point.y-anchor.y;
  let w=clamp(sx*(dx*c+dy*s),min.w,1600),h=clamp(sy*(-dx*s+dy*c),min.h,1600);
  if(proportional){const scale=clamp(Math.max(w/layout.w,h/layout.h),Math.max(min.w/layout.w,min.h/layout.h),Math.min(1600/layout.w,1600/layout.h));w=layout.w*scale;h=layout.h*scale;}
  return {...layout,w,h,x:anchor.x+c*sx*w/2-s*sy*h/2,y:anchor.y+s*sx*w/2+c*sy*h/2};
}
export function containsPoint(layout,point){const a=-layout.rotation*Math.PI/180,dx=point.x-layout.x,dy=point.y-layout.y;return Math.abs(dx*Math.cos(a)-dy*Math.sin(a))<=layout.w/2&&Math.abs(dx*Math.sin(a)+dy*Math.cos(a))<=layout.h/2;}
export function boundsOf(nodes){if(!nodes.length)return {left:0,right:800,top:0,bottom:500};const bounds=nodes.map(({layout:l})=>{const c=Math.abs(Math.cos(l.rotation*Math.PI/180)),s=Math.abs(Math.sin(l.rotation*Math.PI/180)),w=(l.w*c+l.h*s)/2,h=(l.w*s+l.h*c)/2;return {left:l.x-w,right:l.x+w,top:l.y-h,bottom:l.y+h};});return {left:Math.min(...bounds.map(b=>b.left)),right:Math.max(...bounds.map(b=>b.right)),top:Math.min(...bounds.map(b=>b.top)),bottom:Math.max(...bounds.map(b=>b.bottom))};}
