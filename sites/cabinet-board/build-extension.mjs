import {cp, rm, copyFile} from 'node:fs/promises';

// The extension is the web app from dist/ plus its own manifest. The PWA service worker is web-only.
const source = new URL('./dist/', import.meta.url);
const extension = new URL('./chrome-extension/', import.meta.url);
const board = new URL('board/', extension);

await rm(board, {recursive: true, force: true});
await cp(source, board, {recursive: true, filter: path => !path.endsWith('service-worker.js')});
await copyFile(new URL('./extension/manifest.json', import.meta.url), new URL('manifest.json', extension));
console.log('Chrome extension is ready in chrome-extension/.');
