// Service worker : le jeu reste jouable hors ligne une fois chargé.
const CACHE = 'age-empires-mobile-v23';
const ASSETS = [
  './',
  './index.html',
  './css/jeu.css',
  './manifest.webmanifest',
  './icons/icone-192.png',
  './icons/icone-512.png',
  './js/main.js',
  './js/game.js',
  './js/save.js',
  './js/icones.js',
  './js/sprites.js',
  './js/config.js',
  './js/utils.js',
  './js/map.js',
  './js/pathfinding.js',
  './js/entities.js',
  './js/ai.js',
  './js/render.js',
  './js/input.js',
  './js/ui.js',
  './js/audio.js',
  './assets/heros.webp',
  './assets/milicien-marche.webp',
  './assets/villageois.webp',
  './assets/eclaireur.webp',
  './assets/centre-ville.webp',
  './assets/caserne.webp',
  './assets/maison.webp',
  './assets/archerie.webp',
  './assets/ecurie.webp',
  './assets/atelier-siege.webp',
  './assets/forge.webp',
  './assets/moulin.webp',
  './assets/camp-bucherons.webp',
  './assets/camp-mineurs.webp',
  './assets/ferme.webp',
  './assets/tour-guet.webp',
  './assets/sol-herbe.webp',
  './assets/sol-herbe-sombre.webp',
  './assets/sol-terre.webp',
  './assets/sol-sable.webp',
  './assets/sol-eau.webp',
  './assets/arbres.webp',
  './assets/baies.webp',
  './assets/or.webp',
  './assets/chevalier.webp',
  './assets/lancier.png',
  './assets/portrait-milicien.webp',
  './assets/defaite.webp',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
