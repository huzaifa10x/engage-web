'use client';

import {
    ArrowDownUpIcon,
    BotIcon,
    CheckIcon,
    ClockIcon,
    CornerUpLeftIcon,
    FileTextIcon,
    ListFilterIcon,
    MoonIcon,
    SearchIcon,
    TriangleAlertIcon,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useSession } from '@/components/app/session';
import { ResolvedList } from '@/components/inbox/resolved-list';
import { WaitClock } from '@/components/inbox/wait-clock';
import { OwnerAvatar, RingAvatar } from '@/components/inbox/window-ring';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { errorMessage } from '@/lib/api';
import { dur, fmtDay, fmtListTime, fmtTime, windowLeft, windowTier } from '@/lib/inbox';
import { HAPTIC, buzz, undoToast } from '@/lib/mobile';
import { P } from '@/lib/permissions';
import {
    assignConversation,
    type ConversationFilters,
    keys,
    resolveConversation,
    undoResolve,
    useConversationCounts,
    useConversations,
    useInboxTeams,
    useTags,
} from '@/lib/queries';
import type { Conversation } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ConnectPrompt, useNoNumber } from '@/components/app/connect-prompt';

/** Mobile brief v5: Needs reply with the window open (closing soonest first), then closed, then the rest. */
type QueueGroup = 'open' | 'closed' | 'rest';
const GROUP_LABEL: Record<QueueGroup, string> = { open: 'Needs reply · window open', closed: 'Needs reply · template only', rest: 'Everything else' };
function groupOf(c: Conversation, now: number): QueueGroup {
    if (c.status === 'closed' || c.state !== 'needs_reply') return 'rest';

    return c.window?.expires_at && new Date(c.window.expires_at).getTime() > now ? 'open' : 'closed';
}

export type InboxView = 'needs' | 'mine' | 'unassigned' | 'all' | 'resolved';
type Sort = NonNullable<ConversationFilters['sort']>;

const TABS: { id: InboxView; label: string }[] = [
    { id: 'needs', label: 'Needs reply' },
    { id: 'mine', label: 'Mine' },
    { id: 'unassigned', label: 'Unassigned' },
    { id: 'all', label: 'All' },
    { id: 'resolved', label: 'Resolved' },
];
const LEGACY: Record<string, InboxView> = { needs_reply: 'needs', me: 'mine', any: 'all', others: 'all' };
const SORTS: { id: Sort; label: string; hint?: string }[] = [
    { id: 'priority', label: 'Priority', hint: 'Least time left to reply first' },
    { id: 'newest', label: 'Newest activity' },
    { id: 'waiting', label: 'Longest waiting', hint: 'Backlog view' },
];
type Filters = {
    window: 'any' | 'open' | 'closed' | 'closing';
    unread: boolean;
    followup: boolean;
    tag: string;
    afterHours: boolean;
    snoozed: boolean;
    team: string;
    bot: string;
};
const NO_FILTERS: Filters = { window: 'any', unread: false, followup: false, tag: '', afterHours: false, snoozed: false, team: 'all', bot: 'all' };
const BOT_VIEWS = [
    { id: 'all', label: 'Any handler' },
    { id: 'bot', label: 'Bot answering' },
    { id: 'abandoned', label: 'Left the bot' },
    { id: 'completed', label: 'Bot completed' },
];

/** Re-render every 30 s so the waiting timers and rings move. */
export function useNow(every = 30_000): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), every);

        return () => clearInterval(id);
    }, [every]);

    return now;
}

export type ChipTone = 'grey' | 'brand' | 'warn' | 'bad' | 'info' | 'good' | 'dark';
const CHIP_TONES: Record<ChipTone, string> = {
    grey: 'border-border bg-muted text-ink-2',
    brand: 'border-brand-500/30 bg-brand-50 text-brand-600',
    warn: 'border-warn/30 bg-warn-bg text-warn',
    bad: 'border-bad/30 bg-bad-bg text-bad',
    info: 'border-info/25 bg-info-bg text-info',
    good: 'border-good/30 bg-good-bg text-good',
    dark: 'border-transparent bg-foreground text-background',
};

