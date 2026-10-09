'use client';

import { AlertCircleIcon, CheckCheckIcon, CheckIcon, ClockIcon, FileIcon, HistoryIcon, MapPinIcon, ReplyIcon, SmartphoneIcon } from 'lucide-react';

import { clockTime, fileSize } from '@/lib/format';
import type { Message } from '@/lib/types';
import { cn } from '@/lib/utils';

function StatusTicks({ message }: { message: Message }) {
    switch (message.status) {
        case 'queued':
            return (
                <span className="inline-flex items-center gap-0.5">
                    <ClockIcon className="size-3.5" aria-label="Sending" /> Sending
                </span>
            );
        case 'accepted':
        case 'sent':
            return <CheckIcon className="size-3.5" aria-label="Sent" />;
        case 'delivered':
            return <CheckCheckIcon className="size-3.5" aria-label="Delivered" />;
        case 'read':
            return <CheckCheckIcon className="size-3.5 text-sky-500" aria-label="Read" />;
        case 'failed':
            return (
                <span className="inline-flex items-center gap-0.5 font-medium text-bad">
                    <AlertCircleIcon className="size-3.5" aria-hidden /> Not sent
                </span>
            );
        default:
            return null;
    }
}

/**
 * Media is served through this origin (/api/v1/media/{id}) so the session cookie applies.
 * Links use rel="noopener", NOT "noreferrer": the server recognises portal requests by their Referer,
 * and a link that hides it is answered "Authentication required" even for a signed-in person.
 */
function MediaBody({ message }: { message: Message }) {
    const media = message.media;
    if (message.type === 'media_placeholder' || !media) {
        return <p className="text-[13px] italic opacity-70">Media from chat history</p>;
    }
    if (media.status !== 'ready') {
        return <p className="text-[13px] italic opacity-70">{media.status === 'failed' ? 'Media could not be downloaded' : 'Loading media…'}</p>;
    }
    const src = `/api/v1/media/${media.id}`;

    switch (message.type) {
        case 'image':
        case 'sticker':
            return (
                <a href={src} target="_blank" rel="noopener">
                    {/* eslint-disable-next-line @next/next/no-img-element -- authenticated, same-origin media */}
                    <img
                        src={src}
                        alt={message.body ?? 'Image'}
                        className={cn('max-h-72 rounded-md object-cover', message.type === 'sticker' && 'max-h-32 bg-transparent')}
                    />
                </a>
            );
        case 'video':
            return <video src={src} controls className="max-h-72 rounded-md" />;
        case 'audio':
            return <audio src={src} controls className="w-64 max-w-full" />;
        default:
            return (
                <a href={src} target="_blank" rel="noopener" className="flex items-center gap-2 rounded-md bg-black/5 px-3 py-2 hover:bg-black/10">
                    <FileIcon className="size-5 shrink-0" />
                    <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium">{media.filename ?? 'Document'}</span>
                        <span className="text-[11.5px] opacity-70">{fileSize(media.file_size)}</span>
                    </span>
                </a>
            );
    }
}

