import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {spawn} from 'node:child_process';
const root=resolve('dist');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}const body=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404).end('Not found');}});
server.on('error',error=>{
  console.error(error.code==='EADDRINUSE'
    ? 'Port 4173 is already in use. If Cabinet is already running, open http://127.0.0.1:4173 in your browser. Otherwise, close the application using this port and try again.'
    : 'Cannot start the server: '+error.message);
  process.exitCode=1;
});
server.listen(4173,'127.0.0.1',()=>{
  const url='http://127.0.0.1:4173';
  console.log('Local: '+url);
  if(process.argv.includes('--open')&&process.platform==='win32'){
    const browser=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{detached:true,stdio:'ignore',windowsHide:true});
    browser.on('error',()=>console.log('Open this address in your browser: '+url));
    browser.unref();
  }
});
