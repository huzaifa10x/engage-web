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

    return `${sync.percent}% of your history received · ${n(sync.imported)} records imported`;
}

/**
 * Progress of the import from the WhatsApp Business app.
 *
 * WhatsApp sends the data in batches at its own pace and reports what share of the history it has
 * sent so far; that share is the bar. Every batch is imported the moment it arrives, and the
 * counts show exactly how many contacts and messages are in.
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
                Import complete: {n(sync.contacts)} contacts and {n(sync.messages)} messages
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
                    <dl className="grid grid-cols-3 gap-2 text-[13px] sm:grid-cols-[repeat(3,minmax(0,10rem))]">
                        {[
                            ['Received from WhatsApp', `${sync.percent}%`],
                            ['Contacts imported', n(sync.contacts)],
                            ['Messages imported', n(sync.messages)],
                        ].map(([label, value]) => (
                            <div key={label} className="rounded-lg border bg-card px-3 py-2">
                                <dt className="text-[11.5px] text-muted-foreground">{label}</dt>
                                <dd className="text-[15px] font-semibold tabular-nums">{value}</dd>
                            </div>
                        ))}
                    </dl>
                    <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                        {sync.whatsapp_finished
                            ? 'WhatsApp has finished sending; the last records are being imported.'
                            : `WhatsApp sends your history in batches and has sent ${sync.percent}% so far, so ${100 - sync.percent}% is still to come. Each batch is imported as soon as it arrives.`}
                        {sync.waiting > 0 && ` ${n(sync.waiting)} received records are being imported now.`}
                        {sync.last_imported_at &&
                            ` Last batch: ${new Date(sync.last_imported_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.`}{' '}
                        New messages are not affected and arrive straight away.
                    </p>
                </>
            )}
        </div>
    );
}