function Body({ message }: { message: Message }) {
    const c = message.content as Record<string, unknown>;

    if (message.status === 'deleted' || message.revoked_at) return <p className="text-[13.5px] italic opacity-70">This message was deleted</p>;
    if (message.redacted) return <p className="text-[13.5px] italic opacity-70">Content removed by your retention policy</p>;

    switch (message.type) {
        case 'text':
        case 'button':
        case 'interactive':
            return <p className="text-[14px] break-words whitespace-pre-wrap">{message.body}</p>;
        case 'image':
        case 'video':
        case 'audio':
        case 'document':
        case 'sticker':
        case 'media_placeholder':
            return (
                <div className="grid gap-1.5">
                    <MediaBody message={message} />
                    {message.body && <p className="text-[14px] break-words whitespace-pre-wrap">{message.body}</p>}
                </div>
            );
        case 'template': {
            const rendered = message.template?.rendered;

            return (
                <div>
                    <p className="text-[11.5px] font-semibold tracking-wide uppercase opacity-70">Template · {message.template?.name}</p>
                    {rendered?.header && <p className="mt-1 text-[14px] font-semibold">{rendered.header}</p>}
                    {message.body && <p className="mt-1 text-[14px] break-words whitespace-pre-wrap">{message.body}</p>}
                    {rendered?.footer && <p className="mt-1 text-[12px] opacity-70">{rendered.footer}</p>}
                    {rendered?.buttons && rendered.buttons.length > 0 && (
                        <div className="mt-2 grid gap-1 border-t border-black/10 pt-2">
                            {rendered.buttons.map((label, i) => (
                                <span key={i} className="rounded bg-black/5 px-2 py-1 text-center text-[12.5px] font-medium">
                                    {label}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            );
        }
        case 'location': {
            const lat = c.latitude as number | undefined;
            const lng = c.longitude as number | undefined;

            return (
                <a
                    href={`https://maps.google.com/?q=${lat},${lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 underline-offset-2 hover:underline"
                >
                    <MapPinIcon className="size-4" /> {message.body ?? `${lat}, ${lng}`}
                </a>
            );
        }
        case 'reaction':
            return <p className="text-2xl leading-none">{String(c.emoji ?? '')}</p>;
        case 'unsupported':
            return <p className="text-[13px] italic opacity-70">Unsupported message — check the WhatsApp app</p>;
        default:
            return <p className="text-[13px] italic opacity-70">{message.body ?? `${message.type} message`}</p>;
    }
}

export function MessageBubble({
    message,
    quoted,
    authorLabel,
    onReply,
}: {
    message: Message;
    quoted?: Message | null;
    authorLabel?: string | null;
    onReply?: (m: Message) => void;
}) {
    const outbound = message.direction === 'outbound';

    return (
        <div className={cn('group flex items-end gap-1.5', outbound ? 'justify-end' : 'justify-start')}>
            {outbound && onReply && message.wamid && (
                <button
                    onClick={() => onReply(message)}
                    className="invisible rounded p-1 text-muted-foreground group-hover:visible hover:bg-muted"
                    aria-label="Reply"
                >
                    <ReplyIcon className="size-4" />
                </button>
            )}
            <div
                className={cn(
                    'max-w-[min(34rem,80%)] rounded-lg px-3 py-2 shadow-[0_1px_1px_rgba(15,23,42,.08)]',
                    outbound ? 'rounded-br-sm bg-[#dcf8c6] text-slate-900' : 'rounded-bl-sm bg-card',
                    message.origin === 'app_echo' && 'bg-[#e8f5e0]',
                    message.status === 'failed' && 'ring-1 ring-bad/40',
                )}
            >
                {quoted !== undefined && message.reply_to_wamid && (
                    <div className="mb-1.5 rounded border-l-4 border-brand-500/60 bg-black/5 px-2 py-1 text-[12.5px] opacity-80">
                        {quoted ? (quoted.body ?? `${quoted.type} message`) : 'Replying to an earlier message'}
                    </div>
                )}
                <Body message={message} />
                {message.status === 'failed' && (
                    <div className="mt-1.5 rounded border border-bad/30 bg-bad-bg px-2 py-1.5 text-[12.5px] text-bad" role="alert">
                        <p className="font-semibold">
                            Not sent{message.error?.title ? `: ${message.error.title}` : ''}
                            {message.error?.code ? ` (${message.error.code})` : ''}
                        </p>
                        {(message.error?.hint ?? message.error?.detail) && <p className="mt-0.5 text-ink-2">{message.error?.hint ?? message.error?.detail}</p>}
                    </div>
                )}
                <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-slate-500">
                    {message.origin === 'history' && (
                        <span className="inline-flex items-center gap-0.5" title="Imported from the WhatsApp Business app's chat history">
                            <HistoryIcon className="size-3" /> Imported
                        </span>
                    )}
                    {message.origin === 'app_echo' && (
                        <span className="inline-flex items-center gap-0.5" title="Sent from the WhatsApp Business app">
                            <SmartphoneIcon className="size-3" /> App
                        </span>
                    )}
                    {authorLabel && <span>{authorLabel} ·</span>}
                    {message.edited_at && <span>edited ·</span>}
                    <span>{clockTime(message.timestamp)}</span>
                    {outbound && <StatusTicks message={message} />}
                </div>
            </div>
            {!outbound && onReply && message.wamid && (
                <button
                    onClick={() => onReply(message)}
                    className="invisible rounded p-1 text-muted-foreground group-hover:visible hover:bg-muted"
                    aria-label="Reply"
                >
                    <ReplyIcon className="size-4" />
                </button>
            )}
        </div>
    );
}
