import {el} from '../core/dom.js';
export const note={type:'note',version:1,title:'Заметка',description:'Мысль на полях или целая история. Открывается в редактор.',icon:'note',tone:'paper',size:{w:290,h:250},createData:()=>({body:''}),validate:d=>typeof d.body==='string'&&d.body.length<=100000,
renderCard({node,open}){return el('button',{class:'note-preview',onClick:open,'aria-label':'Открыть заметку '+node.title},node.data.body||'Здесь есть место для мысли…');},
renderScreen({node,update,feedback}){
  const input=el('textarea',{class:'note-editor','aria-label':'Текст заметки',placeholder:'Начни писать…',maxlength:100000,value:node.data.body});
  let debounce;
  const save=()=>{clearTimeout(debounce);update({body:input.value});};
  input.addEventListener('input',()=>{feedback('Сохраняю…');clearTimeout(debounce);debounce=setTimeout(save,350);});
  input.addEventListener('blur',save);
  return {element:input,dispose:save};
}
};
