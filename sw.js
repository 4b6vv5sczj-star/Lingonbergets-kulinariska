/* sw.js — Service worker för "Lingonbergets kulinariska"
   ───────────────────────────────────────────────────────────────
   Strategi: NETWORK-FIRST.
     • Online  → hämtar ALLTID senaste filen från nätet och uppdaterar
                 cachen. Du ser alltid den nyaste versionen.
     • Offline → faller tillbaka på den senast cachade versionen.
     • Vid ny version raderas appens GAMLA cachar automatiskt.

   VIKTIGT OM DINA DATA:
     Den här filen hanterar BARA cache-lagringen (Cache Storage), dvs.
     kopior av programfilerna (index.html, ikoner m.m.).
     Dina recept, bilder och inställningar ligger i IndexedDB (store.js)
     och i iCloud — ett helt annat lager som denna kod ALDRIG rör.
     Cache-rensningen nedan kan därför inte radera recept eller annan data.

   Höj VERSION om du någon gång vill tvinga fram en helt ren cache. */
'use strict';

const VERSION = '1.15.0';
const CACHE   = 'lingonberget-v' + VERSION;
const PREFIX  = 'lingonberget-';            // bara appens egna cachar rensas

/* Appens "skal" — förcachas vid installation så att appen startar direkt
   och fungerar offline redan från första besöket. Allt övrigt (t.ex.
   wines.json) cachas automatiskt i takt med att det hämtas. */
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './maskable-512.png',
  './apple-touch-icon.png'
];

/* ── Installation: förcacha skalet ────────────────────────────────
   skipWaiting() görs INTE här — den nya versionen tar över först när
   sidan säger till (se SKIP_WAITING nedan), så att en uppdatering aldrig
   avbryter dig mitt i en redigering. */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {})   // en enskild saknad fil ska inte stoppa installationen
  );
});

/* ── Aktivering: rensa BARA appens gamla cachar, ta kontroll direkt ──
   Endast nycklar som börjar med 'lingonberget-' och inte är den aktuella
   versionen tas bort. Andra appars cachar och – framför allt – IndexedDB
   (recepten) lämnas helt orörda. */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k.indexOf(PREFIX) === 0 && k !== CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── Hämtning: NETWORK-FIRST för alla GET mot samma origin ───────── */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Endast GET hanteras; POST m.m. går rakt till nätet (rör aldrig cachen).
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Andra domäner (proxyservrar, r.jina.ai vid webbimport m.m.) –
  // aldrig cacha, bara skicka vidare till nätet.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Spara en färsk kopia i cachen (bara lyckade svar från egen origin).
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => {
        // Offline → ge cachad version. För sidnavigering: fall tillbaka
        // på cachad index.html så appen alltid öppnar.
        return caches.match(req).then((hit) => {
          if (hit) return hit;
          if (req.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
      })
  );
});

/* ── Meddelande från sidan: applicera väntande uppdatering nu ─────── */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
