import {icon} from './icons.js';
import {el} from './dom.js';
import {swallowTap} from './ui.js';
import {CARD_COLORS,cardColor} from './colors.js';

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
  function show(button,node,{canOpen=false,list=false,first=false,last=false,outLabel=''}={}){
    if(anchor===button&&!menu.hidden){close(true);return;}
    close();anchor=button;
    button.setAttribute('aria-expanded','true');
    menu.setAttribute('aria-label','Действия: '+node.title);
    // Order: open, change the card, arrange it, protect it, delete it.
    const entries=[
      canOpen?['open',node.type==='folder'?'Открыть папку':'Открыть','open']:null,
      ['rename','Переименовать','edit'],
      list?null:['settings','Размер и поворот','sliders'],
      ['duplicate','Дублировать','duplicate'],
      '-',
      outLabel?['out',outLabel,'out']:null,
      ['move','Переместить в папку…','folder'],
      list&&!first?['up','Выше в списке','arrow-up']:null,
      list&&!last?['down','Ниже в списке','arrow-down']:null,
      list?null:['front','На передний план','front'],
      '-',
      ...(node.pinProtected?[
        ['lock','Заблокировать','lock'],
        ['unprotect','Снять защиту PIN','lock']
      ]:[['protect','Защитить PIN-кодом','lock']]),
      ['delete','Удалить','trash']
    ].filter(Boolean);
    const current=cardColor(node.color);
    const swatches=el('div',{class:'swatch-row',role:'group','aria-label':'Цвет карточки'},...CARD_COLORS.map(([key,label])=>
      el('button',{type:'button',class:'swatch','data-color':key,title:label,'aria-label':'Цвет: '+label,'aria-pressed':String(key===current),
        onClick:()=>{close();onAction('color',node.id,key);}},key===current?icon('check'):null)));
    menu.replaceChildren(el('div',{class:'widget-menu-title',role:'presentation'},node.title),swatches,...entries.map(entry=>{
      if(entry==='-')return el('hr',{class:'widget-menu-divider'});
      const [action,label,glyph]=entry;
      return el('button',{type:'button',role:'menuitem',class:'widget-menu-item'+(action==='delete'?' danger':''),
        onClick:()=>{close();onAction(action,node.id);}},el('span',{'aria-hidden':'true'},icon(glyph)),label);
    }));
    menu.hidden=false;
    const rect=button.getBoundingClientRect(),gap=8,padding=10;
    const width=menu.offsetWidth,height=menu.offsetHeight;
    const left=Math.max(padding,Math.min(rect.right-width,window.innerWidth-width-padding));
    const top=rect.bottom+gap+height<=window.innerHeight-padding?rect.bottom+gap:Math.max(padding,rect.top-height-gap);
    menu.style.left=left+'px';menu.style.top=top+'px';
    menu.querySelector('.widget-menu-item').focus({preventScroll:true});
  }
  menu.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
    if(event.key==='Tab'){close(true);return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    const items=[...menu.querySelectorAll('.widget-menu-item')],index=items.indexOf(document.activeElement);
    const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
    items[next].focus();
  });
  document.addEventListener('pointerdown',event=>{if(!menu.hidden&&!menu.contains(event.target)&&!anchor?.contains(event.target)){swallowTap(event);close();}},true);
  document.addEventListener('scroll',event=>{if(!menu.hidden&&!menu.contains(event.target))close();},true);
  window.addEventListener('resize',()=>close());
  return {show,close};
}
