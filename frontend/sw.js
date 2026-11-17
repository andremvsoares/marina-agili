// Cache versionado: sempre que o app mudar, mude o número aqui.
// Ao ativar, as versões antigas são apagadas (o app deixa de ficar preso no cache).
const CACHE_NAME = "marina-aglli-v2";

const ARQUIVOS = [
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./logo.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARQUIVOS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Só GET do próprio site entra no cache.
  // Chamadas de API (outro domínio) e POST/PATCH passam direto para a rede.
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      // Cache primeiro para abrir rápido; rede como reserva.
      return (
        cached ||
        fetch(req).then((resp) => {
          const copia = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copia));
          return resp;
        })
      );
    })
  );
});
