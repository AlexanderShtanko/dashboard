// Pure helpers for the tasks widget (tests/tasks.test.mjs). Data format v1: {items:[{id,text,done}]}.
export const MAX_TASKS=500;
export const MAX_TASK_LENGTH=1000;

export const openTasks=items=>items.filter(item=>!item.done);
export const doneTasks=items=>items.filter(item=>item.done);

/** New tasks go to the top of the open list, like Google Tasks. */
export function addTask(items,text,id){
  const clean=String(text).trim().slice(0,MAX_TASK_LENGTH);
  if(!clean||items.length>=MAX_TASKS)return items;
  return [{id,text:clean,done:false},...items];
}

export const patchTask=(items,id,patch)=>items.map(item=>item.id===id?{...item,...patch}:item);

/** Removes a task and remembers where it was, so «Отменить» can put it back. */
export function removeTask(items,id){
  const index=items.findIndex(item=>item.id===id);
  if(index<0)return {items,removed:null,index:-1};
  return {items:items.filter(item=>item.id!==id),removed:items[index],index};
}

export function restoreTask(items,removed,index){
  if(!removed||items.some(item=>item.id===removed.id)||items.length>=MAX_TASKS)return items;
  const next=items.slice();next.splice(Math.max(0,Math.min(index,next.length)),0,removed);return next;
}

/** order: new order of the open tasks as their indexes in openTasks(items). Done tasks keep their order after them. */
export function reorderOpen(items,order){
  const open=openTasks(items);
  if(order.length!==open.length||new Set(order).size!==open.length||order.some(i=>!open[i]))return items;
  return [...order.map(i=>open[i]),...doneTasks(items)];
}

export function moveOpen(items,from,to){
  const open=openTasks(items);
  if(to<0||to>=open.length||from===to)return items;
  const order=open.map((_,i)=>i);order.splice(from,1);order.splice(to,0,from);
  return reorderOpen(items,order);
}
