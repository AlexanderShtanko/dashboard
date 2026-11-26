import test from 'node:test';
import assert from 'node:assert/strict';
import {focusState,startFocus,pauseFocus,resetFocus,addMinutes,setLength,clock} from '../dist/widgets/focus-data.js';
import {registry} from '../dist/widgets/index.js';

const fresh={task:'',minutes:25,remaining:1500,endsAt:null};
const valid=data=>registry.get('focus').validate(data);

test('start, pause and resume keep the remaining time',()=>{
  const running=startFocus(fresh,1000);
  assert.equal(running.endsAt,1000+1500*1000);
  const state=focusState(running,61000);
  assert.deepEqual({...state,progress:Math.round(state.progress*100)/100},{running:true,finished:false,started:true,seconds:1440,progress:0.04});
  const paused=pauseFocus(running,61000);
  assert.deepEqual(paused,{...fresh,remaining:1440,endsAt:null});
  assert.equal(focusState(paused,99999).started,true);
  assert.equal(startFocus(paused,0).endsAt,1440*1000);
});

test('a session that ran out is finished without writing anything',()=>{
  const running=startFocus(fresh,0);
  const state=focusState(running,1500*1000+1);
  assert.equal(state.finished,true);assert.equal(state.seconds,0);assert.equal(state.progress,1);
  assert.equal(startFocus(running,2e6).endsAt,2e6+1500*1000,'start again begins a full session');
  assert.equal(focusState({...fresh,remaining:0}).finished,true,'old finished data still reads as finished');
});

test('+5 minutes, reset and new length stay within the stored format',()=>{
  const running=startFocus(fresh,0);
  const longer=addMinutes(running,5,0);
  assert.equal(focusState(longer,0).seconds,1800);assert.ok(valid(longer));
  assert.equal(addMinutes(pauseFocus(running,0),5).remaining,1800);
  assert.ok(valid(addMinutes({...fresh,minutes:180,remaining:10800},5)));
  assert.deepEqual(resetFocus({...fresh,remaining:3,endsAt:5}),fresh);
  assert.deepEqual(setLength(fresh,45),{...fresh,minutes:45,remaining:2700});
  assert.equal(setLength(fresh,0),fresh);
});

test('clock shows hours only when needed',()=>{
  assert.equal(clock(1500),'25:00');assert.equal(clock(3725),'1:02:05');
});
