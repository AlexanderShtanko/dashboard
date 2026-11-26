import {el,safeUrl} from '../core/dom.js';
import {icon} from '../core/icons.js';
import {MAX_LINKS,normalizeUrl,hostOf,displayTitle,avatarLetter,avatarColor,moveItem,faviconUrl} from './links-data.js';

// Shortcuts in the spirit of Chrome's new tab page: round tiles with favicons,
// a ⋯ menu on hover, a dialog to add or edit, and drag to reorder.
// Data format is unchanged since v1: {items:[{title,url}]}.

const reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const coarsePointer=()=>globalThis.matchMedia?.('(pointer: coarse)').matches;
const inExtension=()=>globalThis.location?.protocol==='chrome-extension:';

function tileIcon(item){
  const letter=el('span',{class:'link-letter','aria-hidden':'true'},avatarLetter(item));
  letter.style.setProperty('--avatar',avatarColor(item));
  const circle=el('span',{class:'link-circle'},letter);
  const img=el('img',{class:'link-favicon',alt:'',draggable:'false',referrerpolicy:'no-referrer',decoding:'async'});
  img.addEventListener('load',()=>{if(img.naturalWidth>1)circle.classList.add('has-favicon');else img.remove();});
  img.addEventListener('error',()=>img.remove());
  img.src=faviconUrl(item.url,{extension:inExtension()});
  circle.append(img);
  return circle;
}

