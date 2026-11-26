'use client';

import { AlertCircleIcon, ClockIcon, Loader2Icon } from 'lucide-react';

import type { OutboxItem } from '@/lib/outbox';
import { cn } from '@/lib/utils';

/**
 * A reply still on this phone, shown at the end of the chat: Waiting for connection, Sending, or
 * Not sent with the server's reason and Retry / Edit. Once the server accepts it, the real message
 * (with Sent → Delivered → Read) takes its place.
 */
export function OutboxBubble({ item, onRetry, onEdit }: { item: OutboxItem; onRetry: () => void; onEdit: () => void }) {
    return (
        <div className="mt-1.5 flex justify-end">
            <div
                className={cn(
                    'max-w-[80%] rounded-2xl rounded-br-md px-3 py-2 text-[14.5px] shadow-sm',
                    item.state === 'refused' ? 'border border-bad/40 bg-card' : 'bg-brand-100/70',
                )}
            >
                <p className="break-words whitespace-pre-wrap" dir="auto">
                    {item.body}
                </p>
                <p
                    className={cn('mt-1 flex items-center justify-end gap-1 text-[11.5px]', item.state === 'refused' ? 'text-bad' : 'text-muted-foreground')}
                    role="status"
                >
                    {item.state === 'waiting' && (
                        <>
                            <ClockIcon className="size-3.5" aria-hidden /> Waiting for connection
                        </>
                    )}
                    {item.state === 'sending' && (
                        <>
                            <Loader2Icon className="size-3.5 animate-spin" aria-hidden /> Sending…
                        </>
                    )}
                    {item.state === 'refused' && (
                        <>
                            <AlertCircleIcon className="size-3.5 shrink-0" aria-hidden /> Not sent{item.error ? ` · ${item.error}` : ''}
                        </>
                    )}
                </p>
                {item.state !== 'sending' && (
                    <div className="mt-1.5 flex justify-end gap-3 text-[12.5px] font-semibold">
                        {item.state === 'refused' && (
                            <button type="button" onClick={onRetry} className="min-h-8 text-brand-600">
                                Retry
                            </button>
                        )}
                        <button type="button" onClick={onEdit} className="min-h-8 text-ink-2">
                            Edit
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
