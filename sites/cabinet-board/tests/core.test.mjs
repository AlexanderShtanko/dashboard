import test from 'node:test';
import assert from 'node:assert/strict';
import {registry} from '../dist/widgets/index.js';
import {WidgetRegistry} from '../dist/core/registry.js';
import {BoardStore,validateWorkspace} from '../dist/core/store.js';
import {resizeRotated} from '../dist/core/geometry.js';
import {seed} from '../dist/seed.js';
function memory(){let value=null;return {getItem:()=>value,setItem:(_,next)=>{value=next;}};}
function setup(){const storage=memory();return {storage,store:new BoardStore(registry,seed,storage)};}
test('folder nesting rejects cycles and accepts moves to root',()=>{const {store}=setup();const folder=store.add('folder','folder-work');assert.equal(store.canMove('folder-work',folder),false);assert.throws(()=>store.move('folder-work',folder));assert.equal(store.get('folder-work').parentId,null);store.move('note-main',folder);assert.deepEqual(store.ancestors('note-main').map(n=>n.id),['folder-work',folder,'note-main']);store.move('note-main',null);assert.equal(store.get('note-main').parentId,null);});
test('deleting folder preserves children, undo restores folder and nesting',()=>{const {store}=setup();store.remove('folder-work');assert.equal(store.get('work-note').parentId,null);assert.equal(store.get('work-note').data.body,seed.nodes.find(n=>n.id==='work-note').data.body);store.undo();assert.equal(store.get('work-note').parentId,'folder-work');});
test('duplicating nested folders remaps all descendant IDs',()=>{const {store}=setup();const nested=store.add('folder','folder-work'),note=store.add('note',nested);store.update(note,{data:{body:'Independent copy'}});const copy=store.duplicate('folder-work');const copiedFolder=store.children(copy).find(n=>n.type==='folder');const copiedNote=store.children(copiedFolder.id)[0];assert.notEqual(copiedNote.id,note);store.update(copiedNote.id,{data:{body:'Changed'}});assert.equal(store.get(note).data.body,'Independent copy');});
test('layout and data survive save, reload, export and import',()=>{const {store,storage}=setup();store.update('note-main',{layout:{x:345,rotation:35,w:410},data:{body:'Saved'}});const loaded=new BoardStore(registry,seed,storage);assert.equal(loaded.get('note-main').data.body,'Saved');assert.equal(loaded.get('note-main').layout.rotation,35);loaded.import(JSON.parse(store.export()));assert.deepEqual(loaded.state,store.state);});
test('an older tab cannot overwrite a board already saved by another tab',()=>{
  const {store,storage}=setup();
  const olderTab=new BoardStore(registry,seed,storage);
  store.update('note-main',{data:{body:'Saved in a new tab'}});
  olderTab.update('note-main',{title:'Local draft'});
  assert.match(olderTab.error,/в другой вкладке/);
  assert.equal(JSON.parse(olderTab.export()).nodes.find(node=>node.id==='note-main').title,'Local draft');
  const reopened=new BoardStore(registry,seed,storage);
  assert.equal(reopened.get('note-main').data.body,'Saved in a new tab');
  reopened.update('note-main',{title:'Fresh edit'});
  assert.equal(reopened.error,'');
});
test('import is atomic; corrupt hierarchy and javascript links are rejected',()=>{const {store}=setup(),before=store.export(),invalid=structuredClone(seed);invalid.nodes[0].parentId='missing';assert.throws(()=>store.import(invalid));assert.equal(store.export(),before);const unsafe=structuredClone(seed);unsafe.nodes.find(n=>n.type==='links').data.items=[{title:'Unsafe',url:'javascript:alert(1)'}];assert.throws(()=>store.import(unsafe));assert.equal(store.export(),before);});
test('unknown widget data stays intact while a module is absent',()=>{const input=structuredClone(seed);input.nodes[0].type='future-widget';input.nodes[0].data={secretOfLife:42};const validated=validateWorkspace(input,registry);assert.deepEqual(validated.nodes[0].data,{secretOfLife:42});});
test('registry applies explicit data migrations',()=>{const registry=new WidgetRegistry();registry.register({type:'migrating',version:2,createData:()=>({text:''}),validate:d=>typeof d.text==='string',renderCard:()=>null,migrations:{1:d=>({text:d.old})}});const node=structuredClone(seed.nodes[0]);node.type='migrating';node.version=1;node.data={old:'preserved'};const result=registry.normalize(node);assert.deepEqual(result.data,{text:'preserved'});assert.equal(result.version,2);});
test('storage failures are reported; existing corrupt data is not overwritten',()=>{const {store}=setup();store.storage={setItem(){throw new Error('quota');}};store.update('note-main',{title:'Still in memory'});assert.match(store.error,/quota/);const raw='{corrupt';let written=false;const broken=new BoardStore(registry,seed,{getItem:()=>raw,setItem:()=>{written=true;}});broken.update('note-main',{title:'Change'});assert.equal(written,false);assert.equal(broken.readOnly,true);});
test('rotated resize keeps opposite corner fixed at all four handles',()=>{for(const angle of [0,6,45,90,-135,179])for(const sx of [-1,1])for(const sy of [-1,1]){const l={x:300,y:200,w:300,h:220,rotation:angle},a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);const fixed={x:l.x-c*sx*l.w/2+s*sy*l.h/2,y:l.y-s*sx*l.w/2-c*sy*l.h/2};const point={x:fixed.x+c*sx*410-s*sy*320,y:fixed.y+s*sx*410+c*sy*320};const next=resizeRotated(l,point,sx,sy);assert(Math.abs(next.w-410)<1e-8);assert(Math.abs(next.h-320)<1e-8);assert(Math.abs(next.x-c*sx*next.w/2+s*sy*next.h/2-fixed.x)<1e-8);assert(Math.abs(next.y-s*sx*next.w/2-c*sy*next.h/2-fixed.y)<1e-8);}});
test('shift moves a card one step among its siblings only',()=>{const {store}=setup();const order=()=>store.children(null).map(n=>n.id);const before=order();store.shift('note-main',-1);assert.deepEqual(order(),['note-main','tasks-main',...before.slice(2)]);store.shift('note-main',-1);assert.deepEqual(order(),['note-main','tasks-main',...before.slice(2)]);store.shift('note-main',1);assert.deepEqual(order(),before);assert.deepEqual(store.children('folder-work').map(n=>n.id),['work-note','work-tasks']);store.undo();assert.deepEqual(order(),['note-main','tasks-main',...before.slice(2)]);});
test('moving a card out of a folder can place it and is one undo step',()=>{const {store}=setup();store.move('work-note',null,{x:500,y:900});const moved=store.get('work-note');assert.equal(moved.parentId,null);assert.deepEqual([moved.layout.x,moved.layout.y],[500,900]);assert.equal(store.children(null).at(-1).id,'work-note');store.undo();assert.equal(store.get('work-note').parentId,'folder-work');store.move('work-note',null);assert.equal(store.get('work-note').parentId,null);});
test('card colour and board background are saved, undone and validated',()=>{
  const {store,storage}=setup();
  store.setColor('note-main','yellow');store.setBackground('green');
  const saved=JSON.parse(storage.getItem('cabinet-board:workspace:v1'));
  assert.equal(saved.nodes.find(n=>n.id==='note-main').color,'yellow');assert.equal(saved.background,'green');
  assert.equal(store.get(store.duplicate('note-main')).color,'yellow');
  store.setColor('note-main','');assert.equal('color' in store.get('note-main'),false);
  store.setBackground('');assert.equal('background' in store.state,false);
  store.undo();assert.equal(store.state.background,'green');
  assert.equal('background' in validateWorkspace({...seed,background:'<bad>'},registry),false);
  assert.throws(()=>validateWorkspace({schemaVersion:1,nodes:[{...seed.nodes[0],color:5}]},registry),/цвет/);
});
