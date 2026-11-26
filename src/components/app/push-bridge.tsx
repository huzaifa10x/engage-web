'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { PUSH_KEY } from '@/components/settings/phone-notifications-card';
import { api } from '@/lib/api';

/**
 * Inside the signed-in app: a notification tapped while engageX is open moves to that chat without
 * reloading; arriving from the test notification (?n=test&s=…) confirms to the server that it was
 * received and tapped.
 */
export function PushBridge() {
    const router = useRouter();
    const params = useSearchParams();
    const qc = useQueryClient();
    const confirmed = useRef<string | null>(null);

    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;
        const onMessage = (e: MessageEvent) => {
            const d = e.data as { type?: string; url?: string } | null;
            if (d?.type === 'navigate' && typeof d.url === 'string' && d.url.startsWith('/')) router.push(d.url);
        };
        navigator.serviceWorker.addEventListener('message', onMessage);

        return () => navigator.serviceWorker.removeEventListener('message', onMessage);
    }, [router]);

    const test = params.get('n') === 'test' ? params.get('s') : null;
    useEffect(() => {
        if (!test || confirmed.current === test) return;
        confirmed.current = test;
        void api('push/test/tapped', { method: 'POST', body: { id: test } })
            .then(() => {
                toast.success('Notifications work on this phone ✓');
                void qc.invalidateQueries({ queryKey: PUSH_KEY });
            })
            .catch(() => undefined);
        const next = new URLSearchParams(params.toString());
        next.delete('n');
        next.delete('s');
        router.replace(`${window.location.pathname}${next.size ? `?${next}` : ''}`);
    }, [test, params, qc, router]);

    return null;
}
