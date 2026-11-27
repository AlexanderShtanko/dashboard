import {el,symbol} from '../core/dom.js';
import {contextMenu,coarsePointer} from '../core/ui.js';

// Like a folder of shortcuts: each tile opens its widget, the caption opens the whole folder.
function count(n){const mod10=n%10,mod100=n%100;return n+' '+(mod10===1&&mod100!==11?'виджет':mod10>=2&&mod10<=4&&(mod100<12||mod100>14)?'виджета':'виджетов');}

export const folder={type:'folder',version:1,title:'Новая папка',catalogTitle:'Папка с виджетами',description:'Отдельная доска внутри доски. Перетащите карточки на папку, чтобы сложить их туда.',icon:'folder',tone:'sage',size:{w:300,h:245},
  createData:()=>({description:'Всё для одного контекста.'}),validate:d=>typeof d.description==='string'&&d.description.length<=1000,
  renderCard(ctx){
    const {node,children,registry,open}=ctx;
    const nested=children(node.id),shown=nested.length>4?nested.slice(0,3):nested;
    const tiles=el('div',{class:'folder-tiles'},
      shown.map(child=>{
        const openChild=()=>ctx.openChild?ctx.openChild(child.id):open();
        const tile=el('button',{type:'button',class:'folder-tile',title:child.locked?'Закрыто PIN-кодом':'Открыть «'+child.title+'»','aria-haspopup':'menu','aria-expanded':'false',
          'aria-label':child.locked?'Закрытая карточка, открыть по PIN':'Открыть '+child.title,onClick:openChild},
          symbol(child.locked?'lock':registry.get(child.type)?.icon),el('small',{},child.title));
        // Right click or a long press: take the card out of the folder without opening it.
        if(!child.locked&&ctx.moveChildOut){
          if(coarsePointer())tile.dataset.noCardDrag='';
          contextMenu(tile,tile,()=>({title:child.title,items:[
            {label:'Открыть',icon:'open',run:openChild},
            {label:node.parentId?'Вынести из папки':'Вынести на доску',icon:'out',run:()=>ctx.moveChildOut(child.id)}]}));
        }
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
