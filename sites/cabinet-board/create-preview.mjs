// Package our bundled ES modules as one local HTML file; no network or dependencies.
import {readFile,writeFile} from 'node:fs/promises';
import {posix} from 'node:path';
const modules=new Map();
async function visit(file){
  if(modules.has(file))return;
  let source=await readFile('dist/'+file,'utf8');
  const imports=[...source.matchAll(/import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?/g)];
  for(const entry of imports){const dependency=posix.normalize(posix.join(posix.dirname(file),entry[2]));await visit(dependency);source=source.replace(entry[0],`const {${entry[1]}}=__modules[${JSON.stringify(dependency)}];`);}
  const exports=[...source.matchAll(/export\s+(?:const|let|class|(?:async\s+)?function)\s+(\w+)/g)].map(match=>match[1]);
  source=source.replace(/export\s*\{([^}]+)\};?/g,(_,names)=>{exports.push(...names.split(',').map(name=>name.trim()));return '';}).replace(/export\s+(?=const|let|class|function|async\s+function)/g,'');
  modules.set(file,source+'\nreturn {'+[...new Set(exports)].join(',')+'};');
}
await visit('app.js');
// Async wrappers keep top-level await working (app.js waits for storage to open).
const script='(async()=>{const __modules=Object.create(null);\n'+[...modules].map(([file,source])=>'__modules['+JSON.stringify(file)+']=await (async()=>{\n'+source+'\n})();').join('\n')+'\n})().catch(error=>console.error(error));';
new Function(script);
const css=await readFile('dist/style.css','utf8');
const index=await readFile('dist/index.html','utf8');
const html=index.replace('<link rel="stylesheet" href="./style.css">',()=>'<style>'+css+'</style>').replace('<script type="module" src="./app.js"></script>','').replace('</body>',()=>'<script>'+script.replace(/<\/script/gi,'<\\/script')+'</script></body>');
await writeFile('cabinet-preview.html',html);
console.log('Created cabinet-preview.html ('+Buffer.byteLength(html)+' bytes), '+modules.size+' bundled modules.');
