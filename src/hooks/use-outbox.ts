'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { useSession } from '@/components/app/session';
import * as outbox from '@/lib/outbox';
import { keys } from '@/lib/queries';

/** This person's unsent replies in this workspace (optionally one chat), and a way to send the waiting ones. */
export function useOutbox(conversationId?: string) {
    const { me } = useSession();
    const qc = useQueryClient();
    const all = useSyncExternalStore(outbox.subscribe, outbox.snapshot, outbox.serverSnapshot);
    const scope = useMemo(() => ({ userId: me.user.id, tenantId: me.active_tenant_id ?? '' }), [me.user.id, me.active_tenant_id]);
    const items = useMemo(
        () => all.filter((i) => outbox.inScope(i, scope) && (!conversationId || i.conversationId === conversationId)),
        [all, scope, conversationId],
    );
    const flush = useCallback(
        () =>
            outbox.flush(scope, (id) => {
                void qc.invalidateQueries({ queryKey: keys.thread(id) });
                void qc.invalidateQueries({ queryKey: keys.conversation(id) });
                void qc.invalidateQueries({ queryKey: keys.conversationsAll });
            }),
        [scope, qc],
    );

    return { items, scope, flush };
}
