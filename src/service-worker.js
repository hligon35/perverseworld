// Only the offline shell is cached. Store pages, prices, APIs and private data stay on the network.
const CACHE='__CACHE__';
const PAGES=/* __PAGES__ */[];
const ASSETS=['/offline.html','/assets/css/messages.css','/assets/icons/icon-192.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('pw-offline-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin||event.request.method!=='GET')return;
 if(ASSETS.includes(url.pathname)){event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));return;}
 if(event.request.mode==='navigate'&&PAGES.includes(url.pathname.replace(/\/+$/,'')||'/'))event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));
});
