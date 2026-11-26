// Pointer-independent hold recognition; moving/scrolling must remain a normal gesture.
export function createHoldGesture({activate,feedback=()=>{},delay=550,slop=9,setTimer=setTimeout,clearTimer=clearTimeout}){
  let pending=null;
  function cancel(){if(!pending)return;clearTimer(pending.timer);feedback(pending.value,false);pending=null;}
  return {
    start(pointer,x,y,value){
      cancel();
      const press={pointer,x,y,lastX:x,lastY:y,value,fired:false,timer:null};pending=press;feedback(value,true);
      press.timer=setTimer(()=>{if(pending!==press)return;press.fired=true;feedback(value,false);activate(value,{pointerId:press.pointer,clientX:press.lastX,clientY:press.lastY});},delay);
    },
    move(pointer,x,y){if(pending?.pointer!==pointer)return;pending.lastX=x;pending.lastY=y;if(!pending.fired&&Math.hypot(x-pending.x,y-pending.y)>slop)cancel();},
    end(pointer){if(pending?.pointer!==pointer)return false;const fired=pending.fired;cancel();return fired;},
    cancel,
  };
}
