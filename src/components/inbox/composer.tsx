'use client';

import {
    AtSignIcon,
    FileTextIcon,
    Loader2Icon,
    LockIcon,
    MicIcon,
    PaperclipIcon,
    PencilIcon,
    SendIcon,
    SquareIcon,
    Trash2Icon,
    XIcon,
    ZapIcon,
} from 'lucide-react';
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { errorMessage, upload } from '@/lib/api';
import { fileSize } from '@/lib/format';
import { dur, templateBody, windowLeft } from '@/lib/inbox';
import { type Assignee, type SendPayload, useCannedResponses, useTemplates } from '@/lib/queries';
import type { Contact, Conversation, Message, MessageTemplate, UploadedMedia } from '@/lib/types';
import { cn } from '@/lib/utils';

import { EmojiPicker } from './emoji-picker';

/** File types WhatsApp accepts (the server validates type and size again). */
const ACCEPT =
    'image/jpeg,image/png,image/webp,video/mp4,video/3gpp,audio/aac,audio/mp4,audio/mpeg,audio/amr,audio/ogg,.m4a,.aac,.amr,.mp3,.ogg,.opus,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';

/** Recording formats WhatsApp accepts, best first: OGG/Opus is a real voice note; MP4/AAC an audio file. */
const VOICE_FORMATS = [
    { mime: 'audio/ogg;codecs=opus', extension: 'ogg', type: 'audio/ogg' },
    { mime: 'audio/mp4;codecs=mp4a.40.2', extension: 'm4a', type: 'audio/mp4' },
    { mime: 'audio/mp4', extension: 'm4a', type: 'audio/mp4' },
];
const voiceFormat = () => (typeof MediaRecorder === 'undefined' ? null : (VOICE_FORMATS.find((f) => MediaRecorder.isTypeSupported(f.mime)) ?? null));

/** Unsent text is kept in this browser per conversation and per mode for a week. */
const DRAFT_DAYS = 7;
const draftKey = (id: string, mode: 'reply' | 'note') => `engage.inbox.${mode === 'reply' ? 'draft' : 'note'}.${id}`;
function readDraft(id: string, mode: 'reply' | 'note'): string {
    try {
        const raw = window.localStorage.getItem(draftKey(id, mode));
        if (!raw) return '';
        const d = JSON.parse(raw) as { text?: string; at?: number };
        if (typeof d.text !== 'string' || !d.at || Date.now() - d.at > DRAFT_DAYS * 86_400_000) return '';

        return d.text;
    } catch {
        return '';
    }
}
function writeDraft(id: string, mode: 'reply' | 'note', text: string): void {
    try {
        if (text.trim() === '') window.localStorage.removeItem(draftKey(id, mode));
        else window.localStorage.setItem(draftKey(id, mode), JSON.stringify({ text, at: Date.now() }));
    } catch {
        // Private window or full storage: the draft just is not kept.
    }
}
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export type ComposerMode = 'reply' | 'note' | 'template';
export type ComposerHandle = { attach: (file: File) => void; focus: () => void };

/** Why a template can't be sent to this contact, or null. */
export function templateBlock(t: MessageTemplate, contact: Contact | undefined): string | null {
    if (t.status !== 'APPROVED' || !t.sendable)
        return t.status === 'PENDING' ? 'Pending Meta approval · cannot be sent yet' : 'Not approved by Meta · cannot be sent';
    // Soft consent rule: opted out is blocked; unknown is allowed after a warning and a tick; opted in is allowed.
    if (t.category === 'MARKETING' && (contact?.consent_state === 'opted_out' || contact?.marketing_opted_out)) return 'Contact opted out of marketing';

    return null;
}

/**
 * The composer (3.5): Reply / Internal note / Template. Each mode keeps its own draft. Replies are only
 * possible while the 24-hour window is open (checked again at the moment of sending); notes are always
 * possible and never count as a reply; templates are always possible.
 */
