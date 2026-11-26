// Pure helpers for the shortcuts widget: no DOM, covered by tests/links.test.mjs.
import {safeUrl} from '../core/dom.js';

export const MAX_LINKS=200;

/** Accepts what people type into Chrome's omnibox: "ya.ru", "https://…", "localhost:3000". */
export function normalizeUrl(value){
  const text=String(value??'').trim();
  if(!text||/\s/.test(text))return null;
  if(/^[a-z][a-z0-9+.-]*:/i.test(text)&&!/^[^/:]+:\d+(\/|$)/.test(text))return safeUrl(text);
  const href=safeUrl('https://'+text.replace(/^\/+/,''));
  if(!href)return null;
  const host=new URL(href).hostname;
  return host.includes('.')||host==='localhost'||/^\[.*\]$/.test(host)?href:null;
}

export function hostOf(url){try{return new URL(url).hostname.replace(/^www\./,'');}catch{return '';}}

export function displayTitle(item){return (item.title||'').trim()||hostOf(item.url)||item.url;}

/** First letter or digit of the title, like Chrome's letter tiles. */
export function avatarLetter(item){
  const match=displayTitle(item).match(/[\p{L}\p{N}]/u);
  return (match?match[0]:'•').toLocaleUpperCase('ru');
}

// Muted paper inks; the same site always gets the same colour on every device.
const palette=['#7c8f6a','#a0775c','#6f8597','#9a7a94','#b08a4f','#5f8c84','#8b6f5c','#7a7fa3'];
export function avatarColor(item){
  const key=hostOf(item.url)||displayTitle(item);let hash=0;
  for(const char of key)hash=(hash*31+char.codePointAt(0))>>>0;
  return palette[hash%palette.length];
}

export function moveItem(items,from,to){
  if(from===to||from<0||from>=items.length)return items.slice();
  const next=items.slice();const [item]=next.splice(from,1);
  next.splice(Math.max(0,Math.min(to,next.length)),0,item);return next;
}

/** Local favicon cache in the extension; a public favicon service on the web version. */
export function faviconUrl(url,{extension=false,size=64}={}){
  if(extension)return `/_favicon/?pageUrl=${encodeURIComponent(url)}&size=${size}`;
  return `https://www.google.com/s2/favicons?sz=${size}&domain_url=${encodeURIComponent(url)}`;
}
