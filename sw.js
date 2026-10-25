// 인터넷이 없어도 열리도록 앱 파일을 저장해 둠. 앱을 고치면 VERSION 숫자를 올릴 것.
const VERSION = "v114";
// 그림·라이브러리 보관함: 앱(VERSION)을 업데이트해도 지우지 않음. 그림이 바뀌면 주소의 ?v= 번호(index.html의 CATV)가 바뀌어 새로 받음
const ART = "idol-art";
const FILES = ["./", "index.html", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== ART).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  // ?v= 번호가 붙은 그림·코드, 글꼴·라이브러리(CDN)는 바뀌면 주소가 달라지니 저장본을 바로 씀 → 폰에서 빠름
  if (u.search.includes("v=") || u.origin !== location.origin) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok || r.type === "opaque") { const copy = r.clone(); caches.open(ART).then(c => c.put(e.request, copy)); } return r; })));
    return;
  }
  // 게임 화면(index.html 등)은 새 버전 먼저 받아 보고, 인터넷이 없으면 저장해 둔 것을 씀
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
