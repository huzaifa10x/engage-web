/*
 * engageX service worker (mobile brief, P0). Deliberately small:
 *  - Never touches the API, sign-in, billing, Stripe, Meta or anything that is not a GET from this site.
 *  - Pages always come from the network (a cached page would point at the scripts of a previous
 *    deploy); with no connection the offline page is shown instead.
 *  - Only the build's content-hashed files (/_next/static) and the icons are cached.
 * Bump VERSION to drop every cache at the next visit.
 */
const VERSION = 'egx-v1';
const STATIC = `${VERSION}-static`;
const OFFLINE = '/offline.html';
const NEVER = [/^\/api\//, /^\/sanctum\//, /^\/billing(\/|$)/, /^\/impersonate/, /^\/login/, /^\/register/, /^\/_next\/data\//];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(STATIC)
            .then((c) => c.addAll([OFFLINE, '/brand/icon-192.png']))
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((names) => Promise.all(names.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n))))
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    // Other sites (Stripe, Meta, fonts, Sentry) and the never-cache paths: straight to the network.
    if (url.origin !== self.location.origin || NEVER.some((re) => re.test(url.pathname))) return;

    if (req.mode === 'navigate') {
        event.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
        return;
    }

    // Hashed build files never change, so the cached copy is always right; icons refresh in the background.
    if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/brand/')) {
        event.respondWith(
            caches.open(STATIC).then((cache) =>
                cache.match(req).then((hit) => {
                    const fresh = fetch(req).then((res) => {
                        if (res.ok) cache.put(req, res.clone());
                        return res;
                    });
                    return hit || fresh;
                }),
            ),
        );
    }
});
