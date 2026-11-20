'use client';

import { PauseIcon, TimerIcon, TriangleAlertIcon } from 'lucide-react';

import { liveClock, waitText, waitTier } from '@/lib/promise';
import type { Conversation } from '@/lib/types';

import { Chip } from './conversation-list';

/**
 * The reply promise clock (pilot kit): business time this chat has waited for a person, with the
 * assignee ("Waiting 0:42 · Ahmed"). Grey, amber in the last quarter of the limit, red once over;
 * paused outside business hours. Shown on queue cards and in the chat header.
 */
export function WaitClock({ conversation: c, fetchedAt, now }: { conversation: Conversation; fetchedAt: number; now: number }) {
    if (c.status === 'closed' || c.state !== 'needs_reply' || !c.promise) return null;
    const p = liveClock(c.promise, fetchedAt, now);
    const tier = waitTier(p);
    const Icon = tier === 'over' ? TriangleAlertIcon : tier === 'paused' ? PauseIcon : TimerIcon;

    return (
        <Chip
            tone={tier === 'over' ? 'bad' : tier === 'soon' ? 'warn' : 'grey'}
            title={`Needs a reply within ${p.limit_minutes} business minutes${p.paused ? ' · the clock is paused outside business hours' : ''}`}
        >
            <Icon /> {waitText(c, p)}
        </Chip>
    );
}
