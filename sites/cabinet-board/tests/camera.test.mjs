import test from 'node:test';
import assert from 'node:assert/strict';
import {CAMERA_KEY,createCameraMemory} from '../dist/core/camera.js';

function setup(){
  const records=new Map(),pending=[];
  const storage={getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value)};
  const timers={setTimeout:fn=>{pending.push(fn);return pending.length;},clearTimeout:()=>{pending.length=0;}};
  return {records,storage,timers,run:()=>pending.splice(0).forEach(fn=>fn())};
}

test('board position survives a reload and follows the window centre',()=>{
  const {storage,timers,run}=setup();
  createCameraMemory(storage,{timers}).set(null,{x:300,y:-40,z:.8},1000,600);
  run();
  const next=createCameraMemory(storage,{timers});
  assert.deepEqual(next.get(null,1000,600),{x:300,y:-40,z:.8});
  assert.deepEqual(next.get(null,1400,800),{x:500,y:60,z:.8});
});

test('each folder keeps its own position and unknown folders start empty',()=>{
  const {storage,timers}=setup();
  const memory=createCameraMemory(storage,{timers});
  memory.set(null,{x:10,y:20,z:1},800,600);
  memory.set('folder-a',{x:-50,y:5,z:1.5},800,600);
  memory.flush();
  const next=createCameraMemory(storage,{timers});
  assert.deepEqual(next.get('folder-a',800,600),{x:-50,y:5,z:1.5});
  assert.deepEqual(next.get(null,800,600),{x:10,y:20,z:1});
  assert.equal(next.get('folder-b',800,600),null);
});

test('saving merges with positions written by another tab and ignores broken data',()=>{
  const {records,storage,timers}=setup();
  const memory=createCameraMemory(storage,{timers});
  records.set(CAMERA_KEY,JSON.stringify({other:{x:1,y:2,z:1}}));
  memory.set(null,{x:0,y:0,z:1},400,400);memory.flush();
  assert.deepEqual(Object.keys(JSON.parse(records.get(CAMERA_KEY))).sort(),['other','root']);
  records.set(CAMERA_KEY,'{oops');
  assert.equal(createCameraMemory(storage,{timers}).get(null,400,400),null);
  memory.set(null,{x:NaN,y:0,z:1},400,400);memory.set(null,{x:0,y:0,z:1},0,0);memory.flush();
  assert.equal(records.get(CAMERA_KEY),'{oops');
});