export function Composer({
    conversation: c,
    now,
    mode,
    onMode,
    disabledReason,
    replyTo,
    onClearReply,
    onSend,
    onNote,
    beforeSend,
    onTyping,
    banners,
    wabaAccountId,
    teammates,
    dealTitle,
    onFullTemplate,
    ref,
}: {
    conversation: Conversation;
    now: number;
    mode: ComposerMode;
    onMode: (m: ComposerMode) => void;
    /** Nothing can be sent at all (number disconnected, role can't reply). */
    disabledReason: string | null;
    replyTo: Message | null;
    onClearReply: () => void;
    onSend: (payload: SendPayload) => Promise<void>;
    /** Notes; omitted when notes are not on the plan. */
    onNote?: (body: string, mentions: string[]) => Promise<void>;
    /** Checked right before a reply or template goes out: false holds it (the window closed, a teammate replied). */
    beforeSend: (kind: 'reply' | 'template', send: () => Promise<void>) => Promise<boolean>;
    onTyping: (typing: boolean) => void;
    banners: React.ReactNode;
    wabaAccountId: string | null;
    teammates: Assignee[];
    dealTitle: string | null;
    /** Templates that need a header file or link values open the full template form. */
    onFullTemplate: () => void;
    ref?: React.Ref<ComposerHandle>;
}) {
    const id = c.id;
    const contact = c.contact;
    const [reply, setReply] = useState(() => (typeof window !== 'undefined' ? readDraft(id, 'reply') : ''));
    const [note, setNote] = useState(() => (typeof window !== 'undefined' ? readDraft(id, 'note') : ''));
    const [mentions, setMentions] = useState<string[]>([]);
    const [attachment, setAttachment] = useState<UploadedMedia | null>(null);
    const [voice, setVoice] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [sending, setSending] = useState(false);
    const [recording, setRecording] = useState<number | null>(null);
    const [pop, setPop] = useState<{ kind: 'qr' | 'mention'; q: string; hl: number } | null>(null);
    const input = useRef<HTMLTextAreaElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const recorder = useRef<MediaRecorder | null>(null);
    const discard = useRef(false);
    const typingAt = useRef(0);
    const canned = useCannedResponses(mode === 'reply');

    const open = (c.window.replies_allowed ?? c.window.open) && windowLeft(c.window.expires_at, now) > 0;
    const locked = mode === 'reply' && !open;
    const text = mode === 'note' ? note : reply;
    const setText = mode === 'note' ? setNote : setReply;

    useEffect(() => writeDraft(id, 'reply', reply), [id, reply]);
    useEffect(() => writeDraft(id, 'note', note), [id, note]);
    useEffect(() => {
        if (recording === null) return;
        const t = setInterval(() => setRecording((s) => (s === null ? null : s + 1)), 1000);

        return () => clearInterval(t);
    }, [recording === null]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => () => recorder.current?.stream.getTracks().forEach((t) => t.stop()), []);

    const pick = async (file: File | undefined, isVoice = false) => {
        if (!file) return;
        setUploading(true);
        try {
            const form = new FormData();
            form.append('file', file);
            const res = await upload<{ data: UploadedMedia }>('media', form);
            setAttachment(res.data);
            setVoice(isVoice && res.data.type === 'audio');
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };
    useImperativeHandle(ref, () => ({ attach: (file: File) => void pick(file), focus: () => input.current?.focus() }));

    const startRecording = async () => {
        const format = voiceFormat();
        if (!format || !navigator.mediaDevices?.getUserMedia)
            return void toast.error(
                'This browser cannot record in a format WhatsApp accepts. Use Firefox, Safari or a recent Chrome, or attach an audio file.',
            );
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
            const chunks: Blob[] = [];
            const rec = new MediaRecorder(stream, { mimeType: format.mime });
            rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
            rec.onstop = () => {
                stream.getTracks().forEach((t) => t.stop());
                setRecording(null);
                if (!discard.current && chunks.length > 0) void pick(new File(chunks, `voice-message.${format.extension}`, { type: format.type }), true);
            };
            discard.current = false;
            recorder.current = rec;
            rec.start();
            setRecording(0);
        } catch {
            toast.error('The microphone could not be used. Allow microphone access for this site and try again.');
        }
    };
    const stopRecording = (cancel: boolean) => {
        discard.current = cancel;
        recorder.current?.stop();
    };

    const qrItems = useMemo(() => {
        if (pop?.kind !== 'qr') return [];
        const q = pop.q.toLowerCase();

        return (canned.data ?? []).filter((r) => !q || r.shortcut.toLowerCase().includes(q) || r.body.toLowerCase().includes(q)).slice(0, 8);
    }, [pop, canned.data]);
    const mentionItems = useMemo(() => {
        if (pop?.kind !== 'mention') return [];
        const q = pop.q.toLowerCase();

        return teammates
            .filter(
                (t) =>
                    !q ||
                    t.name
                        .toLowerCase()
                        .split(' ')
                        .some((p) => p.startsWith(q)),
            )
            .slice(0, 8);
    }, [pop, teammates]);
    const popCount = pop?.kind === 'qr' ? qrItems.length : mentionItems.length;

    const choosePop = (i: number) => {
        if (pop?.kind === 'qr' && qrItems[i]) setReply(qrItems[i].body);
        if (pop?.kind === 'mention' && mentionItems[i]) {
            const m = mentionItems[i];
            setNote((n) => n.replace(/@(\w*)$/, `@${m.name.split(' ')[0]} `));
            setMentions((ms) => [...new Set([...ms, m.id])]);
        }
        setPop(null);
        requestAnimationFrame(() => input.current?.focus());
    };

    const send = async () => {
        if (mode === 'note') {
            const body = note.trim();
            if (!body) return void toast.message('Write a note first');
            if (!onNote) return;
            setSending(true);
            try {
                await onNote(
                    body,
                    mentions.filter((m) => body.includes(`@${teammates.find((t) => t.id === m)?.name.split(' ')[0]}`)),
                );
                setNote('');
                setMentions([]);
            } catch (e) {
                toast.error(errorMessage(e));
            } finally {
                setSending(false);
            }

            return;
        }
        const body = reply.trim();
        if (!body && !attachment) return void toast.message('Write a message first');
        const go = async () => {
            setSending(true);
            try {
                await onSend(
                    attachment
                        ? {
                              type: attachment.type,
                              media_id: attachment.id,
                              body: attachment.type === 'audio' || attachment.type === 'sticker' ? null : body || null,
                              reply_to: replyTo?.wamid,
                              ...(voice ? { content: { voice: true } } : {}),
                          }
                        : { type: 'text', body, reply_to: replyTo?.wamid },
                );
                setReply('');
                setAttachment(null);
                setVoice(false);
                onClearReply();
                onTyping(false);
            } catch (e) {
                toast.error(errorMessage(e));
            } finally {
                setSending(false);
            }
        };
        if (await beforeSend('reply', go)) await go();
    };

    const hint =
        mode === 'reply'
            ? open
                ? `WhatsApp reply · ${dur(windowLeft(c.window.expires_at, now))} left in window`
                : 'Locked · template required'
            : mode === 'note'
              ? 'Visible to your team only · @ to mention'
              : 'Approved WhatsApp templates';

    if (disabledReason)
        return (
            <div className="border-t bg-[#f0f2f5] px-4 py-3">
                {banners}
                <p className="text-[13px] text-muted-foreground">{disabledReason}</p>
            </div>
        );

    const MODES = [
        { id: 'reply' as const, label: 'Reply', Icon: SendIcon },
        { id: 'note' as const, label: 'Internal note', Icon: PencilIcon },
        { id: 'template' as const, label: 'Template', Icon: FileTextIcon },
    ].filter((m) => m.id !== 'note' || onNote);

    return (
        <div className="border-t bg-[#f0f2f5] px-4 pt-2 pb-3">
            {banners}
            <div role="radiogroup" aria-label="Message type" className="mb-2 flex flex-wrap items-center gap-1">
                {MODES.map(({ id: m, label, Icon }) => (
                    <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={mode === m}
                        onClick={() => onMode(m)}
                        className={cn(
                            'inline-flex h-[26px] items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition-colors duration-150 motion-reduce:transition-none',
                            mode === m ? 'bg-white text-foreground' : 'text-ink-2 hover:bg-white/60',
                        )}
                    >
                        <Icon className="size-[15px]" /> {label}
                        {m === 'reply' && !open && <LockIcon className="size-3 text-muted-foreground" aria-label="locked" />}
                    </button>
                ))}
                <span className="ml-auto text-[11px] text-muted-foreground">{hint}</span>
            </div>

            {mode === 'template' ? (
                <TemplatePane
                    contact={contact}
                    wabaAccountId={wabaAccountId}
                    dealTitle={dealTitle}
                    onFullTemplate={onFullTemplate}
                    onSend={async (payload) => {
                        let ok = false;
                        const go = async () => {
                            await onSend(payload);
                            ok = true;
                        };
                        if (await beforeSend('template', go)) await go();

                        return ok;
                    }}
                />
            ) : (
                <div className={cn('relative rounded-lg border bg-card', mode === 'note' && 'border-[#e0b43a]/60 bg-[#fff3c4]', locked && 'opacity-70')}>
                    {pop && popCount > 0 && (
                        <div
                            className="absolute bottom-[calc(100%+6px)] left-2 z-10 w-[min(380px,90%)] rounded-lg border bg-popover p-1 shadow-raised"
                            role="listbox"
                        >
                            {pop.kind === 'qr'
                                ? qrItems.map((r, i) => (
                                      <button
                                          key={r.id}
                                          type="button"
                                          role="option"
                                          aria-selected={i === pop.hl}
                                          onMouseDown={(e) => {
                                              e.preventDefault();
                                              choosePop(i);
                                          }}
                                          className={cn(
                                              'flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-left text-[13px]',
                                              i === pop.hl && 'bg-muted',
                                          )}
                                      >
                                          <b className="font-mono text-[12px] font-semibold text-brand-600">/{r.shortcut}</b>
                                          <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.body}</span>
                                      </button>
                                  ))
                                : mentionItems.map((t, i) => (
                                      <button
                                          key={t.id}
                                          type="button"
                                          role="option"
                                          aria-selected={i === pop.hl}
                                          onMouseDown={(e) => {
                                              e.preventDefault();
                                              choosePop(i);
                                          }}
                                          className={cn('flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px]', i === pop.hl && 'bg-muted')}
                                      >
                                          {t.name}
                                      </button>
                                  ))}
                        </div>
                    )}
                    {replyTo && mode === 'reply' && (
                        <div className="flex items-center gap-2 border-b px-3 py-1.5 text-[12px]">
                            <span className="min-w-0 flex-1 truncate border-l-2 border-brand-500 pl-2">
                                Replying to: {replyTo.body ?? `${replyTo.type} message`}
                            </span>
                            <button type="button" onClick={onClearReply} aria-label="Cancel reply" className="text-muted-foreground hover:text-foreground">
                                <XIcon className="size-4" />
                            </button>
                        </div>
                    )}
                    {attachment && mode === 'reply' && (
                        <div className="flex items-center gap-2 border-b px-3 py-1.5 text-[12px]">
                            <PaperclipIcon className="size-[15px] text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate">
                                {voice ? 'Voice message' : attachment.filename} · {fileSize(attachment.file_size)}
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    setAttachment(null);
                                    setVoice(false);
                                }}
                                aria-label="Remove attachment"
                                className="text-muted-foreground"
                            >
                                <XIcon className="size-4" />
                            </button>
                        </div>
                    )}
                    <textarea
                        ref={input}
                        value={text}
                        disabled={locked}
                        dir="auto"
                        rows={2}
                        maxLength={mode === 'note' ? 2000 : 4096}
                        aria-label={mode === 'note' ? 'Internal note' : 'Message'}
                        placeholder={
                            mode === 'note'
                                ? 'Write a private note… use @ to mention a teammate'
                                : locked
                                  ? 'Free-form replies are locked until the customer messages again'
                                  : attachment
                                    ? 'Add a caption…'
                                    : 'Type a WhatsApp reply… ( / for quick replies, Enter to send, Shift+Enter for new line )'
                        }
                        onPaste={(e) => {
                            const file = [...e.clipboardData.files][0];
                            if (file && mode === 'reply') {
                                e.preventDefault();
                                void pick(file);
                            }
                        }}
                        onChange={(e) => {
                            const v = e.target.value;
                            setText(v);
                            if (mode === 'reply' && /^\/\w*$/.test(v)) setPop({ kind: 'qr', q: v.slice(1), hl: 0 });
                            else if (mode === 'note' && /@(\w*)$/.test(v)) setPop({ kind: 'mention', q: v.match(/@(\w*)$/)?.[1] ?? '', hl: 0 });
                            else setPop(null);
                            if (mode === 'reply' && Date.now() - typingAt.current > 4000) {
                                typingAt.current = Date.now();
                                onTyping(true);
                            }
                        }}
                        onBlur={() => {
                            if (mode === 'reply') onTyping(false);
                        }}
                        onKeyDown={(e) => {
                            if (pop && popCount > 0) {
                                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    setPop({ ...pop, hl: (pop.hl + (e.key === 'ArrowDown' ? 1 : popCount - 1)) % popCount });

                                    return;
                                }
                                if (e.key === 'Enter' || e.key === 'Tab') {
                                    e.preventDefault();
                                    choosePop(pop.hl);

                                    return;
                                }
                                if (e.key === 'Escape') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setPop(null);

                                    return;
                                }
                            }
                            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                e.preventDefault();
                                void send();
                            }
                        }}
                        className="block field-sizing-content max-h-40 min-h-14 w-full resize-none bg-transparent px-3 pt-2.5 text-[14px] leading-5 text-[#111b21] outline-none placeholder:text-faint disabled:cursor-not-allowed"
                    />
                    <div className="flex items-center gap-1 px-2 pb-2">
                        <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
                        {mode === 'reply' ? (
                            <>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    title="Quick replies"
                                    aria-label="Quick replies"
                                    disabled={locked}
                                    onClick={() => {
                                        setReply('/');
                                        setPop({ kind: 'qr', q: '', hl: 0 });
                                        input.current?.focus();
                                    }}
                                >
                                    <ZapIcon />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    title="Attach a file (image, PDF, up to WhatsApp's limits)"
                                    aria-label="Attach a file"
                                    disabled={locked || uploading}
                                    onClick={() => fileRef.current?.click()}
                                >
                                    {uploading ? <Loader2Icon className="animate-spin" /> : <PaperclipIcon />}
                                </Button>
                                {!locked && (
                                    <EmojiPicker
                                        onPick={(emoji) => {
                                            const el = input.current;
                                            const s = el?.selectionStart ?? reply.length;
                                            const en = el?.selectionEnd ?? reply.length;
                                            setReply(reply.slice(0, s) + emoji + reply.slice(en));
                                            requestAnimationFrame(() => {
                                                el?.focus();
                                                el?.setSelectionRange(s + emoji.length, s + emoji.length);
                                            });
                                        }}
                                    />
                                )}
                                {recording !== null ? (
                                    <>
                                        <span className="flex items-center gap-1.5 px-1 text-[13px] font-semibold text-bad tabular-nums" aria-live="polite">
                                            <span className="size-2 rounded-full bg-bad" /> {clock(recording)}
                                        </span>
                                        <Button variant="ghost" size="icon-sm" onClick={() => stopRecording(true)} aria-label="Discard recording">
                                            <Trash2Icon />
                                        </Button>
                                        <Button variant="ghost" size="icon-sm" onClick={() => stopRecording(false)} aria-label="Stop recording">
                                            <SquareIcon />
                                        </Button>
                                    </>
                                ) : (
                                    !locked && (
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            title="Record a voice message"
                                            aria-label="Record a voice message"
                                            onClick={startRecording}
                                            disabled={uploading}
                                        >
                                            <MicIcon />
                                        </Button>
                                    )
                                )}
                            </>
                        ) : (
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                title="Mention a teammate"
                                aria-label="Mention a teammate"
                                onClick={() => {
                                    setNote(note + (note && !note.endsWith(' ') ? ' ' : '') + '@');
                                    setPop({ kind: 'mention', q: '', hl: 0 });
                                    input.current?.focus();
                                }}
                            >
                                <AtSignIcon />
                            </Button>
                        )}
                        <span className="flex-1" />
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                            {text.length ? `${text.length} / ${mode === 'note' ? 2000 : 4096}` : ''}
                        </span>
                        <Button
                            size="sm"
                            onClick={() => void send()}
                            disabled={locked || sending || uploading}
                            variant={mode === 'note' ? 'outline' : 'default'}
                        >
                            {sending ? <Loader2Icon className="animate-spin" /> : mode === 'note' ? <PencilIcon /> : <SendIcon />}
                            {mode === 'note' ? 'Save note' : 'Send'}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

