// Mesin OSCE service worker: halaman diambil dari jaringan dulu (supaya update cepat), cadangan dari cache saat offline.
// Suara Ami (audio/*.mp4): disimpan utuh sekali, lalu potongan (Range) dilayani dari cache supaya jalan offline.
const CACHE = "osce-fkg-v6";
const AUDIO = "osce-fkg-audio-v2";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png", "./icons/favicon-32.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== AUDIO).map(k => caches.delete(k))))); self.clients.claim(); });
async function rangeFrom(resp, range) {
  const buf = await resp.arrayBuffer(), size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(range || "");
  if (!m) return new Response(buf, { status: 200, headers: { "Content-Type": "audio/mp4", "Content-Length": String(size), "Accept-Ranges": "bytes" } });
  let s = m[1] === "" ? size - Number(m[2]) : Number(m[1]); let en = m[1] !== "" && m[2] !== "" ? Number(m[2]) : size - 1;
  s = Math.max(0, s); en = Math.min(en, size - 1);
  return new Response(buf.slice(s, en + 1), { status: 206, headers: { "Content-Type": "audio/mp4", "Content-Range": `bytes ${s}-${en}/${size}`, "Content-Length": String(en - s + 1), "Accept-Ranges": "bytes" } });
}
async function audio(req) {
  const url = req.url.split("#")[0];
  const c = await caches.open(AUDIO);
  const hit = await c.match(url);
  if (hit) return rangeFrom(hit, req.headers.get("range"));
  // belum tersimpan: ambil utuh, simpan, lalu layani potongan yang diminta
  try {
    const full = await fetch(url, { cache: "no-store" });
    if (full.ok && full.status === 200) { await c.put(url, full.clone()); return rangeFrom(full, req.headers.get("range")); }
  } catch (e) {}
  return fetch(req);
}
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  if (/\/audio\/[^/]+\.(m4a|mp4)$/.test(new URL(e.request.url).pathname)) { e.respondWith(audio(e.request)); return; }
  e.respondWith(
    fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then(m => m || caches.match("./index.html")))
  );
});
