// Service Worker: macht die App offline nutzbar.
// Bei Änderungen an Fragen oder Code die Versionsnummer erhöhen.
const CACHE = "sani-trainer-v14";
const ASSETS = [
  "./",
  "index.html",
  "css/style.css",
  "js/app.js",
  "js/config.js",
  "js/store.js",
  "js/data.js",
  "js/quiz.js",
  "js/sync.js",
  "js/auth.js",
  "js/instructor.js",
  "js/icons.js",
  "js/vendor/qrcode.js",
  "data/meta.json",
  "data/cards.json",
  "data/protokoll.json",
  "js/protocol.js",
  "data/level1.json",
  "data/level2.json",
  "data/level3.json",
  "data/level4.json",
  "manifest.webmanifest",
  "assets/icon-192.png",
  "assets/logo-ov.png",
  "assets/qr-code.png",
  "assets/icon-mark.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Netzwerk zuerst: online immer die neueste Version, offline aus dem Cache.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then((cache) =>
      fetch(e.request, { cache: "no-cache" })
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => cache.match(e.request, { ignoreSearch: true }).then((r) => r || cache.match("./"))),
    ),
  );
});
