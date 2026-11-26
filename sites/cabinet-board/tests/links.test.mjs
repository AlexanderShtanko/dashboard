import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeUrl,hostOf,displayTitle,avatarLetter,avatarColor,moveItem,faviconUrl} from '../dist/widgets/links-data.js';
import {registry} from '../dist/widgets/index.js';

test('addresses are accepted the way people type them',()=>{
  assert.equal(normalizeUrl('ya.ru'),'https://ya.ru/');
  assert.equal(normalizeUrl('  https://mail.google.com/mail/u/0 '),'https://mail.google.com/mail/u/0');
  assert.equal(normalizeUrl('http://example.com'),'http://example.com/');
  assert.equal(normalizeUrl('localhost:4173'),'https://localhost:4173/');
  assert.equal(normalizeUrl('github.com:443/x'),'https://github.com/x');
  for(const bad of ['', 'ya', 'javascript:alert(1)', 'mailto:me@example.com', 'two words.com', 'file:///C:/x'])assert.equal(normalizeUrl(bad),null,bad);
});

test('tile labels and letters fall back to the site name',()=>{
  assert.equal(hostOf('https://www.youtube.com/feed'),'youtube.com');
  assert.equal(displayTitle({title:'  ',url:'https://www.youtube.com/'}),'youtube.com');
  assert.equal(displayTitle({title:'Почта',url:'https://mail.ru/'}),'Почта');
  assert.equal(avatarLetter({title:'почта',url:'https://mail.ru/'}),'П');
  assert.equal(avatarLetter({title:'«2ГИС»',url:'https://2gis.ru/'}),'2');
  assert.equal(avatarColor({title:'A',url:'https://ya.ru/'}),avatarColor({title:'B',url:'https://www.ya.ru/x'}));
});

test('reordering moves one item and keeps the rest',()=>{
  const items=['a','b','c','d'];
  assert.deepEqual(moveItem(items,0,2),['b','c','a','d']);
  assert.deepEqual(moveItem(items,3,0),['d','a','b','c']);
  assert.deepEqual(moveItem(items,1,1),items);
  assert.deepEqual(items,['a','b','c','d']);
});

test('favicons come from Chrome inside the extension',()=>{
  assert.match(faviconUrl('https://ya.ru/',{extension:true}),/^\/_favicon\/\?pageUrl=https%3A%2F%2Fya.ru%2F&size=64$/);
  assert.match(faviconUrl('https://ya.ru/'),/^https:\/\/www\.google\.com\/s2\/favicons/);
});

test('existing links data stays valid without migration',()=>{
  const def=registry.get('links');
  assert.equal(def.version,1);
  assert.equal(def.validate({items:[{title:'Старая ссылка',url:'https://example.com/'}]}),true);
  assert.equal(def.validate({items:[{title:'x',url:'javascript:alert(1)'}]}),false);
});
