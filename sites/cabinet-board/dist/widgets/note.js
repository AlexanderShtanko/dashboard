import {el} from '../core/dom.js';

// Like a sticky note in Google Keep: type right on the card, it saves by itself.
// The separate screen is a larger editor for the same text. Data format v1: {body}.
function editor(ctx,{screen=false}={}){
  const input=el('textarea',{class:screen?'note-editor':'note-inline card-scroll','aria-label':'Текст заметки: '+ctx.node.title,
    placeholder:screen?'Начните писать…':'Заметка…',maxlength:100000,value:ctx.node.data.body,spellcheck:'true'});
  let debounce,saved=ctx.node.data.body;
  const save=()=>{
    clearTimeout(debounce);
    if(input.value===saved)return;
    saved=input.value;
    ctx.update({body:input.value},{render:false,silent:true});
  };
  // In the list view and on the screen the note is as tall as its text (CSS field-sizing where supported).
  const grow=()=>{
    if(globalThis.CSS?.supports?.('field-sizing','content')||!input.closest('.list-view,.detail-content'))return;
    input.style.height='auto';input.style.height=input.scrollHeight+2+'px';
  };
  requestAnimationFrame(grow);
  input.addEventListener('input',()=>{grow();clearTimeout(debounce);debounce=setTimeout(save,400);});
  input.addEventListener('blur',save);
  input.addEventListener('keydown',event=>{if(event.key==='Escape'&&!screen){event.preventDefault();save();input.blur();}});
  return {element:input,dispose:save};
}

export const note={type:'note',version:1,title:'Заметка',description:'Мысль на полях или целая история. Пишите прямо на карточке.',icon:'note',tone:'paper',size:{w:290,h:250},
  createData:()=>({body:''}),validate:d=>typeof d.body==='string'&&d.body.length<=100000,
  renderCard:ctx=>editor(ctx),
  renderScreen:ctx=>editor(ctx,{screen:true}),
};
