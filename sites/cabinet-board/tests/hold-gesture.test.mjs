import test from 'node:test';
import assert from 'node:assert/strict';
import {createHoldGesture} from '../dist/core/hold-gesture.js';
function setup(){
  let time=0,next=0;const timers=new Map(),activated=[];
  const gesture=createHoldGesture({activate:value=>activated.push(value),setTimer:(fn,ms)=>{timers.set(++next,{fn,at:time+ms});return next;},clearTimer:id=>timers.delete(id)});
  return {gesture,activated,tick:ms=>{time+=ms;for(const [id,timer] of timers)if(timer.at<=time){timers.delete(id);timer.fn();}}};
}
test('a short click does not edit or consume the click; a hold edits exactly once',()=>{
  const {gesture:g,activated,tick}=setup();g.start(1,10,10,'note');tick(200);assert.equal(g.end(1),false);tick(600);assert.deepEqual(activated,[]);
  g.start(2,10,10,'note');tick(549);assert.deepEqual(activated,[]);tick(1);tick(1000);assert.deepEqual(activated,['note']);assert.equal(g.end(2),true);assert.equal(g.end(2),false);
});
test('movement and pointer cancellation prevent accidental editing during scroll',()=>{
  const {gesture:g,activated,tick}=setup();g.start(1,0,0,'note');g.move(1,10,0);tick(600);assert.deepEqual(activated,[]);
  g.start(2,0,0,'note');g.cancel();tick(600);assert.deepEqual(activated,[]);
});
test('other pointers cannot complete a hold; restarting cannot fire the old timer',()=>{
  const {gesture:g,activated,tick}=setup();g.start(1,0,0,'first');tick(300);assert.equal(g.end(2),false);g.start(2,0,0,'second');tick(300);assert.deepEqual(activated,[]);tick(250);assert.deepEqual(activated,['second']);
});
test('activation supplies the still-held pointer and its latest coordinates for immediate drag',()=>{
  let fire,received;const gesture=createHoldGesture({activate:(id,pointer)=>{received={id,...pointer};},setTimer:fn=>{fire=fn;return 1;},clearTimer:()=>{}});
  gesture.start(7,100,200,'note');gesture.move(7,104,203);fire();
  assert.deepEqual(received,{id:'note',pointerId:7,clientX:104,clientY:203});
  gesture.move(7,220,350);assert.equal(gesture.end(7),true);
});
