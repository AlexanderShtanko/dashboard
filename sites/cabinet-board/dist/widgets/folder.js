import {el,symbol} from '../core/dom.js';
import {openMenu} from '../core/ui.js';

// Like a folder of shortcuts: each tile opens its widget, the caption opens the whole folder.
function count(n){const mod10=n%10,mod100=n%100;return n+' '+(mod10===1&&mod100!==11?'виджет':mod10>=2&&mod10<=4&&(mod100<12||mod100>14)?'виджета':'виджетов');}

// A tile can be carried straight out of the folder card: drag it with the mouse, or hold it
// with a finger and drag. Dropped outside the folder it lands on the board at that spot.
// A hold without a move (or a right click) opens a small menu instead.
function carry(tile,{menu,drop}){
  let state=null;
  tile.dataset.noCardDrag='';
  const outside=(x,y)=>{const r=(tile.closest('.widget')||tile).getBoundingClientRect();return x<r.left||x>r.right||y<r.top||y>r.bottom;};
  const swallowClick=()=>{
    const swallow=click=>{click.preventDefault();click.stopPropagation();};
    tile.addEventListener('click',swallow,{capture:true,once:true});
    setTimeout(()=>tile.removeEventListener('click',swallow,true),700);
  };
  const lift=()=>{
    if(!state||state.ghost)return;
    const r=tile.getBoundingClientRect(),ghost=tile.cloneNode(true);
    ghost.classList.add('folder-tile-ghost');ghost.removeAttribute('title');ghost.setAttribute('aria-hidden','true');
    Object.assign(ghost.style,{width:r.width+'px',minHeight:r.height+'px',left:r.left+'px',top:r.top+'px'});
    document.body.append(ghost);state.ghost=ghost;state.dx=state.x-r.left;state.dy=state.y-r.top;
    tile.classList.add('carried');document.body.classList.add('carrying-tile');
    try{tile.setPointerCapture(state.id);}catch{}
    if(state.touch)navigator.vibrate?.(12);
    swallowClick();
  };
  const finish=()=>{
    if(!state)return;clearTimeout(state.timer);state.ghost?.remove();
    tile.classList.remove('carried');document.body.classList.remove('carrying-tile');
    try{tile.releasePointerCapture(state.id);}catch{}
    state=null;
  };
  tile.addEventListener('contextmenu',event=>{
    event.preventDefault();event.stopPropagation();
    if(!state)openMenu(tile,menu());
  });
  tile.addEventListener('pointerdown',event=>{
    if(!event.isPrimary||event.button!==0)return;
    finish();
    const touch=event.pointerType!=='mouse';
    state={id:event.pointerId,x:event.clientX,y:event.clientY,touch,moved:false,timer:touch?setTimeout(lift,420):0};
  });
  tile.addEventListener('pointermove',event=>{
    if(!state||event.pointerId!==state.id)return;
    const far=Math.hypot(event.clientX-state.x,event.clientY-state.y);
    if(!state.ghost){
      if(state.touch){if(far>8)finish();return;}
      if(far<6||!(event.buttons&1))return;
      lift();
    }
    if(far>8)state.moved=true;
    state.ghost.style.left=event.clientX-state.dx+'px';state.ghost.style.top=event.clientY-state.dy+'px';
    state.ghost.classList.toggle('will-drop',state.moved&&outside(event.clientX,event.clientY));
  });
  // Once lifted, the finger carries the tile and must not scroll the list under it.
  tile.addEventListener('touchmove',event=>{if(state?.ghost&&event.cancelable)event.preventDefault();},{passive:false});
  tile.addEventListener('pointerup',event=>{
    if(!state||event.pointerId!==state.id)return;
    const {ghost,moved,touch}=state,x=event.clientX,y=event.clientY;
    finish();
    if(!ghost)return;
    if(moved&&outside(x,y))drop(x,y);
    else if(touch&&!moved)openMenu(tile,menu());
  });
  tile.addEventListener('pointercancel',event=>{if(state&&event.pointerId===state.id)finish();});
}

export const folder={type:'folder',version:1,title:'Новая папка',catalogTitle:'Папка с виджетами',description:'Отдельная доска внутри доски. Перетащите карточки на папку, чтобы сложить их туда.',icon:'folder',tone:'sage',size:{w:300,h:245},
  createData:()=>({description:'Всё для одного контекста.'}),validate:d=>typeof d.description==='string'&&d.description.length<=1000,
  renderCard(ctx){
    const {node,children,registry,open}=ctx;
    const nested=children(node.id),shown=nested.length>4?nested.slice(0,3):nested;
    const tiles=el('div',{class:'folder-tiles'},
      shown.map(child=>{
        const openChild=()=>ctx.openChild?ctx.openChild(child.id):open();
        const tile=el('button',{type:'button',class:'folder-tile',title:child.locked?'Закрыто PIN-кодом':'Открыть «'+child.title+'». Перетащите на доску, чтобы вынести из папки','aria-haspopup':'menu','aria-expanded':'false',
          'aria-label':child.locked?'Закрытая карточка, открыть по PIN':'Открыть '+child.title,onClick:openChild},
          symbol(child.locked?'lock':registry.get(child.type)?.icon),el('small',{},child.title));
                if(!child.locked&&ctx.moveChildOut)carry(tile,{
          menu:()=>({title:child.title,items:[
            {label:'Открыть',icon:'open',run:openChild},
            {label:node.parentId?'Вынести из папки':'Вынести на доску',icon:'out',run:()=>ctx.moveChildOut(child.id)}]}),
          drop:(x,y)=>ctx.dropChild?ctx.dropChild(child.id,x,y):ctx.moveChildOut(child.id)});
        return tile;
      }),
      nested.length>4?el('button',{type:'button',class:'folder-tile folder-tile-more',onClick:open},el('strong',{},'+'+(nested.length-3)),el('small',{},'ещё')):null);
    const empty=el('button',{type:'button',class:'folder-empty',onClick:open},
      el('span',{},'Пусто'),el('small',{},'Перетащите сюда карточку или откройте папку'));
    return el('div',{class:'folder-preview'},
      nested.length?tiles:empty,
      el('div',{class:'folder-caption'},el('span',{},nested.length?count(nested.length):''),
        el('button',{type:'button',class:'text-button',onClick:open},'Открыть папку')));
  },
};
