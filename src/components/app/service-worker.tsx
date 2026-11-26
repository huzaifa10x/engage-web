'use client';

import { useEffect } from 'react';

import { listenForInstall } from '@/lib/install';

/**
 * Registers the service worker (public/sw.js) in production builds on HTTPS (or localhost). It caches
 * only the build's hashed files and icons and shows an offline page; it never touches the API or
 * billing. A new deploy's worker takes over at the next load.
 */
export function ServiceWorker() {
    useEffect(() => {
        // Keep Android Chrome's install offer for the Install buttons (Home card, install banner).
        listenForInstall();
        if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
        if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    }, []);

    return null;
}
