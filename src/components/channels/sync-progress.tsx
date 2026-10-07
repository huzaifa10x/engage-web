'use client';

import { CheckCircle2Icon, Loader2Icon, TriangleAlertIcon } from 'lucide-react';

import type { PhoneNumberSync } from '@/lib/types';
import { cn } from '@/lib/utils';

const n = (value: number) => value.toLocaleString();

/** "about 3 hours 20 minutes", "about 45 minutes", "less than a minute". */
export function timeLeft(minutes: number): string {
    if (minutes <= 0) return 'less than a minute';
    if (minutes < 60) return `about ${minutes} minute${minutes === 1 ? '' : 's'}`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours >= 48) return `about ${Math.round(minutes / 1440)} days`;

    return `about ${hours} hour${hours === 1 ? '' : 's'}${rest >= 5 ? ` ${rest} minutes` : ''}`;
}

/** One sentence for tight spaces (the inbox banner, a table cell). */
export function syncSummary(sync: PhoneNumberSync): string {
    if (sync.state === 'waiting') return 'Waiting for WhatsApp to start sending your data…';
    if (sync.state === 'complete') return `Import complete: ${n(sync.imported)} records`;
    if (sync.state === 'failed') return 'The import could not be started';

    return `${n(sync.imported)} of ${n(sync.received)}${sync.whatsapp_finished ? '' : '+'} records imported · ${n(sync.remaining)} remaining`;
}

/**
 * Progress of the import from the WhatsApp Business app: how many records have arrived, how many
 * are imported, how many remain, at what pace, and how long that will take. Every number comes
 * from the server's own counters.
 */
export function SyncProgress({ sync, compact = false }: { sync: PhoneNumberSync; compact?: boolean }) {
    if (sync.state === 'failed') {
        return (
            <p className="flex items-start gap-2 text-[13px] text-bad">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                The import was not started within WhatsApp&apos;s 24-hour limit. New messages work normally; to import history, disconnect and reconnect the
                number.
            </p>
        );
    }
    if (sync.state === 'complete') {
        return (
            <p className="flex items-center gap-2 text-[13px] text-good">
                <CheckCircle2Icon className="size-4 shrink-0" />
                Import complete: {n(sync.contacts.imported)} contacts and {n(sync.messages.imported)} messages
                {sync.history_declined && ' (chat history was not shared from the phone)'}.
            </p>
        );
    }

    const waiting = sync.state === 'waiting';

    return (
        <div className="grid gap-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="flex items-center gap-2 text-[13.5px] font-semibold">
                    <Loader2Icon className="size-4 shrink-0 animate-spin text-brand-600" />
                    {waiting ? 'Waiting for WhatsApp to start sending your data' : 'Importing from the WhatsApp Business app'}
                </p>
                {!waiting && <p className="text-[13.5px] font-semibold tabular-nums">{sync.percent}%</p>}
            </div>

            <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={sync.percent}
                aria-label="Import progress"
                className="h-2.5 overflow-hidden rounded-full bg-muted"
            >
                <div
                    className={cn('h-full rounded-full bg-primary transition-[width] duration-700', waiting && 'w-1/5 animate-pulse')}
                    style={waiting ? undefined : { width: `${Math.max(2, sync.percent)}%` }}
                />
            </div>

            {!waiting && (
                <>
                    <dl className={cn('grid gap-2 text-[13px]', compact ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-[repeat(3,minmax(0,10rem))]')}>
                        {[
                            ['Imported', sync.imported],
                            ['Remaining', sync.remaining],
                            ['Received so far', sync.received],
                        ].map(([label, value]) => (
                            <div key={label as string} className="rounded-lg border bg-card px-3 py-2">
                                <dt className="text-[11.5px] text-muted-foreground">{label}</dt>
                                <dd className="text-[15px] font-semibold tabular-nums">{n(value as number)}</dd>
                            </div>
                        ))}
                    </dl>
                    <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                        {n(sync.contacts.imported)} of {n(sync.contacts.received)} contacts and {n(sync.messages.imported)} of {n(sync.messages.received)}{' '}
                        messages. Records are imported at {n(sync.per_hour)} per hour, so the rest takes {timeLeft(sync.minutes_left)}.{' '}
                        {sync.whatsapp_finished
                            ? 'WhatsApp has finished sending.'
                            : `WhatsApp is still sending history${sync.whatsapp_progress !== null ? ` (${sync.whatsapp_progress}% sent)` : ''}, so the totals can still grow.`}{' '}
                        New messages are not affected and arrive straight away.
                    </p>
                </>
            )}
        </div>
    );
}
