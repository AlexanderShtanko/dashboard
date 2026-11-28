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

export const ZOOM_MIN=.2,ZOOM_MAX=2;
/**
 * Camera that shows every card: bounds are fitted into the free part of the viewport
 * (the viewport minus the insets kept for the dock and breadcrumbs) with `pad` pixels
 * around them. The zoom may go above 100%, so a few cards fill the screen instead of
 * sitting small in the middle.
 */
export function fitCamera(bounds,{w,h,top=0,bottom=0,left=0,right=0,pad=24,min=ZOOM_MIN,max=ZOOM_MAX}){
  const bw=Math.max(1,bounds.right-bounds.left),bh=Math.max(1,bounds.bottom-bounds.top);
  const aw=Math.max(1,w-left-right-2*pad),ah=Math.max(1,h-top-bottom-2*pad);
  const z=clamp(Math.min(aw/bw,ah/bh),min,max);
  return {z,x:(left+w-right)/2-(bounds.left+bounds.right)/2*z,y:(top+h-bottom)/2-(bounds.top+bounds.bottom)/2*z};
}
/** Reads a zoom typed by hand: "150", "150%", "1,5x" → 1.5; null when it is not a number. */
export function parseZoom(text,{min=ZOOM_MIN,max=ZOOM_MAX}={}){
  const raw=String(text??'').trim().replace(',','.').replace(/\s+/g,'');
  const m=/^(\d+(?:\.\d+)?|\.\d+)(%|x|×)?$/i.exec(raw);if(!m)return null;
  let value=Number(m[1]);if(!Number.isFinite(value))return null;
  value=m[2]&&m[2]!=='%'?value:value/100;
  return clamp(value,min,max);
}
