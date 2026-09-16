/* Service worker (M26) : la page et ses fichiers restent lisibles hors ligne.
   Cache au premier passage, puis le réseau d'abord pour la page (mises à jour)
   et le cache d'abord pour les fichiers nommés par empreinte. */
const CACHE = "simulation-de-vie-v1";
self.addEventListener("install", (ev) => {
  ev.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        c
          .addAll(["./", "./index.html", "./manifest.webmanifest", "./icone.svg"])
          .catch(() => undefined),
      ),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});
self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  const page = req.mode === "navigate" || req.destination === "document";
  ev.respondWith(
    page
      ? fetch(req)
          .then((r) => {
            const copie = r.clone();
            caches.open(CACHE).then((c) => c.put(req, copie));
            return r;
          })
          .catch(() => caches.match(req).then((r) => r ?? caches.match("./index.html")))
      : caches.match(req).then(
          (r) =>
            r ??
            fetch(req).then((rep) => {
              const copie = rep.clone();
              caches.open(CACHE).then((c) => c.put(req, copie));
              return rep;
            }),
        ),
  );
});