/** A status chip: 22px, fully rounded, soft background with a matching border. */
export function Chip({ tone = 'grey', children, title, className }: { tone?: ChipTone; children: React.ReactNode; title?: string; className?: string }) {
    return (
        <span
            title={title}
            className={cn(
                'inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-semibold whitespace-nowrap tabular-nums [&>svg]:size-3',
                CHIP_TONES[tone],
                className,
            )}
        >
            {children}
        </span>
    );
}

/** The window chip: brand "18h left", amber "Closes in 3h", red under 2h, grey "Template only". */
export function WindowChip({ conversation: c, now, big = false }: { conversation: Conversation; now: number; big?: boolean }) {
    const t = windowTier(c.window?.expires_at, now, true);
    if (t === 'none') return null;
    if (t === 'closed')
        return (
            <Chip>
                <FileTextIcon /> {big ? 'Window closed · Template only' : 'Template only'}
            </Chip>
        );
    const left = dur(windowLeft(c.window.expires_at, now), big);
    if (t === 'critical')
        return (
            <Chip tone="bad">
                <TriangleAlertIcon /> Closes in {left}
            </Chip>
        );
    if (t === 'soon')
        return (
            <Chip tone="warn">
                <ClockIcon /> Closes in {left}
            </Chip>
        );

    return (
        <Chip tone="brand">
            <span className="size-1.5 rounded-full bg-current" aria-hidden /> {big ? `Window open · ${left} left` : `${left} left`}
        </Chip>
    );
}

/** Exactly one status chip, chosen by the chat's state; an overdue follow-up is its own chip. */
function CardChips({ c, now, fetchedAt }: { c: Conversation; now: number; fetchedAt: number }) {
    const state = c.status === 'closed' ? 'resolved' : c.snoozed_until ? 'snoozed' : c.state === 'needs_reply' ? 'needs' : 'waiting';
    const over =
        (c.next_step?.overdue ?? 0) > 0 && state !== 'resolved' ? (
            <Chip tone="bad">
                <ClockIcon /> Follow-up overdue
            </Chip>
        ) : null;
    if (state === 'needs')
        return (
            <>
                <WindowChip conversation={c} now={now} />
                {c.promise ? (
                    <WaitClock conversation={c} fetchedAt={fetchedAt} now={now} />
                ) : (
                    c.needs_reply_since && <Chip>Waiting {dur(now - new Date(c.needs_reply_since).getTime())}</Chip>
                )}
                {over}
            </>
        );
    if (state === 'waiting') {
        if (over)
            return (
                <>
                    <Chip tone="info">
                        <CornerUpLeftIcon /> Replied · waiting for customer
                    </Chip>
                    {over}
                </>
            );
        if (c.next_step)
            return (
                <Chip tone="info">
                    <ClockIcon /> {c.next_step.type_label} {fmtDay(c.next_step.due_at, now)}
                </Chip>
            );

        return (
            <Chip tone="info">
                <CornerUpLeftIcon /> Replied · waiting for customer
            </Chip>
        );
    }
    if (state === 'snoozed')
        return (
            <>
                <Chip tone="info">
                    <MoonIcon /> Until {fmtTime(c.snoozed_until as string)}
                </Chip>
                {over}
            </>
        );

    return (
        <Chip>
            <CheckIcon /> {c.resolution?.reason_label ?? 'Resolved'}
            {c.resolution?.resolved_by ? ` · ${c.resolution.resolved_by.name.split(' ')[0]}` : ''}
        </Chip>
    );
}

