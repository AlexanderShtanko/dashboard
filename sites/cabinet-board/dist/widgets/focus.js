import {el,action,inputField} from '../core/dom.js';
const remaining=d=>d.endsAt?Math.max(0,Math.ceil((d.endsAt-Date.now())/1000)):d.remaining;
const clock=seconds=>String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
export const focus={type:'focus',version:1,title:'Время для главного',description:'Одна задача и спокойная фокус-сессия на отдельном экране.',icon:'focus',tone:'sage',size:{w:290,h:240},createData:()=>({task:'',minutes:25,remaining:1500,endsAt:null}),validate:d=>typeof d.task==='string'&&d.task.length<=500&&Number.isFinite(d.minutes)&&d.minutes>=1&&d.minutes<=180&&Number.isFinite(d.remaining)&&d.remaining>=0&&d.remaining<=10800&&(d.endsAt===null||Number.isFinite(d.endsAt)),
renderCard(ctx){const timer=el('span',{class:'timer-preview'},clock(remaining(ctx.node.data)));const root=el('button',{class:'focus-preview',onClick:ctx.open},timer,el('span',{},ctx.node.data.task||'Выбрать одно дело'),el('small',{},'Открыть пространство фокуса ↗'));const interval=setInterval(()=>{timer.textContent=clock(remaining(ctx.latest().data));},1000);return {element:root,dispose:()=>clearInterval(interval)};},
renderScreen(ctx){
  const root=el('div',{class:'focus-layout'});
  const timer=el('div',{class:'focus-clock',role:'timer','aria-label':'Оставшееся время'});
  const finished=el('p',{class:'focus-finished muted',role:'status'});
  const task=inputField('Задача',{value:ctx.node.data.task,placeholder:'На чём сосредоточиться?',maxlength:500},value=>ctx.update({...ctx.latest().data,task:value}));
  const length=inputField('Длительность, мин.',{type:'number',value:ctx.node.data.minutes,min:1,max:180},value=>{
    const minutes=Number(value);
    if(minutes>=1&&minutes<=180){ctx.update({...ctx.latest().data,minutes,remaining:minutes*60,endsAt:null});paint();}
  });
  const toggle=action('Начать',()=>{
    const data=ctx.latest().data,seconds=remaining(data)||data.minutes*60;
    ctx.update({...data,remaining:seconds,endsAt:data.endsAt?null:Date.now()+seconds*1000});paint();
  },'button primary');
  const reset=action('Сначала',()=>{
    const data=ctx.latest().data;
    ctx.update({...data,remaining:data.minutes*60,endsAt:null});paint();
  },'button');
  function paint(){
    const data=ctx.latest().data,seconds=remaining(data);
    const time=clock(seconds),label=data.endsAt&&seconds>0?'Пауза':seconds===0?'Начать снова':'Начать';
    if(timer.textContent!==time)timer.textContent=time;
    if(toggle.textContent!==label)toggle.textContent=label;
    const message=seconds===0?'Сессия завершена.':'';
    if(finished.textContent!==message)finished.textContent=message;
    if(data.endsAt&&seconds===0)ctx.update({...data,remaining:0,endsAt:null});
  }
  root.append(el('div',{class:'focus-fields'},task,length),timer,finished,el('div',{class:'focus-actions'},toggle,reset));
  paint();
  const interval=setInterval(paint,500);
  return {element:root,dispose:()=>clearInterval(interval)};
}
};
