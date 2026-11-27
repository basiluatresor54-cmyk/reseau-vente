/* Stock & Livreurs — service worker : ouverture instantanée et hors connexion */
const VERSION = 'c0f02864f1';
const CACHE = 'stock-livreurs-' + VERSION;
const CORE = ['./', 'index.html', 'supabase.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'guide.html', 'conditions.html'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('stock-livreurs-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const timeout = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });
/* Partage depuis WhatsApp (vocal ou position) : le fichier est gardé puis l'app s'ouvre */
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if(url.origin !== location.origin || !/\/partage\/?$/.test(url.pathname)) return;
  if(req.method !== 'POST'){ e.respondWith(Response.redirect(new URL('./', self.registration.scope).href, 303)); return; }
  e.respondWith((async () => {
    try{
      const fd = await req.formData(), c = await caches.open('partage');
      const files = fd.getAll('audio').filter(f => f && typeof f === 'object' && f.size);
      for(let i = 0; i < files.length && i < 3; i++) await c.put('https://rv.local/__partage/f' + i, new Response(files[i], {headers:{'Content-Type':files[i].type || 'audio/ogg', 'X-Name':encodeURIComponent(files[i].name || '')}}));
      await c.put('https://rv.local/__partage/meta', new Response(JSON.stringify({n:Math.min(files.length, 3), title:fd.get('title') || '', text:fd.get('text') || '', url:fd.get('url') || ''}), {headers:{'Content-Type':'application/json'}}));
    }catch(_){ }
    return Response.redirect(new URL('./?partage=1', self.registration.scope).href, 303);
  })());
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if(req.method !== 'GET' || url.origin !== location.origin) return;           // Supabase et WhatsApp : jamais en cache
  if(url.pathname.endsWith('version.json')){ e.respondWith(fetch(req, {cache:'no-store'}).catch(() => new Response('{}', {headers:{'Content-Type':'application/json'}}))); return; }
  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html');
  if(isPage){
    if(url.searchParams.has('fresh')) return; // téléchargement de la nouvelle version (réseau seulement)
    // Page : la copie gardée s'ouvre tout de suite (même avec un réseau faible) ; la nouvelle version se télécharge derrière
    e.respondWith(caches.match('index.html').then(hit => {
      const net = fetch(req.url, {cache:'no-store', credentials:'same-origin'});
      if(hit){ e.waitUntil(timeout(net, 120000).then(r => { if(r && r.ok) return caches.open(CACHE).then(x => x.put('index.html', r)); }).catch(() => {})); return hit; }
      return timeout(net, 20000).then(r => { if(r && r.ok){ const c = r.clone(); caches.open(CACHE).then(x => x.put('index.html', c)); } return r; }).catch(() => caches.match('./'));
    }));
    return;
  }
  // Fichiers (images, supabase.js…) : copie gardée d'abord, mise à jour en arrière-plan
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => { if(r && r.ok){ const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});

/* Notifications */
self.addEventListener('push', e => {
  let d = {}; try{ d = e.data ? e.data.json() : {}; }catch(_){ d = {title:'Stock & Livreurs', body: e.data ? e.data.text() : ''}; }
  e.waitUntil(self.registration.showNotification(d.title || 'Stock & Livreurs', {body: d.body || '', tag: d.tag || undefined, icon:'icon-192.png', badge:'icon-192.png', data:{url: d.url || './'}, renotify: !!d.tag}));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(cs => { for(const c of cs){ if(c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus(); } return self.clients.openWindow(url); }));
});
