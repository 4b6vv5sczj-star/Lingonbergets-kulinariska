/* sw.js — service worker.
   Strategi: "stale-while-revalidate" för appens egna filer — appen startar direkt
   från cache (även offline), men varje fil hämtas samtidigt på nytt i bakgrunden
   och uppdateras inför nästa öppning. Då uppdaterar appen sig själv automatiskt,
   utan att man behöver ta bort och lägga till den på hemskärmen.
   OCR-/PDF-biblioteken laddas från CDN och går direkt till nätet. */
var CACHE = 'lingonberget-v4';
var SHELL = [
  './',
  './index.html',
  './app.css',
  './store.js',
  './editor.js',
  './recipeformat.js',
  './ocr.js',
  './pdfimport.js',
  './webimport.js',
  './icloud.js',
  './app.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })
  );
});

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
  // Endast egna app-resurser hanteras här; CDN/proxy går direkt till nätet.
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req).then(function (cached) {
        // Hämta alltid en färsk kopia i bakgrunden och uppdatera cachen.
        var network = fetch(req).then(function (res) {
          if (res && res.status === 200 && res.type === 'basic') {
            cache.put(req, res.clone());
          }
          return res;
        }).catch(function () {
          // Offline: fall tillbaka på cache (och index.html för sidnavigering).
          return cached || (req.mode === 'navigate' ? cache.match('./index.html') : undefined);
        });

        // Visa cache direkt om den finns, annars vänta på nätet.
        return cached || network;
      });
    })
  );
});
