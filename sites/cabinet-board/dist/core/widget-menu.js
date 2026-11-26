import {icon} from './icons.js';
import {el} from './dom.js';

/** Body-level menu: canvas zoom, rotation and clipping must not affect it. */
export function createWidgetMenu(onAction){
  const menu=el('div',{id:'widget-menu',class:'widget-menu',role:'menu','aria-label':'Действия с виджетом',hidden:true});
  document.body.append(menu);
  let anchor=null;
  function close(restoreFocus=false){
    if(menu.hidden)return;
    const previous=anchor;
    menu.hidden=true;anchor=null;
    menu.replaceChildren();
    menu.setAttribute('aria-label','Действия с виджетом');
    previous?.setAttribute('aria-expanded','false');
    if(restoreFocus&&previous?.isConnected)previous.focus({preventScroll:true});
  }
  function show(button,node,canOpen){
    if(anchor===button&&!menu.hidden){close(true);return;}
    close();anchor=button;
    button.setAttribute('aria-expanded','true');
    menu.setAttribute('aria-label','Действия: '+node.title);
    const entries=[
      ...(canOpen?[['open',node.type==='folder'?'Открыть папку':'Открыть виджет','↗']]:[]),
      ['settings','Редактировать карточку','✎'],
      ...(node.pinProtected?[
        ['lock','Заблокировать карточку'],
        ['unprotect','Снять защиту PIN']
      ]:[['protect','Защитить PIN-кодом']]),
      ['move','Переместить в папку…','▱'],
      ['duplicate','Дублировать','⧉'],
      ['front','На передний план','↑'],
      ['delete','Удалить','×']
    ];
    menu.replaceChildren(el('div',{class:'widget-menu-title',role:'presentation'},node.title),...entries.map(([action,label])=>el('button',{
      type:'button',role:'menuitem',class:'widget-menu-item'+(action==='delete'?' danger':''),
      onClick:()=>{close();onAction(action,node.id);}
    },el('span',{'aria-hidden':'true'},icon(({open:'expand',settings:'note',lock:'lock',protect:'lock',unprotect:'lock',move:'folder',duplicate:'duplicate',front:'front',delete:'close'})[action])),label)));
    menu.hidden=false;
    const rect=button.getBoundingClientRect(),gap=8,padding=10;
    const width=menu.offsetWidth,height=menu.offsetHeight;
    const left=Math.max(padding,Math.min(rect.right-width,window.innerWidth-width-padding));
    const top=rect.bottom+gap+height<=window.innerHeight-padding?rect.bottom+gap:Math.max(padding,rect.top-height-gap);
    menu.style.left=left+'px';menu.style.top=top+'px';
    menu.querySelector('button').focus({preventScroll:true});
  }
  menu.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
    if(event.key==='Tab'){close(true);return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    const items=[...menu.querySelectorAll('button')],index=items.indexOf(document.activeElement);
    const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
    items[next].focus();
  });
  document.addEventListener('pointerdown',event=>{if(!menu.hidden&&!menu.contains(event.target)&&!anchor?.contains(event.target))close();},true);
  document.addEventListener('scroll',event=>{if(!menu.hidden&&!menu.contains(event.target))close();},true);
  window.addEventListener('resize',()=>close());
  return {show,close};
}
