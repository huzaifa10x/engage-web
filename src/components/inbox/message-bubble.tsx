'use client';

import {
    AlertCircleIcon,
    BotIcon,
    CheckCheckIcon,
    MicIcon,
    CheckIcon,
    ClockIcon,
    FileIcon,
    HistoryIcon,
    MapPinIcon,
    ReplyIcon,
    ShieldCheckIcon,
    SmartphoneIcon,
} from 'lucide-react';
import { useState } from 'react';

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
            return message.played_at ? (
                // A voice note the customer listened to (Meta's "played" status).
                <span className="inline-flex items-center gap-0.5 text-[#53bdeb]" title="Played">
                    <MicIcon className="size-3" aria-hidden />
                    <CheckCheckIcon className="size-3.5" aria-label="Played" />
                </span>
            ) : (
                <CheckCheckIcon className="size-3.5 text-[#53bdeb]" aria-label="Read" />
            );
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
    // Sent by a chatbot block as a public link (no uploaded copy).
    const link = typeof message.content?.link === 'string' && message.content.link.startsWith('https://') ? message.content.link : null;
    if (!media && link) {
        return message.type === 'image' ? (
            <a href={link} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- a public picture sent by link */}
                <img src={link} alt={message.body ?? 'Image'} className="max-h-72 rounded-md object-cover" />
            </a>
        ) : (
            <a href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-md bg-black/5 px-3 py-2 hover:bg-black/10">
                <FileIcon className="size-5 shrink-0" />
                <span className="truncate text-[13px] font-medium">
                    {String(message.content?.filename ?? (message.type === 'video' ? 'Video' : 'Document'))}
                </span>
            </a>
        );
    }
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
            return <p className="text-[14px] break-words whitespace-pre-wrap">{message.body}</p>;
        case 'interactive': {
            // Our own menus (chatbot buttons and lists) show what the customer could tap.
            const action = (c.action ?? {}) as { button?: string; buttons?: { reply?: { title?: string } }[]; sections?: { rows?: { title?: string }[] }[] };
            const options =
                message.direction === 'outbound'
                    ? [
                          ...(action.buttons ?? []).map((b) => b.reply?.title),
                          ...(action.sections ?? []).flatMap((sec) => (sec.rows ?? []).map((r) => r.title)),
                      ].filter(Boolean)
                    : [];
            const header = (c.header ?? null) as { type?: string; text?: string; image?: { link?: string } } | null;

            return (
                <div>
                    {header?.type === 'image' && header.image?.link && (
                        // eslint-disable-next-line @next/next/no-img-element -- a public picture sent by link
                        <img src={header.image.link} alt="" className="mb-1.5 max-h-48 rounded-md object-cover" />
                    )}
                    {header?.type === 'text' && header.text && <p className="text-[14px] font-semibold">{header.text}</p>}
                    <p className="text-[14px] break-words whitespace-pre-wrap">{message.body}</p>
                    {options.length > 0 && (
                        <div className="mt-2 grid gap-1 border-t border-black/10 pt-2">
                            {action.sections && action.button && <span className="text-[11px] font-semibold opacity-60">☰ {action.button}</span>}
                            {options.map((label, i) => (
                                <span key={i} className="rounded bg-black/5 px-2 py-1 text-center text-[12.5px] font-medium">
                                    {label}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            );
        }
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
        case 'request_welcome':
            return <p className="text-[13px] italic opacity-70">👋 Opened the chat for the first time</p>;
        default:
            return <p className="text-[13px] italic opacity-70">{message.body ?? `${message.type} message`}</p>;
    }
}

/**
 * Growth Hub: the customer's message is shown without its website code ("… (Ref: XG-…)"). Owners
 * and Admins can show the raw text as received (audit); the server sends it only to them.
 */
function RawText({ raw }: { raw: string }) {
    const [open, setOpen] = useState(false);

    return (
        <div className="mt-1 text-[11.5px]">
            <button type="button" onClick={() => setOpen((o) => !o)} className="text-muted-foreground underline-offset-2 hover:underline">
                {open ? 'Hide raw text' : 'Show raw text'}
            </button>
            {open && <p className="mt-0.5 rounded bg-black/5 px-1.5 py-1 font-mono break-words whitespace-pre-wrap">{raw}</p>}
        </div>
    );
}

/**
 * Why a message was not sent (3.3): a plain reason, Meta's code, Retry only for temporary errors,
 * "Choose template" when the 24-hour window closed, and Meta's own details for codes we don't know.
 * A failed reply never counts as answering: the chat is back in Needs reply.
 */
function FailureNote({ message, onRetry, onTemplate }: { message: Message; onRetry?: (m: Message) => Promise<void>; onTemplate?: () => void }) {
    const [busy, setBusy] = useState(false);
    const [details, setDetails] = useState(false);
    const e = message.error;
    const reason = e?.plain ?? e?.hint ?? e?.title ?? 'WhatsApp did not accept this message.';
    const human = message.origin === 'agent' || message.origin === 'api';

    return (
        <div className="mt-1.5 rounded border border-bad/30 bg-bad-bg px-2 py-1.5 text-[12.5px] text-bad" role="alert">
            <p className="font-semibold">
                Not sent: {reason}
                {e?.code && /^\d+$/.test(e.code) ? <span className="font-normal text-ink-2"> · Meta code {e.code}</span> : null}
            </p>
            {e?.plain && e.hint && <p className="mt-0.5 text-ink-2">{e.hint}</p>}
            {human && <p className="mt-0.5 text-ink-2">A failed reply doesn’t count, so the chat is back in Needs reply unless another reply was accepted.</p>}
            {(e?.known === false || details) && (e?.title || e?.detail) && (
                <p className="mt-0.5 font-mono text-[11.5px] break-words text-ink-2">{[e?.title, e?.detail].filter(Boolean).join(' · ')}</p>
            )}
            <div className="mt-1 flex flex-wrap gap-1.5">
                {e?.action === 'retry' && human && onRetry && (
                    <button
                        type="button"
                        disabled={busy}
                        className="rounded border border-bad/40 bg-card px-2 py-0.5 font-semibold hover:bg-white disabled:opacity-60"
                        onClick={async () => {
                            setBusy(true);
                            try {
                                await onRetry(message);
                            } finally {
                                setBusy(false);
                            }
                        }}
                    >
                        {busy ? 'Sending…' : 'Retry'}
                    </button>
                )}
                {e?.action === 'template' && onTemplate && (
                    <button type="button" className="rounded border border-bad/40 bg-card px-2 py-0.5 font-semibold hover:bg-white" onClick={onTemplate}>
                        Choose template
                    </button>
                )}
                {e?.known !== false && (e?.title || e?.detail) && (
                    <button type="button" className="px-1 py-0.5 underline-offset-2 hover:underline" onClick={() => setDetails(!details)}>
                        {details ? 'Hide details' : 'Details'}
                    </button>
                )}
            </div>
        </div>
    );
}

export function MessageBubble({
    message,
    quoted,
    authorLabel,
    onReply,
    onRetry,
    onTemplate,
    grouped = false,
}: {
    message: Message;
    /** Same sender within 5 minutes of the previous bubble: no tail. */
    grouped?: boolean;
    quoted?: Message | null;
    authorLabel?: string | null;
    onReply?: (m: Message) => void;
    /** Send a failed reply again (offered only for temporary errors). */
    onRetry?: (m: Message) => Promise<void>;
    /** Open the template picker (the 24-hour window closed: 131047). */
    onTemplate?: () => void;
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
                    'relative max-w-[min(34rem,80%)] rounded-lg px-2.5 pt-1.5 pb-1 shadow-[0_1px_0.5px_rgba(11,20,26,.13)]',
                    outbound ? 'bg-[#d9fdd3] text-[#111b21]' : 'bg-white text-[#111b21]',
                    !grouped && (outbound ? 'rounded-tr-none' : 'rounded-tl-none'),
                    message.origin === 'automation' && 'bg-[#e7f3ff]',
                    message.origin === 'app_echo' && 'bg-[#e8f5e0]',
                    message.status === 'failed' && 'bg-bad-bg ring-1 ring-bad',
                    // Still sending: dimmed until WhatsApp accepts it.
                    message.status === 'queued' && 'opacity-60',
                )}
            >
                {!grouped && (
                    <svg
                        aria-hidden
                        viewBox="0 0 8 13"
                        className={cn(
                            'absolute top-0 h-[13px] w-2',
                            outbound ? '-right-2' : '-left-2 -scale-x-100',
                            message.status === 'failed'
                                ? 'fill-bad-bg'
                                : message.origin === 'automation'
                                  ? 'fill-[#e7f3ff]'
                                  : message.origin === 'app_echo'
                                    ? 'fill-[#e8f5e0]'
                                    : outbound
                                      ? 'fill-[#d9fdd3]'
                                      : 'fill-white',
                        )}
                    >
                        <path d="M0 0h8L1.5 8.5C.9 9.3 0 9 0 8z" />
                    </svg>
                )}
                {quoted !== undefined && message.reply_to_wamid && (
                    <div className="mb-1.5 rounded border-l-4 border-brand-500/60 bg-black/5 px-2 py-1 text-[12.5px] opacity-80">
                        {quoted ? (quoted.body ?? `${quoted.type} message`) : 'Replying to an earlier message'}
                    </div>
                )}
                {authorLabel && (
                    <p
                        className={cn(
                            'mb-0.5 flex items-center gap-1 text-[11px] font-semibold',
                            message.origin === 'automation' ? 'text-info' : 'text-brand-600',
                        )}
                    >
                        {message.origin === 'automation' && <BotIcon className="size-3" />}
                        {authorLabel}
                    </p>
                )}
                <Body message={message} />
                {message.raw_body && <RawText raw={message.raw_body} />}
                {message.status === 'failed' && <FailureNote message={message} onRetry={onRetry} onTemplate={onTemplate} />}
                <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-[#667781]">
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
                    {message.origin === 'automation' && message.automation === 'consent' && (
                        <span className="inline-flex items-center gap-0.5" title="Sent automatically when the customer’s consent changed (Consent & Privacy)">
                            <ShieldCheckIcon className="size-3" /> Consent reply ·
                        </span>
                    )}
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
