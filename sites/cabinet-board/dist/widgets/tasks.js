import {el,action} from '../core/dom.js';
function rows(ctx,limit=Infinity){const {node,update}=ctx;return node.data.items.slice(0,limit).map(item=>el('label',{class:'task-row'},el('input',{type:'checkbox',checked:item.done,onChange:event=>update({items:ctx.latest().data.items.map(t=>t.id===item.id?{...t,done:event.target.checked}:t)})}),el('span',{class:item.done?'done':''},item.text)));}
export const tasks={type:'tasks',version:1,title:'Задачи',description:'Небольшой список конкретных шагов. Полный список — на отдельном экране.',icon:'tasks',tone:'white',size:{w:330,h:300},minSize:{w:250,h:240},createData:()=>({items:[]}),validate:d=>Array.isArray(d.items)&&d.items.length<=500&&new Set(d.items.map(t=>t.id)).size===d.items.length&&d.items.every(t=>typeof t.id==='string'&&typeof t.text==='string'&&t.text.length<=1000&&typeof t.done==='boolean'),
renderCard(ctx){
  const {items}=ctx.node.data;
  if(!items.length)return action('Добавить задачу',ctx.open,'text-button');
  const done=items.filter(item=>item.done).length;
  return el('div',{class:'tasks-preview'},rows(ctx,4),
    el('div',{class:'card-bottom'},
      el('div',{class:'task-progress'},
        el('span',{class:'muted'},`${done} из ${items.length} выполнено`),
        el('progress',{value:done,max:items.length,'aria-label':'Выполнение задач'})),
      action('Все задачи →',ctx.open,'text-button')));
},
renderScreen(ctx){
  const root=el('div');
  function render(){
    const {items}=ctx.latest().data;
    const input=el('input',{placeholder:'Новая задача',maxlength:1000,required:true,'aria-label':'Новая задача'});
    root.replaceChildren(el('form',{class:'inline-form',onSubmit:event=>{
      event.preventDefault();
      const text=input.value.trim();if(!text)return;
      ctx.update({items:[...ctx.latest().data.items,{id:crypto.randomUUID(),text,done:false}]});
      render();root.querySelector('input').focus();
    }},input,el('button',{class:'button primary',type:'submit'},'Добавить')));
    for(const item of items){
      const change=patch=>{
        ctx.update({items:ctx.latest().data.items.map(task=>task.id===item.id?{...task,...patch}:task)});
        render();
      };
      const check=el('input',{type:'checkbox',checked:item.done,'aria-label':'Выполнено: '+item.text,onChange:event=>change({done:event.target.checked})});
      const text=el('input',{value:item.text,maxlength:1000,'aria-label':'Текст задачи',class:item.done?'done':'',onChange:event=>change({text:event.target.value.trim()||item.text})});
      const remove=el('button',{type:'button',class:'icon-button','aria-label':'Удалить задачу: '+item.text,onClick:()=>{
        ctx.update({items:ctx.latest().data.items.filter(task=>task.id!==item.id)});render();
      }},'×');
      root.append(el('div',{class:'task-edit'},check,text,remove));
    }
  }
  render();return root;
}
};
