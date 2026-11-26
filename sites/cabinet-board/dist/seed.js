export const seed={schemaVersion:1,nodes:[
{id:'tasks-main',type:'tasks',version:1,parentId:null,title:'Одно дело за другим',data:{items:[{id:'step1',text:'Выбрать главное на сегодня',done:false},{id:'step2',text:'Разложить материалы по папкам',done:false},{id:'step3',text:'Оставить место для паузы',done:false}]},layout:{x:200,y:195,w:340,h:300,rotation:0}},
{id:'note-main',type:'note',version:1,parentId:null,title:'На полях',data:{body:'Меньше открытых вкладок.\nБольше места для своих мыслей.\n\nНачать можно с одного маленького шага.'},layout:{x:555,y:170,w:290,h:245,rotation:-3}},
{id:'focus-main',type:'focus',version:1,parentId:null,title:'Время для главного',data:{task:'Продумать своё рабочее пространство',minutes:25,remaining:1500,endsAt:null},layout:{x:875,y:170,w:280,h:245,rotation:0}},
{id:'folder-work',type:'folder',version:1,parentId:null,title:'Мои проекты',data:{description:'Задачи, мысли и материалы — в одном месте.'},layout:{x:195,y:515,w:330,h:250,rotation:0}},
{id:'links-main',type:'links',version:1,parentId:null,title:'Под рукой',data:{items:[]},layout:{x:555,y:500,w:290,h:225,rotation:2}},
{id:'folder-personal',type:'folder',version:1,parentId:null,title:'Личное',data:{description:'Пространство вне работы.'},layout:{x:875,y:515,w:280,h:250,rotation:0}},
{id:'work-note',type:'note',version:1,parentId:'folder-work',title:'Идея проекта',data:{body:'Каким должно быть место, в которое хочется возвращаться?\n\nЗдесь можно собрать мысли, задачи и полезные ссылки.'},layout:{x:190,y:190,w:300,h:270,rotation:-2}},
{id:'work-tasks',type:'tasks',version:1,parentId:'folder-work',title:'Следующие шаги',data:{items:[]},layout:{x:540,y:190,w:330,h:280,rotation:0}},
{id:'personal-note',type:'note',version:1,parentId:'folder-personal',title:'Для себя',data:{body:'Прогулка. Книга. Время без экрана.\n\nНе всё нужно превращать в задачу.'},layout:{x:230,y:200,w:330,h:270,rotation:2}}
]};
