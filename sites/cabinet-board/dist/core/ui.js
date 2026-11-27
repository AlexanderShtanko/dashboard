// Shared widget controls in the spirit of Chrome and Google apps:
// a ⋯ menu attached to <body>, a small form dialog, an inline "+ Add" row,
// right-click / long-press for menus and mouse drag to reorder a list.
import {el} from './dom.js';
import {icon} from './icons.js';

const glyph=value=>typeof value==='string'&&/^[a-z-]+$/.test(value)?icon(value):value??'';
export const reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const coarsePointer=()=>globalThis.matchMedia?.('(pointer: coarse)').matches;

/** A touch outside an open menu only closes it: the tap must not also press what is underneath. */
export function swallowTap(event){
  if(event.pointerType!=='touch')return;
  const stop=click=>{click.preventDefault();click.stopPropagation();};
  document.addEventListener('click',stop,{capture:true,once:true});
  setTimeout(()=>document.removeEventListener('click',stop,true),700);
}

let active=null;

export function closeMenu(restoreFocus=false){
  if(!active)return;
  const {menu,anchor,cleanup}=active;active=null;
  menu.remove();cleanup();
  anchor?.setAttribute('aria-expanded','false');
  if(restoreFocus&&anchor?.isConnected)anchor.focus({preventScroll:true});
}

/** items: [{label, icon, run, danger, disabled}] or null for a divider. Clicking the same anchor again closes it. */
export function openMenu(anchor,{title,items,className=''}){
  const reopen=active?.anchor===anchor;
  closeMenu();
  if(reopen)return;
  const entries=items.filter(Boolean);
  const menu=el('div',{class:'widget-menu item-menu '+className,role:'menu','aria-label':title||'Действия'},
    title?el('div',{class:'widget-menu-title',role:'presentation'},title):null,
    ...entries.map(item=>el('button',{type:'button',role:'menuitem',class:'widget-menu-item'+(item.danger?' danger':''),disabled:!!item.disabled,
      onClick:()=>{closeMenu(true);item.run();}},el('span',{'aria-hidden':'true'},glyph(item.icon)),item.label)));
  document.body.append(menu);
  const rect=anchor.getBoundingClientRect(),box=menu.getBoundingClientRect(),pad=10;
  let top=rect.bottom+6;if(top+box.height>innerHeight-pad)top=Math.max(pad,rect.top-box.height-6);
  menu.style.left=Math.max(pad,Math.min(rect.right-box.width,innerWidth-box.width-pad))+'px';
  menu.style.top=top+'px';
  anchor.setAttribute('aria-expanded','true');
  const buttons=[...menu.querySelectorAll('button:not(:disabled)')];
  buttons[0]?.focus({preventScroll:true});
  const outside=event=>{if(!menu.contains(event.target)&&!anchor.contains(event.target)){swallowTap(event);closeMenu();}};
  const keys=event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeMenu(true);return;}
    if(event.key==='Tab'){closeMenu();return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    const i=buttons.indexOf(document.activeElement);
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
    buttons[next]?.focus();
  };
  const away=()=>closeMenu();
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',keys,true);
  addEventListener('resize',away);document.addEventListener('wheel',away,{passive:true,capture:true});
  active={menu,anchor,cleanup:()=>{
    document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',keys,true);
    removeEventListener('resize',away);document.removeEventListener('wheel',away,true);
  }};
}

/** A round ⋯ button that appears on hover, like on Chrome's shortcut tiles. */
export function moreButton(label,getMenu){
  const button=el('button',{type:'button',class:'item-more','aria-label':label,'aria-haspopup':'menu','aria-expanded':'false','data-no-card-drag':true,
    onClick:event=>{event.preventDefault();event.stopPropagation();openMenu(button,getMenu());}},icon('more'));
  return button;
}

/** Right click with a mouse, long press on a touch screen. */
export function contextMenu(target,anchor,getMenu){
  let press=null;
  const cancel=()=>{if(press){clearTimeout(press.timer);press=null;}};
  target.addEventListener('contextmenu',event=>{
    if(event.target.closest('input,textarea'))return;
    event.preventDefault();event.stopPropagation();
    if(active?.anchor!==anchor)openMenu(anchor,getMenu());
  });
  target.addEventListener('pointerdown',event=>{
    if(event.pointerType!=='touch'||!event.isPrimary)return;
    cancel();
    press={x:event.clientX,y:event.clientY,timer:setTimeout(()=>{
      press=null;
      const swallow=click=>{click.preventDefault();click.stopPropagation();};
      target.addEventListener('click',swallow,{capture:true,once:true});
      setTimeout(()=>target.removeEventListener('click',swallow,true),700);
      if(active?.anchor!==anchor)openMenu(anchor,getMenu());
    },480)};
  });
  target.addEventListener('pointermove',event=>{if(press&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>8)cancel();});
  for(const type of ['pointerup','pointercancel','pointerleave'])target.addEventListener(type,cancel);
}

/**
 * Small modal form, like Chrome's "Добавить ярлык".
 * onSubmit returns an error message to keep the dialog open, or nothing to close it.
 */
