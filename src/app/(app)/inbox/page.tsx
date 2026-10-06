'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Loader2Icon, MessageSquarePlusIcon, RadioIcon, WifiOffIcon } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useState } from 'react';

import { EmptyState, Forbidden } from '@/components/app/page-header';
import { useSelectedNumber } from '@/components/app/number-switcher';
import { useSession } from '@/components/app/session';
import { ConversationList } from '@/components/inbox/conversation-list';
import { NewConversationDialog } from '@/components/inbox/new-conversation-dialog';
import { Thread } from '@/components/inbox/thread';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ResizeHandle } from '@/components/app/resize-handle';
import { useInboxRealtime } from '@/hooks/use-inbox-realtime';
import { useStored } from '@/hooks/use-stored';
import { P } from '@/lib/permissions';
import { usePhoneNumbers } from '@/lib/queries';
import { cn } from '@/lib/utils';

function Inbox() {
    const { me, can } = useSession();
    const router = useRouter();
    const qc = useQueryClient();
    const params = useSearchParams();
    const [numberId] = useSelectedNumber();
    const [composeOpen, setComposeOpen] = useState(false);
    const selected = params.get('c');
    const [listWidth, setListWidth] = useStored<number>('engage.inbox.list-width', 384);
    // A WhatsApp Business app number whose chat history import has not finished yet.
    const syncing = (usePhoneNumbers().data ?? []).find(
        (n) => (!numberId || n.id === numberId) && ['sync_pending', 'history_syncing'].includes(n.coexistence_status),
    );

    // New-message alerts (desktop notification + sound) come from the header bell on every page;
    // with a live connection the bell is told to check straight away instead of on its next tick.
    const notify = useCallback(() => void qc.invalidateQueries({ queryKey: ['notifications'] }), [qc]);
    const realtime = useInboxRealtime(me.active_tenant_id ?? '', notify);
    const polling = realtime !== 'live';

    const open = (id: string | null) => router.replace(id ? `/inbox?c=${id}` : '/inbox', { scroll: false });

    if (!can(P.InboxView)) return <Forbidden />;

    return (
        <div className="flex h-full min-h-0">
            <div
                className={cn('w-full shrink-0 flex-col md:flex md:w-(--list-width)', selected ? 'hidden' : 'flex')}
                style={{ '--list-width': `${listWidth}px` } as React.CSSProperties}
            >
                <div className="flex items-center gap-2 border-r border-b bg-card px-3 py-2.5">
                    <h1 className="flex-1 text-[15px] font-semibold">Team Inbox</h1>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className={cn('inline-flex items-center gap-1 text-[11.5px]', realtime === 'live' ? 'text-good' : 'text-muted-foreground')}>
                                {realtime === 'live' ? <RadioIcon className="size-3.5" /> : <WifiOffIcon className="size-3.5" />}
                                {realtime === 'live' ? 'Live' : realtime === 'connecting' ? 'Connecting' : 'Refreshing'}
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>
                            {realtime === 'live' ? 'New messages appear instantly.' : 'Realtime is not connected; the inbox refreshes every few seconds.'}
                        </TooltipContent>
                    </Tooltip>
                    {can(P.InboxReply) && (
                        <Button size="icon-sm" variant="ghost" onClick={() => setComposeOpen(true)} aria-label="New conversation">
                            <MessageSquarePlusIcon />
                        </Button>
                    )}
                </div>
                {syncing && (
                    <p role="status" className="flex items-center gap-2 border-r border-b bg-info-bg px-3 py-2 text-[12.5px] text-info">
                        <Loader2Icon className="size-3.5 shrink-0 animate-spin" />
                        History syncing… Older chats from the WhatsApp Business app are still arriving for{' '}
                        {syncing.verified_name ?? syncing.display_phone_number}.
                    </p>
                )}
                <div className="min-h-0 flex-1">
                    <ConversationList phoneNumberId={numberId} selectedId={selected} onSelect={(c) => open(c.id)} polling={polling} />
                </div>
            </div>

            <ResizeHandle
                className="hidden md:block"
                label="Resize the conversation list"
                direction="right"
                width={listWidth}
                min={280}
                max={560}
                onResize={setListWidth}
                onReset={() => setListWidth(384)}
            />

            <div className={cn('min-h-0 min-w-0 flex-1', selected ? 'flex' : 'hidden md:flex')}>
                {selected ? (
                    <Thread key={selected} conversationId={selected} polling={polling} onBack={() => open(null)} />
                ) : (
                    <div className="flex flex-1 items-center justify-center bg-[#efeae2]">
                        <EmptyState
                            title="Select a conversation"
                            description="Pick a chat on the left, or start a new one with an approved template."
                            action={
                                can(P.InboxReply) ? (
                                    <Button onClick={() => setComposeOpen(true)}>
                                        <MessageSquarePlusIcon /> New conversation
                                    </Button>
                                ) : undefined
                            }
                        />
                    </div>
                )}
            </div>

            <NewConversationDialog open={composeOpen} onOpenChange={setComposeOpen} defaultNumberId={numberId} onStarted={(id) => open(id)} />
        </div>
    );
}

export default function InboxPage() {
    return (
        <Suspense>
            <Inbox />
        </Suspense>
    );
}
