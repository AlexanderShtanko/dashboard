import test from 'node:test';
import assert from 'node:assert/strict';
import {createPinRecord,verifyPin} from '../dist/core/pin.js';
import {BoardStore} from '../dist/core/store.js';
import {registry} from '../dist/widgets/index.js';
import {seed} from '../dist/seed.js';

function setup(){
  const records=new Map();
  const storage={getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value)};
  return {store:new BoardStore(registry,seed,storage),storage};
}

test('changing protection survives reload and cannot be reversed by layout undo',()=>{
  const {store,storage}=setup();
  store.update('note-main',{layout:{x:456}});
  store.setProtection('note-main',true);
  store.undo();
  assert.equal(new BoardStore(registry,seed,storage).get('note-main').pinProtected,true);
  store.update('note-main',{layout:{x:567}});
  store.setProtection('note-main',false);
  store.undo();
  assert.equal(store.get('note-main').pinProtected,undefined);
});

test('deleting a protected folder keeps its children protected',()=>{
  const {store}=setup();
  store.setProtection('folder-work',true);
  store.remove('folder-work');
  assert.equal(store.get('work-note').pinProtected,true);
  store.undo();
  assert.equal(store.get('folder-work').pinProtected,true);
});

test('PIN verifiers are salted and only accept the correct numeric code',async()=>{
  const raw=await createPinRecord('012345');
  assert.deepEqual(Object.keys(JSON.parse(raw)),['salt','digest']);
  assert.notEqual(raw,await createPinRecord('012345'));
  assert.equal(await verifyPin('012345',raw),true);
  assert.equal(await verifyPin('012346',raw),false);
  await assert.rejects(createPinRecord('123'));
});
