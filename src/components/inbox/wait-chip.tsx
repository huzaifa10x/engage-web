'use client';

import { PauseIcon, TimerIcon, TriangleAlertIcon } from 'lucide-react';

import { liveClock, waitText, waitTier } from '@/lib/promise';
import type { Conversation } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * The reply promise clock (3.3): business time this chat has waited for a person, with the assignee
 * ("Waiting 0:42 · Ahmed"). Grey, then amber in the last quarter of the limit, red once over;
 * paused outside business hours.
 */
export function WaitChip({ conversation, fetchedAt, now, large }: { conversation: Conversation; fetchedAt: number; now: number; large?: boolean }) {
    if (conversation.state !== 'needs_reply' || !conversation.promise) return null;
    const p = liveClock(conversation.promise, fetchedAt, now);
    const tier = waitTier(p);
    const Icon = tier === 'over' ? TriangleAlertIcon : tier === 'paused' ? PauseIcon : TimerIcon;

    return (
        <span
            className={cn(
                'inline-flex w-fit items-center gap-1 rounded-full font-semibold tabular-nums',
                large ? 'px-2 py-0.5 text-[12px]' : 'mt-1 mr-1 px-1.5 py-px text-[10.5px]',
                tier === 'over' ? 'bg-bad-bg text-bad' : tier === 'soon' ? 'bg-warn-bg text-warn' : 'bg-grey-bg text-grey',
            )}
            title={`Needs a reply within ${p.limit_minutes} business minutes${p.paused ? ' · the clock is paused outside business hours' : ''}`}
        >
            <Icon className="size-3" /> {waitText(conversation, p)}
        </span>
    );
}
