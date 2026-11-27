import {registry} from './widgets/index.js';
import {BoardStore,KEY} from './core/store.js';
import {el,action,symbol} from './core/dom.js';
import {resizeRotated,clamp,normalizeAngle,boundsOf,containsPoint} from './core/geometry.js';
import {seed} from './seed.js';
import {createWidgetMenu} from './core/widget-menu.js';
import {createHoldGesture} from './core/hold-gesture.js';
import {icon} from './core/icons.js';
import {PIN_KEY,createPinDialog} from './core/pin.js';
import {openStorage} from './core/storage.js';
import {SYNC_STATUS_KEY} from './core/sync.js';
import {openDialog,field,coarsePointer} from './core/ui.js';
import {CAMERA_KEY,createCameraMemory} from './core/camera.js';
import {setupCloud,CLOUD_KEYS} from './core/cloud.js';
import {DRIVE_STATUS_KEY,DRIVE_SETTINGS_KEY} from './core/drive.js';
const $=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
const storage=await openStorage([KEY,PIN_KEY,SYNC_STATUS_KEY,CAMERA_KEY,...CLOUD_KEYS]);
const cameras=createCameraMemory(storage);
const rememberCamera=()=>{if(!list&&!board.hidden)cameras.set(currentParent,camera,board.clientWidth,board.clientHeight);};
let cloud=null;
const store=new BoardStore(registry,seed,storage);
storage.onWriteError=message=>{store.error='Не сохранено: '+message;saved();};
const board=$('#board'),world=$('#world');
world.addEventListener('animationend',event=>{
  if(!event.target.matches('.widget'))return;
  const classes={materialize:'is-new','edit-enter':'edit-enter','desk-settle':'settling'};
  if(classes[event.animationName])event.target.classList.remove(classes[event.animationName]);
});
let selected=null,hand=false,space=false,drag=null,pendingMouseDrag=null,cardCleanup=[],screenCleanup=null;
let list=matchMedia('(max-width:700px)').matches,camera={x:0,y:0,z:1},currentParent=null,route={kind:'board',id:null};
let confirmAction,hasNavigated=false,inspectorVisible=false,statusTimeout;
let editingId=null,seenCards=new Set(),suppressClickUntil=0;
const unlocked=new Set(),externalProtected=new Set();
const pinDialog=createPinDialog(storage,$('#pin-dialog'),lockCards);
const lockedTitle='Закрытая карточка';
const dragExclusions='input,textarea,select,label,[contenteditable],[data-no-card-drag],.widget-options,.card-edit-done,.unlock-card';
function isProtected(node){return node.pinProtected||externalProtected.has(node.id);}
function lockFor(id){return store.ancestors(id).find(node=>isProtected(node)&&!unlocked.has(node.id));}
function requirePin(title,complete,save=false){
  $('#board-options').close();
  attempt(()=>pinDialog.show(title,save,()=>attempt(complete)));
}
function unlockCard(id){
  requirePin('Открыть карточку',()=>{
    for(const node of store.ancestors(id))if(isProtected(node))unlocked.add(node.id);
    if(board.hidden)navigate();
    else {
      refresh();
      all('.widget').find(frame=>frame.dataset.id===id)?.querySelector('[data-drag]')?.focus({preventScroll:true});
    }
  });
}
function lockCards(id){
  pinDialog.cancel();
  if(id)unlocked.delete(id);else unlocked.clear();
  if(drag)endDrag({pointerId:drag.pointer},true);
  for(const dialog of all('dialog[open]'))dialog.close();
  $('#move-destinations').replaceChildren();
  $('#confirm-title').textContent='';$('#confirm-text').textContent='';confirmAction=null;
  stopStatus();
  if(route.kind==='widget'||board.hidden||lockFor(route.id))navigate();
  else{finishEditing();refresh();}
}
function updatePinControls(){
  const canLock=unlocked.size>0;
  $('#pin-lock-all').hidden=!canLock;
  $('#detail-lock').hidden=!canLock;
  $('#pin-settings-label').textContent=attempt(()=>storage.getItem(PIN_KEY))?'Изменить PIN':'Настроить PIN';
}
const hold=createHoldGesture({
  activate:(id,pointer)=>{
    suppressClickUntil=performance.now()+800;
    const frame=all('.widget').find(frame=>frame.dataset.id===id);
    if(list){const button=frame?.querySelector('.widget-options');if(button)cardMenu(button,id);return;}
    beginEditing(id,{showInspector:false,announce:false});
    if(frame)startCardDrag(frame,pointer);
  },
  feedback:(id,active)=>all('.widget').find(frame=>frame.dataset.id===id)?.classList.toggle('holding',active),
});
function beginEditing(id,{showInspector=true,announce=true}={}){
  if(!store.get(id)||lockFor(id))return;
  widgetMenu.close();editingId=selected=id;inspectorVisible=showInspector;highlight();inspect();
  const frame=all('.widget').find(frame=>frame.dataset.id===id);
  frame?.classList.remove('edit-enter');void frame?.offsetWidth;frame?.classList.add('edit-enter');
  frame?.querySelector('[data-drag]')?.focus({preventScroll:true});
  if(announce)status(coarsePointer()?'Двигай карточку пальцем. Углы меняют размер, круг — поворот. Галочка — готово.':'Углы меняют размер, круг — поворот. Esc или галочка — готово.');
}
function finishEditing(){hold.cancel();editingId=null;inspectorVisible=false;selected=null;inspect();highlight();}
for(const [id,name] of Object.entries({'board-menu':'menu','add-widget':'plus','dock-fit':'fit',fullscreen:'expand',duplicate:'duplicate',front:'front',delete:'trash','pan-mode':'move','zoom-out':'minus','zoom-in':'plus'}))$('#'+id).replaceChildren(icon(name));
for(const [id,name] of Object.entries({undo:'undo','pin-settings':'lock','pin-lock-all':'lock','drive-connect':'cloud','drive-signin':'cloud','drive-disconnect':'cloud',export:'download',import:'upload'}))$('#'+id+' .menu-item-icon').replaceChildren(icon(name));
all('[data-close].icon-button').forEach(button=>button.replaceChildren(icon('close')));
const widgetMenu=createWidgetMenu((action,id)=>{
  if(!store.get(id)||lockFor(id))return;
  if(action==='lock'){lockCards(id);return;}
  if(action==='protect'){
    requirePin('Защитить карточку',()=>{
      if(!store.get(id))return;
      unlocked.delete(id);
      store.setProtection(id,true);
      lockCards(id);
    });
    return;
  }
  if(action==='unprotect'){
    requirePin('Снять защиту PIN',()=>{
      store.setProtection(id,false);
      if(!externalProtected.has(id))unlocked.delete(id);
      updatePinControls();
    });
    return;
  }
  selected=id;inspect();highlight();
  if(action==='open'){openNode(id);return;}
  if(action==='rename'){renameCard(id);return;}
  if(action==='settings'){beginEditing(id,{showInspector:!coarsePointer()});return;}
  if(action==='up'||action==='down'){attempt(()=>store.shift(id,action==='up'?-1:1));all('.widget').find(frame=>frame.dataset.id===id)?.scrollIntoView({block:'nearest',behavior:'smooth'});return;}
  const controls={move:'#move',duplicate:'#duplicate',front:'#front',delete:'#delete'};
  if(controls[action])$(controls[action]).click();
});
function renameCard(id){
  const node=store.get(id);if(!node)return;
  const input=el('input',{value:node.title,maxlength:160,enterkeyhint:'done',autocomplete:'off'});
  openDialog({title:'Название карточки',body:[field('Название',input)],submitLabel:'Сохранить',onSubmit:()=>{
    const title=input.value.trim();if(!title)return 'Введи название.';
    attempt(()=>store.update(id,{title}));
    if(route.kind==='widget')heading();
  }});
  input.select();
}
function stopStatus(){const toast=$('#status');clearTimeout(statusTimeout);toast.classList.remove('visible','has-action');toast.textContent='';}
// A snackbar like in Google apps: a short message and, optionally, one action such as «Отменить».
function status(text,act){
  const toast=$('#status');clearTimeout(statusTimeout);
  toast.replaceChildren(el('span',{class:'toast-text'},text));
  toast.classList.toggle('has-action',!!act);
  if(text==='Сохранено в этом браузере.'||text==='Сохраняю…'){toast.classList.remove('visible');return;}
  if(act)toast.append(el('button',{type:'button',class:'toast-action',onClick:()=>{stopStatus();attempt(act.run);}},act.label||'Отменить'));
  toast.classList.add('visible');
  if(!store.error)statusTimeout=setTimeout(()=>toast.classList.remove('visible','has-action'),act?7000:4500);
}
function attempt(operation){try{return operation();}catch(error){status(error.message);return null;}}
function updateCloudControls(){
  const box=$('#cloud-actions');box.hidden=!cloud?.available;if(box.hidden)return;
  const on=cloud.enabled(),state=cloud.status()?.state;
  $('#drive-connect').hidden=on;$('#drive-disconnect').hidden=!on;$('#drive-signin').hidden=!(on&&state==='signed-out');
}
function syncInfo(){if(cloud?.enabled())return cloud.status();if(storage.kind!=='chrome')return null;try{return JSON.parse(storage.getItem(SYNC_STATUS_KEY)||'null');}catch{return null;}}
let shownSyncProblem='';
function saved(){
  updateCloudControls();
  const error=store.error,sync=error?null:syncInfo(),problem=['too-big','error','signed-out'].includes(sync?.state);
  $('#save-status').textContent=error?'Не сохранено':sync?.state==='synced'?'Сохранено и синхронизировано':sync?.state==='pending'?'Сохранено, синхронизация…':sync?.state==='signed-out'?'Сохранено, нужен вход в Google':problem?'Сохранено только на этом устройстве':'Сохранено в браузере';
  $('#save-status').classList.toggle('error',!!error||problem);
  if(error)status(error);
  else if(problem&&sync.message!==shownSyncProblem){shownSyncProblem=sync.message;status(sync.message);}
  else if(!problem)shownSyncProblem='';
}
function parseRoute(){const parts=location.hash.slice(1).split('/').filter(Boolean);let id;try{id=decodeURIComponent(parts[1]||'');}catch{return {kind:'board',id:null};}return parts[0]==='folder'?{kind:'board',id}:parts[0]==='widget'?{kind:'widget',id}:{kind:'board',id:null};}
function go(parent=null){$('#board-options').close();location.hash=parent?'#/folder/'+encodeURIComponent(parent):'#/board';}
function openNode(id){const node=store.get(id);if(!node)return;$('#board-options').close();location.hash=node.type==='folder'?'#/folder/'+encodeURIComponent(id):'#/widget/'+encodeURIComponent(id);}
function disposeCards(){for(const dispose of cardCleanup)attempt(dispose);cardCleanup=[];}
function disposeScreen(){const dispose=screenCleanup;screenCleanup=null;if(dispose)attempt(dispose);}
function mount(result,container,screen=false){if(result?.element){container.append(result.element);if(result.dispose){if(screen)screenCleanup=result.dispose;else cardCleanup.push(result.dispose);}}else if(result instanceof Node)container.append(result);}
// update(data,{render:false}) lets a card redraw itself, so typing or ticking a box keeps focus.
let quietUpdate=false;
function ctx(node){return {node,registry,latest:()=>store.get(node.id)||node,
  children:id=>store.children(id).map(child=>lockFor(child.id)?{id:child.id,type:null,title:lockedTitle,locked:true}:child),
  open:()=>openNode(node.id),openChild:id=>{if(lockFor(id))unlockCard(id);else openNode(id);},
  update:(data,options={})=>attempt(()=>{quietUpdate=options.render===false;try{store.update(node.id,{data});}finally{quietUpdate=false;}if(!store.error&&!options.silent)status('Сохранено в этом браузере.');}),
  feedback:status};}