function shortcuts(ctx,{screen=false}={}){
  const grid=el('div',{class:'links-grid'+(screen?' links-grid-large':''),role:'list','aria-label':'Ярлыки'});
  const hint=el('p',{class:'muted links-empty'},'Добавьте сайты, которые открываете чаще всего.');
  const root=el('div',{class:'links-shortcuts'},hint,grid);
  let menu=null,menuCleanup=null,dialog=null,drag=null,press=null,suppressUntil=0;
  const items=()=>ctx.latest().data.items;

  function save(next,message){
    ctx.update({...ctx.latest().data,items:next});
    if(message)ctx.feedback?.(message);
    render();
  }
  function render(focusIndex=null){
    const list=items();
    hint.hidden=list.length>0;
    grid.replaceChildren(...list.map(tile),...(list.length<MAX_LINKS?[addTile()]:[]));
    if(focusIndex!==null)grid.children[focusIndex]?.querySelector('a')?.focus({preventScroll:true});
  }

  function tile(item,index){
    const title=displayTitle(item);
    const link=el('a',{class:'link-tile-link',href:safeUrl(item.url),rel:'noreferrer',draggable:'false',title:title+'\n'+hostOf(item.url)},
      tileIcon(item),el('span',{class:'link-title'},title));
    const more=el('button',{type:'button',class:'link-more','aria-label':'Изменить или удалить: '+title,'aria-haspopup':'menu','aria-expanded':'false',
      onClick:event=>{event.preventDefault();event.stopPropagation();openMenu(more,index,true);}},icon('more'));
    const node=el('div',{class:'link-tile',role:'listitem','data-index':index,'data-no-card-drag':true},link,more);
    link.addEventListener('contextmenu',event=>{event.preventDefault();if(menu?.anchor!==more)openMenu(more,index);});
    link.addEventListener('keydown',event=>{
      if(!event.altKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;
      event.preventDefault();reorder(index,index+(event.key==='ArrowLeft'?-1:1));
    });
    node.addEventListener('pointerdown',event=>pointerDown(event,node,more,index));
    return node;
  }
  function addTile(){
    return el('div',{class:'link-tile link-add',role:'listitem','data-no-card-drag':true},
      el('button',{type:'button',class:'link-tile-link',onClick:()=>openDialog()},
        el('span',{class:'link-circle'},icon('plus')),el('span',{class:'link-title'},'Добавить')));
  }

  function reorder(from,to){
    const list=items();if(to<0||to>=list.length)return;
    save(moveItem(list,from,to),'Порядок ярлыков сохранён.');
    if(screen)render(to);
  }
  function remove(index){
    const list=items();if(!list[index])return;
    save(list.filter((_,i)=>i!==index),'Ярлык «'+displayTitle(list[index])+'» удалён. Можно отменить.');
  }

  // ⋯ menu, attached to <body> so board zoom and card rotation do not distort it.
  function closeMenu(restoreFocus=false){
    if(!menu)return;
    const anchor=menu.anchor;menu.remove();menu=null;menuCleanup?.();menuCleanup=null;
    anchor?.setAttribute('aria-expanded','false');
    if(restoreFocus&&anchor?.isConnected)anchor.focus({preventScroll:true});
  }
  function openMenu(anchor,index,toggle=false){
    const reopen=menu?.anchor===anchor;closeMenu();if(reopen&&toggle)return;
    const item=items()[index];if(!item)return;
    const last=items().length-1;
    const entries=[
      ['Изменить',icon('note'),()=>openDialog(index)],
      ...(coarsePointer()&&index>0?[['Сдвинуть левее','←',()=>reorder(index,index-1)]]:[]),
      ...(coarsePointer()&&index<last?[['Сдвинуть правее','→',()=>reorder(index,index+1)]]:[]),
      ['Удалить',icon('close'),()=>remove(index),true],
    ];
    menu=el('div',{class:'widget-menu link-menu',role:'menu','aria-label':'Ярлык: '+displayTitle(item)},
      el('div',{class:'widget-menu-title',role:'presentation'},displayTitle(item)),
      ...entries.map(([label,glyph,run,danger])=>el('button',{type:'button',role:'menuitem',class:'widget-menu-item'+(danger?' danger':''),
        onClick:()=>{closeMenu();run();}},el('span',{'aria-hidden':'true'},glyph),label)));
    menu.anchor=anchor;anchor.setAttribute('aria-expanded','true');
    document.body.append(menu);
    const rect=anchor.getBoundingClientRect(),box=menu.getBoundingClientRect(),pad=10;
    let top=rect.bottom+6;if(top+box.height>innerHeight-pad)top=Math.max(pad,rect.top-box.height-6);
    menu.style.left=Math.max(pad,Math.min(rect.right-box.width,innerWidth-box.width-pad))+'px';
    menu.style.top=top+'px';
    const buttons=[...menu.querySelectorAll('button')];buttons[0]?.focus({preventScroll:true});
    const outside=event=>{if(!menu?.contains(event.target)&&event.target!==anchor)closeMenu();};
    const keys=event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeMenu(true);return;}
      if(event.key==='Tab'){closeMenu();return;}
      if(!['ArrowDown','ArrowUp'].includes(event.key))return;
      event.preventDefault();const i=buttons.indexOf(document.activeElement);
      buttons[(i+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();
    };
    const away=()=>closeMenu();
    document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',keys,true);
    addEventListener('resize',away);document.addEventListener('wheel',away,{passive:true,capture:true});
    menuCleanup=()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',keys,true);removeEventListener('resize',away);document.removeEventListener('wheel',away,true);};
  }

  // Add / edit dialog, like Chrome's "Добавить ярлык".
  function closeDialog(){const current=dialog;dialog=null;if(current?.open)current.close();current?.remove();}
  function openDialog(index=null){
    closeDialog();closeMenu();
    const editing=index===null?null:items()[index];
    if(index!==null&&!editing)return;
    const title=el('input',{maxlength:160,value:editing?.title||'',autocomplete:'off',placeholder:'Как подписать ярлык'});
    const url=el('input',{type:'text',inputmode:'url',value:editing?.url||'',placeholder:'например, ya.ru',autocomplete:'off',spellcheck:'false',autocapitalize:'off'});
    const error=el('p',{class:'form-error',role:'alert'});
    const done=el('button',{class:'button primary',type:'submit'},'Готово');
    const check=()=>{done.disabled=!normalizeUrl(url.value);error.textContent='';};
    url.addEventListener('input',check);
    url.addEventListener('blur',()=>{if(url.value.trim()&&!normalizeUrl(url.value))error.textContent='Проверьте адрес: например, ya.ru или https://example.com';});
    const form=el('form',{class:'link-dialog-form',onSubmit:event=>{
      event.preventDefault();
      const href=normalizeUrl(url.value);
      if(!href){error.textContent='Проверьте адрес: например, ya.ru или https://example.com';url.focus();return;}
      const entry={title:title.value.trim()||hostOf(href)||href,url:href};
      const list=items().slice();
      if(editing){const at=list.indexOf(editing);list[at>=0?at:index]={...editing,...entry};}else list.push(entry);
      closeDialog();
      save(list,editing?'Ярлык изменён.':'Ярлык добавлен.');
    }},
      el('label',{class:'field'},el('span',{},'Название'),title),
      el('label',{class:'field'},el('span',{},'Адрес сайта'),url),
      error,
      el('div',{class:'modal-actions'},
        editing?el('button',{type:'button',class:'button link-dialog-remove',onClick:()=>{closeDialog();remove(index);}},'Удалить'):null,
        el('button',{type:'button',class:'button',onClick:closeDialog},'Отмена'),done));
    dialog=el('dialog',{class:'modal small link-dialog','aria-label':editing?'Изменить ярлык':'Добавить ярлык'},
      el('h2',{},editing?'Изменить ярлык':'Добавить ярлык'),form);
    dialog.addEventListener('close',()=>{if(dialog?.open===false)closeDialog();});
    dialog.addEventListener('click',event=>{if(event.target===dialog)closeDialog();});
    document.body.append(dialog);dialog.showModal();check();
    (editing?title:url).focus();
  }

  // Mouse and pen: drag a tile onto another to reorder. Touch: long press opens the menu.
  function pointerDown(event,node,more,index){
    if(!event.isPrimary||event.button!==0||event.target.closest('.link-more'))return;
    if(event.pointerType==='touch'){
      press={pointerId:event.pointerId,x:event.clientX,y:event.clientY,timer:setTimeout(()=>{press=null;suppressUntil=performance.now()+700;if(menu?.anchor!==more)openMenu(more,index);},480)};
      listen(true);return;
    }
    event.preventDefault(); // no text selection; click still follows
    drag={node,pointerId:event.pointerId,x:event.clientX,y:event.clientY,active:false};
    listen(true);
  }
  function listen(on){
    const method=on?'addEventListener':'removeEventListener';
    document[method]('pointermove',onMove,true);document[method]('pointerup',onUp,true);
    document[method]('pointercancel',onCancel,true);document[method]('keydown',onKey,true);
  }
  function stopGestures(){
    if(press)clearTimeout(press.timer);press=null;
    if(drag){drag.node.classList.remove('dragging');grid.classList.remove('reordering');}
    drag=null;listen(false);
  }
  function onMove(event){
    if(press&&event.pointerId===press.pointerId){if(Math.hypot(event.clientX-press.x,event.clientY-press.y)>8)stopGestures();return;}
    if(!drag||event.pointerId!==drag.pointerId)return;
    if(!drag.active){
      if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<5)return;
      drag.active=true;drag.node.classList.add('dragging');grid.classList.add('reordering');closeMenu();
    }
    const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.link-tile');
    if(!target||target===drag.node||target.parentNode!==grid||target.classList.contains('link-add'))return;
    const tiles=[...grid.children];
    const before=tiles.indexOf(target)<tiles.indexOf(drag.node);
    animate(()=>grid.insertBefore(drag.node,before?target:target.nextSibling));
  }
  function onUp(event){
    if(press&&event.pointerId===press.pointerId){stopGestures();return;}
    if(!drag||event.pointerId!==drag.pointerId)return;
    const active=drag.active;stopGestures();if(!active)return;
    suppressUntil=performance.now()+400;
    const list=items(),order=[...grid.querySelectorAll('.link-tile:not(.link-add)')].map(tile=>Number(tile.dataset.index));
    if(order.length!==list.length||order.every((value,i)=>value===i)){render();return;}
    save(order.map(i=>list[i]),'Порядок ярлыков сохранён.');
  }
  function onCancel(event){
    if(press?.pointerId===event.pointerId){stopGestures();return;}
    if(drag?.pointerId===event.pointerId){const active=drag.active;stopGestures();if(active)render();}
  }
  function onKey(event){
    if(event.key!=='Escape'||!drag?.active)return;
    event.preventDefault();event.stopPropagation();stopGestures();suppressUntil=performance.now()+400;render();
  }
  // Positions in the card's own coordinates, so zoom and rotation do not skew the animation.
  function animate(change){
    if(reducedMotion()){change();return;}
    const tiles=[...grid.children],before=new Map(tiles.map(tile=>[tile,[tile.offsetLeft,tile.offsetTop]]));
    change();
    for(const tile of tiles){
      const [x,y]=before.get(tile),dx=x-tile.offsetLeft,dy=y-tile.offsetTop;
      if(dx||dy)tile.animate?.([{transform:`translate(${dx}px,${dy}px)`},{transform:'none'}],{duration:170,easing:'cubic-bezier(.2,.7,.3,1)'});
    }
  }
  grid.addEventListener('click',event=>{if(performance.now()<suppressUntil){event.preventDefault();event.stopPropagation();}},true);

  render();
  return {element:root,dispose(){stopGestures();closeMenu();closeDialog();}};
}

export const links={type:'links',version:1,title:'Ярлыки',description:'Любимые сайты плитками, как на новой вкладке Chrome.',icon:'links',tone:'sand',size:{w:340,h:250},createData:()=>({items:[]}),
  validate:d=>Array.isArray(d.items)&&d.items.length<=MAX_LINKS&&d.items.every(item=>typeof item.title==='string'&&typeof item.url==='string'&&safeUrl(item.url)),
  renderCard:ctx=>shortcuts(ctx),
  renderScreen(ctx){
    const view=shortcuts(ctx,{screen:true});
    view.element.append(el('p',{class:'muted links-help'},'Перетащите ярлык мышью, чтобы изменить порядок. Наведите на ярлык и нажмите ⋯, чтобы изменить или удалить его. С клавиатуры: Alt + ← / →.'));
    return view;
  }
};
