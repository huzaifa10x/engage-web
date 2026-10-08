'use client';

import { FileTextIcon, Loader2Icon, MicIcon, PaperclipIcon, SendHorizontalIcon, SquareIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { CannedPicker } from './canned-picker';
import { EmojiPicker } from './emoji-picker';
import { errorMessage, upload } from '@/lib/api';
import { fileSize } from '@/lib/format';
import type { SendPayload } from '@/lib/queries';
import type { Message, UploadedMedia } from '@/lib/types';

/** File types WhatsApp accepts (the server validates type and size again). */
const ACCEPT =
    'image/jpeg,image/png,image/webp,video/mp4,video/3gpp,audio/aac,audio/mp4,audio/mpeg,audio/amr,audio/ogg,.m4a,.aac,.amr,.mp3,.ogg,.opus,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';

/**
 * Recording formats WhatsApp accepts, best first: OGG/Opus is delivered as a real voice note;
 * MP4/AAC as an audio file. Browsers that can only record WebM cannot send voice messages.
 */
const VOICE_FORMATS = [
    { mime: 'audio/ogg;codecs=opus', extension: 'ogg', type: 'audio/ogg' },
    { mime: 'audio/mp4;codecs=mp4a.40.2', extension: 'm4a', type: 'audio/mp4' },
    { mime: 'audio/mp4', extension: 'm4a', type: 'audio/mp4' },
];

function voiceFormat() {
    if (typeof MediaRecorder === 'undefined') return null;

    return VOICE_FORMATS.find((f) => MediaRecorder.isTypeSupported(f.mime)) ?? null;
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export type ComposerHandle = { attach: (file: File) => void };

/**
 * Enter sends, Shift+Enter adds a line. Attachments and voice recordings are uploaded first
 * (validated against WhatsApp limits server-side) and sent with the text as caption.
 */
export function Composer({
    disabledReason,
    replyTo,
    onClearReply,
    onSend,
    onTemplate,
    canSendTemplate = true,
    ref,
}: {
    disabledReason: string | null;
    replyTo: Message | null;
    onClearReply: () => void;
    onSend: (payload: SendPayload) => Promise<void>;
    onTemplate: () => void;
    /** False when not even a template can be sent (the number is disconnected). */
    canSendTemplate?: boolean;
    /** Lets the chat area hand over a file that was dropped onto it. */
    ref?: React.Ref<ComposerHandle>;
}) {
    const [text, setText] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [attachment, setAttachment] = useState<UploadedMedia | null>(null);
    const [uploading, setUploading] = useState(false);
    const [sending, setSending] = useState(false);
    const [voice, setVoice] = useState(false); // the attachment is a voice recording
    const [recording, setRecording] = useState<number | null>(null); // seconds, null = not recording
    const fileRef = useRef<HTMLInputElement>(null);
    const recorder = useRef<MediaRecorder | null>(null);
    const discard = useRef(false);

    useEffect(() => {
        if (recording === null) return;
        const timer = setInterval(() => setRecording((s) => (s === null ? null : s + 1)), 1000);

        return () => clearInterval(timer);
    }, [recording === null]); // eslint-disable-line react-hooks/exhaustive-deps -- restart only when recording starts/stops

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

    useImperativeHandle(ref, () => ({ attach: (file: File) => void pick(file) }));

    /** A screenshot or copied image pasted into the message box becomes the attachment. */
    const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const file = [...e.clipboardData.files][0];
        if (file) {
            e.preventDefault();
            void pick(file);
        }
    };

    const startRecording = async () => {
        const format = voiceFormat();
        if (!format || !navigator.mediaDevices?.getUserMedia) {
            toast.error(
                'This browser cannot record in a format WhatsApp accepts. Use Firefox, Safari or a recent Chrome, or attach an audio file (MP3, M4A, OGG).',
            );

            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
            const chunks: Blob[] = [];
            const rec = new MediaRecorder(stream, { mimeType: format.mime });
            rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
            rec.onstop = () => {
                stream.getTracks().forEach((t) => t.stop());
                setRecording(null);
                if (!discard.current && chunks.length > 0) {
                    void pick(new File(chunks, `voice-message.${format.extension}`, { type: format.type }), true);
                }
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

    const send = async () => {
        const body = text.trim();
        if (sending || (!body && !attachment)) return;
        setSending(true);
        try {
            await onSend(
                attachment
                    ? {
                          type: attachment.type,
                          media_id: attachment.id,
                          body: attachment.type === 'audio' || attachment.type === 'sticker' ? null : body || null,
                          reply_to: replyTo?.wamid,
                          // OGG/Opus recordings arrive as a voice note; the server ignores this for other formats.
                          ...(voice ? { content: { voice: true } } : {}),
                      }
                    : { type: 'text', body, reply_to: replyTo?.wamid },
            );
            setText('');
            setAttachment(null);
            setVoice(false);
            onClearReply();
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setSending(false);
        }
    };

    if (disabledReason) {
        return (
            <div className="flex flex-wrap items-center gap-3 border-t bg-card px-4 py-3">
                <p className="flex-1 text-[13px] text-muted-foreground">{disabledReason}</p>
                {canSendTemplate && (
                    <Button size="sm" onClick={onTemplate}>
                        <FileTextIcon /> Send template
                    </Button>
                )}
            </div>
        );
    }

    return (
        <div className="border-t bg-card px-3 py-2.5">
            {replyTo && (
                <div className="mb-2 flex items-center gap-2 rounded-md border-l-4 border-brand-500 bg-muted px-3 py-1.5 text-[12.5px]">
                    <span className="min-w-0 flex-1 truncate">Replying to: {replyTo.body ?? `${replyTo.type} message`}</span>
                    <button onClick={onClearReply} aria-label="Cancel reply" className="text-muted-foreground hover:text-foreground">
                        <XIcon className="size-4" />
                    </button>
                </div>
            )}
            {attachment && (
                <div className="mb-2 flex items-center gap-2 rounded-md bg-muted px-3 py-1.5 text-[12.5px]">
                    <PaperclipIcon className="size-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                        {voice ? 'Voice message' : attachment.filename} · {fileSize(attachment.file_size)}
                    </span>
                    <button
                        onClick={() => {
                            setAttachment(null);
                            setVoice(false);
                        }}
                        aria-label="Remove attachment"
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <XIcon className="size-4" />
                    </button>
                </div>
            )}
            <div className="flex items-end gap-2">
                <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
                <Button variant="ghost" size="icon" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Attach a file">
                    {uploading ? <Loader2Icon className="animate-spin" /> : <PaperclipIcon />}
                </Button>
                <Button variant="ghost" size="icon" onClick={onTemplate} aria-label="Send a template">
                    <FileTextIcon />
                </Button>
                <CannedPicker
                    onPick={(body) => {
                        setText((current) => (current.trim() ? `${current.trimEnd()}\n${body}` : body));
                        requestAnimationFrame(() => inputRef.current?.focus());
                    }}
                />
                <EmojiPicker
                    onPick={(emoji) => {
                        const el = inputRef.current;
                        const start = el?.selectionStart ?? text.length;
                        const end = el?.selectionEnd ?? text.length;
                        setText(text.slice(0, start) + emoji + text.slice(end));
                        // Put the cursor right after the inserted emoji.
                        requestAnimationFrame(() => {
                            el?.focus();
                            el?.setSelectionRange(start + emoji.length, start + emoji.length);
                        });
                    }}
                />
                <textarea
                    ref={inputRef}
                    onPaste={onPaste}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            void send();
                        }
                    }}
                    rows={1}
                    maxLength={4096}
                    placeholder={attachment ? 'Add a caption…' : 'Type a message, or drop a file here'}
                    aria-label="Message"
                    className="field-sizing-content max-h-40 min-h-9 flex-1 resize-none rounded-md border border-input bg-card px-3 py-2 text-sm leading-5 outline-none placeholder:text-faint focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
                />
                {recording !== null ? (
                    <>
                        <span className="flex h-9 items-center gap-1.5 px-1 text-[13px] font-medium text-bad tabular-nums" aria-live="polite">
                            <span className="size-2 animate-pulse rounded-full bg-bad" /> {clock(recording)}
                        </span>
                        <Button variant="ghost" size="icon" onClick={() => stopRecording(true)} aria-label="Discard recording">
                            <Trash2Icon />
                        </Button>
                        <Button size="icon" onClick={() => stopRecording(false)} aria-label="Stop recording">
                            <SquareIcon />
                        </Button>
                    </>
                ) : !text.trim() && !attachment ? (
                    <Button size="icon" variant="outline" onClick={startRecording} disabled={uploading} aria-label="Record a voice message">
                        {uploading ? <Loader2Icon className="animate-spin" /> : <MicIcon />}
                    </Button>
                ) : (
                    <Button size="icon" onClick={send} disabled={sending || uploading} aria-label="Send">
                        {sending ? <Loader2Icon className="animate-spin" /> : <SendHorizontalIcon />}
                    </Button>
                )}
            </div>
        </div>
    );
}
