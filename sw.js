const CACHE = "reserva-sc-v4"; // súbele la versión al cambiar archivos
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./img/icon-192.png",
  "./img/icon-512.png",
  "./img/ups.gif", 
  "./assets/Done.json",
  "./js/app.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    // Opcional: tomar control inmediato sin recargar en loop
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;

  // App Shell para navegaciones
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Stale-while-revalidate para estáticos
  e.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((netRes) => {
        const copy = netRes.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return netRes;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
