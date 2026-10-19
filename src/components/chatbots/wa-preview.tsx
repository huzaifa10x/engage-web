'use client';

import { ExternalLinkIcon, FileTextIcon, ImageIcon, ListIcon, MicIcon, VideoIcon } from 'lucide-react';
import { Fragment } from 'react';

import type { FlowNode } from '@/lib/chatbots';
import { cn } from '@/lib/utils';

/** What a WhatsApp message looks like, independent of where it comes from (a block being edited, or a test-chat turn). */
export type WaMessage = {
    header?: string | null;
    image?: string | null;
    media?: { kind: string; name?: string | null } | null;
    text?: string | null;
    footer?: string | null;
    buttons?: string[];
    list?: { button: string; sections: { title?: string | null; rows: { title: string; description?: string | null }[] }[] } | null;
    cta?: string | null;
    template?: string | null;
    note?: boolean;
};

/** Renders {{placeholders}} as small chips and *bold* / _italic_ like WhatsApp. */
export function RichText({ text, className }: { text: string; className?: string }) {
    const parts = text.split(/(\{\{[^}]+\}\}|\*[^*\n]+\*|_[^_\n]+_)/g);

    return (
        <span className={cn('break-words whitespace-pre-wrap', className)}>
            {parts.map((p, i) =>
                /^\{\{[^}]+\}\}$/.test(p) ? (
                    <span key={i} className="mx-px inline-block rounded bg-sky-100 px-1 font-mono text-[0.85em] leading-tight text-sky-800">
                        {p.slice(2, -2).trim()}
                    </span>
                ) : /^\*[^*]+\*$/.test(p) ? (
                    <b key={i}>{p.slice(1, -1)}</b>
                ) : /^_[^_]+_$/.test(p) ? (
                    <i key={i}>{p.slice(1, -1)}</i>
                ) : (
                    <Fragment key={i}>{p}</Fragment>
                ),
            )}
        </span>
    );
}

/** A WhatsApp-style bubble (with its buttons / list button underneath). */
export function WaBubble({ message, compact = false, rtl = false }: { message: WaMessage; compact?: boolean; rtl?: boolean }) {
    const m = message;
    const MediaIcon = m.media?.kind === 'video' ? VideoIcon : m.media?.kind === 'audio' ? MicIcon : m.media?.kind === 'document' ? FileTextIcon : ImageIcon;

    return (
        <div className={cn('w-full space-y-px', compact ? 'text-[11.5px]' : 'text-[13px]')} dir={rtl ? 'rtl' : undefined}>
            <div
                className={cn(
                    'relative rounded-lg rounded-tl-sm px-2.5 py-1.5 leading-snug shadow-[0_1px_0.5px_rgba(0,0,0,.13)]',
                    m.note ? 'bg-[#fff6d8] text-[#5f4800]' : 'bg-white text-[#111b21]',
                )}
            >
                {m.template && <p className="mb-0.5 text-[10px] font-semibold tracking-wide text-[#667781] uppercase">Template · {m.template}</p>}
                {m.image && (
                    // eslint-disable-next-line @next/next/no-img-element -- the author's own picture link
                    <img src={m.image} alt="" className={cn('mb-1.5 w-full rounded object-cover', compact ? 'max-h-24' : 'max-h-44')} />
                )}
                {m.media && !m.image && (
                    <div className="mb-1 flex items-center gap-2 rounded bg-[#f0f2f5] px-2 py-1.5 text-[#54656f]">
                        <MediaIcon className="size-4 shrink-0" />
                        <span className="truncate">{m.media.name || `${m.media.kind} file`}</span>
                    </div>
                )}
                {m.header && <p className="font-semibold">{m.header}</p>}
                {m.text ? (
                    <RichText text={m.text} className={compact ? 'line-clamp-4' : undefined} />
                ) : (
                    !m.media && !m.image && <span className="text-[#8696a0] italic">Empty message</span>
                )}
                {m.footer && <p className="mt-0.5 text-[0.85em] text-[#667781]">{m.footer}</p>}
            </div>
            {m.cta && (
                <div className="flex items-center justify-center gap-1.5 rounded-md bg-white px-2 py-1.5 font-medium text-[#027eb5] shadow-[0_1px_0.5px_rgba(0,0,0,.13)]">
                    <ExternalLinkIcon className="size-3.5" /> {m.cta}
                </div>
            )}
            {m.list && (
                <div className="flex items-center justify-center gap-1.5 rounded-md bg-white px-2 py-1.5 font-medium text-[#027eb5] shadow-[0_1px_0.5px_rgba(0,0,0,.13)]">
                    <ListIcon className="size-3.5" /> {m.list.button}
                </div>
            )}
            {!compact &&
                (m.buttons ?? []).map((b, i) => (
                    <div key={i} className="rounded-md bg-white px-2 py-1.5 text-center font-medium text-[#027eb5] shadow-[0_1px_0.5px_rgba(0,0,0,.13)]">
                        {b}
                    </div>
                ))}
        </div>
    );
}

