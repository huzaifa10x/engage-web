'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ActivityIcon, Loader2Icon, MessageSquarePlusIcon, PlusIcon, RadioIcon, WifiOffIcon } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { useChatOpen } from '@/components/app/app-shell';
import { EmptyState, Forbidden } from '@/components/app/page-header';
import { useSelectedNumber } from '@/components/app/number-switcher';
import { useSession } from '@/components/app/session';
import { ConversationList, type InboxView } from '@/components/inbox/conversation-list';
import { InboxHealthPanel } from '@/components/inbox/inbox-health';
import { StartConversationDialog } from '@/components/inbox/start-conversation-dialog';
import { Thread } from '@/components/inbox/thread';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ResizeHandle } from '@/components/app/resize-handle';
import { syncSummary } from '@/components/channels/sync-progress';
import { useInboxRealtime } from '@/hooks/use-inbox-realtime';
import { useStored } from '@/hooks/use-stored';
import { P } from '@/lib/permissions';
import { keys, usePhoneNumbers } from '@/lib/queries';
import { cn } from '@/lib/utils';

function Inbox() {
    const { me, can } = useSession();
    const router = useRouter();
    const qc = useQueryClient();
    const params = useSearchParams();
    const [numberId] = useSelectedNumber();
    const [composeOpen, setComposeOpen] = useState(false);
    const selected = params.get('c');
    const closure = params.get('ev');
    const [health, setHealth] = useState(false);
    const order = useRef<string[]>([]);
    const view = useRef<InboxView>('needs');
    const search = useRef<HTMLInputElement>(null);
    // "Start chat" on a contact's record lands here with ?start=<contact id>.
    const startFor = params.get('start');
    useChatOpen(!!selected);
    const [listWidth, setListWidth] = useStored<number>('engage.inbox.list-width', 384);
    // A WhatsApp Business app number whose chat history import has not finished yet.
    const syncing = (usePhoneNumbers().data ?? []).find(
        (n) => (!numberId || n.id === numberId) && n.sync !== null && ['waiting', 'importing'].includes(n.sync.state),
    );

    // New-message alerts (desktop notification + sound) come from the header bell on every page;
    // with a live connection the bell is told to check straight away instead of on its next tick.
    // Imported history arrives without realtime pushes (thousands of them would be a storm), so the
    // list is refreshed when the import counter moves instead: at most once per progress check.
    const importedSoFar = syncing?.sync?.imported ?? null;
    useEffect(() => {
        if (importedSoFar !== null) void qc.invalidateQueries({ queryKey: keys.conversationsAll });
    }, [importedSoFar, qc]);

    const notify = useCallback(() => void qc.invalidateQueries({ queryKey: ['notifications'] }), [qc]);
    const realtime = useInboxRealtime(me.active_tenant_id ?? '', notify);
    const polling = realtime !== 'live';

    const open = useCallback(
        (id: string | null, ev?: string | null) => router.replace(id ? `/inbox?c=${id}${ev ? `&ev=${ev}` : ''}` : '/inbox', { scroll: false }),
        [router],
    );
    const onOrder = useCallback((ids: string[]) => void (order.current = ids), []);
    const onViewChange = useCallback((v: InboxView) => void (view.current = v), []);
    // After resolving in Needs reply, the next chat in the queue opens (the resolved one leaves the list).
    const onResolved = useCallback(() => {
        if (view.current !== 'needs' || !selected) return;
        const ids = order.current;
        const i = ids.indexOf(selected);
        if (i < 0) return;
        const next = ids.filter((x) => x !== selected)[Math.min(i, ids.length - 2)];
        if (next) open(next);
    }, [selected, open]);

    // ⌘K search · J / K move through the list.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                search.current?.focus();
                return;
            }
            const el = document.activeElement as HTMLElement | null;
            if (e.metaKey || e.ctrlKey || e.altKey || (el && (/INPUT|TEXTAREA|SELECT/.test(el.tagName) || el.isContentEditable))) return;
            if (document.querySelector('[role="dialog"],[role="menu"]')) return;
            const k = e.key.toLowerCase();
            if (k !== 'j' && k !== 'k') return;
            const ids = order.current;
            if (ids.length === 0) return;
            e.preventDefault();
            const i = selected ? ids.indexOf(selected) : -1;
            const next = ids[Math.min(ids.length - 1, Math.max(0, i + (k === 'j' ? 1 : -1)))];
            if (next && next !== selected) open(next);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selected, open]);

    if (!can(P.InboxView)) return <Forbidden />;

    return (
        <div className="flex h-full min-h-0">
            <div
                className={cn('w-full shrink-0 flex-col md:flex md:w-(--list-width)', selected ? 'hidden' : 'flex')}
                style={{ '--list-width': `${listWidth}px` } as React.CSSProperties}
            >
                <div className="flex items-center gap-2 border-r bg-card px-4 pt-3.5 pb-2.5">
                    <h1 className="flex-1 text-[17px] font-semibold">Team Inbox</h1>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span
                                className={cn('inline-flex size-2 rounded-full', realtime === 'live' ? 'bg-good' : 'bg-faint')}
                                aria-label={realtime === 'live' ? 'Live' : 'Refreshing'}
                            />
                        </TooltipTrigger>
                        <TooltipContent>
                            {realtime === 'live' ? (
                                <>
                                    <RadioIcon className="mr-1 inline size-3" /> Live · new messages appear instantly.
                                </>
                            ) : (
                                <>
                                    <WifiOffIcon className="mr-1 inline size-3" /> Realtime is not connected; the inbox refreshes every few seconds.
                                </>
                            )}
                        </TooltipContent>
                    </Tooltip>
                    <Button
                        variant={health ? 'secondary' : 'ghost'}
                        size="icon-sm"
                        onClick={() => setHealth((h) => !h)}
                        aria-pressed={health}
                        aria-label="Inbox health"
                        title="Inbox health"
                    >
                        <ActivityIcon />
                    </Button>
                    {can(P.InboxReply) && (
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setComposeOpen(true)}
                            aria-label="Start a new conversation"
                            title="Start a new conversation"
                        >
                            <PlusIcon />
                        </Button>
                    )}
                </div>
                {syncing?.sync && (
                    <div role="status" className="border-r border-b bg-brand-50 px-3 py-2.5">
                        <p className="flex items-center gap-2 text-[12.5px] font-semibold text-brand-600">
                            <Loader2Icon className="size-3.5 shrink-0 animate-spin" />
                            Importing older chats for {syncing.verified_name ?? syncing.display_phone_number}
                        </p>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-brand-100" aria-hidden>
                            <div
                                className="h-full rounded-full bg-primary transition-[width] duration-700"
                                style={{ width: `${Math.max(2, syncing.sync.percent)}%` }}
                            />
                        </div>
                        <p className="mt-1.5 text-[12px] text-ink-2">{syncSummary(syncing.sync)}</p>
                    </div>
                )}
                <div className="min-h-0 flex-1">
                    <ConversationList
                        phoneNumberId={numberId}
                        selectedId={selected}
                        selectedClosure={closure}
                        onSelect={(id, ev) => open(id, ev)}
                        polling={polling}
                        onOrder={onOrder}
                        searchRef={search}
                        onViewChange={onViewChange}
                    />
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
                    <Thread
                        key={selected}
                        conversationId={selected}
                        polling={polling}
                        onBack={() => open(null)}
                        focusMessageId={params.get('m')}
                        closureId={closure}
                        onResolved={onResolved}
                        initialMode={params.get('compose') === 'template' ? 'template' : 'reply'}
                    />
                ) : (
                    <div className="flex flex-1 items-center justify-center bg-[#efeae2]">
                        <EmptyState
                            title="No conversation selected"
                            description="Pick one from the list."
                            action={
                                can(P.InboxReply) ? (
                                    <Button onClick={() => setComposeOpen(true)}>
                                        <MessageSquarePlusIcon /> Start conversation
                                    </Button>
                                ) : undefined
                            }
                        />
                    </div>
                )}
            </div>

            {health && <InboxHealthPanel phoneNumberId={numberId} onClose={() => setHealth(false)} />}
            <StartConversationDialog
                open={composeOpen || !!startFor}
                onOpenChange={(o) => {
                    setComposeOpen(o);
                    if (!o && startFor) router.replace(selected ? `/inbox?c=${selected}` : '/inbox', { scroll: false });
                }}
                defaultNumberId={numberId}
                contactId={startFor}
                onStarted={(id) => open(id)}
            />
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