/** Inline template picker: category, language and status; variables prefilled from the contact; preview. */
function TemplatePane({
    contact,
    wabaAccountId,
    dealTitle,
    onSend,
    onFullTemplate,
}: {
    contact: Contact | undefined;
    wabaAccountId: string | null;
    dealTitle: string | null;
    onSend: (payload: SendPayload) => Promise<boolean>;
    onFullTemplate: () => void;
}) {
    const list = useTemplates({ waba_account_id: wabaAccountId }, !!wabaAccountId);
    const templates = useMemo(
        () =>
            (list.data?.data ?? [])
                .filter((t) => !['REJECTED', 'DISABLED', 'DELETED'].includes(t.status))
                .sort((a, b) => Number(b.status === 'APPROVED') - Number(a.status === 'APPROVED')),
        [list.data],
    );
    const [picked, setPicked] = useState<MessageTemplate | null>(null);
    const [vars, setVars] = useState<string[]>([]);
    const [header, setHeader] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [agreed, setAgreed] = useState(false);

    const choose = (t: MessageTemplate) => {
        setPicked(t);
        setAgreed(false);
        const first = (contact?.name ?? contact?.profile_name ?? '').split(' ')[0] ?? '';
        const topic = (dealTitle ?? '').split(' · ')[0].toLowerCase();
        setVars(t.variables.body.map((_, i) => (i === 0 ? first : i === 1 ? topic : '')));
        setHeader(t.variables.header.map(() => ''));
    };
    const needsFull =
        !!picked && (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(picked.variables.header_format ?? '') || picked.variables.buttons.some((b) => b.variable));
    const missing = !!picked && (vars.some((v) => !v.trim()) || header.some((v) => !v.trim()));
    const body = picked ? templateBody(picked) : '';
    const marketing = picked?.category === 'MARKETING';
    // Marketing to a contact with no consent record: allowed once the sender confirms they agreed.
    const unknownConsent = marketing && contact?.consent_state !== 'opted_in';

    return (
        <div className="grid gap-3 rounded-lg border bg-muted/60 p-2.5 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
            <div className="grid max-h-64 content-start gap-1 overflow-y-auto">
                {list.isLoading && <p className="p-2 text-[13px] text-muted-foreground">Loading templates…</p>}
                {!list.isLoading && templates.length === 0 && (
                    <p className="p-2 text-[13px] text-muted-foreground">No templates on this number’s WhatsApp account yet.</p>
                )}
                {templates.map((t) => {
                    const why = templateBlock(t, contact);

                    return (
                        <button
                            key={t.id}
                            type="button"
                            disabled={!!why}
                            onClick={() => choose(t)}
                            className={cn(
                                'grid gap-1 rounded-md border bg-card px-2.5 py-2 text-left disabled:cursor-not-allowed disabled:opacity-60',
                                picked?.id === t.id && 'border-brand-500 ring-2 ring-brand-500/20',
                            )}
                        >
                            <b className="truncate font-mono text-[12px] font-semibold">{t.name}</b>
                            <span className="flex flex-wrap gap-1">
                                <span
                                    className={cn(
                                        'inline-flex h-[20px] items-center rounded-full border px-1.5 text-[11px] font-semibold',
                                        t.category === 'MARKETING' ? 'border-warn/30 bg-warn-bg text-warn' : 'border-info/25 bg-info-bg text-info',
                                    )}
                                >
                                    {t.category === 'MARKETING' ? 'Marketing' : t.category === 'AUTHENTICATION' ? 'Authentication' : 'Utility'}
                                </span>
                                <span className="inline-flex h-[20px] items-center rounded-full border bg-muted px-1.5 text-[11px] font-semibold text-ink-2">
                                    {t.language}
                                </span>
                                <span
                                    className={cn(
                                        'inline-flex h-[20px] items-center rounded-full border px-1.5 text-[11px] font-semibold',
                                        t.status === 'APPROVED' ? 'border-good/30 bg-good-bg text-good' : 'bg-muted text-ink-2',
                                    )}
                                >
                                    {t.status === 'APPROVED' ? 'Approved' : 'Pending'}
                                </span>
                            </span>
                            {why && <span className="text-[11px] text-bad">{why}</span>}
                        </button>
                    );
                })}
            </div>
            <div className="grid content-start gap-2.5">
                {!picked ? (
                    <p className="px-1 py-5 text-[13px] text-muted-foreground">Pick a template to preview it with this customer’s details.</p>
                ) : (
                    <>
                        {(header.length > 0 || vars.length > 0) && (
                            <div className="grid gap-2 sm:grid-cols-2">
                                {header.map((v, i) => (
                                    <label key={`h${i}`} className="grid gap-1 text-[11px] font-semibold text-muted-foreground">
                                        Header {`{{${i + 1}}}`}
                                        <Input
                                            value={v}
                                            onChange={(e) => setHeader(header.map((x, j) => (j === i ? e.target.value : x)))}
                                            placeholder="Required"
                                            dir="auto"
                                        />
                                    </label>
                                ))}
                                {vars.map((v, i) => (
                                    <label key={i} className="grid gap-1 text-[11px] font-semibold text-muted-foreground">
                                        {`{{${i + 1}}}`} {i === 0 ? 'Customer name' : i === 1 ? 'Enquiry topic' : `Value ${i + 1}`}
                                        <Input
                                            value={v}
                                            onChange={(e) => setVars(vars.map((x, j) => (j === i ? e.target.value : x)))}
                                            placeholder={i < 2 ? 'Not on contact' : 'Required'}
                                            dir="auto"
                                        />
                                    </label>
                                ))}
                            </div>
                        )}
                        <div
                            className="rounded-lg bg-[#d9fdd3] px-3 py-2 text-[14px] whitespace-pre-wrap text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,.13)]"
                            dir="auto"
                        >
                            {body.split(/(\{\{\d+\}\})/).map((part, i) => {
                                const m = part.match(/^\{\{(\d+)\}\}$/);
                                if (!m) return <span key={i}>{part}</span>;
                                const val = vars[Number(m[1]) - 1]?.trim();

                                return (
                                    <span key={i} className={cn('rounded px-0.5', val ? 'bg-white/60' : 'bg-bad-bg text-bad')}>
                                        {val || part}
                                    </span>
                                );
                            })}
                        </div>
                        {unknownConsent && (
                            <div role="alert" className="grid gap-1.5 rounded-md border border-warn/30 bg-warn-bg px-3 py-2 text-[12px] text-ink-2">
                                <p>No consent record for this contact. Send marketing only if they agreed to hear from your business.</p>
                                <label className="flex items-start gap-2 font-semibold">
                                    <input
                                        type="checkbox"
                                        className="mt-0.5 accent-[var(--brand-500)]"
                                        checked={agreed}
                                        onChange={(e) => setAgreed(e.target.checked)}
                                    />
                                    They agreed to receive messages from us
                                </label>
                            </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="flex-1 text-[11px] text-muted-foreground">
                                {marketing
                                    ? 'Marketing conversation · billed at Meta’s marketing rate'
                                    : 'Utility conversation · billed at Meta’s utility rate'}
                                {missing && <span className="text-bad"> · Fill all variables</span>}
                            </span>
                            {needsFull ? (
                                <Button size="sm" variant="outline" onClick={onFullTemplate}>
                                    Add header file or link…
                                </Button>
                            ) : (
                                <Button
                                    size="sm"
                                    disabled={missing || busy || (unknownConsent && !agreed)}
                                    onClick={async () => {
                                        setBusy(true);
                                        try {
                                            const ok = await onSend({
                                                type: 'template',
                                                template: { name: picked.name, language: picked.language, variables: { header, body: vars, buttons: {} } },
                                            });
                                            if (ok) setPicked(null);
                                        } catch (e) {
                                            toast.error(errorMessage(e));
                                        } finally {
                                            setBusy(false);
                                        }
                                    }}
                                >
                                    <SendIcon /> Send template
                                </Button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
