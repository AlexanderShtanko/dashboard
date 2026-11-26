import {el} from '../core/dom.js';
import {icon} from '../core/icons.js';
import {addRow,moreButton,contextMenu,sortable,coarsePointer} from '../core/ui.js';
import {MAX_TASKS,MAX_TASK_LENGTH,openTasks,doneTasks,addTask,patchTask,removeTask,restoreTask,reorderOpen,moveOpen} from './tasks-data.js';

// A checklist in the spirit of Google Tasks: add right on the card, click a task to edit,
// ⋯ or right click for the menu, drag to reorder, completed tasks fold away.
function checklist(ctx,{screen=false}={}){
  const root=el('div',{class:'tasks'+(screen?' tasks-screen':'')});
  const items=()=>ctx.latest().data.items;
  let showDone=false,editing=null,cleanup=[];

  function save(next,{message,undo}={}){
    ctx.update({...ctx.latest().data,items:next},{render:false,silent:true});
    render();
    if(message)ctx.feedback?.(message,undo?{label:'Отменить',run:undo}:undefined);
  }
  const add=addRow({label:'Добавить задачу',placeholder:'Новая задача',maxlength:MAX_TASK_LENGTH,className:'tasks-add',onAdd:text=>{
    if(items().length>=MAX_TASKS){ctx.feedback?.(`В списке может быть до ${MAX_TASKS} задач.`);return;}
    save(addTask(items(),text,crypto.randomUUID()));
    add.show();
  }});

  function remove(item){
    const result=removeTask(items(),item.id);
    save(result.items,{message:'Задача удалена.',undo:()=>save(restoreTask(items(),result.removed,result.index))});
  }
  function toggle(item,done){
    save(patchTask(items(),item.id,{done}));
    root.querySelector(`[data-id="${CSS.escape(item.id)}"] input`)?.focus({preventScroll:true});
  }
  function menu(item,openIndex){
    const count=openTasks(items()).length;
    return {title:item.text,items:[
      {label:'Изменить',icon:'edit',run:()=>startEdit(item.id)},
      !item.done&&(screen||coarsePointer())&&openIndex>0?{label:'Выше',icon:'arrow-up',run:()=>save(moveOpen(items(),openIndex,openIndex-1))}:null,
      !item.done&&(screen||coarsePointer())&&openIndex<count-1?{label:'Ниже',icon:'arrow-down',run:()=>save(moveOpen(items(),openIndex,openIndex+1))}:null,
      {label:item.done?'Вернуть в список':'Выполнено',icon:item.done?'reset':'check',run:()=>toggle(item,!item.done)},
      {label:'Удалить',icon:'trash',danger:true,run:()=>remove(item)},
    ]};
  }
  function startEdit(id){editing=id;render();}

  function row(item,openIndex){
    const check=el('input',{type:'checkbox',class:'task-check',checked:item.done,'aria-label':(item.done?'Снять отметку: ':'Выполнено: ')+item.text,
      onChange:event=>toggle(item,event.target.checked)});
    const li=el('li',{class:'task-item'+(item.done?' is-done':''),'data-id':item.id},check);
    if(!item.done)li.dataset.index=openIndex;
    if(editing===item.id){
      const input=el('input',{class:'task-input',value:item.text,maxlength:MAX_TASK_LENGTH,'aria-label':'Текст задачи'});
      let finished=false;
      const finish=commit=>{
        if(finished)return;finished=true;editing=null;
        const text=input.value.trim();
        if(!commit||text===item.text){render();return;}
        if(!text){remove(item);return;}
        save(patchTask(items(),item.id,{text}));
      };
      input.addEventListener('keydown',event=>{
        if(event.key==='Enter'){event.preventDefault();finish(true);}
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish(false);}
      });
      input.addEventListener('blur',()=>finish(true));
      li.append(input);
      queueMicrotask(()=>{input.focus({preventScroll:true});input.setSelectionRange(input.value.length,input.value.length);});
      return li;
    }
    const text=el('button',{type:'button',class:'task-text',title:'Нажмите, чтобы изменить',onClick:()=>startEdit(item.id)},item.text);
    const more=moreButton('Действия с задачей: '+item.text,()=>menu(item,openIndex));
    contextMenu(li,more,()=>menu(item,openIndex));
    li.append(text,more);
    return li;
  }

  function render(){
    for(const dispose of cleanup)dispose();cleanup=[];
    const list=items(),open=openTasks(list),done=doneTasks(list);
    const keepAddOpen=add.isOpen()&&root.contains(document.activeElement);
    const openList=el('ul',{class:'task-list card-scroll-part','data-no-card-drag':true,'aria-label':'Задачи'},open.map((item,i)=>row(item,i)));
    cleanup.push(sortable(openList,{onDrop:order=>save(reorderOpen(items(),order)),onCancel:render}).dispose);
    const children=[add.element];
    if(!list.length)children.push(el('p',{class:'tasks-empty muted'},'Список пуст. Добавьте первое дело.'));
    else if(!open.length)children.push(el('p',{class:'tasks-empty muted'},'Всё сделано.'));
    children.push(openList);
    if(done.length){
      const toggleDone=el('button',{type:'button',class:'tasks-done-toggle','aria-expanded':String(showDone),'data-no-card-drag':true,
        onClick:()=>{showDone=!showDone;render();}},el('span',{class:'tasks-chevron','aria-hidden':'true'},icon('chevron-down')),`Выполнено (${done.length})`);
      const clear=el('button',{type:'button',class:'text-button tasks-clear','data-no-card-drag':true,onClick:()=>{
        const cleared=doneTasks(items());
        save(openTasks(items()),{message:`Удалено выполненных: ${cleared.length}.`,undo:()=>{
          const current=items(),ids=new Set(current.map(item=>item.id));
          save([...current,...cleared.filter(item=>!ids.has(item.id))].slice(0,MAX_TASKS));
        }});
      }},'Удалить выполненные');
      children.push(el('div',{class:'tasks-done-head'},toggleDone,showDone?clear:null));
      if(showDone)children.push(el('ul',{class:'task-list task-list-done','data-no-card-drag':true,'aria-label':'Выполненные задачи'},done.map(item=>row(item,-1))));
    }
    root.replaceChildren(...children);
    if(keepAddOpen)add.focus();
  }
  render();
  return {element:root,dispose(){for(const dispose of cleanup)dispose();}};
}

export const tasks={type:'tasks',version:1,title:'Задачи',description:'Список дел как в Google Задачах: добавляйте и отмечайте прямо на карточке.',icon:'tasks',tone:'white',size:{w:330,h:300},minSize:{w:250,h:240},
  createData:()=>({items:[]}),
  validate:d=>Array.isArray(d.items)&&d.items.length<=MAX_TASKS&&new Set(d.items.map(t=>t.id)).size===d.items.length&&d.items.every(t=>typeof t.id==='string'&&typeof t.text==='string'&&t.text.length<=MAX_TASK_LENGTH&&typeof t.done==='boolean'),
  renderCard:ctx=>checklist(ctx),
  renderScreen(ctx){
    const view=checklist(ctx,{screen:true});
    const help=el('p',{class:'muted tasks-help'},'Нажмите на задачу, чтобы изменить текст. Перетащите мышью, чтобы поменять порядок. ⋯ или правая кнопка открывают меню.');
    return {element:el('div',{},view.element,help),dispose:view.dispose};
  },
};
