'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, Loader2Icon } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useSession } from '@/components/app/session';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { newId } from '@/lib/id';
import { dayLabel, timeLeft } from '@/lib/format';
import { P } from '@/lib/permissions';
import { keys, sendToConversation, type SendPayload, useConversation, useMembers, usePhoneNumbers, useThread } from '@/lib/queries';
import type { Message } from '@/lib/types';

import { Composer } from './composer';
import { ContactPanel } from './contact-panel';
import { MessageBubble } from './message-bubble';
import { TemplateDialog } from './template-dialog';

export function Thread({ conversationId, polling, onBack }: { conversationId: string; polling: boolean; onBack: () => void }) {
    const { can, membership } = useSession();
    const qc = useQueryClient();
    const conversation = useConversation(conversationId, polling ? 15_000 : false);
    const thread = useThread(conversationId, polling ? 5_000 : false);
    const members = useMembers(can(P.TeamView));
    const [replyTo, setReplyTo] = useState<Message | null>(null);
    const [templateOpen, setTemplateOpen] = useState(false);
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
    const disabledReason = !can(P.InboxReply)
        ? 'Your role can read this conversation but not reply.'
        : contact?.consent_state === 'opted_out'
          ? 'This contact opted out. They must send START before you can message them.'
          : !c.window.open
            ? 'The 24-hour window is closed, so normal messages cannot be sent. Send an approved template; when the customer replies, the window opens again.'
            : null;
    const optedOut = contact?.consent_state === 'opted_out';

    return (
        <div className="flex min-h-0 min-w-0 flex-1">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#efeae2]">
                <header className="flex items-center gap-3 border-b bg-card px-4 py-2.5">
                    <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack} aria-label="Back to conversations">
                        <ArrowLeftIcon />
                    </Button>
                    <Avatar name={contact?.display_name ?? '?'} />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[14.5px] font-semibold">{contact?.display_name}</p>
                        <p className="truncate text-[12px] text-muted-foreground">
                            {contact?.phone ?? (contact?.username ? `@${contact.username}` : 'WhatsApp user')}
                            {c.phone_number ? ` · via ${c.phone_number.verified_name ?? c.phone_number.display_phone_number}` : ''}
                        </p>
                    </div>
                    {c.window.open ? (
                        <Badge tone="good" dot title="The customer wrote in the last 24 hours: you can send text and media.">
                            Window open · {timeLeft(c.window.expires_at)}
                        </Badge>
                    ) : (
                        <Badge tone="warn" dot title="More than 24 hours since the customer last wrote: only approved templates can be sent.">
                            Window closed · template only
                        </Badge>
                    )}
                    {c.status === 'closed' && <Badge tone="grey">Closed</Badge>}
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
