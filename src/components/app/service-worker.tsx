'use client';

import { RefreshCwIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { isBusy, onBusyChange } from '@/lib/busy';
import { listenForInstall } from '@/lib/install';

/**
 * Registers the service worker (public/sw.js) in production builds on HTTPS (or localhost). It caches
 * only the build's hashed files and icons and shows an offline page; it never touches the API or
 * billing. Safe updates (mobile brief): a new version installs and waits, and takes over only when
 * nothing is being typed, recorded or sent; the same screen then reloads with drafts kept (they live
 * on the phone). Registration errors are reported in the console, not swallowed.
 */
export function ServiceWorker() {
    const [ready, setReady] = useState<ServiceWorker | null>(null);
    const [waitingOnUser, setWaitingOnUser] = useState(false);
    const applied = useRef(false);

    useEffect(() => {
        // Keep Android Chrome's install offer for the Install buttons (Home card, install banner).
        listenForInstall();
        if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
        if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;

        let reg: ServiceWorkerRegistration | null = null;
        const watch = (r: ServiceWorkerRegistration) => {
            if (r.waiting && navigator.serviceWorker.controller) setReady(r.waiting);
            r.addEventListener('updatefound', () => {
                const next = r.installing;
                next?.addEventListener('statechange', () => {
                    // Installed while an older version controls the page: an update is ready.
                    if (next.state === 'installed' && navigator.serviceWorker.controller) setReady(next);
                });
            });
        };
        navigator.serviceWorker
            .register('/sw.js', { scope: '/' })
            .then((r) => {
                reg = r;
                watch(r);
            })
            .catch((e) => console.error('engageX: the service worker could not be registered', e));
        const onControllerChange = () => {
            if (applied.current) window.location.reload();
        };
        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
        // Look for a new version when the app comes back to the screen.
        const check = () => document.visibilityState === 'visible' && void reg?.update().catch(() => undefined);
        document.addEventListener('visibilitychange', check);

        return () => {
            navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
            document.removeEventListener('visibilitychange', check);
        };
    }, []);

    // Take the update as soon as nobody is typing, recording or sending.
    useEffect(() => {
        if (!ready) return;
        const apply = () => {
            if (applied.current || isBusy()) {
                setWaitingOnUser(isBusy());
                return;
            }
            applied.current = true;
            ready.postMessage({ type: 'SKIP_WAITING' });
        };
        apply();

        return onBusyChange(apply);
    }, [ready]);

    if (!ready || !waitingOnUser) return null;

    return (
        <div
            role="status"
            className="fixed inset-x-0 top-[env(safe-area-inset-top)] z-[55] flex items-center justify-center gap-2 bg-foreground px-3 py-1.5 text-[12.5px] text-background"
        >
            <RefreshCwIcon className="size-3.5" aria-hidden /> Update ready · it installs after you send this reply
        </div>
    );
}