export function openDialog({title,body=[],submitLabel='Готово',cancelLabel='Отмена',onSubmit,remove,className='',focus}){
  const error=el('p',{class:'form-error',role:'alert'});
  const submit=submitLabel?el('button',{class:'button primary',type:'submit'},submitLabel):null;
  let dialog;
  const close=()=>{if(dialog.open)dialog.close();};
  const form=el('form',{class:'item-dialog-form',onSubmit:event=>{
    event.preventDefault();
    const result=onSubmit?.();
    if(typeof result==='string'){error.textContent=result;return;}
    close();
  }},
    ...body,error,
    el('div',{class:'modal-actions'},
      remove?el('button',{type:'button',class:'button item-dialog-remove',onClick:()=>{close();remove.run();}},remove.label||'Удалить'):null,
      el('button',{type:'button',class:'button',onClick:close},submit?cancelLabel:'Закрыть'),submit));
  dialog=el('dialog',{class:'modal small item-dialog '+className,'aria-label':title},el('h2',{},title),form);
  dialog.addEventListener('close',()=>dialog.remove());
  dialog.addEventListener('click',event=>{
    if(event.target!==dialog)return;
    const r=dialog.getBoundingClientRect();
    if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();
  });
  document.body.append(dialog);dialog.showModal();
  (focus||form.querySelector('input:not([readonly]),textarea,select,button[type=submit]'))?.focus();
  return {dialog,close,setError:text=>{error.textContent=text;},submit};
}

export function field(label,input,hint){
  return el('label',{class:'field'},el('span',{},label),input,hint?el('small',{class:'field-hint'},hint):null);
}

/**
 * "+ Добавить …" row that turns into an input, like Google Tasks.
 * Enter adds and keeps the field open for the next item; Esc or leaving an empty field closes it.
 */
export function addRow({label,placeholder,maxlength=200,onAdd,className=''}){
  const root=el('div',{class:'add-row '+className,'data-no-card-drag':true});
  let open=false;
  function show(focus=true){
    open=true;
    const input=el('input',{class:'add-row-input',placeholder,maxlength,'aria-label':label,enterkeyhint:'done'});
    const form=el('form',{class:'add-row-form',onSubmit:event=>{
      event.preventDefault();
      const text=input.value.trim();
      if(!text){hide(true);return;}
      input.value='';
      onAdd(text);
    }},el('span',{class:'add-row-icon','aria-hidden':'true'},icon('plus')),input);
    input.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();hide(true);}});
    input.addEventListener('blur',()=>setTimeout(()=>{if(open&&!input.value.trim()&&!root.contains(document.activeElement))hide();},120));
    root.replaceChildren(form);
    if(focus)input.focus({preventScroll:false});
  }
  function hide(restoreFocus=false){
    open=false;
    const button=el('button',{type:'button',class:'add-row-button',onClick:()=>show()},
      el('span',{class:'add-row-icon','aria-hidden':'true'},icon('plus')),label);
    root.replaceChildren(button);
    if(restoreFocus)button.focus({preventScroll:true});
  }
  hide();
  return {element:root,show,hide,isOpen:()=>open,focus:()=>root.querySelector('input')?.focus({preventScroll:true})};
}

/**
 * Mouse/pen drag to reorder the children of a vertical list.
 * Items carry data-index; onDrop receives the new order of original indexes.
 */
export function sortable(list,{onDrop,onCancel,itemSelector=':scope>[data-index]'}){
  let drag=null,suppressUntil=0;
  const items=()=>[...list.querySelectorAll(itemSelector)];
  function listen(on){
    const method=on?'addEventListener':'removeEventListener';
    document[method]('pointermove',move,true);document[method]('pointerup',up,true);
    document[method]('pointercancel',cancel,true);document[method]('keydown',key,true);
  }
  function stop(){if(drag){drag.node.classList.remove('dragging');list.classList.remove('reordering');}drag=null;listen(false);}
  function move(event){
    if(!drag||event.pointerId!==drag.pointerId)return;
    if(!drag.active){
      if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<5)return;
      drag.active=true;drag.node.classList.add('dragging');list.classList.add('reordering');closeMenu();
      document.activeElement?.blur?.();
    }
    const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-index]');
    if(!target||target===drag.node||target.parentNode!==list)return;
    const all=items(),before=all.indexOf(target)<all.indexOf(drag.node);
    animate(()=>list.insertBefore(drag.node,before?target:target.nextSibling));
  }
  function up(event){
    if(!drag||event.pointerId!==drag.pointerId)return;
    const active=drag.active;stop();if(!active)return;
    suppressUntil=performance.now()+400;
    const order=items().map(item=>Number(item.dataset.index));
    if(order.every((value,i)=>value===i)){onCancel?.();return;}
    onDrop(order);
  }
  function cancel(event){if(drag?.pointerId===event.pointerId){const active=drag.active;stop();if(active)onCancel?.();}}
  function key(event){
    if(event.key!=='Escape'||!drag?.active)return;
    event.preventDefault();event.stopPropagation();stop();suppressUntil=performance.now()+400;onCancel?.();
  }
  function animate(change){
    if(reducedMotion()){change();return;}
    const all=items(),before=new Map(all.map(item=>[item,item.offsetTop]));
    change();
    for(const item of all){const dy=before.get(item)-item.offsetTop;if(dy)item.animate?.([{transform:`translateY(${dy}px)`},{transform:'none'}],{duration:150,easing:'cubic-bezier(.2,.7,.3,1)'});}
  }
  list.addEventListener('pointerdown',event=>{
    if(!event.isPrimary||event.button!==0||event.pointerType==='touch')return;
    if(event.target.closest('input,textarea,.item-more,[data-no-sort]'))return;
    const node=event.target.closest('[data-index]');
    if(!node||node.parentNode!==list)return;
    drag={node,pointerId:event.pointerId,x:event.clientX,y:event.clientY,active:false};
    listen(true);
  });
  list.addEventListener('click',event=>{if(performance.now()<suppressUntil){event.preventDefault();event.stopPropagation();}},true);
  return {dispose:stop};
}