function sidebar(){
  const navigation=$('#navigation');
  const row=(glyph,label,run,cls='')=>el('button',{type:'button',class:'nav-button '+cls,onClick:run},el('span',{class:'menu-item-icon','aria-hidden':'true'},icon(glyph)),el('span',{},label));
  navigation.replaceChildren(row('board','Моя доска',()=>go(),route.kind==='board'&&!route.id?'active':''));
  for(const folder of store.state.nodes.filter(n=>n.type==='folder'&&!lockFor(n.id))){
    const depth=store.ancestors(folder.id).length-1,button=row('folder',folder.title,()=>go(folder.id),route.id===folder.id?'active':'');
    button.style.paddingLeft=(12+Math.min(depth+1,6)*14)+'px';navigation.append(button);
  }
  navigation.append(row('plus','Новая папка',()=>addType('folder'),'new-folder'));
}
function heading(){
  const node=route.id?store.get(route.id):null;
  const locked=lockFor(route.id);
  $('#page-title').textContent=locked?lockedTitle:route.kind==='widget'?node?.title||'':'';
  const parent=store.get((locked||node)?.parentId),backLabel=parent&&!lockFor(parent.id)?parent.title:'Моя доска';
  $('#back').replaceChildren(icon('chevron-left'),el('span',{},backLabel));$('#back').setAttribute('aria-label','Назад: '+backLabel);
  const crumbs=$('#breadcrumbs');
  crumbs.replaceChildren(action('Моя доска',()=>go(),'crumb'));
  if(node&&!locked&&route.kind==='board')for(const ancestor of store.ancestors(node.id)){
    crumbs.append(el('span',{'aria-hidden':'true'},'/'),action(ancestor.title,()=>go(ancestor.id),'crumb'));
  }
}
function inspect(){const node=lockFor(selected)?null:store.get(selected);$('#inspector').hidden=!inspectorVisible||!node||board.hidden;$('#item-title').value=node?.title??'';if(!node)return;$('#item-width').value=Math.round(node.layout.w);$('#item-height').value=Math.round(node.layout.h);$('#item-angle').value=Math.round(node.layout.rotation);const min=registry.get(node.type)?.minSize||{w:220,h:170};$('#item-width').min=min.w;$('#item-height').min=min.h;}
function paintCamera(){world.style.transform=list?'':`translate(${camera.x}px,${camera.y}px) scale(${camera.z})`;world.style.setProperty('--inverse',1/camera.z);board.style.backgroundSize=`${24*camera.z}px ${24*camera.z}px`;board.style.backgroundPosition=`${camera.x}px ${camera.y}px`;$('#zoom-value').textContent=Math.round(camera.z*100)+'%';board.classList.toggle('hand',hand||space);}
function paintLayout(frame,layout){frame.style.left=layout.x-layout.w/2+'px';frame.style.top=layout.y-layout.h/2+'px';frame.style.width=layout.w+'px';frame.style.height=layout.h+'px';frame.style.transform=`rotate(${layout.rotation}deg)`;}
function cardMenu(button,id){
  const node=store.get(id);if(!node||lockFor(id))return;
  const siblings=store.children(currentParent),index=siblings.findIndex(item=>item.id===id);
  selected=id;inspect();highlight();
  widgetMenu.show(button,node,{canOpen:node.type==='folder'||!!registry.get(node.type)?.renderScreen,list,first:index===0,last:index===siblings.length-1});
}
let renderedParent;
function renderBoard(){
  pendingMouseDrag=null;hold.cancel();widgetMenu.close();disposeCards();const scrolled=list?board.scrollTop:0;world.replaceChildren();const children=store.children(currentParent);
  if(editingId&&!children.some(node=>node.id===editingId)){editingId=null;inspectorVisible=false;}
  board.classList.toggle('list-view',list);$('#canvas-controls').hidden=list;$('#dock-fit').hidden=list||!children.length;$('#board-help').textContent=boardHelp();$('#view-canvas').setAttribute('aria-pressed',String(!list));$('#view-list').setAttribute('aria-pressed',String(list));$('#undo').disabled=!store.history.length;$('#count').textContent=cardCount(children.length);$('#board-empty').hidden=!!children.length;
  for(const [index,node] of children.entries()){
    if(lockFor(node.id)){
      const frame=el('article',{class:'widget locked-card','data-id':node.id,'aria-label':lockedTitle},
        el('button',{class:'unlock-card',type:'button',onClick:()=>unlockCard(node.id)},icon('lock'),el('strong',{},lockedTitle),el('span',{},'Открыть по PIN')));
      paintLayout(frame,node.layout);frame.style.zIndex=index;world.append(frame);
      continue;
    }
    const def=registry.get(node.type),frame=el('article',{class:`widget tone-${def?.tone||'white'} ${selected===node.id?'selected':''} ${seenCards.has(node.id)?'':'is-new'}`, 'data-id':node.id,'data-type':node.type,'aria-label':node.title});paintLayout(frame,node.layout);frame.style.zIndex=index;frame.style.setProperty('--entry-delay',Math.min(index,7)*35+'ms');
    const opensDetails = node.type === 'folder' || Boolean(def?.renderScreen);
    const dragHandle = el('button', {
      class:'widget-drag', 'data-drag':true,
      'aria-label':(opensDetails ? 'Открыть: ' : 'Выбрать: ') + node.title,
      title:node.title,
      onClick:()=>{
        if (opensDetails && editingId !== node.id) {openNode(node.id);return;}
        selected=node.id;inspect();highlight();
      },
    }, symbol(def?.icon), el('span',{},node.title));
    const options=el('button',{class:'widget-options',type:'button','aria-label':'Параметры '+node.title,'aria-haspopup':'menu','aria-controls':'widget-menu','aria-expanded':'false',onClick:event=>cardMenu(event.currentTarget,node.id)},icon('more'));
    const done=el('button',{class:'card-edit-done',type:'button',hidden:true,'aria-label':'Закончить редактирование '+node.title,onClick:finishEditing},icon('check'));
    const header=el('header',{class:'widget-header'},dragHandle,options,done);frame.append(header);
    const content=el('div',{class:'widget-content'});try{if(def)mount(def.renderCard(ctx(node)),content);else content.append(el('p',{class:'muted'},'Модуль «'+node.type+'» не подключён. Данные сохранены.'));}catch(error){content.append(el('p',{class:'muted'},'Не удалось открыть виджет. '+error.message));}frame.append(content);
    const stem=el('span',{class:'rotation-stem','aria-hidden':'true'});frame.append(stem,el('button',{class:'transform-handle rotate-handle','data-rotate':true,'aria-label':'Повернуть '+node.title}));for(const corner of ['nw','ne','se','sw'])frame.append(el('button',{class:'transform-handle resize-handle '+corner,'data-corner':corner,'aria-label':'Изменить размер '+node.title}));world.append(frame);
  }
  seenCards=new Set(children.map(node=>node.id));highlight();inspect();paintCamera();saved();
  // Redrawing the list must not throw the reader back to the top.
  if(list&&scrolled&&renderedParent===currentParent)board.scrollTop=scrolled;
  renderedParent=currentParent;
}
function highlight(){all('.widget:not(.locked-card)').forEach(frame=>{const editing=frame.dataset.id===editingId;frame.classList.toggle('selected',frame.dataset.id===selected);frame.classList.toggle('editing',editing);frame.querySelector('.card-edit-done').hidden=!editing;});board.classList.toggle('editing-card',!!editingId);}
function renderScreen(){
  const node=store.get(route.id);if(!node){go();return;}
  const content=$('#detail-content');content.replaceChildren();
  if(lockFor(node.id)){
    content.append(el('div',{class:'protected-route'},icon('lock'),action('Открыть по PIN',()=>unlockCard(node.id),'button primary')));
    $('#page-title').focus({preventScroll:true});
    return;
  }
  const def=registry.get(node.type);
  try{
    if(def?.renderScreen)mount(def.renderScreen(ctx(node)),content,true);
    else content.append(el('p',{class:'empty-copy'},'У этого виджета пока нет отдельного экрана.'));
  }catch(error){content.append(el('p',{class:'empty-copy'},'Не удалось открыть экран: '+error.message));}
  $('.main').scrollTop=0;
  $('#page-title').focus({preventScroll:true});
}
function navigate(){
  pendingMouseDrag=null;hold.cancel();widgetMenu.close();inspectorVisible=false;editingId=null;seenCards.clear();
  if(hasNavigated)rememberCamera();hasNavigated=true;
  disposeScreen();disposeCards();$('#detail-content').replaceChildren();world.replaceChildren();route=parseRoute();selected=null;
  const node=route.id?store.get(route.id):null;if(route.id&&!node||route.kind==='board'&&node&&node.type!=='folder'){status('Эта папка или виджет больше не существует.');history.replaceState(null,'','#/board');route={kind:'board',id:null};}
  const detail=route.kind==='widget'||!!lockFor(route.id);document.body.classList.toggle('detail-mode',detail);$('#breadcrumbs').hidden=detail||!route.id;$('#board').hidden=detail;$('#detail').hidden=!detail;$('#board-toolbar').hidden=detail;$('#canvas-controls').hidden=detail||list;$('.workspace-dock').hidden=detail;
  heading();sidebar();inspect();updatePinControls();
  if(detail)renderScreen();else{currentParent=route.id;restoreCamera();}saved();
}
function refresh(){
  sidebar();heading();updatePinControls();$('#undo').disabled=!store.history.length;
  if(!board.hidden&&!lockFor(route.id)&&!quietUpdate)renderBoard();
  saved();
}
store.subscribe(refresh);
window.addEventListener('hashchange',navigate);
function restoreCamera(){
  const saved=list?null:cameras.get(currentParent,board.clientWidth,board.clientHeight);
  camera=saved||{x:0,y:0,z:1};renderBoard();if(!saved)requestAnimationFrame(fit);
}
function cardCount(count){const m10=count%10,m100=count%100;return count+' '+(m10===1&&m100!==11?'карточка':m10>=2&&m10<=4&&(m100<12||m100>14)?'карточки':'карточек');}
function boardHelp(){
  if(list)return coarsePointer()?'Удержи карточку или нажми ⋯, чтобы открыть её меню. В режиме «Доска» карточки можно свободно раскладывать.':'Действия с карточкой — в меню ⋯. В режиме «Доска» карточки можно свободно раскладывать.';
  return coarsePointer()?'Поле двигается одним пальцем, масштаб — двумя. Удержи карточку, чтобы передвинуть её. Размер и поворот — в меню ⋯.':'Тяни карточку мышью, поле — за свободное место или с пробелом. Ctrl + колесо меняет масштаб. Размер и поворот — в меню ⋯.';
}
function fit(){
  if(list||board.hidden)return;
  const b=boundsOf(store.children(currentParent)),w=board.clientWidth,h=board.clientHeight;
  // The dock sits at the top on wide screens and at the bottom on phones: keep cards clear of it.
  const area=board.getBoundingClientRect(),dock=$('.workspace-dock').getBoundingClientRect(),low=dock.top>area.top+h/2;
  const crumbs=$('#breadcrumbs').hidden?0:$('#breadcrumbs').getBoundingClientRect().bottom-area.top;
  const top=Math.min(Math.max(low?0:dock.bottom-area.top,crumbs)+12,h/3),bottom=low?Math.min(area.bottom-dock.top+12,h/3):24;
  camera.z=clamp(Math.min((w-(w<700?24:90))/(b.right-b.left),(h-top-bottom)/(b.bottom-b.top),1),.2,2);
  camera.x=w/2-(b.left+b.right)/2*camera.z;
  camera.y=(top+h-bottom)/2-(b.top+b.bottom)/2*camera.z;
  paintCamera();rememberCamera();
}
function zoom(factor,x=board.clientWidth/2,y=board.clientHeight/2){const z=clamp(camera.z*factor,.2,2),wx=(x-camera.x)/camera.z,wy=(y-camera.y)/camera.z;camera={z,x:x-wx*z,y:y-wy*z};paintCamera();rememberCamera();}
function point(event){const r=board.getBoundingClientRect();return {x:(event.clientX-r.left-camera.x)/camera.z,y:(event.clientY-r.top-camera.y)/camera.z};}
function addType(type){$('#board-options').close();const onScreen=route.kind==='widget',parent=onScreen?(store.get(route.id)?.parentId??null):currentParent;const pos=list||onScreen?undefined:{x:(board.clientWidth/2-camera.x)/camera.z,y:(board.clientHeight/2-camera.y)/camera.z};const id=attempt(()=>store.add(type,parent,pos));if(!id)return;selected=id;$('#catalog').close();if(onScreen)go(parent);else renderBoard();if(list)requestAnimationFrame(()=>all('.widget').find(frame=>frame.dataset.id===id)?.scrollIntoView({block:'center',behavior:'smooth'}));status('Карточка добавлена.');}
$('#catalog-grid').replaceChildren(...registry.list().map(def=>
  el('button',{class:'catalog-item tone-'+def.tone,onClick:()=>addType(def.type)},
    symbol(def.icon),el('strong',{},def.catalogTitle||def.title),el('p',{},def.description))));
