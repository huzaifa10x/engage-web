import { ApiError } from './api';
import { sendToConversation } from './queries';

/**
 * Unsent replies (mobile brief, launch must-have 2). Every typed reply is saved on this phone first,
 * with its own id, before it leaves: Waiting for connection → Sending → accepted by the server (then
 * the chat shows Sent → Delivered → Read from WhatsApp). The id is the request's Idempotency-Key, so
 * a retry, a lost answer or a send after reopening the app can never store the reply twice.
 * Kept per person and workspace; replies go out only while the app is open, never in the background.
 */

export type OutboxState = 'waiting' | 'sending' | 'refused';
export type OutboxItem = {
    id: string;
    userId: string;
    tenantId: string;
    conversationId: string;
    body: string;
    replyTo: string | null;
    state: OutboxState;
    error: string | null;
    at: number;
    /** Failed attempts while the phone was online (server busy or failing). */
    tries?: number;
};
export type OutboxScope = { userId: string; tenantId: string };

const KEY = 'engage.outbox.v1';
const listeners = new Set<() => void>();
let cache: OutboxItem[] | null = null;

function read(): OutboxItem[] {
    if (cache) return cache;
    try {
        const raw = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null;
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        cache = Array.isArray(parsed) ? (parsed as OutboxItem[]).filter((i) => i && typeof i.id === 'string' && typeof i.body === 'string') : [];
    } catch {
        cache = [];
    }
    // A reply that was "sending" when the app closed is waiting again (the server returns the same message if it had arrived).
    cache = cache.map((i) => (i.state === 'sending' ? { ...i, state: 'waiting' } : i));

    return cache;
}

function write(items: OutboxItem[]): void {
    cache = items;
    try {
        if (items.length) window.localStorage.setItem(KEY, JSON.stringify(items));
        else window.localStorage.removeItem(KEY);
    } catch {
        // private window or full storage: kept for this visit only
    }
    listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
        if (e.key === KEY) {
            cache = null;
            listener();
        }
    };
    window.addEventListener('storage', onStorage);

    return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
    };
}

const EMPTY: OutboxItem[] = [];
export const snapshot = (): OutboxItem[] => (typeof window === 'undefined' ? EMPTY : read());
export const serverSnapshot = (): OutboxItem[] => EMPTY;

export const inScope = (i: OutboxItem, s: OutboxScope) => i.userId === s.userId && i.tenantId === s.tenantId;

export function add(item: Omit<OutboxItem, 'state' | 'error' | 'at'>): void {
    write([...read().filter((i) => i.id !== item.id), { ...item, state: 'waiting', error: null, at: Date.now() }]);
}

export function update(id: string, patch: Partial<OutboxItem>): void {
    write(read().map((i) => (i.id === id ? { ...i, ...patch } : i)));
}

export function remove(id: string): void {
    write(read().filter((i) => i.id !== id));
}

/** Sign-out: unsent replies on this phone for this person. */
export function countFor(userId: string): number {
    return read().filter((i) => i.userId === userId).length;
}

/** Sign-out: removes unsent replies and every chat draft kept on this phone. */
export function clearForSignOut(userId: string): void {
    write(read().filter((i) => i.userId !== userId));
    try {
        for (let n = window.localStorage.length - 1; n >= 0; n--) {
            const k = window.localStorage.key(n);
            if (k && (k.startsWith('engage.inbox.draft.') || k.startsWith('engage.inbox.note.'))) window.localStorage.removeItem(k);
        }
    } catch {
        // nothing kept
    }
}

/** Mobile-ready, step 5: a reply from this phone was accepted by the server. */
export const REPLIED_KEY = 'engage.mobile-ready.replied';
function markReplied(): void {
    try {
        localStorage.setItem(REPLIED_KEY, '1');
    } catch {
        // fine
    }
}

let running: Promise<void> | null = null;

/**
 * Sends this workspace's waiting replies, oldest first, one at a time. A dropped connection leaves
 * the rest waiting; a refusal from the server (window closed, number gone, …) marks that reply
 * "Not sent" with the reason, for Retry or Edit.
 */
export function flush(scope: OutboxScope, onSent: (conversationId: string) => void): Promise<void> {
    if (running) return running;
    const run = async (): Promise<void> => {
        for (;;) {
            if (typeof navigator !== 'undefined' && !navigator.onLine) return;
            const next = read()
                .filter((i) => inScope(i, scope) && i.state === 'waiting')
                .sort((a, b) => a.at - b.at)[0];
            if (!next) return;
            update(next.id, { state: 'sending', error: null });
            try {
                await sendToConversation(next.conversationId, { type: 'text', body: next.body, reply_to: next.replyTo ?? undefined }, next.id);
                remove(next.id);
                markReplied();
                onSent(next.conversationId);
            } catch (e) {
                const refused = e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429;
                if (refused) {
                    const reason = e.firstFieldError('body') ?? e.firstFieldError('message') ?? e.message;
                    update(next.id, { state: 'refused', error: reason });
                    onSent(next.conversationId);
                    continue;
                }
                update(next.id, { state: 'waiting', error: null });

                // Online but the server keeps failing: after 3 tries say so, with Retry, instead of
                // waiting for a connection the phone already has.
                const tries = (next.tries ?? 0) + 1;
                const online = typeof navigator === 'undefined' || navigator.onLine;
                if (online && tries >= 3) {
                    update(next.id, { state: 'refused', error: 'Couldn’t reach engageX', tries: 0 });
                    onSent(next.conversationId);
                    continue;
                }
                update(next.id, { state: 'waiting', error: null, tries: online ? tries : next.tries });

                return; // no connection, or the server is busy: try again later
            }
        }
    };
    // Cleared only after it was set: when there is nothing to send the loop ends at once, and clearing
    // it inside the loop would run before the assignment and leave every later send blocked.
    running = run().finally(() => {
        running = null;
    });

    return running;
}
