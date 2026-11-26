import type { Conversation, ReplyPromiseClock } from './types';

/** "0:42", "2:05"; beyond 24 business hours "3d 4h", so a stale chat never reads as 576:00. */
export function clock(seconds: number): string {
    const m = Math.floor(Math.abs(seconds) / 60);
    const h = Math.floor(m / 60);
    if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;

    return `${h}:${String(m % 60).padStart(2, '0')}`;
}

/** The promise clock moved on locally between refreshes (only while the business is open). */
export function liveClock(p: ReplyPromiseClock, fetchedAt: number, now: number): ReplyPromiseClock {
    if (p.paused) return p;
    const extra = Math.max(0, Math.floor((now - fetchedAt) / 1000));
    const waited = p.waited_seconds + extra;
    const left = p.left_seconds - extra;

    return { ...p, waited_seconds: waited, left_seconds: left, over: left <= 0 };
}

export type WaitTier = 'over' | 'soon' | 'ok' | 'paused';

/** Default reply-alert steps (Fast preset): amber after 5 minutes, red after 15. */
export const AMBER_MINUTES = 5;
export const RED_MINUTES = 15;

/**
 * Amber from the first reply-alert step (5 min on Fast), red from the second (15 min) or once over the
 * promise; grey before that; paused outside business hours.
 */
export function waitTier(p: ReplyPromiseClock): WaitTier {
    const [amber = AMBER_MINUTES, red = RED_MINUTES] = p.alert_minutes ?? [];
    if (p.over || p.waited_seconds >= red * 60) return 'over';
    if (p.paused) return 'paused';

    return p.waited_seconds >= amber * 60 ? 'soon' : 'ok';
}

/** "Waiting 0:42 · Ahmed" */
export function waitText(c: Pick<Conversation, 'assigned_name'>, p: ReplyPromiseClock): string {
    const who = c.assigned_name ? c.assigned_name.split(' ')[0] : 'Unassigned';
    const base = `Waiting ${clock(p.waited_seconds)} · ${who}`;
    if (p.over) return `${base} · over by ${clock(-p.left_seconds)}`;
    if (p.paused) return `${base} · paused`;

    return base;
}

export const AED = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `AED ${Math.round(v).toLocaleString('en-GB')}`);
