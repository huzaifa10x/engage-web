'use client';

import { BotIcon, ClockIcon, InboxIcon, MoonIcon, SearchIcon, XIcon } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { SourceChip } from '@/components/growth/source-chip';
import { ResolvedList } from '@/components/inbox/resolved-list';
import { WaitChip } from '@/components/inbox/wait-chip';
import { RingAvatar, TagDots } from '@/components/inbox/window-ring';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { shortTime } from '@/lib/format';
import { type ConversationFilters, useConversationCounts, useConversations, useInboxTeams } from '@/lib/queries';
import type { Conversation } from '@/lib/types';
import { cn } from '@/lib/utils';

type Tab = 'needs_reply' | 'me' | 'unassigned' | 'any' | 'resolved';

// Five tabs (3.5). "Needs reply" first: the chats waiting on us, least time left on the reply promise first.
// A count always means work to do, so Resolved and All have none.
const TABS: { id: Tab; label: string; title: string }[] = [
    { id: 'needs_reply', label: 'Needs reply', title: 'Chats waiting on the team: least time left on the reply promise first' },
    { id: 'me', label: 'Mine', title: 'Open chats assigned to you' },
    { id: 'unassigned', label: 'Unassigned', title: 'Open chats nobody has picked up' },
    { id: 'any', label: 'All', title: 'Every open chat you can see' },
    { id: 'resolved', label: 'Resolved', title: 'Every closure, with its reason' },
];
const LEGACY_TABS: Record<string, Tab> = { others: 'any', all: 'any' };

/** Re-render every 30 s so the waiting timers move. */
export function useNow(): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 30_000);

        return () => clearInterval(id);
    }, []);

    return now;
}

type View = NonNullable<ConversationFilters['view']> | 'all';
const VIEWS: { id: View; label: string; title: string }[] = [
    { id: 'all', label: 'Any', title: 'Every conversation' },
    { id: 'bot', label: 'Bot', title: 'A chatbot is handling these right now' },
    { id: 'waiting', label: 'Waiting', title: 'We wrote last: waiting for the customer' },
    { id: 'abandoned', label: 'Abandoned', title: 'The customer stopped answering the chatbot' },
    { id: 'completed', label: 'Completed', title: 'The chatbot flow finished' },
];

const BOT_STATE: Record<string, string> = { handed_off: 'Handed off by bot', completed: 'Bot completed', abandoned: 'Left the bot', stopped: 'Bot stopped' };

