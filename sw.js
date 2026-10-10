const CACHE='palava-shell-v2';
const ASSETS=['/','/index.html','/online.js','/manifest.webmanifest','/icons/palava-192.svg','/icons/palava-512.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).catch(()=>{})));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 event.respondWith(fetch(event.request).then(response=>{
   if(response.ok&&url.pathname!=='/'){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
   return response;
 }).catch(()=>caches.match(event.request).then(response=>response||caches.match('/index.html'))));
});
