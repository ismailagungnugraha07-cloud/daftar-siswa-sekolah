const CACHE_NAME = "smart-school-shell-v2";
const APP_SHELL = [
  "/",
  "/index.html",
  "/login.html",
  "/style.css",
  "/css/app.css",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.svg"
];

// Cache hanya aset tampilan. Data API dan halaman yang memerlukan login
// selalu diminta langsung dari server agar data sekolah tidak tersimpan offline.
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/uploads/") || event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/login.html")));
    return;
  }
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
