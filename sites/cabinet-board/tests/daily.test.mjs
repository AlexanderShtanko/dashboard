import test from 'node:test';
import assert from 'node:assert/strict';
import {BoardStore} from '../dist/core/store.js';
import {registry} from '../dist/widgets/index.js';
import {recentDays, monthDays, setDayDone, validateDaily} from '../dist/widgets/daily-data.js';

test('history calendar includes every day of old months and leap years',()=>{
  assert.equal(monthDays('2024-02').length,29);
  assert.equal(monthDays('2025-02').length,28);
  assert.equal(monthDays('2023-12').at(-1),'2023-12-31');
  assert.deepEqual(monthDays('2024-13'),[]);
});

test('seven local days include today and cross month and year boundaries',()=>{
  assert.deepEqual(recentDays(new Date(2024,2,2,0,5)),[
    '2024-02-25','2024-02-26','2024-02-27','2024-02-28','2024-02-29','2024-03-01','2024-03-02'
  ]);
  assert.deepEqual(recentDays(new Date(2025,0,1,23,55)),[
    '2024-12-26','2024-12-27','2024-12-28','2024-12-29','2024-12-30','2024-12-31','2025-01-01'
  ]);
});

test('checking and undoing a date leaves other actions and dates intact',()=>{
  const actions = [
    {id:'walk',name:'Прогулка',completed:['2026-11-14']},
    {id:'journal',name:'Дневник',completed:['2026-11-15']},
  ];
  const marked = setDayDone(actions,'walk','2026-11-15',true);
  assert.deepEqual(setDayDone(marked,'walk','2026-11-15',true),marked);
  assert.deepEqual(marked[0].completed,['2026-11-14','2026-11-15']);
  assert.deepEqual(setDayDone(marked,'walk','2026-11-15',false),actions);
});

test('daily history survives board reload and invalid marks are rejected',()=>{
  const seed = {schemaVersion:1,nodes:[]};
  const entries = new Map();
  const storage = {getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)};
  const store = new BoardStore(registry,seed,storage);
  const id = store.add('daily');
  assert.deepEqual(store.get(id).data,{actions:[]});
  const data = {actions:[{id:'walk',name:'Прогулка',completed:['2026-11-08','2026-11-15']}]};
  store.update(id,{data});
  const loaded = new BoardStore(registry,seed,storage);
  assert.deepEqual(loaded.get(id).data,data);
  data.actions[0].completed.push('2026-02-30');
  assert.equal(validateDaily(data),false);
  data.actions[0].completed[2]='2026-11-15';
  assert.equal(validateDaily(data),false);
});
