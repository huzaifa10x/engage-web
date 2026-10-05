'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { keys } from '@/lib/queries';
import { getEcho, realtimeConfigured } from '@/lib/realtime';

/**
 * Keeps template lists live: listens on `tenant.{tenant}.templates` and refetches when Meta
 * approves, rejects, pauses, edits or deletes a template (batched, so a full sync causes one
 * refetch). Returns whether the live connection is up; callers poll as a fallback when it is not.
 */
export function useTemplatesRealtime(tenantId: string | null | undefined, enabled = true): boolean {
    const qc = useQueryClient();
    const [live, setLive] = useState(false);

    useEffect(() => {
        const echoPromise = enabled && tenantId ? getEcho() : null;
        if (!echoPromise) return;

        let disposed = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const channel = `tenant.${tenantId}.templates`;

        void echoPromise.then((echo) => {
            if (disposed) return;
            const pusher = (echo.connector as unknown as { pusher: { connection: { bind: (ev: string, cb: () => void) => void; state: string } } }).pusher;
            pusher.connection.bind('connected', () => setLive(true));
            pusher.connection.bind('unavailable', () => setLive(false));
            pusher.connection.bind('failed', () => setLive(false));
            if (pusher.connection.state === 'connected') setLive(true);

            echo.private(channel).listen('.templates.changed', () => {
                timer ??= setTimeout(() => {
                    timer = null;
                    void qc.invalidateQueries({ queryKey: keys.templatesAll });
                }, 300);
            });
        });

        return () => {
            disposed = true;
            if (timer) clearTimeout(timer);
            setLive(false);
            void echoPromise.then((echo) => echo.leave(channel));
        };
    }, [tenantId, enabled, qc]);

    return realtimeConfigured && live;
}
