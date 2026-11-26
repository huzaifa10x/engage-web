'use client';

import { ClockIcon, TriangleAlertIcon } from 'lucide-react';

import { liveClock, waitTier } from '@/lib/promise';
import { dur } from '@/lib/inbox';
import type { Conversation } from '@/lib/types';
import { cn } from '@/lib/utils';

import { WindowChip } from './conversation-list';

/**
 * Phones (prototype): one line under the chat header. While the customer waits: "Sara has waited
 * 12 min", amber from the first alert step, red from the second, with the 24-hour window on the right.
 * Otherwise only the window. Replaces the chip row of the desktop header.
 */
export function MobileWaitBar({
    conversation: c,
    fetchedAt,
    now,
    name,
    numberGone,
}: {
    conversation: Conversation;
    fetchedAt: number;
    now: number;
    name: string;
    numberGone: boolean;
}) {
    const waiting = c.status !== 'closed' && c.state === 'needs_reply';
    const p = waiting && c.promise ? liveClock(c.promise, fetchedAt, now) : null;
    const tier = p ? waitTier(p) : null;
    const waited = p ? p.waited_seconds * 1000 : waiting && c.needs_reply_since ? now - new Date(c.needs_reply_since).getTime() : null;
    const first = name.split(' ')[0];

    return (
        <div
            className={cn(
                'flex items-center gap-2 border-t px-4 py-2 text-[12.5px] md:hidden',
                tier === 'over' ? 'bg-bad-bg text-bad' : tier === 'soon' ? 'bg-warn-bg text-warn' : 'bg-card text-muted-foreground',
            )}
        >
            {waited !== null ? (
                <>
                    {tier === 'over' ? <TriangleAlertIcon className="size-4 shrink-0" aria-hidden /> : <ClockIcon className="size-4 shrink-0" aria-hidden />}
                    <span className="min-w-0 flex-1 truncate">
                        {first} has waited <b className="font-semibold tabular-nums">{dur(waited, true)}</b>
                        {p?.paused ? ' · paused outside hours' : ''}
                    </span>
                </>
            ) : (
                <span className="min-w-0 flex-1 truncate">{c.status === 'closed' ? 'Resolved' : 'No one is waiting'}</span>
            )}
            {numberGone ? <span className="shrink-0 font-semibold text-bad">Number disconnected</span> : <WindowChip conversation={c} now={now} />}
        </div>
    );
}