/** The message a block sends, for the live preview in the inspector and on the card. */
export function messageOf(node: FlowNode): WaMessage | null {
    const c = node.config;
    switch (node.type) {
        case 'message':
            return { text: c.text };
        case 'buttons':
            return { header: c.header, text: c.text, footer: c.footer, buttons: (c.buttons ?? []).map((b: { title: string }) => b.title) };
        case 'list':
            return { header: c.header, text: c.text, footer: c.footer, list: { button: c.button_label || 'Choose', sections: c.sections ?? [] } };
        case 'question':
            return { text: c.text };
        case 'ask_media':
            return { text: c.text, buttons: c.optional ? [c.skip_label || 'Skip'] : [] };
        case 'location':
            return { text: c.text, cta: 'Send location' };
        case 'rating':
            return {
                text: c.text,
                list: { button: c.button_label || 'Rate us', sections: [{ rows: [5, 4, 3, 2, 1].map((n) => ({ title: '⭐'.repeat(n) })) }] },
            };
        case 'url':
            return { header: c.header, text: c.text, footer: c.footer, cta: c.cta || 'Open' };
        case 'form':
            return { header: c.header, text: c.text, footer: c.footer, cta: c.cta || 'Open form' };
        case 'media':
            return { media: { kind: c.kind, name: c.media_name ?? c.filename ?? null }, image: c.kind === 'image' && c.link ? c.link : null, text: c.caption };
        case 'product': {
            const first = (c.items ?? [])[0] as { name: string; price: string | null; image_url: string | null } | undefined;
            if (c.mode === 'list')
                return {
                    text: c.text,
                    list: {
                        button: c.button_label || 'View products',
                        sections: [{ rows: (c.items ?? []).map((p: { name: string; price: string | null }) => ({ title: p.name, description: p.price })) }],
                    },
                };

            return first
                ? {
                      image: first.image_url,
                      text: `*${first.name}*${first.price ? `\n${first.price}` : ''}`,
                      cta: c.mode === 'cards' ? c.order_label || 'View & order' : null,
                  }
                : { text: c.text };
        }
        case 'optin':
        case 'optout':
        case 'handoff':
        case 'end':
            return c.text ? { text: c.text } : null;
        case 'note':
            return { text: c.text, note: true };
        default:
            return null;
    }
}

/** A test-chat turn (the real payload the bot would send) as a bubble model. */
export function messageOfPayload(m: { type: string; body?: string | null; content?: Record<string, unknown>; template?: { name: string } }): WaMessage {
    const content = (m.content ?? {}) as Record<string, any>;
    if (m.type === 'interactive') {
        const action = content.action ?? {};
        const kind = content.type;

        return {
            header: content.header?.type === 'text' ? content.header.text : null,
            image: content.header?.type === 'image' ? content.header.image?.link : null,
            text: content.body?.text ?? m.body,
            footer: content.footer?.text,
            buttons: kind === 'button' ? (action.buttons ?? []).map((b: { reply: { title: string } }) => b.reply.title) : [],
            list: kind === 'list' ? { button: action.button ?? 'Choose', sections: action.sections ?? [] } : null,
            cta:
                kind === 'cta_url'
                    ? action.parameters?.display_text
                    : kind === 'flow'
                      ? action.parameters?.flow_cta
                      : kind === 'location_request_message'
                        ? 'Send location'
                        : null,
        };
    }
    if (m.type === 'template') return { template: m.template?.name ?? 'template', text: 'Sent as your approved template, with its variables filled in.' };
    if (['image', 'video', 'document', 'audio'].includes(m.type)) {
        return { media: { kind: m.type, name: content.filename ?? null }, image: m.type === 'image' ? (content.link ?? null) : null, text: m.body };
    }

    return { text: m.body };
}
