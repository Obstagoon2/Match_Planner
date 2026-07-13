/*
 * FRC Auto Path Planner — companion service worker
 *
 * This file must sit in the SAME folder as index.html on GitHub Pages
 * (e.g. https://obstagoon2.github.io/Match_Planner/sw.js) for it to be
 * allowed to control that scope. Browsers require service workers to be
 * registered from a real same-origin file rather than inline script, which
 * is why this can't just live inside index.html.
 *
 * What it does:
 *  - Precaches the app shell (this page, field.png, the Nasalization font)
 *    so the tool can be opened with zero connectivity, e.g. in a gym with
 *    no wifi/cell signal.
 *  - Serves those shell assets cache-first (fast, works offline), and
 *    everything else (Statbotics API calls, the QR code CDN script) using
 *    a network-first strategy that falls back to cache when offline.
 *  - The app's own match/EPA data caching (localStorage) and saved auto
 *    paths (IndexedDB) are handled separately in index.html and are
 *    unaffected by this file.
 */

const CACHE_NAME = "frc-planner-shell-v1";

const SHELL_ASSETS = [
    "./",
    "./index.html",
    "./field.png",
    "../assets/fonts/Nasalization Rg.otf"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Add each asset individually so a single missing file (e.g. if
            // field.png hasn't been added yet) doesn't fail the whole install.
            return Promise.all(
                SHELL_ASSETS.map((url) =>
                    cache.add(url).catch((err) => {
                        console.warn("[sw] could not precache", url, err);
                    })
                )
            );
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET") return;

    const url = new URL(req.url);
    const isShellAsset = req.url.endsWith("field.png")
        || req.url.endsWith("index.html")
        || req.url.endsWith("Nasalization Rg.otf")
        || url.pathname === "/" || url.pathname.endsWith("/");

    if (isShellAsset) {
        // Cache-first: instant load, works fully offline.
        event.respondWith(
            caches.match(req).then((cached) => cached || fetch(req).then((res) => {
                const clone = res.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
                return res;
            }))
        );
        return;
    }

    // Network-first for everything else (Statbotics API, CDN libs),
    // falling back to whatever was last cached if the network fails.
    event.respondWith(
        fetch(req).then((res) => {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
            return res;
        }).catch(() => caches.match(req))
    );
});
