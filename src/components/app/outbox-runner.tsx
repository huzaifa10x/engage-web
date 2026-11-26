'use client';

import { useEffect } from 'react';

import { useOutbox } from '@/hooks/use-outbox';

/**
 * Sends replies saved on this phone while there was no connection: when the app opens, when the
 * connection comes back, when the app returns to the screen, and every 20 seconds while any wait.
 * Nothing is sent while the app is closed.
 */
export function OutboxRunner() {
    const { items, flush } = useOutbox();
    const waiting = items.some((i) => i.state === 'waiting');

    useEffect(() => {
        void flush();
        const kick = () => void flush();
        const visible = () => document.visibilityState === 'visible' && kick();
        window.addEventListener('online', kick);
        document.addEventListener('visibilitychange', visible);

        return () => {
            window.removeEventListener('online', kick);
            document.removeEventListener('visibilitychange', visible);
        };
    }, [flush]);
    useEffect(() => {
        if (!waiting) return;
        const t = setInterval(() => void flush(), 20_000);

        return () => clearInterval(t);
    }, [waiting, flush]);

    return null;
}
