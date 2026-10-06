'use client';

import { InboxIcon, SearchIcon } from 'lucide-react';
import { useState } from 'react';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { shortTime } from '@/lib/format';
import { type ConversationFilters, useConversations } from '@/lib/queries';
import type { Conversation } from '@/lib/types';
import { cn } from '@/lib/utils';

const TABS: { id: NonNullable<ConversationFilters['assigned']>; label: string }[] = [
    { id: 'any', label: 'All' },
    { id: 'me', label: 'Mine' },
    { id: 'unassigned', label: 'Unassigned' },
];

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
    const [assigned, setAssigned] = useState<NonNullable<ConversationFilters['assigned']>>('any');
    const [status, setStatus] = useState<'open' | 'closed'>('open');
    const [unread, setUnread] = useState(false);
    const [snoozed, setSnoozed] = useState(false);
    const [search, setSearch] = useState('');
    const [q, setQ] = useState('');

    // Without websockets the list is kept fresh by polling.
    const list = useConversations(
        { phone_number_id: phoneNumberId, assigned, status, unread, snoozed: snoozed || undefined, q: q || undefined },
        polling ? 15_000 : false,
    );
    const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r bg-card">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 border-b p-3">
                <form
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
                <div className="flex flex-wrap items-center gap-1">
                    {TABS.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setAssigned(t.id)}
                            className={cn(
                                'rounded-md px-2.5 py-1 text-[12.5px] font-semibold',
                                assigned === t.id ? 'bg-brand-50 text-brand-600' : 'text-muted-foreground hover:bg-muted',
                            )}
                        >
                            {t.label}
                        </button>
                    ))}
                    <button
                        onClick={() => setUnread((u) => !u)}
                        className={cn(
                            'rounded-md px-2.5 py-1 text-[12.5px] font-semibold',
                            unread ? 'bg-brand-50 text-brand-600' : 'text-muted-foreground hover:bg-muted',
                        )}
                        aria-pressed={unread}
                    >
                        Unread
                    </button>
                    <button
                        onClick={() => setSnoozed((v) => !v)}
                        className={cn(
                            'rounded-md px-2.5 py-1 text-[12.5px] font-semibold',
                            snoozed ? 'bg-brand-50 text-brand-600' : 'text-muted-foreground hover:bg-muted',
                        )}
                        aria-pressed={snoozed}
                    >
                        Snoozed
                    </button>
                    <Select value={status} onValueChange={(v) => setStatus(v as 'open' | 'closed')}>
                        <SelectTrigger size="sm" className="ml-auto w-24 shrink-0" aria-label="Status">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

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
                        {q || unread || snoozed || assigned !== 'any'
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
                                    'flex w-full gap-3 border-b border-line-2 px-3 py-2.5 text-left hover:bg-muted/60',
                                    selectedId === c.id && 'bg-brand-50 hover:bg-brand-50',
                                )}
                            >
                                <Avatar name={name} className="size-10 text-[13px]" />
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-baseline gap-2">
                                        <span className={cn('min-w-0 flex-1 truncate text-[14px]', c.unread_count > 0 ? 'font-bold' : 'font-semibold')}>
                                            {name}
                                        </span>
                                        <span
                                            className={cn('shrink-0 text-[11.5px]', c.unread_count > 0 ? 'font-semibold text-good' : 'text-muted-foreground')}
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
        </div>
    );
}
