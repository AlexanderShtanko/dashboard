import test from 'node:test';
import assert from 'node:assert/strict';
import {addTask,removeTask,restoreTask,reorderOpen,moveOpen,openTasks,doneTasks,patchTask} from '../dist/widgets/tasks-data.js';

const items=[{id:'a',text:'A',done:false},{id:'b',text:'B',done:true},{id:'c',text:'C',done:false},{id:'d',text:'D',done:false}];

test('new tasks go on top and blank text is ignored',()=>{
  assert.deepEqual(addTask(items,'  New ','n')[0],{id:'n',text:'New',done:false});
  assert.equal(addTask(items,'   ','n'),items);
});

test('a removed task comes back to the same place',()=>{
  const {items:rest,removed,index}=removeTask(items,'c');
  assert.deepEqual(rest.map(i=>i.id),['a','b','d']);
  assert.deepEqual(restoreTask(rest,removed,index).map(i=>i.id),['a','b','c','d']);
  assert.equal(restoreTask(items,removed,index),items,'no duplicate when it is already there');
});

test('reordering open tasks keeps completed ones after them',()=>{
  assert.deepEqual(reorderOpen(items,[2,0,1]).map(i=>i.id),['d','a','c','b']);
  assert.equal(reorderOpen(items,[0,0,1]),items,'invalid order is ignored');
  assert.deepEqual(moveOpen(items,0,1).map(i=>i.id),['c','a','d','b']);
  assert.equal(moveOpen(items,0,-1),items);
});

test('helpers split and patch without touching the format',()=>{
  assert.deepEqual(openTasks(items).map(i=>i.id),['a','c','d']);
  assert.deepEqual(doneTasks(items).map(i=>i.id),['b']);
  assert.deepEqual(patchTask(items,'a',{done:true})[0],{id:'a',text:'A',done:true});
});
