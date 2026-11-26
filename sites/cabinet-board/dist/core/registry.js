/** Trusted, bundled widget modules. No runtime evaluation of external code. */
export class WidgetRegistry {
  #definitions=new Map();
  register(definition){
    if(!/^[a-z][a-z0-9-]*$/.test(definition.type)||this.#definitions.has(definition.type))throw new Error('Тип виджета должен быть уникальным.');
    for(const key of ['createData','validate','renderCard'])if(typeof definition[key]!=='function')throw new Error(`Виджету нужен ${key}`);
    if(!Number.isInteger(definition.version)||definition.version<1)throw new Error('Некорректная версия виджета');
    this.#definitions.set(definition.type,Object.freeze({minSize:{w:220,h:170},...definition}));return this;
  }
  get(type){return this.#definitions.get(type);}
  list(){return [...this.#definitions.values()];}
  normalize(node){
    const definition=this.get(node.type);
    if(!definition)return node; // Preserve data for modules not installed in this build.
    if(node.version>definition.version)throw new Error(`Виджет «${node.title}» создан в более новой версии приложения.`);
    const result=structuredClone(node);
    while(result.version<definition.version){const migrate=definition.migrations?.[result.version];if(!migrate)throw new Error(`Нет миграции для ${node.type} v${result.version}`);result.data=migrate(result.data);result.version++;}
    if(!definition.validate(result.data))throw new Error(`Некорректные данные виджета «${node.title}».`);
    result.layout.w=Math.max(definition.minSize.w,result.layout.w);result.layout.h=Math.max(definition.minSize.h,result.layout.h);
    return result;
  }
}
