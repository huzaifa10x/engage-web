'use client';

import { CheckCircle2Icon, Loader2Icon, TriangleAlertIcon } from 'lucide-react';

import type { PhoneNumberSync } from '@/lib/types';
import { cn } from '@/lib/utils';

const n = (value: number) => value.toLocaleString();

/** One sentence for tight spaces (the inbox banner, a table cell). */
export function syncSummary(sync: PhoneNumberSync): string {
    if (sync.state === 'waiting') return 'Waiting for WhatsApp to start sending your data…';
    if (sync.state === 'complete') return `Import complete: ${n(sync.imported)} records`;
    if (sync.state === 'failed') return 'The import could not be started';

    return `${n(sync.imported)} of ${n(sync.received)}${sync.whatsapp_finished ? '' : '+'} records imported · ${n(sync.waiting)} waiting`;
}

/**
 * Progress of the import from the WhatsApp Business app. Two things happen, and both are shown:
 * WhatsApp sends the data in batches (it reports what share it has sent), and what has arrived
 * is imported into the inbox in steady batches so the rest of the app stays fast.
 */
export function SyncProgress({ sync }: { sync: PhoneNumberSync }) {
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
                {!waiting && (
                    <p className="text-[13.5px] font-semibold tabular-nums">
                        {n(sync.imported)} / {n(sync.received)}
                        {!sync.whatsapp_finished && '+'}
                    </p>
                )}
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
                    <dl className="grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-[repeat(4,minmax(0,9.5rem))]">
                        {[
                            ['Imported', n(sync.imported)],
                            ['Waiting to import', n(sync.waiting)],
                            ['Received so far', n(sync.received)],
                            ['Sent by WhatsApp', `${sync.whatsapp_percent}%`],
                        ].map(([label, value]) => (
                            <div key={label} className="rounded-lg border bg-card px-3 py-2">
                                <dt className="text-[11.5px] text-muted-foreground">{label}</dt>
                                <dd className="text-[15px] font-semibold tabular-nums">{value}</dd>
                            </div>
                        ))}
                    </dl>
                    <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                        {n(sync.contacts.imported)} of {n(sync.contacts.received)} contacts and {n(sync.messages.imported)} of {n(sync.messages.received)}{' '}
                        messages are in.{' '}
                        {sync.whatsapp_finished
                            ? 'WhatsApp has finished sending, so these totals are final.'
                            : `WhatsApp has sent ${sync.whatsapp_percent}% of your history so far; the totals grow as more arrives.`}{' '}
                        Records are imported in steady batches in the background so the inbox stays fast. New messages are not affected and arrive straight
                        away.
                    </p>
                </>
            )}
        </div>
    );
}
