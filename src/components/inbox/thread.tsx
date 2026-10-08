'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, Loader2Icon, UploadCloudIcon } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useSession } from '@/components/app/session';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, errorMessage } from '@/lib/api';
import { newId } from '@/lib/id';
import { dayLabel, timeLeft } from '@/lib/format';
import { P } from '@/lib/permissions';
import {
    keys,
    requestConsent,
    sendToConversation,
    setConversationAutoReply,
    type SendPayload,
    useConversation,
    useMembers,
    usePhoneNumbers,
    useThread,
} from '@/lib/queries';
import type { Message } from '@/lib/types';

import { Composer, type ComposerHandle } from './composer';
import { ContactPanel } from './contact-panel';
import { MessageBubble } from './message-bubble';
import { NotesButton, SnoozeMenu } from './thread-tools';
import { TemplateDialog } from './template-dialog';

/** True while something that contains files is being dragged (not text or a link). */
const hasFiles = (e: React.DragEvent) => [...e.dataTransfer.types].includes('Files');

export function Thread({ conversationId, polling, onBack }: { conversationId: string; polling: boolean; onBack: () => void }) {
    const { can, membership } = useSession();
    const qc = useQueryClient();
    const conversation = useConversation(conversationId, polling ? 15_000 : false);
    const thread = useThread(conversationId, polling ? 5_000 : false);
    const members = useMembers(can(P.TeamView));
    const [replyTo, setReplyTo] = useState<Message | null>(null);
    const [templateOpen, setTemplateOpen] = useState(false);
    const [askingConsent, setAskingConsent] = useState(false);
    // Drag and drop: files dropped anywhere on the chat are handed to the message box.
    const composer = useRef<ComposerHandle>(null);
    const dragDepth = useRef(0);
    const [dropping, setDropping] = useState(false);
    const scroller = useRef<HTMLDivElement>(null);
    const pinnedToBottom = useRef(true);
    const readFor = useRef<string | null>(null);

    // API pages are newest-first; display oldest → newest.
    const messages = useMemo(() => (thread.data?.pages.flatMap((p) => p.data) ?? []).slice().reverse(), [thread.data]);
    const byWamid = useMemo(() => new Map(messages.filter((m) => m.wamid).map((m) => [m.wamid as string, m])), [messages]);
    const names = useMemo(() => new Map((members.data?.data ?? []).map((m) => [m.id, m.user?.name ?? 'Teammate'])), [members.data]);

    // Keep the view pinned to the newest message unless the agent scrolled up to read history.
    useEffect(() => {
        const el = scroller.current;
        if (el && pinnedToBottom.current) el.scrollTop = el.scrollHeight;
    }, [messages.length, conversationId]);

    const read = useMutation({
        mutationFn: () => api(`conversations/${conversationId}/read`, { method: 'POST' }),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: keys.conversationsAll });
            void qc.invalidateQueries({ queryKey: keys.conversation(conversationId) });
        },
    });
    const { mutate: markRead } = read;
    const unread = conversation.data?.unread_count ?? 0;
    useEffect(() => {
        if (unread > 0 && readFor.current !== `${conversationId}:${messages.length}`) {
            readFor.current = `${conversationId}:${messages.length}`;
            markRead();
        }
    }, [unread, conversationId, messages.length, markRead]);

    const afterSend = () => {
        pinnedToBottom.current = true;
        void qc.invalidateQueries({ queryKey: keys.thread(conversationId) });
        void qc.invalidateQueries({ queryKey: keys.conversation(conversationId) });
        void qc.invalidateQueries({ queryKey: keys.conversationsAll });
    };

    const send = async (payload: SendPayload) => {
        await sendToConversation(conversationId, payload, newId());
        afterSend();
    };

    const sendTemplate = async (payload: SendPayload) => {
        await send(payload);
        toast.success('Template queued for sending');
    };

    // Templates belong to the WhatsApp Business Account of the number this thread runs on.
    const numbers = usePhoneNumbers();
    const wabaAccountId = numbers.data?.find((n) => n.id === conversation.data?.phone_number_id)?.waba_account_id ?? null;

    const c = conversation.data;
    if (conversation.isLoading || !c) {
        return (
            <div className="flex flex-1 flex-col gap-3 p-6">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-16 w-2/3" />
                <Skeleton className="ml-auto h-16 w-1/2" />
            </div>
        );
    }

    const contact = c.contact;
    // The number was offboarded: its history is kept and readable, but there is nothing to send from.
    const numberGone = c.phone_number?.status === 'disconnected';
    const disabledReason = numberGone
        ? `This conversation is on ${c.phone_number?.verified_name ?? c.phone_number?.display_phone_number ?? 'a number'}, which is no longer connected. You can read the history, but messages cannot be sent or received here. Reconnect the number in Channels to continue.`
        : !can(P.InboxReply)
          ? 'Your role can read this conversation but not reply.'
          : contact?.consent_state === 'opted_out'
            ? 'This contact opted out. They must send START before you can message them.'
            : !c.window.open
              ? 'The 24-hour window is closed, so normal messages cannot be sent. Send an approved template; when the customer replies, the window opens again.'
              : null;
    const optedOut = contact?.consent_state === 'opted_out';

    return (
        <div className="flex min-h-0 min-w-0 flex-1">
            <div
                className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#efeae2]"
                onDragEnter={(e) => {
                    if (!hasFiles(e)) return;
                    e.preventDefault();
                    dragDepth.current += 1;
                    setDropping(true);
                }}
                onDragOver={(e) => {
                    if (!hasFiles(e)) return;
                    e.preventDefault(); // required, or the browser opens the file instead
                    e.dataTransfer.dropEffect = disabledReason ? 'none' : 'copy';
                }}
                onDragLeave={(e) => {
                    if (!hasFiles(e)) return;
                    dragDepth.current = Math.max(0, dragDepth.current - 1);
                    if (dragDepth.current === 0) setDropping(false);
                }}
                onDrop={(e) => {
                    if (!hasFiles(e)) return;
                    e.preventDefault();
                    dragDepth.current = 0;
                    setDropping(false);
                    const files = [...e.dataTransfer.files];
                    if (disabledReason) return void toast.error(disabledReason);
                    if (files.length === 0) return void toast.error('That item cannot be attached. Drop a file from your computer.');
                    if (files.length > 1) toast.message('One file per message: the first file was attached.');
                    composer.current?.attach(files[0]);
                }}
            >
                {dropping && (
                    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-primary/15 p-6 backdrop-blur-[1px]">
                        <div className="rounded-xl border-2 border-dashed border-brand-500 bg-card px-8 py-6 text-center shadow-raised">
                            <UploadCloudIcon className="mx-auto size-8 text-brand-600" />
                            <p className="mt-2 text-[15px] font-semibold">{disabledReason ? 'Files cannot be sent right now' : 'Drop to attach'}</p>
                            <p className="mt-0.5 max-w-xs text-[13px] text-muted-foreground">
                                {disabledReason ?? 'Images, videos, audio and documents. You can add a caption before sending.'}
                            </p>
                        </div>
                    </div>
                )}
                <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-card px-4 py-2.5">
                    <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack} aria-label="Back to conversations">
                        <ArrowLeftIcon />
                    </Button>
                    <Avatar name={contact?.display_name ?? '?'} />
                    <div className="min-w-32 flex-1">
                        <p className="truncate text-[14.5px] font-semibold">{contact?.display_name}</p>
                        <p className="truncate text-[12px] text-muted-foreground">
                            {contact?.phone ?? (contact?.username ? `@${contact.username}` : 'WhatsApp user')}
                            {c.phone_number ? ` · via ${c.phone_number.verified_name ?? c.phone_number.display_phone_number}` : ''}
                        </p>
                    </div>
                    {/* Status and actions: one group that wraps as a whole row when space is short, so nothing is hidden. */}
                    <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
                        {numberGone ? null : c.window.open ? (
                            <Badge tone="good" dot title="The customer wrote in the last 24 hours: you can send text and media.">
                                Window open · {timeLeft(c.window.expires_at)}
                            </Badge>
                        ) : (
                            <Badge tone="warn" dot title="More than 24 hours since the customer last wrote: only approved templates can be sent.">
                                Window closed · template only
                            </Badge>
                        )}
                        {numberGone && (
                            <Badge tone="bad" title="The WhatsApp number this conversation belongs to was disconnected. The history is kept.">
                                Number disconnected
                            </Badge>
                        )}
                        {c.status === 'closed' && <Badge tone="grey">Closed</Badge>}
                        {c.snoozed_until && <Badge tone="info">Snoozed</Badge>}
                        <NotesButton conversation={c} />
                        {can(P.InboxReply) && <SnoozeMenu conversation={c} />}
                        {can(P.InboxReply) && (
                            <Button
                                variant="outline"
                                size="sm"
                                title={
                                    c.auto_reply_enabled
                                        ? 'Automatic replies are allowed in this conversation. Click to cancel them here.'
                                        : 'Automatic replies are cancelled for this conversation. Click to allow them again.'
                                }
                                onClick={async () => {
                                    try {
                                        await setConversationAutoReply(c.id, !c.auto_reply_enabled);
                                        toast.success(
                                            c.auto_reply_enabled ? 'Auto reply cancelled for this conversation' : 'Auto reply allowed for this conversation',
                                        );
                                        void qc.invalidateQueries({ queryKey: keys.conversation(c.id) });
                                        void qc.invalidateQueries({ queryKey: keys.conversationsAll });
                                    } catch (e) {
                                        toast.error(errorMessage(e));
                                    }
                                }}
                            >
                                {c.auto_reply_enabled ? 'Cancel auto reply' : 'Auto reply off'}
                            </Button>
                        )}
                        {c.window.open && can(P.InboxReply) && contact && contact.consent_state === 'unknown' && (
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={askingConsent}
                                title="Sends a question with Subscribe / No thanks buttons. A tap on Subscribe is recorded as marketing consent."
                                onClick={async () => {
                                    setAskingConsent(true);
                                    try {
                                        await requestConsent(c.id);
                                        toast.success('Consent request sent');
                                        void qc.invalidateQueries({ queryKey: keys.thread(c.id) });
                                    } catch (e) {
                                        toast.error(errorMessage(e));
                                    } finally {
                                        setAskingConsent(false);
                                    }
                                }}
                            >
                                {askingConsent ? 'Sending…' : 'Ask for consent'}
                            </Button>
                        )}
                    </div>
                </header>

                <div
                    ref={scroller}
                    onScroll={(e) => {
                        const el = e.currentTarget;
                        pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                    }}
                    className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-4 sm:px-8"
                >
                    {thread.hasNextPage && (
                        <div className="mb-2 flex justify-center">
                            <Button size="sm" variant="outline" onClick={() => thread.fetchNextPage()} disabled={thread.isFetchingNextPage}>
                                {thread.isFetchingNextPage ? <Loader2Icon className="animate-spin" /> : null} Load earlier messages
                            </Button>
                        </div>
                    )}
                    {thread.isLoading && <Skeleton className="h-16 w-1/2" />}
                    {messages.map((m, i) => {
                        const prev = messages[i - 1];
                        const newDay =
                            !prev || (m.timestamp && prev.timestamp && new Date(m.timestamp).toDateString() !== new Date(prev.timestamp).toDateString());
                        const author =
                            m.direction === 'outbound' && m.origin === 'agent'
                                ? m.sent_by_membership_id === membership.id
                                    ? 'You'
                                    : (names.get(m.sent_by_membership_id ?? '') ?? null)
                                : null;

                        return (
                            <Fragment key={m.id}>
                                {newDay && m.timestamp && (
                                    <div className="my-3 flex justify-center">
                                        <span className="rounded-md bg-card/90 px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground shadow-xs">
                                            {dayLabel(m.timestamp)}
                                        </span>
                                    </div>
                                )}
                                <MessageBubble
                                    message={m}
                                    quoted={m.reply_to_wamid ? (byWamid.get(m.reply_to_wamid) ?? null) : undefined}
                                    authorLabel={author}
                                    onReply={disabledReason ? undefined : setReplyTo}
                                />
                            </Fragment>
                        );
                    })}
                </div>

                <Composer
                    ref={composer}
                    canSendTemplate={!numberGone}
                    disabledReason={disabledReason}
                    replyTo={replyTo}
                    onClearReply={() => setReplyTo(null)}
                    onSend={send}
                    onTemplate={() => (optedOut || !can(P.InboxReply) ? toast.error(disabledReason ?? 'Not allowed') : setTemplateOpen(true))}
                />
            </div>

            <ContactPanel conversation={c} />
            <TemplateDialog open={templateOpen} onOpenChange={setTemplateOpen} wabaAccountId={wabaAccountId} onSend={sendTemplate} />
        </div>
    );
}