export function ConversationList({
    phoneNumberId,
    selectedId,
    onSelect,
    polling,
}: {
    phoneNumberId: string | null;
    selectedId: string | null;
    onSelect: (c: Conversation) => void;
    polling: boolean;
}) {
    const onOpen = (conversationId: string) => onSelect({ id: conversationId } as Conversation);
    // Links from the Dashboard open a tab directly: /inbox?tab=needs_reply&assigned=unassigned, &after_hours=1.
    const params = useSearchParams();
    const [tab, setTab] = useState<Tab>(() => {
        const t = params.get('tab') ?? '';

        return TABS.some((x) => x.id === t) ? (t as Tab) : (LEGACY_TABS[t] ?? 'needs_reply');
    });
    // Needs reply narrowed to unassigned chats or mine (from the Dashboard); cleared with its chip.
    const [only, setOnly] = useState<'me' | 'unassigned' | null>(() => {
        const a = params.get('assigned');

        return params.get('tab') === 'needs_reply' && (a === 'me' || a === 'unassigned') ? a : null;
    });
    const assigned: NonNullable<ConversationFilters['assigned']> = tab === 'needs_reply' ? (only ?? 'any') : tab === 'resolved' ? 'any' : tab;
    const [afterHours, setAfterHours] = useState(() => params.get('after_hours') === '1');
    const now = useNow();
    const counts = useConversationCounts(phoneNumberId, polling ? 15_000 : false).data;
    const [unread, setUnread] = useState(false);
    const [snoozed, setSnoozed] = useState(false);
    const [view, setView] = useState<View>('all');
    const [team, setTeam] = useState('all');
    const teams = useInboxTeams();
    const [search, setSearch] = useState('');
    const [q, setQ] = useState('');

    // Without websockets the list is kept fresh by polling.
    const list = useConversations(
        {
            phone_number_id: phoneNumberId,
            assigned,
            team: team === 'all' ? undefined : team,
            // Closed chats live in the Resolved tab; every other tab lists open ones.
            status: 'open',
            unread,
            snoozed: snoozed || undefined,
            q: q || undefined,
            view: view === 'all' ? undefined : view,
            state: tab === 'needs_reply' ? 'needs_reply' : undefined,
            after_hours: afterHours || undefined,
        },
        polling ? 15_000 : false,
        tab !== 'resolved',
    );
    const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r bg-card">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 border-b p-3">
                <form
                    hidden={tab === 'resolved'}
                    onSubmit={(e) => {
                        e.preventDefault();
                        setQ(search.trim());
                    }}
                    className="relative"
                >
                    <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search name or number"
                        className="pl-8"
                        aria-label="Search conversations"
                    />
                </form>
                <TabStrip
                    tab={tab}
                    onTab={(t) => (setTab(t), setOnly(null))}
                    counts={{ needs_reply: counts?.needs_reply ?? 0, me: counts?.needs_reply_mine ?? 0, unassigned: counts?.unassigned ?? 0 }}
                />
                {tab !== 'resolved' && (
                    <div className="flex flex-wrap items-center gap-1">
                        {tab === 'needs_reply' && only && (
                            <button
                                onClick={() => setOnly(null)}
                                className="inline-flex h-7 items-center gap-1 rounded-md bg-brand-50 px-2.5 text-[12px] font-semibold text-brand-600"
                                title="Show every chat that needs a reply"
                            >
                                {only === 'me' ? 'Mine only' : 'Unassigned only'} <XIcon className="size-3" />
                            </button>
                        )}
                        <FilterChip
                            on={afterHours}
                            onClick={() => setAfterHours((v) => !v)}
                            title="Chats that arrived while you were closed and still need a reply"
                        >
                            <MoonIcon className="size-3.5" /> After hours
                            {(counts?.after_hours ?? 0) > 0 && <span className="tabular-nums">· {counts?.after_hours}</span>}
                        </FilterChip>
                        <FilterChip on={unread} onClick={() => setUnread((u) => !u)}>
                            Unread
                        </FilterChip>
                        <FilterChip on={snoozed} onClick={() => setSnoozed((v) => !v)}>
                            Snoozed
                        </FilterChip>
                        <Select value={view} onValueChange={(v) => setView(v as View)}>
                            <SelectTrigger size="sm" className="ml-auto w-28 shrink-0" aria-label="Bot view">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {VIEWS.map((v) => (
                                    <SelectItem key={v.id} value={v.id} title={v.title}>
                                        {v.id === 'all' ? 'All chats' : v.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {(teams.data ?? []).length > 0 && (
                            <Select value={team} onValueChange={setTeam}>
                                <SelectTrigger size="sm" className="w-28 shrink-0" aria-label="Team">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All teams</SelectItem>
                                    {(teams.data ?? []).map((t) => (
                                        <SelectItem key={t.id} value={t.id}>
                                            {t.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                )}
            </div>

            {tab === 'resolved' ? (
                <ResolvedList phoneNumberId={phoneNumberId} selectedId={selectedId} onOpen={onOpen} polling={polling} />
            ) : (
                <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Conversations">
                    {list.isLoading &&
                        [0, 1, 2, 3, 4].map((i) => (
                            <li key={i} className="flex gap-3 border-b border-line-2 p-3">
                                <Skeleton className="size-10 rounded-full" />
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-3.5 w-1/2" />
                                    <Skeleton className="h-3 w-3/4" />
                                </div>
                            </li>
                        ))}
                    {!list.isLoading && rows.length === 0 && (
                        <li className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
                            <InboxIcon className="size-6" />
                            {tab === 'needs_reply' && !q && !afterHours
                                ? 'Nobody is waiting on the team. 🎉'
                                : q || unread || snoozed || afterHours || tab !== 'any' || view !== 'all'
                                  ? 'No conversations match these filters.'
                                  : 'No conversations yet. Messages to your WhatsApp numbers appear here.'}
                        </li>
                    )}
                    {rows.map((c) => {
                        const name = c.contact?.display_name ?? 'WhatsApp user';

                        return (
                            <li key={c.id}>
                                <button
                                    onClick={() => onSelect(c)}
                                    aria-current={selectedId === c.id ? 'true' : undefined}
                                    className={cn(
                                        'flex w-full gap-3 border-b border-line-2 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-muted/60 motion-reduce:transition-none',
                                        selectedId === c.id && 'bg-brand-50 hover:bg-brand-50',
                                    )}
                                >
                                    <RingAvatar name={name} expiresAt={c.window?.expires_at} className="size-10 text-[13px]" now={now} />
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-baseline gap-2">
                                            <span className={cn('min-w-0 flex-1 truncate text-[14px]', c.unread_count > 0 ? 'font-bold' : 'font-semibold')}>
                                                {name}
                                            </span>
                                            <span
                                                className={cn(
                                                    'shrink-0 text-[11.5px]',
                                                    c.unread_count > 0 ? 'font-semibold text-good' : 'text-muted-foreground',
                                                )}
                                            >
                                                {shortTime(c.last_message_at)}
                                            </span>
                                        </span>
                                        <span className="mt-0.5 flex items-center gap-2">
                                            <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                                                {c.last_message_direction === 'outbound' && <span className="text-faint">You: </span>}
                                                {c.last_message_preview}
                                            </span>
                                            {c.unread_count > 0 && (
                                                <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-good px-1.5 text-[11px] font-bold text-white">
                                                    {c.unread_count}
                                                </span>
                                            )}
                                        </span>
                                        {(c.contact?.tags ?? []).length > 0 && <TagDots tags={c.contact?.tags ?? []} className="mt-1" />}
                                        <WaitChip conversation={c} fetchedAt={list.dataUpdatedAt} now={now} />
                                        {c.window?.closing_soon && (
                                            <span
                                                className="mt-1 mr-1 inline-flex w-fit items-center gap-1 rounded-full bg-bad-bg px-1.5 py-px text-[10.5px] font-semibold text-bad"
                                                title="After the 24-hour window closes, only a paid template can reach the customer"
                                            >
                                                <ClockIcon className="size-3" /> Reply before window closes
                                            </span>
                                        )}
                                        {c.state === 'needs_reply' && c.after_hours && (
                                            <span className="mt-1 mr-1 inline-flex w-fit items-center gap-1 rounded-full bg-[#f1ebff] px-1.5 py-px text-[10.5px] font-semibold text-[#5b3fc9]">
                                                <MoonIcon className="size-3" /> Arrived after hours
                                            </span>
                                        )}
                                        {c.contact?.acquisition && (
                                            <SourceChip
                                                acquisition={c.contact.acquisition}
                                                // Returning contacts: "Before tracking · Latest: Google Ads".
                                                label={c.contact.acquisition.returning_label}
                                                compact
                                                className="mt-1 mr-1"
                                            />
                                        )}
                                        {c.handler === 'bot' ? (
                                            <span
                                                className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-info-bg px-1.5 py-px text-[10.5px] font-semibold text-info"
                                                title={c.bot?.node_title ? `At “${c.bot.node_title}”` : undefined}
                                            >
                                                <BotIcon className="size-3" /> Bot{c.bot?.flow_name ? ` · ${c.bot.flow_name}` : ''}
                                            </span>
                                        ) : c.bot?.state && BOT_STATE[c.bot.state] ? (
                                            <span
                                                className={cn(
                                                    'mt-1 inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-px text-[10.5px] font-semibold',
                                                    c.bot.state === 'abandoned' ? 'bg-warn-bg text-warn' : 'bg-grey-bg text-grey',
                                                )}
                                            >
                                                <BotIcon className="size-3" /> {BOT_STATE[c.bot.state]}
                                                {c.bot.state === 'abandoned' && c.bot.node_title ? ` at “${c.bot.node_title}”` : ''}
                                            </span>
                                        ) : null}
                                        {c.status === 'closed' && (
                                            <span className="mt-1 mr-1 inline-flex w-fit items-center rounded-full bg-grey-bg px-1.5 py-px text-[10.5px] font-semibold text-grey">
                                                Closed
                                            </span>
                                        )}
                                        {c.phone_number?.status === 'disconnected' && (
                                            <span className="mt-1 inline-flex w-fit items-center rounded-full bg-bad-bg px-1.5 py-px text-[10.5px] font-semibold text-bad">
                                                Number disconnected
                                            </span>
                                        )}
                                        {!phoneNumberId && c.phone_number && (
                                            <span className="mt-0.5 block truncate text-[11.5px] text-faint">
                                                via {c.phone_number.verified_name ?? c.phone_number.display_phone_number}
                                            </span>
                                        )}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                    {list.hasNextPage && (
                        <li className="p-3">
                            <Button variant="ghost" size="sm" className="w-full" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                                {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
                            </Button>
                        </li>
                    )}
                </ul>
            )}
        </div>
    );
}

function FilterChip({ on, onClick, title, children }: { on: boolean; onClick: () => void; title?: string; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            title={title}
            aria-pressed={on}
            className={cn(
                'inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[12px] font-semibold transition-colors duration-150 motion-reduce:transition-none',
                on ? 'bg-brand-50 text-brand-600' : 'text-muted-foreground hover:bg-muted',
            )}
        >
            {children}
        </button>
    );
}

/**
 * The five tabs in one row. When the list is narrow the row scrolls sideways (the mouse wheel scrolls it
 * too), a fade shows there is more, and the selected tab is kept in view.
 */
function TabStrip({ tab, onTab, counts }: { tab: Tab; onTab: (t: Tab) => void; counts: Partial<Record<Tab, number>> }) {
    const row = useRef<HTMLDivElement>(null);
    const [fade, setFade] = useState({ left: false, right: false });
    const measure = () => {
        const el = row.current;
        if (el) setFade({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    };
    useLayoutEffect(() => {
        const el = row.current;
        if (!el) return;
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        // A vertical wheel scrolls the row sideways; listened to directly so it can be stopped from scrolling the page.
        const wheel = (e: WheelEvent) => {
            if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
            e.preventDefault();
            el.scrollLeft += e.deltaY;
        };
        el.addEventListener('wheel', wheel, { passive: false });

        return () => (ro.disconnect(), el.removeEventListener('wheel', wheel));
    }, []);
    useEffect(() => {
        row.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, [tab]);

    return (
        <div className="relative min-w-0">
            <div
                ref={row}
                role="tablist"
                aria-label="Inbox views"
                onScroll={measure}
                className="flex [scrollbar-width:none] gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden"
                onKeyDown={(e) => {
                    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                    const i = TABS.findIndex((t) => t.id === tab);
                    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
                    onTab(next.id);
                    requestAnimationFrame(() => row.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
                }}
            >
                {TABS.map((t) => {
                    const on = tab === t.id;
                    const n = counts[t.id] ?? 0;

                    return (
                        <button
                            key={t.id}
                            role="tab"
                            aria-selected={on}
                            tabIndex={on ? 0 : -1}
                            onClick={() => onTab(t.id)}
                            title={t.title}
                            className={cn(
                                'inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors duration-150 motion-reduce:transition-none',
                                on ? 'bg-brand-50 text-brand-600' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                            )}
                        >
                            {t.label}
                            {n > 0 && (
                                <span
                                    className={cn(
                                        'rounded-full px-1 text-[11px] leading-4 font-semibold tabular-nums',
                                        t.id === 'needs_reply' ? 'bg-warn text-white' : 'bg-muted text-ink-2',
                                    )}
                                >
                                    {n}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
            {fade.left && <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-card to-transparent" />}
            {fade.right && <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-card to-transparent" />}
        </div>
    );
}
