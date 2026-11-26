/*
 * engageX service worker (mobile brief, P0). Deliberately small:
 *  - Never touches the API, sign-in, billing, Stripe, Meta or anything that is not a GET from this site.
 *  - Pages always come from the network (a cached page would point at the scripts of a previous
 *    deploy); with no connection the offline page is shown instead.
 *  - Only the build's content-hashed files (/_next/static) and the icons are cached.
 * Bump VERSION to drop every cache at the next visit.
 */
const VERSION = 'egx-v2';
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

/* Phone notifications: { title, body, url, tag, kind, badge } from the server (encrypted end to end). */
self.addEventListener('push', (event) => {
    let d = {};
    try {
        d = event.data ? event.data.json() : {};
    } catch {
        d = { title: 'engageX', body: event.data ? event.data.text() : '' };
    }
    const shown = self.registration.showNotification(d.title || 'engageX', {
        body: d.body || '',
        icon: '/brand/icon-192.png',
        badge: '/brand/icon-192.png',
        tag: d.tag || undefined,
        renotify: Boolean(d.tag),
        data: { url: d.url || '/inbox', kind: d.kind || null },
    });
    const badge =
        typeof d.badge === 'number' && self.navigator.setAppBadge ? (d.badge > 0 ? self.navigator.setAppBadge(d.badge) : self.navigator.clearAppBadge()) : null;
    event.waitUntil(Promise.all([shown, badge].filter(Boolean)).catch(() => undefined));
});

/* Tapping a notification opens that exact chat (or screen): inside the open app if there is one. */
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/inbox';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
            const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
            if (open) {
                open.postMessage({ type: 'navigate', url });
                return open.focus();
            }
            return self.clients.openWindow(url);
        }),
    );
});