export function ConversationList({
    phoneNumberId,
    selectedId,
    selectedClosure,
    onSelect,
    polling,
    onOrder,
    searchRef,
    onViewChange,
}: {
    phoneNumberId: string | null;
    selectedId: string | null;
    /** Opened from a Resolved row: that closure's id. */
    selectedClosure: string | null;
    onSelect: (conversationId: string, closureId?: string | null) => void;
    polling: boolean;
    /** The ids in the order shown, for J / K. */
    onOrder?: (ids: string[]) => void;
    searchRef?: React.Ref<HTMLInputElement>;
    onViewChange?: (v: InboxView) => void;
}) {
    const params = useSearchParams();
    const [view, setView] = useState<InboxView>(() => {
        const t = params.get('tab') ?? '';

        return TABS.some((x) => x.id === t) ? (t as InboxView) : (LEGACY[t] ?? 'needs');
    });
    const [only, setOnly] = useState<'me' | 'unassigned' | null>(() => {
        const a = params.get('assigned');

        return params.get('tab') === 'needs_reply' && (a === 'me' || a === 'unassigned') ? a : null;
    });
    const [sort, setSort] = useState<Sort>('priority');
    const [filters, setFilters] = useState<Filters>(() => ({
        ...NO_FILTERS,
        afterHours: params.get('after_hours') === '1',
        // The Action Centre's "closing within 2 h" tile opens this view.
        window: params.get('window') === 'closing' ? 'closing' : NO_FILTERS.window,
    }));
    const [panel, setPanel] = useState(false);
    const [search, setSearch] = useState('');
    const [q, setQ] = useState('');
    // Wait badges move on every 15 seconds without reloading the list.
    const now = useNow(15_000);
    const counts = useConversationCounts(phoneNumberId, polling ? 15_000 : false).data;
    const teams = useInboxTeams();
    const tags = useTags(panel);

    useEffect(() => {
        const t = setTimeout(() => setQ(search.trim()), 200);

        return () => clearTimeout(t);
    }, [search]);
    useEffect(() => onViewChange?.(view), [view, onViewChange]);

    const activeFilters =
        Number(filters.window !== 'any') +
        Number(filters.unread) +
        Number(filters.followup) +
        Number(!!filters.tag) +
        Number(filters.afterHours) +
        Number(filters.snoozed) +
        Number(filters.team !== 'all') +
        Number(filters.bot !== 'all');

    const resolvedView = view === 'resolved' && !q;
    const noNumber = useNoNumber();
    const list = useConversations(
        {
            phone_number_id: phoneNumberId,
            sort,
            q: q || undefined,
            status: view === 'resolved' ? 'closed' : 'open',
            state: view === 'needs' ? 'needs_reply' : undefined,
            assigned: view === 'mine' ? 'me' : view === 'unassigned' ? 'unassigned' : view === 'needs' && only ? only : 'any',
            include_snoozed: view !== 'needs' && !filters.snoozed,
            snoozed: filters.snoozed || undefined,
            window: filters.window === 'any' ? undefined : filters.window,
            unread: filters.unread,
            followup: filters.followup,
            tag: filters.tag || undefined,
            after_hours: filters.afterHours || undefined,
            team: filters.team === 'all' ? undefined : filters.team,
            view: filters.bot === 'all' ? undefined : (filters.bot as ConversationFilters['view']),
        },
        polling ? 15_000 : false,
        !resolvedView,
    );
    // An empty view: does the workspace have any chat at all ("No chats yet" vs "Everyone has a reply")?
    const listEmpty = !!list.data && list.data.pages.every((p) => p.data.length === 0);
    const anyChat = useConversations({ sort: 'newest', include_snoozed: true, assigned: 'any' }, false, listEmpty && !q && !activeFilters);
    // Pages are read by position while the order changes (a new message moves a chat up): a chat can
    // come back on the next page, so each one is listed once.
    const rows = useMemo(() => {
        const seen = new Set<string>();

        return (list.data?.pages.flatMap((p) => p.data) ?? []).filter((c) => !seen.has(c.id) && !!seen.add(c.id));
    }, [list.data]);

    // Phones: swipe right takes an unassigned chat, swipe left resolves it; both can be undone for 5
    // seconds. A teammate's chat is never taken by a swipe: it is reassigned from inside the chat.
    const qc = useQueryClient();
    const { can, membership } = useSession();
    const reload = () => qc.invalidateQueries({ queryKey: keys.conversationsAll });
    const swipeAction = async (done: string, act: () => Promise<unknown>, undo: () => Promise<unknown>) => {
        try {
            await act();
            buzz(HAPTIC.threshold);
            void reload();
            undoToast(done, async () => {
                await undo().catch((e) => toast.error(errorMessage(e)));
                void reload();
            });
        } catch (e) {
            buzz(HAPTIC.error);
            toast.error(errorMessage(e));
            void reload(); // e.g. a teammate took it first: show who has it now
        }
    };
    const take = can(P.InboxAssign)
        ? (c: Conversation) =>
              swipeAction(
                  `${c.contact?.display_name ?? 'Chat'} assigned to you`,
                  () => assignConversation(c.id, membership.id, c.assigned_membership_id),
                  // Undo only while it is still yours.
                  () => assignConversation(c.id, c.assigned_membership_id, membership.id),
              )
        : undefined;
    const resolve = can(P.InboxReply)
        ? (c: Conversation) =>
              swipeAction(
                  `${c.contact?.display_name ?? 'Chat'} resolved`,
                  () => resolveConversation(c.id, 'resolved'),
                  () => undoResolve(c.id),
              )
        : undefined;
    useEffect(() => {
        if (!resolvedView) onOrder?.(rows.map((r) => r.id));
    }, [rows, resolvedView, onOrder]);

    // Motion (3.5): rows glide to their new place within the same view; a new customer message tints its
    // row once. Nothing loops; with reduce motion on, every change is instant.
    const ul = useRef<HTMLUListElement>(null);
    const tops = useRef(new Map<string, number>());
    const seenIn = useRef(new Map<string, string>());
    const { pull, refreshing } = usePullToRefresh(ul, () =>
        Promise.all([list.refetch(), qc.invalidateQueries({ queryKey: [...keys.conversationsAll, 'counts'] })]).then(() => toast.success('Updated')),
    );
    const viewKey = `${view}|${q}|${sort}|${JSON.stringify(filters)}|${only}`;
    const lastKey = useRef(viewKey);
    useLayoutEffect(() => {
        const el = ul.current;
        if (!el) return;
        const same = lastKey.current === viewKey;
        lastKey.current = viewKey;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const next = new Map<string, number>();
        el.querySelectorAll<HTMLElement>('[data-row]').forEach((row) => {
            const id = row.dataset.row as string;
            next.set(id, row.offsetTop);
            const before = tops.current.get(id);
            if (same && !reduce && before !== undefined && Math.abs(before - row.offsetTop) > 1)
                row.animate([{ transform: `translateY(${before - row.offsetTop}px)` }, { transform: 'none' }], {
                    duration: 180,
                    easing: 'cubic-bezier(.2,.8,.2,1)',
                });
        });
        tops.current = next;
        for (const c of rows) {
            const mark = c.last_message_direction === 'inbound' ? (c.last_message_at ?? '') : '';
            const was = seenIn.current.get(c.id);
            if (was !== undefined && mark && was !== mark && c.id !== selectedId && !reduce) {
                el.querySelector<HTMLElement>(`[data-row="${c.id}"] > button`)?.animate(
                    [{ backgroundColor: 'var(--brand-100)' }, { backgroundColor: 'var(--card)' }],
                    {
                        duration: 1400,
                        easing: 'cubic-bezier(.2,.8,.2,1)',
                    },
                );
            }
            seenIn.current.set(c.id, mark);
        }
    }, [rows, viewKey, selectedId]);

    const tabCounts: Partial<Record<InboxView, number>> = {
        needs: counts?.needs_reply ?? 0,
        mine: counts?.needs_reply_mine ?? 0,
        unassigned: counts?.needs_reply_unassigned ?? 0,
    };

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r bg-card">
            <div className="grid gap-2 px-4 pb-2">
                <label className="relative block">
                    <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-[15px] -translate-y-1/2 text-faint" />
                    <input
                        ref={searchRef}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                                setSearch('');
                                e.currentTarget.blur();
                            }
                        }}
                        placeholder="Search name, number or message"
                        aria-label="Search conversations"
                        className="h-8 w-full rounded-md border border-input bg-card pr-14 pl-8 text-[13px] outline-none placeholder:text-faint focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
                    />
                    <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border bg-muted px-1.5 font-sans text-[11px] text-muted-foreground">
                        ⌘K
                    </kbd>
                </label>
            </div>
            <TabStrip
                view={view}
                onView={(v) => {
                    setView(v);
                    setOnly(null);
                    setSearch('');
                }}
                counts={tabCounts}
            />
            {view !== 'resolved' && (
                <div className="flex items-center gap-1.5 border-b px-4 py-2">
                    <button
                        type="button"
                        onClick={() => setPanel((p) => !p)}
                        aria-expanded={panel}
                        className={cn(
                            'inline-flex h-[26px] items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-semibold transition-colors duration-150 motion-reduce:transition-none',
                            panel || activeFilters ? 'border-brand-500/40 bg-brand-50 text-brand-600' : 'text-ink-2 hover:bg-muted',
                        )}
                    >
                        <ListFilterIcon className="size-[15px]" /> Filters
                        {activeFilters > 0 && <span className="tabular-nums">· {activeFilters}</span>}
                    </button>
                    {view === 'needs' && only && (
                        <button
                            type="button"
                            onClick={() => setOnly(null)}
                            className="inline-flex h-[26px] items-center gap-1 rounded-full border border-brand-500/40 bg-brand-50 px-2.5 text-[12px] font-semibold text-brand-600"
                        >
                            {only === 'me' ? 'Mine only' : 'Unassigned only'} ×
                        </button>
                    )}
                    <span className="flex-1" />
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className="inline-flex h-[26px] items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-semibold text-ink-2 hover:bg-muted"
                            >
                                <ArrowDownUpIcon className="size-[15px]" /> {SORTS.find((s) => s.id === sort)?.label}
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64">
                            <DropdownMenuLabel className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Sort</DropdownMenuLabel>
                            {SORTS.map((s) => (
                                <DropdownMenuItem key={s.id} onSelect={() => setSort(s.id)} className="gap-2">
                                    <CheckIcon className={cn('size-4', sort !== s.id && 'invisible')} />
                                    <span className="flex-1">{s.label}</span>
                                    {s.hint && <span className="text-[11px] text-muted-foreground">{s.hint}</span>}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            )}
            {panel && view !== 'resolved' && (
                <div className="grid gap-2 border-b bg-muted/40 px-4 py-3 text-[13px]">
                    <div className="flex items-center gap-2">
                        <span className="w-12 text-muted-foreground">Window</span>
                        <Segmented
                            value={filters.window}
                            options={[
                                ['any', 'Any'],
                                ['open', 'Open'],
                                ['closing', 'Closing'],
                                ['closed', 'Closed'],
                            ]}
                            onChange={(v) => setFilters((f) => ({ ...f, window: v as Filters['window'] }))}
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="w-12 text-muted-foreground">Show</span>
                        <Toggle on={filters.unread} onClick={() => setFilters((f) => ({ ...f, unread: !f.unread }))}>
                            Unread
                        </Toggle>
                        <Toggle on={filters.followup} onClick={() => setFilters((f) => ({ ...f, followup: !f.followup }))}>
                            Has follow-up
                        </Toggle>
                        <Toggle on={filters.afterHours} onClick={() => setFilters((f) => ({ ...f, afterHours: !f.afterHours }))}>
                            <MoonIcon className="size-3" /> After hours
                            {(counts?.after_hours ?? 0) > 0 && <span className="tabular-nums">· {counts?.after_hours}</span>}
                        </Toggle>
                        <Toggle on={filters.snoozed} onClick={() => setFilters((f) => ({ ...f, snoozed: !f.snoozed }))}>
                            Snoozed only
                        </Toggle>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="w-12 text-muted-foreground">Tag</span>
                        <Select value={filters.tag || 'any'} onValueChange={(v) => setFilters((f) => ({ ...f, tag: v === 'any' ? '' : v }))}>
                            <SelectTrigger size="sm" className="w-36" aria-label="Tag">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="any">Any tag</SelectItem>
                                {(tags.data ?? []).map((t) => (
                                    <SelectItem key={t.name} value={t.name}>
                                        {t.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={filters.bot} onValueChange={(v) => setFilters((f) => ({ ...f, bot: v }))}>
                            <SelectTrigger size="sm" className="w-36" aria-label="Chatbot">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {BOT_VIEWS.map((b) => (
                                    <SelectItem key={b.id} value={b.id}>
                                        {b.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {(teams.data ?? []).length > 0 && (
                            <Select value={filters.team} onValueChange={(v) => setFilters((f) => ({ ...f, team: v }))}>
                                <SelectTrigger size="sm" className="w-32" aria-label="Team">
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
                        {activeFilters > 0 && (
                            <button
                                type="button"
                                onClick={() => setFilters(NO_FILTERS)}
                                className="ml-auto text-[12px] font-semibold text-brand-600 hover:underline"
                            >
                                Clear all
                            </button>
                        )}
                    </div>
                </div>
            )}

            {resolvedView ? (
                <ResolvedList phoneNumberId={phoneNumberId} selectedClosure={selectedClosure} onOpen={onSelect} polling={polling} now={now} />
            ) : (
                <ul ref={ul} className="relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain" role="listbox" aria-label="Conversations">
                    {(pull > 0 || refreshing) && (
                        <li aria-hidden className="flex items-end justify-center overflow-hidden text-[12px] text-muted-foreground" style={{ height: pull }}>
                            <span className="pb-2">{refreshing ? 'Updating…' : pull >= 56 ? 'Release to update' : 'Pull to update'}</span>
                        </li>
                    )}
                    {q && (
                        <li className="border-b bg-muted/50 px-4 py-1.5 text-[11px] text-muted-foreground">
                            Searching all chats, every queue and resolved · {rows.length}
                            {list.hasNextPage ? '+' : ''} found
                        </li>
                    )}
                    {list.isLoading &&
                        [0, 1, 2, 3, 4].map((i) => (
                            <li key={i} className="flex gap-3 border-b border-line-2 px-4 py-3">
                                <Skeleton className="size-10 rounded-full" />
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-3.5 w-1/2" />
                                    <Skeleton className="h-3 w-3/4" />
                                </div>
                            </li>
                        ))}
                    {/* Five honest states (audit APP-026): no number, nothing yet, all done, filtered to zero, failed. */}
                    {!list.isLoading && rows.length === 0 && (
                        <li className="px-6 py-14 text-center text-[13px] text-muted-foreground">
                            {list.isError ? (
                                <>
                                    <b className="block font-semibold text-foreground">Couldn’t load the chats.</b>
                                    <Button variant="outline" size="sm" className="mt-3" onClick={() => void list.refetch()}>
                                        Try again
                                    </Button>
                                </>
                            ) : noNumber ? (
                                <ConnectPrompt purpose="start receiving chats" className="text-left" />
                            ) : q || activeFilters ? (
                                <>
                                    <b className="block font-semibold text-foreground">No chats match {q ? 'this search' : 'these filters'}.</b>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="mt-3"
                                        onClick={() => {
                                            setFilters(NO_FILTERS);
                                            setSearch('');
                                        }}
                                    >
                                        Clear {q ? 'search' : 'filters'}
                                    </Button>
                                </>
                            ) : anyChat.isLoading ? null : !anyChat.data?.pages[0]?.data.length ? (
                                <>
                                    <b className="block font-semibold text-foreground">No chats yet.</b>They’ll appear here when a customer messages you.
                                </>
                            ) : view === 'needs' ? (
                                <>
                                    <b className="block font-semibold text-foreground">Everyone has a reply. 🎉</b>New messages from customers land here first.
                                </>
                            ) : (
                                <>
                                    <b className="block font-semibold text-foreground">Nothing here right now.</b>Try another view.
                                </>
                            )}
                        </li>
                    )}
                    {rows.map((c, i) => (
                        <Fragment key={c.id}>
                            {sort === 'priority' &&
                                groupOf(c, now) !== (i > 0 ? groupOf(rows[i - 1]!, now) : null) &&
                                rows.some((r) => groupOf(r, now) !== 'rest') && (
                                    <li className="sticky top-0 z-[1] border-b bg-muted/95 px-4 py-1.5 text-[11.5px] font-bold tracking-[0.06em] text-muted-foreground uppercase backdrop-blur">
                                        {GROUP_LABEL[groupOf(c, now)]}
                                    </li>
                                )}
                            <QueueCard
                                c={c}
                                now={now}
                                fetchedAt={list.dataUpdatedAt}
                                selected={c.id === selectedId}
                                onSelect={() => onSelect(c.id)}
                                showNumber={!phoneNumberId}
                                onTake={take && c.assigned_membership_id === null ? () => take(c) : undefined}
                                onResolve={resolve && c.status !== 'closed' ? () => resolve(c) : undefined}
                            />
                        </Fragment>
                    ))}
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

function QueueCard({
    c,
    now,
    fetchedAt,
    selected,
    onSelect,
    showNumber,
    onTake,
    onResolve,
}: {
    c: Conversation;
    now: number;
    fetchedAt: number;
    selected: boolean;
    onSelect: () => void;
    showNumber: boolean;
    onTake?: () => void;
    onResolve?: () => void;
}) {
    const name = c.contact?.display_name ?? 'WhatsApp user';
    // Touch swipe: right reveals "Assign to me", left "Resolve"; past 80 px it vibrates and commits on release.
    const [dx, setDx] = useState(0);
    const swipe = useRef<{ x: number; y: number; axis: 'x' | 'y' | null; armed: boolean } | null>(null);
    const moved = useRef(false);
    const COMMIT = 80;
    const onTouchStart = (e: React.TouchEvent) => {
        const t = e.touches[0];
        if (!t || (!onTake && !onResolve)) return;
        swipe.current = { x: t.clientX, y: t.clientY, axis: null, armed: false };
        moved.current = false;
    };
    const onTouchMove = (e: React.TouchEvent) => {
        const s = swipe.current;
        const t = e.touches[0];
        if (!s || !t) return;
        const mx = t.clientX - s.x;
        const my = t.clientY - s.y;
        s.axis ??= Math.abs(mx) > 8 || Math.abs(my) > 8 ? (Math.abs(mx) > Math.abs(my) ? 'x' : 'y') : null;
        if (s.axis !== 'x') return;
        moved.current = true;
        const allowed = (mx > 0 && onTake) || (mx < 0 && onResolve) ? mx : 0;
        const next = Math.max(-140, Math.min(140, allowed));
        if (Math.abs(next) >= COMMIT && !s.armed) {
            s.armed = true;
            buzz(HAPTIC.threshold);
        } else if (Math.abs(next) < COMMIT) s.armed = false;
        setDx(next);
    };
    const onTouchEnd = () => {
        const commit = dx;
        swipe.current = null;
        setDx(0);
        if (commit >= COMMIT) onTake?.();
        else if (commit <= -COMMIT) onResolve?.();
    };
    const who = c.last_message_by && c.last_message_by.kind !== 'customer' ? (c.last_message_by.name ?? 'Auto') : null;
    const unread = c.unread_count > 0;

    return (
        <li data-row={c.id} role="option" aria-selected={selected} className="relative overflow-hidden">
            {dx !== 0 && (
                <span
                    aria-hidden
                    className={cn(
                        'absolute inset-0 flex items-center px-5 text-[13px] font-semibold text-white',
                        dx > 0 ? 'justify-start bg-info' : 'justify-end bg-good',
                    )}
                >
                    {dx > 0 ? 'Assign to me' : 'Resolve'}
                </span>
            )}
            <button
                type="button"
                onClick={() => !moved.current && onSelect()}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                onTouchCancel={() => {
                    swipe.current = null;
                    setDx(0);
                }}
                style={dx !== 0 ? { transform: `translateX(${dx}px)`, transition: 'none' } : undefined}
                className={cn(
                    'relative flex w-full gap-3 border-b border-line-2 bg-card px-4 py-3 text-left transition-[background-color,transform] duration-150 hover:bg-[#f5f5f4] motion-reduce:transition-none',
                    selected &&
                        'bg-brand-50 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-brand-500 hover:bg-brand-50',
                )}
            >
                <RingAvatar
                    name={name}
                    expiresAt={c.window?.expires_at}
                    hasChat={!!c.contact?.last_inbound_at || !!c.window?.expires_at}
                    className="size-10 text-[13px]"
                    now={now}
                />
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" dir="auto">
                            {name}
                        </span>
                        {c.handler === 'bot' && <BotIcon className="size-[15px] shrink-0 text-info" aria-label="A chatbot is answering" />}
                        {c.state === 'needs_reply' && c.after_hours && (
                            <MoonIcon className="size-[15px] shrink-0 text-muted-foreground" aria-label="Arrived after hours" />
                        )}
                        {unread && <span className="size-2 shrink-0 rounded-full bg-[#25a55f]" title="Unread" aria-label="Unread" />}
                        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{fmtListTime(c.last_message_at, now)}</span>
                    </span>
                    <span className={cn('mt-0.5 block truncate text-[13px]', unread ? 'font-semibold text-foreground' : 'text-muted-foreground')} dir="auto">
                        {who && <span className="font-semibold">{who}: </span>}
                        {c.last_message_preview}
                    </span>
                    <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1">
                        <CardChips c={c} now={now} fetchedAt={fetchedAt} />
                        <span className="flex-1" />
                        <OwnerAvatar name={c.assigned_name} />
                    </span>
                    {showNumber && c.phone_number && (
                        <span className="mt-1 block truncate text-[11px] text-faint">
                            via {c.phone_number.verified_name ?? c.phone_number.display_phone_number}
                            {c.phone_number.status === 'disconnected' ? ' · disconnected' : ''}
                        </span>
                    )}
                </span>
            </button>
        </li>
    );
}

function Segmented({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (v: string) => void }) {
    return (
        <span className="inline-flex rounded-md border bg-card p-0.5">
            {options.map(([v, l]) => (
                <button
                    key={v}
                    type="button"
                    aria-pressed={value === v}
                    onClick={() => onChange(v)}
                    className={cn(
                        'h-[24px] rounded px-2.5 text-[12px] font-semibold',
                        value === v ? 'bg-primary text-primary-foreground' : 'text-ink-2 hover:bg-muted',
                    )}
                >
                    {l}
                </button>
            ))}
        </span>
    );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            aria-pressed={on}
            onClick={onClick}
            className={cn(
                'inline-flex h-[26px] items-center gap-1 rounded-full border px-2.5 text-[12px] font-semibold',
                on ? 'border-brand-500/40 bg-brand-50 text-brand-600' : 'bg-card text-ink-2 hover:bg-muted',
            )}
        >
            {children}
        </button>
    );
}

/**
 * The five tabs in one row. A narrow list scrolls the row sideways (the mouse wheel scrolls it too), a fade
 * on the right edge says there is more, and the selected tab is always scrolled into view. The selected tab
 * is solid brand with a white count bubble; a count always means work to do.
 */
function TabStrip({ view, onView, counts }: { view: InboxView; onView: (v: InboxView) => void; counts: Partial<Record<InboxView, number>> }) {
    const row = useRef<HTMLDivElement>(null);
    const [end, setEnd] = useState(true);
    const measure = () => {
        const el = row.current;
        if (el) setEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
    };
    useLayoutEffect(() => {
        const el = row.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2));
        ro.observe(el);
        const wheel = (e: WheelEvent) => {
            if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
            e.preventDefault();
            el.scrollLeft += e.deltaY;
        };
        el.addEventListener('wheel', wheel, { passive: false });

        return () => {
            ro.disconnect();
            el.removeEventListener('wheel', wheel);
        };
    }, []);
    useEffect(() => {
        row.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, [view]);

    return (
        <div className="relative min-w-0 border-b">
            <div
                ref={row}
                role="tablist"
                aria-label="Inbox views"
                onScroll={measure}
                className="flex [scrollbar-width:none] gap-1 overflow-x-auto px-4 pb-2 [&::-webkit-scrollbar]:hidden"
                onKeyDown={(e) => {
                    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                    const i = TABS.findIndex((t) => t.id === view);
                    onView(TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length].id);
                    requestAnimationFrame(() => row.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
                }}
            >
                {TABS.map((t) => {
                    const on = view === t.id;
                    const n = counts[t.id];

                    return (
                        <button
                            key={t.id}
                            type="button"
                            role="tab"
                            aria-selected={on}
                            tabIndex={on ? 0 : -1}
                            onClick={() => onView(t.id)}
                            className={cn(
                                'inline-flex h-[26px] shrink-0 items-center gap-1 rounded-full px-[9px] text-[12px] font-semibold whitespace-nowrap transition-colors duration-150 motion-reduce:transition-none',
                                on ? 'bg-primary text-primary-foreground' : 'text-ink-2 hover:bg-muted',
                            )}
                        >
                            {t.label}
                            {n !== undefined && n > 0 && (
                                <span
                                    className={cn(
                                        'rounded-full px-1.5 text-[11px] leading-4 tabular-nums',
                                        on ? 'bg-white text-foreground' : 'bg-muted text-ink-2',
                                    )}
                                >
                                    {n}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
            {!end && <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent" />}
        </div>
    );
}
