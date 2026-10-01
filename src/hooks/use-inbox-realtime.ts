'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { keys, usePhoneNumbers } from '@/lib/queries';
import { getEcho, realtimeConfigured } from '@/lib/realtime';

type MessageEvent = { id: string; conversation_id: string; direction: string; status: string; preview: string };

export type RealtimeState = 'live' | 'connecting' | 'polling';

/**
 * Subscribes to `tenant.{tenant}.number.{number}` for every number this member can use and
 * refreshes the affected queries (batched, so a campaign burst causes one refetch, not 500).
 */
export function useInboxRealtime(tenantId: string, onInbound?: (e: MessageEvent) => void): RealtimeState {
    const qc = useQueryClient();
    const numbers = usePhoneNumbers();
    const [state, setState] = useState<RealtimeState>(realtimeConfigured ? 'connecting' : 'polling');
    const pending = useRef<{ threads: Set<string>; list: boolean; timer: ReturnType<typeof setTimeout> | null }>({
        threads: new Set(),
        list: false,
        timer: null,
    });
    const onInboundRef = useRef(onInbound);

    useEffect(() => {
        onInboundRef.current = onInbound;
    }, [onInbound]);

    const ids = (numbers.data ?? [])
        .filter((n) => n.status !== 'disconnected')
        .map((n) => n.id)
        .sort()
        .join(',');

    useEffect(() => {
        const echoPromise = getEcho();
        if (!echoPromise || ids === '') return;

        let disposed = false;
        const channels = ids.split(',').map((id) => `tenant.${tenantId}.number.${id}`);

        const flush = () => {
            const p = pending.current;
            p.timer = null;
            if (p.list) void qc.invalidateQueries({ queryKey: keys.conversationsAll });
            for (const id of p.threads) {
                void qc.invalidateQueries({ queryKey: keys.thread(id) });
                void qc.invalidateQueries({ queryKey: keys.conversation(id) });
            }
            p.threads.clear();
            p.list = false;
        };

        const schedule = (e: MessageEvent, created: boolean) => {
            const p = pending.current;
            p.threads.add(e.conversation_id);
            p.list ||= created;
            p.timer ??= setTimeout(flush, 250);
            if (created && e.direction === 'inbound') onInboundRef.current?.(e);
        };

        void echoPromise.then((echo) => {
            if (disposed) return;
            const pusher = (echo.connector as unknown as { pusher: { connection: { bind: (ev: string, cb: () => void) => void; state: string } } }).pusher;
            pusher.connection.bind('connected', () => setState('live'));
            pusher.connection.bind('unavailable', () => setState('polling'));
            pusher.connection.bind('failed', () => setState('polling'));
            if (pusher.connection.state === 'connected') setState('live');

            for (const name of channels) {
                echo.private(name)
                    .listen('.message.created', (e: MessageEvent) => schedule(e, true))
                    .listen('.message.updated', (e: MessageEvent) => schedule(e, false));
            }
        });

        return () => {
            disposed = true;
            void echoPromise.then((echo) => channels.forEach((name) => echo.leave(name)));
        };
    }, [ids, tenantId, qc]);

    return state;
}
