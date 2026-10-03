// Service worker : le jeu reste jouable hors ligne une fois chargé.
const CACHE = 'age-empires-mobile-v46';
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
  // Importés par render.js et sprites.js : sans eux, le graphe de modules
  // échoue hors ligne et le jeu ne démarre pas.
  './js/decor.js',
  './js/decor-pieces.js',
  './js/input.js',
  './js/ui.js',
  './js/audio.js',
  // Essais de 3D : le module et l'atlas précalculé. Le modèle de l'essai en
  // direct (glTF en JSON), facultatif, entre au cache au premier usage.
  './js/rendu3d.js',
  './assets/chevalier-3d.webp',
  // Le milicien et le villageois en 3D (le style par défaut) : les modèles, et
  // three.js qui les cuit au premier lancement.
  './js/modele3d.js',
  './js/vendor/three-jeu.min.js',
  './assets/modeles/milicien.json',
  './assets/modeles/villageois.json',
  './assets/modeles/atlante.json',
  './assets/modeles/archer.json',
  './assets/modeles/hydre.json',
  './assets/modeles/lancier.json',
  './assets/modeles/pretresse.json',
  './assets/modeles/cavalier.json',
  './assets/modeles/eclaireur.json',
  './assets/modeles/champion.json',
  './assets/modeles/belier.json',
  './assets/modeles/catapulte.json',
  './assets/portrait-hydre.webp',
  './assets/portrait-pretresse.webp',
  './assets/portrait-cavalier.webp',
  './assets/portrait-lancier.webp',
  './assets/portrait-champion.webp',
  './assets/portrait-eclaireur.webp',
  './assets/heros.webp',
  './assets/milicien-marche.webp',
  './assets/villageois.webp',
  './assets/eclaireur.webp',
  './assets/decor.webp',
  './assets/cochon.webp',
  './assets/cerf.webp',
  './assets/centre-ville.webp',
  './assets/caserne.webp',
  './assets/maison.webp',
  './assets/archerie.webp',
  './assets/ecurie.webp',
  './assets/atelier-siege.webp',
  './assets/forge.webp',
  './assets/temple.webp',
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
      // Les unités en 3D déjà cuites (js/modele3d.js) survivent aux mises à
      // jour : leur clé porte l'empreinte du modèle et la version de la cuisson.
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== 'aem-modeles-3d').map((k) => caches.delete(k))))
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