$('#add-widget').onclick=$('#empty-add').onclick=()=>$('#catalog').showModal();
$('#board-menu').onclick=()=>$('#board-options').showModal();
$('#pin-settings').onclick=()=>requirePin('Изменить PIN',()=>status('PIN сохранён.'),true);
$('#pin-lock-all').onclick=$('#detail-lock').onclick=()=>lockCards();
$('#detail-lock').replaceChildren(icon('lock'));
function updateFullscreen(){const active=!!document.fullscreenElement;$('#fullscreen').setAttribute('aria-pressed',String(active));$('#fullscreen').setAttribute('aria-label',active?'Выйти из полноэкранного режима':'На весь экран');$('#fullscreen').title=active?'Выйти из полноэкранного режима (Esc)':'На весь экран';$('#fullscreen').replaceChildren(icon(active?'collapse':'expand'));}
$('#fullscreen').hidden=!document.documentElement.requestFullscreen||coarsePointer()||matchMedia('(display-mode: standalone)').matches;
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else status('Полноэкранный режим недоступен в этом браузере. На компьютере можно использовать F11.');}catch{status('Браузер не разрешил полноэкранный режим. Открой кабинет в отдельном браузере или используй F11.');}updateFullscreen();};
document.addEventListener('fullscreenchange',updateFullscreen);
let lastBoardSize;
new ResizeObserver(()=>{if(board.hidden||list){lastBoardSize=null;return;}const next={w:board.clientWidth,h:board.clientHeight};if(lastBoardSize){camera.x+=(next.w-lastBoardSize.w)/2;camera.y+=(next.h-lastBoardSize.h)/2;paintCamera();}lastBoardSize=next;}).observe(board);
all('[data-close]').forEach(button=>button.onclick=()=>button.closest('dialog').close());
all('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
$('#view-canvas').onclick=()=>{list=false;$('#board-options').close();restoreCamera();};$('#view-list').onclick=()=>{list=true;$('#board-options').close();renderBoard();};
$('#zoom-in').onclick=()=>zoom(1.2);$('#zoom-out').onclick=()=>zoom(1/1.2);$('#fit').onclick=()=>{fit();$('#board-options').close();};$('#dock-fit').onclick=fit;$('#pan-mode').hidden=coarsePointer();$('#pan-mode').onclick=()=>{hand=!hand;$('#pan-mode').setAttribute('aria-pressed',String(hand));$('#board-options').close();paintCamera();};
$('#undo').onclick=()=>{attempt(()=>store.undo());if(selected&&!store.get(selected)){selected=null;inspect();}$('#board-options').close();status('Последнее изменение отменено.');};
$('#close-inspector').onclick=finishEditing;
$('#item-title').onchange=e=>attempt(()=>store.update(selected,{title:e.target.value}));
for(const [id,key] of [['item-width','w'],['item-height','h'],['item-angle','rotation']])$('#'+id).onchange=e=>{const node=store.get(selected),value=e.target.valueAsNumber;if(!node||!Number.isFinite(value)){inspect();return;}const min=registry.get(node.type)?.minSize||{w:220,h:170};attempt(()=>store.update(selected,{layout:{[key]:key==='rotation'?normalizeAngle(value):clamp(value,min[key],1600)}}));};
$('#duplicate').onclick=()=>{selected=attempt(()=>store.duplicate(selected));renderBoard();};$('#front').onclick=()=>attempt(()=>store.front(selected));
function confirm(title,text,label,operation){$('#confirm-title').textContent=title;$('#confirm-text').textContent=text;$('#confirm-action').textContent=label;confirmAction=operation;$('#confirm-dialog').showModal();}
$('#confirm-action').onclick=()=>{const operation=confirmAction;$('#confirm-dialog').close();attempt(operation);};
// Like every other delete in the app: at once, with «Отменить» in the snackbar.
$('#delete').onclick=()=>{
  const node=store.get(selected);if(!node)return;
  const inside=node.type==='folder'&&store.children(node.id).length;
  if(!attempt(()=>{store.remove(node.id);return true;}))return;
  const mark=store.history.at(-1);selected=null;finishEditing();renderBoard();
  status('«'+node.title+'» — удалено.'+(inside?' Карточки из папки остались на доске.':''),{label:'Отменить',run:()=>{
    if(store.history.at(-1)!==mark){status('После удаления были другие изменения. Отмена по шагам — в меню.');return;}
    store.undo();
  }});
};
$('#move').onclick=()=>{const node=store.get(selected);if(!node)return;const holder=$('#move-destinations');holder.replaceChildren();const destinations=[{id:null,title:'Моя доска'},...store.state.nodes.filter(n=>n.type==='folder'&&!lockFor(n.id)&&store.canMove(node.id,n.id))];for(const dest of destinations){const button=action(dest.id?store.ancestors(dest.id).map(n=>n.title).join(' / '):dest.title,()=>{const id=node.id;attempt(()=>store.move(id,dest.id));$('#move-dialog').close();selected=null;renderBoard();status('Карточка перемещена: '+dest.title+'.');},'destination');button.disabled=dest.id===node.parentId;holder.append(button);}$('#move-dialog').showModal();};
$('#back').onclick=()=>{const locked=lockFor(route.id);go((locked||store.get(route.id))?.parentId??null);};
function exportBoard(){
  let content=store.export();if(store.readOnly){try{content=storage.getItem(KEY)||content;}catch{}}
  const url=URL.createObjectURL(new Blob([content],{type:'application/json'})),a=el('a',{href:url,download:'cabinet-board-'+new Date().toISOString().slice(0,10)+'.json'});
  a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);status('Копия доски экспортирована.');
}
$('#export').onclick=()=>attempt(()=>{
  if(storage.getItem(PIN_KEY)||store.state.nodes.some(isProtected))requirePin('Подтвердить экспорт',exportBoard);
  else exportBoard();
});
$('#import').onclick=()=>$('#import-file').click();$('#import-file').onchange=async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;if(file.size>5*1024*1024){status('Файл слишком большой. Максимум — 5 МБ.');return;}try{const data=JSON.parse(await file.text());confirm('Заменить текущую доску?', 'Перед импортом можно закрыть это окно и экспортировать текущую доску. Замена доступна для отмены в этой вкладке.','Импортировать',()=>{disposeScreen();unlocked.clear();store.import(data);selected=null;history.replaceState(null,'','#/board');navigate();fit();status('Доска импортирована.');});}catch(error){status('Не удалось прочитать файл: '+error.message);}};
// Two fingers on the board: pinch to zoom and move the field at the same time.
const touches=new Map();let pinch=null;
function pinchFrame(){const [a,b]=[touches.get(pinch.a),touches.get(pinch.b)],r=board.getBoundingClientRect();return {d:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),x:(a.x+b.x)/2-r.left,y:(a.y+b.y)/2-r.top};}
function endPinch(){if(!pinch)return;pinch=null;board.classList.remove('panning','dragging');suppressClickUntil=performance.now()+400;rememberCamera();}
board.addEventListener('pointerdown',event=>{
  if(event.pointerType!=='touch')return;
  touches.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(list||pinch||touches.size!==2||drag)return;
  pendingMouseDrag=null;hold.cancel();widgetMenu.close();
  const [a,b]=[...touches.keys()];pinch={a,b};pinch.start=pinchFrame();pinch.camera={...camera};
  board.classList.add('panning','dragging');event.preventDefault();
},true);
function releaseTouch(event){if(!touches.delete(event.pointerId))return;if(pinch&&(event.pointerId===pinch.a||event.pointerId===pinch.b))endPinch();}
document.addEventListener('pointerup',releaseTouch,true);document.addEventListener('pointercancel',releaseTouch,true);
board.addEventListener('pointerdown',event=>{
  if(!event.isPrimary){hold.cancel();return;}
  suppressClickUntil=0;
  const frame=event.target.closest('.widget');
  if(!frame){if(editingId)finishEditing();return;}
  if(editingId&&editingId!==frame.dataset.id)finishEditing();
  if(event.button!==0||event.pointerType==='mouse'||hand||space||editingId===frame.dataset.id||lockFor(frame.dataset.id)||event.target.closest(dragExclusions+',.transform-handle'))return;
  hold.start(event.pointerId,event.clientX,event.clientY,frame.dataset.id);
},true);
document.addEventListener('pointerdown',event=>{if(!event.isPrimary){pendingMouseDrag=null;hold.cancel();if(drag)endDrag({pointerId:drag.pointer},drag.kind!=='pan');}},true);
document.addEventListener('pointerup',event=>{
  if(pendingMouseDrag?.pointerId===event.pointerId)pendingMouseDrag=null;
  if(hold.end(event.pointerId))suppressClickUntil=performance.now()+600;
},true);
document.addEventListener('pointercancel',event=>{
  if(pendingMouseDrag?.pointerId===event.pointerId)pendingMouseDrag=null;
  hold.cancel();
},true);
board.addEventListener('click',event=>{if(performance.now()<suppressClickUntil){suppressClickUntil=0;event.preventDefault();event.stopImmediatePropagation();}},true);
board.addEventListener('contextmenu',event=>{if(event.target.closest('.widget')&&!event.target.closest('input,textarea'))event.preventDefault();});
board.addEventListener('dragstart',event=>{if(event.target.closest('.widget'))event.preventDefault();});
board.addEventListener('scroll',()=>hold.cancel(),true);
function startCardDrag(frame,event,handle=null){
  const node=store.get(frame.dataset.id);if(!node||drag||lockFor(node.id))return;
  const p=point(event);selected=node.id;
  drag={pointer:event.pointerId,startX:event.clientX,startY:event.clientY,p,kind:handle?(handle.dataset.rotate!==undefined?'rotate':'resize'):'move',id:node.id,frame,original:{...node.layout},preview:{...node.layout}};
  if(drag.kind==='resize'){drag.sx=handle.dataset.corner.includes('e')?1:-1;drag.sy=handle.dataset.corner.includes('s')?1:-1;}
  if(drag.kind==='rotate')drag.startAngle=Math.atan2(p.y-node.layout.y,p.x-node.layout.x)*180/Math.PI;
  try{board.setPointerCapture(event.pointerId);}catch{drag=null;return;}
  frame.classList.add('dragging-card');board.classList.add('dragging');
  (handle||frame.querySelector('[data-drag]')).focus({preventScroll:true});highlight();$('#inspector').hidden=true;
  return true;
}
board.addEventListener('pointerdown',event=>{
  if(list||drag||!event.isPrimary||event.button>1||event.target.closest(dragExclusions+',.board-empty'))return;
  const frame=event.target.closest('.widget'),handle=event.target.closest('.transform-handle');
  if(!frame||hand||space||event.button===1){
    board.setPointerCapture(event.pointerId);
    drag={pointer:event.pointerId,startX:event.clientX,startY:event.clientY,kind:'pan',camera:{...camera}};
    board.classList.add('panning','dragging');$('#pan-mode').focus({preventScroll:true});
  }else if(event.pointerType==='mouse'&&!handle){
    // Leave the original click alone until the pointer actually moves.
    pendingMouseDrag={frame,pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY};
    return;
  }else if((!handle&&editingId!==frame.dataset.id)||!startCardDrag(frame,event,handle))return;
  hold.cancel();event.preventDefault();
});
document.addEventListener('pointermove',event=>{
  const touch=touches.get(event.pointerId);
  if(touch){touch.x=event.clientX;touch.y=event.clientY;}
  if(pinch){
    if(event.pointerId!==pinch.a&&event.pointerId!==pinch.b)return;
    const now=pinchFrame(),from=pinch.start,c=pinch.camera,z=clamp(c.z*now.d/from.d,.2,2);
    camera={z,x:now.x-(from.x-c.x)/c.z*z,y:now.y-(from.y-c.y)/c.z*z};paintCamera();return;
  }
  hold.move(event.pointerId,event.clientX,event.clientY);
  const pending=pendingMouseDrag;
  if(pending?.pointerId===event.pointerId){
    if(!(event.buttons&1)||!pending.frame.isConnected){pendingMouseDrag=null;return;}
    if(Math.hypot(event.clientX-pending.clientX,event.clientY-pending.clientY)<4)return;
    pendingMouseDrag=null;
    if(!startCardDrag(pending.frame,pending))return;
  }
  if(!drag||drag.pointer!==event.pointerId)return;
  if(drag.kind==='pan'){camera.x=drag.camera.x+event.clientX-drag.startX;camera.y=drag.camera.y+event.clientY-drag.startY;paintCamera();return;}
  const p=point(event),l=drag.original,node=store.get(drag.id);if(!node)return;
  if(drag.kind==='move')drag.preview={...l,x:clamp(l.x+p.x-drag.p.x,-100000,100000),y:clamp(l.y+p.y-drag.p.y,-100000,100000)};
  if(drag.kind==='resize')drag.preview=resizeRotated(l,p,drag.sx,drag.sy,registry.get(node.type)?.minSize,event.shiftKey);
  if(drag.kind==='rotate'){let a=l.rotation+Math.atan2(p.y-l.y,p.x-l.x)*180/Math.PI-drag.startAngle;if(event.shiftKey)a=Math.round(a/15)*15;drag.preview={...l,rotation:normalizeAngle(a)};}
  paintLayout(drag.frame,drag.preview);all('.drop-target').forEach(n=>n.classList.remove('drop-target'));drag.target=null;
  if(drag.kind==='move'&&Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>8){const target=store.children(currentParent).filter(n=>n.type==='folder'&&!lockFor(n.id)&&store.canMove(drag.id,n.id)&&containsPoint(n.layout,p)).at(-1);if(target){drag.target=target.id;all('.widget').find(frame=>frame.dataset.id===target.id)?.classList.add('drop-target');}}
},{passive:true});
function endDrag(event,cancel=false){
  if(!drag||drag.pointer!==event.pointerId)return;const d=drag;drag=null;
  hold.cancel();board.classList.remove('panning','dragging');d.frame?.classList.remove('dragging-card');
  if(board.hasPointerCapture(event.pointerId))board.releasePointerCapture(event.pointerId);
  if(d.kind==='pan'){if(cancel)camera=d.camera;paintCamera();rememberCamera();return;}
  const changed=Object.keys(d.original).some(key=>d.original[key]!==d.preview[key]);
  suppressClickUntil=performance.now()+600;
  if(!cancel&&changed){
    if(d.target){
      const moved=attempt(()=>{store.move(d.id,d.target);return true;});
      if(moved){selected=null;status('Карточка перемещена в папку.');}
    }else attempt(()=>store.update(d.id,{layout:d.preview}));
  }
  // A saved layout re-renders through the store subscription. A cancelled or
  // stationary hold keeps its existing card so the lift can unwind in place.
  if(d.frame.isConnected){
    paintLayout(d.frame,store.get(d.id)?.layout??d.original);
    all('.drop-target').forEach(frame=>frame.classList.remove('drop-target'));
  }else{
    const frame=all('.widget').find(frame=>frame.dataset.id===d.id);
    frame?.classList.add('settling');
    frame?.querySelector('[data-drag]')?.focus({preventScroll:true});
  }
  inspect();
}
board.addEventListener('pointerup',event=>endDrag(event));board.addEventListener('pointercancel',event=>endDrag(event,true));board.addEventListener('lostpointercapture',event=>endDrag(event,true));
board.addEventListener('wheel',event=>{if(list||drag||!event.ctrlKey&&!event.metaKey)return;event.preventDefault();const r=board.getBoundingClientRect();zoom(Math.exp(-event.deltaY*.006),event.clientX-r.left,event.clientY-r.top);},{passive:false});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!document.querySelector('dialog[open]')){pendingMouseDrag=null;hold.cancel();if(editingId){event.preventDefault();if(drag)endDrag({pointerId:drag.pointer},true);finishEditing();return;}}
  if(event.target.matches('input,textarea,select')||document.querySelector('dialog[open]'))return;
  if(event.code==='Space'&&route.kind==='board'&&!list&&!event.target.closest('button,a')){event.preventDefault();space=true;paintCamera();}
  if(event.key==='Escape'&&route.kind==='widget'){event.preventDefault();$('#back').click();return;}
  if(event.key==='Escape'){if(drag)endDrag({pointerId:drag.pointer},true);selected=null;hand=false;space=false;$('#pan-mode').setAttribute('aria-pressed','false');inspect();highlight();paintCamera();}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&route.kind==='board'){event.preventDefault();store.undo();}
  const frame=event.target.closest('.widget');if(list||!frame||editingId!==frame.dataset.id||!event.key.startsWith('Arrow'))return;event.preventDefault();const node=store.get(frame.dataset.id),step=event.shiftKey?10:1,dx=event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0,dy=event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0;selected=node.id;const cls=event.target.className;const patch=event.target.dataset.rotate!==undefined?{rotation:normalizeAngle(node.layout.rotation+(dx||-dy))}:event.target.dataset.corner?{w:clamp(node.layout.w+dx,registry.get(node.type)?.minSize.w||220,1600),h:clamp(node.layout.h+dy,registry.get(node.type)?.minSize.h||170,1600)}:{x:node.layout.x+dx,y:node.layout.y+dy};attempt(()=>store.update(node.id,{layout:patch}));const matching=all('.widget').find(n=>n.dataset.id===node.id);matching?.querySelector(cls.includes('rotate-handle')?'.rotate-handle':cls.includes('resize-handle')?'.resize-handle':'[data-drag]')?.focus({preventScroll:true});
});
document.addEventListener('keyup',event=>{if(event.code==='Space'){space=false;paintCamera();}});window.addEventListener('blur',()=>{touches.clear();endPinch();pendingMouseDrag=null;hold.cancel();space=false;if(drag)endDrag({pointerId:drag.pointer},true);paintCamera();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){pendingMouseDrag=null;hold.cancel();}});
function protectedIds(raw){
  let nodes;
  try{nodes=JSON.parse(raw)?.nodes;}catch{return [];}
  if(!Array.isArray(nodes))return [];
  const byId=new Map(nodes.filter(node=>node&&typeof node.id==='string').map(node=>[node.id,node]));
  return [...byId.values()].filter(node=>{
    const visited=new Set();
    for(let entry=node;entry&&!visited.has(entry.id);entry=byId.get(entry.parentId)){
      if(entry.pinProtected===true)return true;
      visited.add(entry.id);
    }
    return false;
  }).map(node=>node.id).sort();
}
let adoptTimer;
function adoptExternal(){
  clearTimeout(adoptTimer);
  if(drag||pendingMouseDrag){adoptTimer=setTimeout(adoptExternal,400);return;}
  try{
    const raw=storage.getItem(KEY);
    if(raw===null||raw===store.savedSnapshot)return;
    store.adopt(raw);
    if(route.id&&!store.get(route.id))navigate();
    status('Доска обновлена: изменения из другой вкладки или с другого устройства.');
  }catch(error){status('Не удалось загрузить изменения: '+error.message+' Обнови страницу.');}
}
storage.onExternalChange(event=>{
  if(event.key===SYNC_STATUS_KEY||event.key===DRIVE_STATUS_KEY||event.key===DRIVE_SETTINGS_KEY){saved();return;}
  if(event.key===PIN_KEY||event.key===null){lockCards();return;}
  if(event.key!==KEY)return;
  const next=protectedIds(event.newValue);
  if(JSON.stringify(next)!==JSON.stringify(protectedIds(event.oldValue))){
    for(const id of next)externalProtected.add(id);
    lockCards();
  }
  adoptExternal();
});
window.addEventListener('beforeunload',()=>{if(screenCleanup)screenCleanup();});
window.addEventListener('pagehide',()=>cameras.flush());
document.addEventListener('visibilitychange',()=>{if(document.hidden)cameras.flush();});
cloud=setupCloud({storage,store,onLocalChange:key=>{if(key===KEY)adoptExternal();else if(key===PIN_KEY)lockCards();else if(key===DRIVE_STATUS_KEY||key===DRIVE_SETTINGS_KEY)saved();}});
$('#drive-connect').onclick=$('#drive-signin').onclick=()=>cloud.connect().then(()=>{saved();status('Google Диск подключён. Синхронизирую…');}).catch(error=>status(error.message));
$('#drive-disconnect').onclick=()=>cloud.disconnect().then(()=>{saved();status('Google Диск отключён. Доска остаётся на этом устройстве.');});
const cloudNotice=await cloud.start();
if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol))navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
navigate();
if(cloudNotice)status(cloudNotice);
