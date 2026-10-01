'use client';

import { FileTextIcon, Loader2Icon, PaperclipIcon, SendHorizontalIcon, XIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { errorMessage, upload } from '@/lib/api';
import { fileSize } from '@/lib/format';
import type { SendPayload } from '@/lib/queries';
import type { Message, UploadedMedia } from '@/lib/types';

/**
 * Enter sends, Shift+Enter adds a line. Attachments are uploaded first (validated against
 * WhatsApp limits server-side) and sent with the text as caption.
 */
export function Composer({
    disabledReason,
    replyTo,
    onClearReply,
    onSend,
    onTemplate,
}: {
    disabledReason: string | null;
    replyTo: Message | null;
    onClearReply: () => void;
    onSend: (payload: SendPayload) => Promise<void>;
    onTemplate: () => void;
}) {
    const [text, setText] = useState('');
    const [attachment, setAttachment] = useState<UploadedMedia | null>(null);
    const [uploading, setUploading] = useState(false);
    const [sending, setSending] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const pick = async (file: File | undefined) => {
        if (!file) return;
        setUploading(true);
        try {
            const form = new FormData();
            form.append('file', file);
            const res = await upload<{ data: UploadedMedia }>('media', form);
            setAttachment(res.data);
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
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
                      }
                    : { type: 'text', body, reply_to: replyTo?.wamid },
            );
            setText('');
            setAttachment(null);
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
                <Button size="sm" onClick={onTemplate}>
                    <FileTextIcon /> Send template
                </Button>
            </div>
        );
    }

    return (
        <div className="border-t bg-card px-3 py-2.5">
            {replyTo && (
                <div className="mb-2 flex items-center gap-2 rounded-md border-l-4 border-primary bg-muted px-3 py-1.5 text-[12.5px]">
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
                        {attachment.filename} · {fileSize(attachment.file_size)}
                    </span>
                    <button onClick={() => setAttachment(null)} aria-label="Remove attachment" className="text-muted-foreground hover:text-foreground">
                        <XIcon className="size-4" />
                    </button>
                </div>
            )}
            <div className="flex items-end gap-2">
                <input ref={fileRef} type="file" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
                <Button variant="ghost" size="icon" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Attach a file">
                    {uploading ? <Loader2Icon className="animate-spin" /> : <PaperclipIcon />}
                </Button>
                <Button variant="ghost" size="icon" onClick={onTemplate} aria-label="Send a template">
                    <FileTextIcon />
                </Button>
                <textarea
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
                    placeholder={attachment ? 'Add a caption…' : 'Type a message'}
                    aria-label="Message"
                    className="field-sizing-content max-h-40 min-h-9 flex-1 resize-none rounded-md border border-input bg-card px-3 py-2 text-sm leading-5 outline-none placeholder:text-faint focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
                />
                <Button size="icon" onClick={send} disabled={sending || (!text.trim() && !attachment)} aria-label="Send">
                    {sending ? <Loader2Icon className="animate-spin" /> : <SendHorizontalIcon />}
                </Button>
            </div>
        </div>
    );
}
