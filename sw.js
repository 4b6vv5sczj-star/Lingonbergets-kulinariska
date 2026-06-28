/* sw.js — service worker med "network-first" för själva appen, så att den ALLTID
   hämtar senaste versionen från nätet när du är online, men funkar offline via cache.
   Övriga egna resurser (manifest, ikoner, wines.json) använder stale-while-revalidate.
   CDN/proxy-anrop (Tesseract, pdf.js, SheetJS, jina, proxyer) går direkt till nätet. */
var CACHE = 'lingonberget-app-v1';

self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // CDN/proxy → direkt till nätet

  // Sidladdning: hämta alltid färskt från nätet (förbi HTTP-cachen), cacha för offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req.url, { cache: 'no-store' }).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (m) { return m || caches.match('./'); });
      })
    );
    return;
  }

  // Övriga egna resurser: visa cache direkt, uppdatera i bakgrunden.
  e.respondWith(
    caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (cached) {
        var net = fetch(req).then(function (res) {
          if (res && res.status === 200 && res.type === 'basic') c.put(req, res.clone());
          return res;
        }).catch(function () { return cached; });
        return cached || net;
      });
    })
  );
});
