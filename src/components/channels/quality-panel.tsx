'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangleIcon } from 'lucide-react';

import { Badge, type Tone } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { relative } from '@/lib/format';

export type NumberQuality = {
    quality_rating: 'GREEN' | 'YELLOW' | 'RED' | null;
    messaging_limit_tier: string | null;
    limit: number | null;
    used: number;
    remaining: number | null;
    available_at: string | null;
    campaign_hourly_share: number;
    campaign_hourly_cap: number | null;
    warning: { at: string; title: string; detail: string | null; tone: string } | null;
    last_synced_at: string | null;
    history: { at: string; type: string; title: string; detail: string | null; tone: string }[];
};

const RATING: Record<string, { label: string; tone: Tone; hint: string }> = {
    GREEN: { label: 'High quality', tone: 'good', hint: 'Customers are responding well to your messages.' },
    YELLOW: {
        label: 'Medium quality',
        tone: 'warn',
        hint: 'More people than usual block or report your messages. Send fewer marketing messages, only to people who asked for them.',
    },
    RED: {
        label: 'Low quality',
        tone: 'bad',
        hint: 'Many people block or report your messages. Marketing campaigns on this number are paused; Meta may lower the limit.',
    },
};

const TONE: Record<string, Tone> = { good: 'good', warn: 'warn', bad: 'bad', info: 'info' };

/**
 * Channels › a number's quality and limits: Meta's quality rating, the daily messaging limit and how
 * much of it was used in the last 24 hours, how fast one campaign may use it, Meta's latest warning
 * and the last 30 days of changes. Refreshes every 30 seconds while open.
 */
export function QualityPanel({ numberId }: { numberId: string }) {
    const q = useQuery({
        queryKey: ['phone-numbers', numberId, 'quality'],
        queryFn: () => api<{ data: NumberQuality }>(`phone-numbers/${numberId}/quality`).then((r) => r.data),
        refetchInterval: 30_000,
    });
    if (!q.data) return <Skeleton className="h-32" />;
    const d = q.data;
    const rating = d.quality_rating ? RATING[d.quality_rating] : null;
    const pct = d.limit ? Math.min(100, Math.round((d.used / d.limit) * 100)) : 0;

    return (
        <div className="grid gap-4" role="region" aria-label="Quality and limits">
            {d.warning && (
                <div role="alert" className="flex gap-2 rounded-lg border border-bad/30 bg-bad-bg px-3 py-2 text-[13px] text-ink-2">
                    <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-bad" />
                    <span>
                        <span className="font-semibold text-bad">{d.warning.title}</span>
                        {d.warning.detail ? ` ${d.warning.detail}` : ''} <span className="text-muted-foreground">· {relative(d.warning.at)}</span>
                    </span>
                </div>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border px-3 py-2.5">
                    <p className="text-[12px] text-muted-foreground">Quality rating</p>
                    <div className="mt-1">
                        {rating ? (
                            <Badge tone={rating.tone} dot>
                                {rating.label}
                            </Badge>
                        ) : (
                            <span className="text-[13px]">Not rated yet</span>
                        )}
                    </div>
                    {rating && <p className="mt-1.5 text-[12px] text-muted-foreground">{rating.hint}</p>}
                </div>
                <div className="rounded-md border px-3 py-2.5">
                    <p className="text-[12px] text-muted-foreground">Business-initiated, last 24 hours</p>
                    <p className="text-lg font-semibold tabular-nums">
                        {d.used.toLocaleString()}
                        <span className="text-[13px] font-normal text-muted-foreground"> / {d.limit === null ? 'unlimited' : d.limit.toLocaleString()}</span>
                    </p>
                    {d.limit !== null && (
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${pct}% of the daily limit used`}>
                            <div className={`h-full rounded-full ${pct >= 90 ? 'bg-bad' : pct >= 70 ? 'bg-warn' : 'bg-good'}`} style={{ width: `${pct}%` }} />
                        </div>
                    )}
                    <p className="mt-1.5 text-[12px] text-muted-foreground">
                        {d.remaining === 0 && d.available_at
                            ? `Limit reached. Room again from ${new Date(d.available_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.`
                            : 'Shared by every number of this business. People who wrote to you in the last 24 hours don’t count.'}
                    </p>
                </div>
                <div className="rounded-md border px-3 py-2.5">
                    <p className="text-[12px] text-muted-foreground">One campaign, per hour</p>
                    <p className="text-lg font-semibold tabular-nums">
                        {d.campaign_hourly_cap === null ? 'No cap' : `up to ${d.campaign_hourly_cap.toLocaleString()}`}
                    </p>
                    <p className="mt-1.5 text-[12px] text-muted-foreground">
                        {d.campaign_hourly_share}% of the daily limit, so a large campaign is spread over the day. Change it in Consent &amp; Privacy.
                    </p>
                </div>
            </div>
            <div>
                <p className="mb-1.5 text-[12.5px] font-semibold text-muted-foreground">Changes in the last 30 days</p>
                {d.history.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">No changes. Checked with Meta {relative(d.last_synced_at)}.</p>
                ) : (
                    <ul className="grid gap-1.5 text-[13px]" aria-label="Quality changes">
                        {d.history.map((h, i) => (
                            <li key={`${h.at}-${i}`} className="flex flex-wrap items-baseline gap-x-2">
                                <Badge tone={TONE[h.tone] ?? 'grey'} dot>
                                    {new Date(h.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                                </Badge>
                                <span className="font-medium">{h.title}</span>
                                {h.detail && <span className="text-muted-foreground">{h.detail}</span>}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
