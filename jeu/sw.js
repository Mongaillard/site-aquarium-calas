// Service worker : le jeu reste jouable hors ligne une fois chargé.
const CACHE = 'age-empires-mobile-v62';
// La musique (js/musique.js) : trois morceaux lourds. Ils ne sont pas pris à
// l'installation mais à la première écoute, et gardés à part, comme les unités
// en 3D : une mise à jour du jeu ne les fait pas retélécharger.
const MUSIQUE = 'aem-musique';
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
  // Importés par game.js (niveaux des troupes) : classement, ligues, coffres.
  './js/progression.js',
  './js/progression-config.js',
  './js/progression-ecrans.js',
  './js/fiches-troupes.js',
  './js/musique.js',
  './js/rangement-durable.js',
  './css/progression.css',
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
  './assets/modeles/arbaletrier.json',
  './assets/modeles/archer-monte.json',
  './assets/modeles/sol-garde.json',
  './assets/modeles/sol-lancier.json',
  './assets/modeles/sol-fellah.json',
  './assets/modeles/sol-archer.json',
  './assets/modeles/sol-chacal.json',
  './assets/modeles/sol-mehariste.json',
  './assets/modeles/sol-elite.json',
  './assets/modeles/sol-pretre.json',
  './assets/modeles/sol-belier.json',
  './assets/modeles/sol-catapulte.json',
  './assets/modeles/pavoisier.json',
  './assets/modeles/frondeur.json',
  './assets/modeles/sapeur.json',
  './assets/modeles/sol-pavoisier.json',
  './assets/modeles/sol-frondeur.json',
  './assets/modeles/sol-sapeur.json',
  './assets/portrait-hydre.webp',
  './assets/portrait-pretresse.webp',
  './assets/portrait-cavalier.webp',
  './assets/portrait-lancier.webp',
  './assets/portrait-champion.webp',
  './assets/portrait-eclaireur.webp',
  './assets/portrait-catapulte.webp',
  './assets/portrait-belier.webp',
  './assets/portrait-arbaletrier.webp',
  './assets/portrait-archer-monte.webp',
  './assets/portrait-villageois.webp',
  './assets/portrait-archer.webp',
  './assets/portrait-sol-fellah.webp',
  './assets/portrait-sol-garde.webp',
  './assets/portrait-sol-lancier.webp',
  './assets/portrait-sol-archer.webp',
  './assets/portrait-sol-chacal.webp',
  './assets/portrait-sol-mehariste.webp',
  './assets/portrait-sol-elite.webp',
  './assets/portrait-sol-pretre.webp',
  './assets/portrait-sol-belier.webp',
  './assets/portrait-sol-catapulte.webp',
  './assets/portrait-pavoisier.webp',
  './assets/portrait-frondeur.webp',
  './assets/portrait-sapeur.webp',
  './assets/portrait-triton.webp',
  './assets/portrait-sol-pavoisier.webp',
  './assets/portrait-sol-frondeur.webp',
  './assets/portrait-sol-sapeur.webp',
  './assets/coffres/coffre-bois-ferme.webp',
  './assets/coffres/coffre-bois-entrouvert.webp',
  './assets/coffres/coffre-bois-ouvert.webp',
  './assets/coffres/coffre-argent-ferme.webp',
  './assets/coffres/coffre-argent-entrouvert.webp',
  './assets/coffres/coffre-argent-ouvert.webp',
  './assets/coffres/coffre-or-ferme.webp',
  './assets/coffres/coffre-or-entrouvert.webp',
  './assets/coffres/coffre-or-ouvert.webp',
  './assets/coffres/coffre-legendaire-ferme.webp',
  './assets/coffres/coffre-legendaire-entrouvert.webp',
  './assets/coffres/coffre-legendaire-ouvert.webp',
  './assets/sons/clic-1.mp4',
  './assets/sons/clic-2.mp4',
  './assets/sons/selection-1.mp4',
  './assets/sons/selection-2.mp4',
  './assets/sons/ordre-1.mp4',
  './assets/sons/ordre-2.mp4',
  './assets/sons/erreur-1.mp4',
  './assets/sons/pose-1.mp4',
  './assets/sons/pose-2.mp4',
  './assets/sons/formee-1.mp4',
  './assets/sons/construit-1.mp4',
  './assets/sons/age-1.mp4',
  './assets/sons/victoire-1.mp4',
  './assets/sons/defaite-1.mp4',
  './assets/sons/epee-1.mp4',
  './assets/sons/epee-2.mp4',
  './assets/sons/epee-3.mp4',
  './assets/sons/epee-4.mp4',
  './assets/sons/epee-5.mp4',
  './assets/sons/tir-1.mp4',
  './assets/sons/tir-2.mp4',
  './assets/sons/chute-1.mp4',
  './assets/sons/chute-2.mp4',
  './assets/sons/chute-3.mp4',
  './assets/sons/effondrement-1.mp4',
  './assets/sons/effondrement-2.mp4',
  './assets/sons/cloche-1.mp4',
  './assets/sons/cloche-2.mp4',
  './assets/sons/hache-1.mp4',
  './assets/sons/hache-2.mp4',
  './assets/sons/hache-3.mp4',
  './assets/sons/pioche-1.mp4',
  './assets/sons/pioche-2.mp4',
  './assets/sons/pioche-3.mp4',
  './assets/sons/pioche-4.mp4',
  './assets/sons/cueillette-1.mp4',
  './assets/sons/cueillette-2.mp4',
  './assets/sons/marteau-1.mp4',
  './assets/sons/marteau-2.mp4',
  './assets/sons/marteau-3.mp4',
  './assets/solariens/centre-ville.webp',
  './assets/solariens/caserne.webp',
  './assets/solariens/archerie.webp',
  './assets/solariens/ecurie.webp',
  './assets/solariens/atelier-siege.webp',
  './assets/solariens/forge.webp',
  './assets/solariens/temple.webp',
  './assets/solariens/maison.webp',
  './assets/solariens/moulin.webp',
  './assets/solariens/camp-bucherons.webp',
  './assets/solariens/camp-mineurs.webp',
  './assets/solariens/ferme.webp',
  './assets/solariens/tour-guet.webp',
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
  './assets/position.webp',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      // Les unités en 3D déjà cuites (js/modele3d.js) survivent aux mises à
      // jour : leur clé porte l'empreinte du modèle et la version de la cuisson.
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== 'aem-modeles-3d' && k !== MUSIQUE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).pathname.includes('/assets/musique/')) {
    event.respondWith(caches.open(MUSIQUE).then((cache) => cache.match(event.request).then((garde) => garde || fetch(event.request).then((reponse) => {
      if (reponse && reponse.status === 200 && reponse.type === 'basic') cache.put(event.request, reponse.clone());
      return reponse;
    }))));
    return;
  }
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
