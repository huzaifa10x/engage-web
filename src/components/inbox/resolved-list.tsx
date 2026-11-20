'use client';

import { FlagIcon, RotateCcwIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Chip } from '@/components/inbox/conversation-list';
import { OwnerAvatar, RingAvatar } from '@/components/inbox/window-ring';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtDay, fmtListTime, fmtWhen, REASONS } from '@/lib/inbox';
import { useResolutions } from '@/lib/queries';
import type { ResolutionReason } from '@/lib/types';
import { cn } from '@/lib/utils';

const PERIODS = [
    { id: '1', label: 'Today' },
    { id: '7', label: 'Last 7 days' },
    { id: '30', label: 'Last 30 days' },
    { id: '90', label: 'Last 90 days' },
    { id: '0', label: 'All time' },
];

/**
 * Inbox › Resolved (3.5): one row per closure, newest first, visible to everyone. Each row is its own
 * closure (its own id), so clicking a row highlights only that row and the chat shows that closure, even if
 * it was reopened or closed again since. Opening a chat here never changes its status.
 */
export function ResolvedList({
    phoneNumberId,
    selectedClosure,
    onOpen,
    polling,
    now,
}: {
    phoneNumberId: string | null;
    selectedClosure: string | null;
    onOpen: (conversationId: string, closureId?: string | null) => void;
    polling: boolean;
    now: number;
}) {
    const [reason, setReason] = useState<'all' | ResolutionReason>('all');
    const [agent, setAgent] = useState('all');
    const [days, setDays] = useState('7');
    const list = useResolutions(
        { phone_number_id: phoneNumberId, reason: reason === 'all' ? null : reason, agent: agent === 'all' ? null : agent, days: Number(days) },
        polling ? 30_000 : false,
    );
    const rows = useMemo(() => list.data ?? [], [list.data]);
    const people = useMemo(() => {
        const m = new Map<string, string>();
        for (const r of rows) if (r.resolved_by) m.set(r.resolved_by.id, r.resolved_by.name.split(' ')[0]);

        return [...m];
    }, [rows]);

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="grid grid-cols-3 gap-1.5 border-b px-4 py-2">
                <Select value={agent} onValueChange={setAgent}>
                    <SelectTrigger size="sm" className="w-full min-w-0" aria-label="Agent">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All agents</SelectItem>
                        {people.map(([id, name]) => (
                            <SelectItem key={id} value={id}>
                                {name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={reason} onValueChange={(v) => setReason(v as typeof reason)}>
                    <SelectTrigger size="sm" className="w-full min-w-0" aria-label="Reason">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All reasons</SelectItem>
                        {REASONS.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                                {r.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={days} onValueChange={setDays}>
                    <SelectTrigger size="sm" className="w-full min-w-0" aria-label="Period">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {PERIODS.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                                {p.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto" role="listbox" aria-label="Resolved chats">
                {list.isLoading &&
                    [0, 1, 2, 3].map((i) => (
                        <li key={i} className="flex gap-3 border-b border-line-2 px-4 py-3">
                            <Skeleton className="size-10 rounded-full" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-3.5 w-1/2" />
                                <Skeleton className="h-3 w-3/4" />
                            </div>
                        </li>
                    ))}
                {!list.isLoading && rows.length === 0 && (
                    <li className="px-6 py-14 text-center text-[13px] text-muted-foreground">
                        <b className="block font-semibold text-foreground">No closures match</b>Try a longer period or another agent.
                    </li>
                )}
                {rows.map((r) => {
                    const name = r.contact?.display_name ?? 'WhatsApp user';
                    const expires = r.contact?.last_inbound_at ? new Date(new Date(r.contact.last_inbound_at).getTime() + 86_400_000).toISOString() : null;
                    const on = selectedClosure === r.id;
                    const by = r.resolved_by?.name.split(' ')[0] ?? 'the chatbot';

                    return (
                        <li key={r.id} data-closure={r.id} role="option" aria-selected={on}>
                            <button
                                type="button"
                                onClick={() => onOpen(r.conversation_id, r.id)}
                                className={cn(
                                    'relative flex w-full gap-3 border-b border-line-2 bg-card px-4 py-3 text-left transition-colors duration-150 hover:bg-[#f5f5f4] motion-reduce:transition-none',
                                    on &&
                                        'bg-brand-50 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-brand-500 hover:bg-brand-50',
                                )}
                            >
                                <RingAvatar name={name} expiresAt={expires} hasChat={!!r.contact?.last_inbound_at} className="size-10 text-[13px]" now={now} />
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-2">
                                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" dir="auto">
                                            {name}
                                        </span>
                                        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{fmtListTime(r.resolved_at, now)}</span>
                                    </span>
                                    <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                                        Resolved by <b className="font-semibold text-ink-2">{by}</b> · {fmtWhen(r.resolved_at, now)}
                                    </span>
                                    <span className="mt-1.5 flex flex-wrap items-center gap-1">
                                        <Chip tone={r.reason === 'not_lead' ? 'warn' : 'grey'}>{r.reason_label}</Chip>
                                        {r.reopened_at && (
                                            <Chip tone="info">
                                                <RotateCcwIcon /> {r.reopen_how === 'flag' ? 'Flagged & reopened' : 'Reopened'} {fmtDay(r.reopened_at, now)}
                                            </Chip>
                                        )}
                                        {r.flag && (
                                            <Chip tone="bad">
                                                <FlagIcon /> Flagged
                                            </Chip>
                                        )}
                                        <span className="flex-1" />
                                        <OwnerAvatar name={r.resolved_by?.name} />
                                    </span>
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
