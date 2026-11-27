import {isColorKey} from './colors.js';
const KEY='cabinet-board:workspace:v1';
const clone=value=>structuredClone(value);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
export function validateWorkspace(input,registry){
  if(!object(input)||input.schemaVersion!==1||!Array.isArray(input.nodes)||input.nodes.length>500)throw new Error('Не поддерживается формат доски (нужна версия 1, до 500 виджетов).');
  const nodes=input.nodes.map(node=>{
    if(!object(node)||typeof node.id!=='string'||!node.id||node.id.length>100||typeof node.type!=='string'||typeof node.title!=='string'||node.title.length>160||!Number.isInteger(node.version)||node.version<1||!object(node.data)||!object(node.layout)||!(node.parentId===null||typeof node.parentId==='string'))throw new Error('Повреждена запись виджета.');
    if(node.pinProtected!==undefined&&typeof node.pinProtected!=='boolean')throw new Error('Некорректная настройка PIN у виджета.');
    if(node.color!==undefined&&!isColorKey(node.color))throw new Error('Некорректный цвет виджета.');
    for(const key of ['x','y','w','h','rotation'])if(!Number.isFinite(node.layout[key]))throw new Error('Некорректное положение виджета.');
    if(Math.abs(node.layout.x)>100000||Math.abs(node.layout.y)>100000||node.layout.w<1||node.layout.h<1||node.layout.w>1600||node.layout.h>1600)throw new Error('Размер или положение виджета вне допустимого диапазона.');
    return registry.normalize(clone(node));
  });
  const byId=new Map(nodes.map(n=>[n.id,n]));if(byId.size!==nodes.length)throw new Error('Повторяющиеся идентификаторы.');
  for(const node of nodes){const visited=new Set([node.id]);let parent=node.parentId;while(parent!==null){if(visited.has(parent))throw new Error('Папки не могут содержать сами себя.');visited.add(parent);const folder=byId.get(parent);if(!folder||folder.type!=='folder')throw new Error('Не найдена родительская папка.');parent=folder.parentId;}}
  // Board-wide look. An unknown value is dropped, never an error: the board itself is still fine.
  return isColorKey(input.background)?{schemaVersion:1,nodes,background:input.background}:{schemaVersion:1,nodes};
}
export class BoardStore {
  constructor(registry,seed,storage=globalThis.localStorage){
    this.registry=registry;this.storage=storage;this.listeners=new Set();this.history=[];this.error='';this.readOnly=false;
    this.state=validateWorkspace(seed,registry);
    try {
      this.savedSnapshot=storage?.getItem(KEY);
      if(this.savedSnapshot)this.state=validateWorkspace(JSON.parse(this.savedSnapshot),registry);
    }catch(error){this.error='Сохранённая доска недоступна: '+error.message;this.readOnly=true;}
  }
  subscribe(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  emit(){this.listeners.forEach(listener=>listener());}
  get(id){return this.state.nodes.find(node=>node.id===id);}
  children(parentId=null){return this.state.nodes.filter(node=>node.parentId===parentId);}
  ancestors(id){const chain=[];let node=this.get(id);while(node){chain.unshift(node);node=this.get(node.parentId);}return chain;}
  canMove(id,parentId){if(!this.get(id))return false;if(parentId===null)return true;const parent=this.get(parentId);return parent?.type==='folder'&&!this.ancestors(parentId).some(node=>node.id===id);}
  persist(){
    try{
      if(this.readOnly)throw new Error('Исходные данные сохранены. Экспортируйте их или импортируйте исправленную копию.');
      if(this.storage?.getItem&&this.storage.getItem(KEY)!==this.savedSnapshot){
        throw new Error('Доска изменилась в другой вкладке. Экспортируйте текущую копию или обновите страницу.');
      }
      const snapshot=JSON.stringify(this.state);
      this.storage?.setItem(KEY,snapshot);
      this.savedSnapshot=snapshot;
      this.error='';
    }catch(error){this.error='Не сохранено: '+error.message;}
  }
  commit(operation){const before=clone(this.state),draft=clone(this.state);operation(draft);const valid=validateWorkspace(draft,this.registry);if(JSON.stringify(valid)===JSON.stringify(before))return;this.history.push(before);if(this.history.length>40)this.history.shift();this.state=valid;this.persist();this.emit();}
  add(type,parentId=null,position){const def=this.registry.get(type);if(!def)throw new Error('Неизвестный тип виджета');if(parentId!==null&&this.get(parentId)?.type!=='folder')throw new Error('Папка не найдена');const id=crypto.randomUUID(),count=this.children(parentId).length;this.commit(draft=>draft.nodes.push({id,type,version:def.version,title:def.title,parentId,data:def.createData(),layout:{x:position?.x??190+(count%3)*340,y:position?.y??170+Math.floor(count/3)*310,w:def.size.w,h:def.size.h,rotation:0}}));return id;}
  update(id,patch){this.commit(draft=>{const n=draft.nodes.find(n=>n.id===id);if(!n)return;if(patch.title!==undefined)n.title=String(patch.title).trim().slice(0,160)||'Без названия';if(patch.data)n.data=clone(patch.data);if(patch.layout)n.layout={...n.layout,...patch.layout};});}
  setProtection(id,enabled){
    const node=this.get(id);
    if(!node||Boolean(node.pinProtected)===enabled)return;
    const setFlag=entry=>{if(enabled)entry.pinProtected=true;else delete entry.pinProtected;};
    const before=node.pinProtected;
    setFlag(node);
    this.persist();
    if(this.error){if(before===undefined)delete node.pinProtected;else node.pinProtected=before;this.emit();throw new Error(this.error);}
    for(const previous of this.history){
      const entry=previous.nodes.find(item=>item.id===id);
      if(entry)setFlag(entry);
    }
    this.emit();
  }
  /** Card colour: a key from core/colors.js, or '' for the default. */
  setColor(id,color){this.commit(draft=>{const n=draft.nodes.find(n=>n.id===id);if(!n)return;if(color)n.color=color;else delete n.color;});}
  /** Board background: a key from core/colors.js, or '' for the default (grey). */
  setBackground(key){this.commit(draft=>{if(key)draft.background=key;else delete draft.background;});}
  move(id,parentId,position){if(!this.canMove(id,parentId))throw new Error('Нельзя переместить папку внутрь самой себя.');if(this.get(id).parentId===parentId)return;const count=this.children(parentId).length;this.commit(draft=>{const i=draft.nodes.findIndex(n=>n.id===id),n=draft.nodes[i];n.parentId=parentId;n.layout.x=position?.x??190+(count%3)*340;n.layout.y=position?.y??170+Math.floor(count/3)*310;draft.nodes.push(...draft.nodes.splice(i,1));});}
  remove(id){this.commit(draft=>{const n=draft.nodes.find(n=>n.id===id);if(!n)return;draft.nodes.filter(child=>child.parentId===id).forEach((child,i)=>{child.parentId=n.parentId;if(n.pinProtected)child.pinProtected=true;child.layout.x=n.layout.x+35*(i+1);child.layout.y=n.layout.y+35*(i+1);});draft.nodes=draft.nodes.filter(n=>n.id!==id);});}
  duplicate(id){const original=this.get(id);if(!original)return;const descendants=this.state.nodes.filter(node=>this.ancestors(node.id).some(n=>n.id===id));const map=new Map(descendants.map(node=>[node.id,crypto.randomUUID()]));this.commit(draft=>{for(const node of descendants){const n=clone(node);n.id=map.get(node.id);n.parentId=node.id===id?node.parentId:map.get(node.parentId);if(node.id===id){n.title+=' — копия';n.layout.x+=35;n.layout.y+=35;}draft.nodes.push(n);}});return map.get(id);}
  front(id){this.commit(draft=>{const i=draft.nodes.findIndex(n=>n.id===id);if(i>=0)draft.nodes.push(...draft.nodes.splice(i,1));});}
  /** Moves a card one step among its siblings: the order in the list view and the stacking on the canvas. */
  shift(id,step){this.commit(draft=>{const node=draft.nodes.find(n=>n.id===id);if(!node)return;const siblings=draft.nodes.filter(n=>n.parentId===node.parentId),other=siblings[siblings.indexOf(node)+Math.sign(step)];if(!other)return;const a=draft.nodes.indexOf(node),b=draft.nodes.indexOf(other);draft.nodes[a]=other;draft.nodes[b]=node;});}
  undo(){if(!this.history.length)return;this.state=this.history.pop();this.persist();this.emit();}
  import(input){const next=validateWorkspace(input,this.registry);this.history.push(clone(this.state));this.state=next;this.readOnly=false;this.persist();this.emit();}
  /** Takes a board saved by another tab or another computer. Undo history is cleared: it belongs to the old board. */
  adopt(raw){const next=validateWorkspace(JSON.parse(raw),this.registry);this.state=next;this.savedSnapshot=raw;this.readOnly=false;this.history=[];this.error='';this.emit();}
  export(){return JSON.stringify(this.state,null,2);}
}
export {KEY};
