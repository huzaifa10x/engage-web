'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangleIcon, AtSignIcon, BellIcon, ClockIcon, MessageCircleIcon, UserPlusIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { LargeTitle, Row, RowCard, SectionLabel, Segmented } from '@/components/mobile/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { readNotifications, useNotifications } from '@/lib/queries';
import { cn } from '@/lib/utils';

const ICON: Record<string, typeof BellIcon> = {
    assigned: UserPlusIcon,
    reassigned: UserPlusIcon,
    mention: AtSignIcon,
    reply_overdue: ClockIcon,
    reply_escalated: ClockIcon,
    window_closing: ClockIcon,
    snooze_ended: ClockIcon,
    channel_disconnected: AlertTriangleIcon,
    number_quality: AlertTriangleIcon,
};

const ago = (iso: string | null) => {
    if (!iso) return '';
    const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
    if (m < 1) return 'now';
    if (m < 60) return `${m}m`;
    if (m < 1440) return `${Math.round(m / 60)}h`;

    return `${Math.round(m / 1440)}d`;
};

/**
 * Notifications (mobile prototype): every alert the app sends, kept 30 days. All / Unread, grouped
 * Today and Earlier, Mark all read; chats waiting for you on top. Tapping opens the exact chat or
 * screen. The header bell shows the same list on a computer.
 */
export default function NotificationsPage() {
    const qc = useQueryClient();
    const feed = useNotifications();
    const [view, setView] = useState<'all' | 'unread'>('all');
    const d = feed.data;
    const items = (d?.items ?? []).filter((n) => view === 'all' || !n.read);
    const today = new Date().setHours(0, 0, 0, 0);
    const groups: [string, typeof items][] = [
        ['Today', items.filter((n) => n.created_at && new Date(n.created_at).getTime() >= today)],
        ['Earlier', items.filter((n) => !n.created_at || new Date(n.created_at).getTime() < today)],
    ];
    const read = async (id?: string) => {
        qc.setQueryData(['notifications'], await readNotifications(id));
    };

    return (
        <div className="mx-auto max-w-xl">
            <LargeTitle
                title="Notifications"
                actions={
                    (d?.unread ?? 0) > 0 ? (
                        <button
                            type="button"
                            onClick={() => void read()}
                            className="h-10 rounded-full px-3 text-[13.5px] font-semibold text-brand-600 active:bg-muted"
                        >
                            Mark all read
                        </button>
                    ) : null
                }
            >
                <Segmented
                    value={view}
                    onChange={setView}
                    options={[
                        ['all', 'All'],
                        ['unread', `Unread${d?.unread ? ` · ${d.unread}` : ''}`],
                    ]}
                    label="Show"
                />
            </LargeTitle>

            {!d && <Skeleton className="mt-4 h-60 rounded-2xl" />}

            {d && d.messages.length > 0 && (
                <>
                    <SectionLabel>Waiting for you</SectionLabel>
                    <RowCard>
                        {d.messages.map((m) => (
                            <Row key={m.conversation_id} href={m.url}>
                                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-600">
                                    <MessageCircleIcon className="size-4" aria-hidden />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <b className="block truncate text-[15px] font-semibold">{m.contact}</b>
                                    <span className="block truncate text-[13px] text-muted-foreground">{m.preview}</span>
                                </span>
                                <span className="shrink-0 text-[12px] text-muted-foreground">{ago(m.at)}</span>
                            </Row>
                        ))}
                    </RowCard>
                </>
            )}

            {d &&
                groups.map(([title, list]) =>
                    list.length === 0 ? null : (
                        <section key={title}>
                            <SectionLabel>{title}</SectionLabel>
                            <RowCard>
                                {list.map((n) => {
                                    const Icon = ICON[n.type] ?? BellIcon;
                                    const alarm = n.type === 'channel_disconnected' || n.type === 'number_quality';

                                    return (
                                        <Link
                                            key={n.id}
                                            href={n.url ?? '/inbox'}
                                            onClick={() => !n.read && void read(n.id)}
                                            className={cn('flex min-h-14 items-start gap-3 px-3.5 py-2.5 active:bg-muted/70', !n.read && 'bg-brand-50/70')}
                                        >
                                            <span
                                                className={cn(
                                                    'mt-0.5 grid size-9 shrink-0 place-items-center rounded-full',
                                                    alarm ? 'bg-bad-bg text-bad' : 'bg-muted text-ink-2',
                                                )}
                                            >
                                                <Icon className="size-4" aria-hidden />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <b className={cn('block text-[14.5px]', n.read ? 'font-medium' : 'font-semibold')}>{n.title}</b>
                                                {n.body && <span className="line-clamp-2 block text-[13px] text-muted-foreground">{n.body}</span>}
                                            </span>
                                            <span className="shrink-0 text-[12px] text-muted-foreground">{ago(n.created_at)}</span>
                                        </Link>
                                    );
                                })}
                            </RowCard>
                        </section>
                    ),
                )}

            {d && items.length === 0 && d.messages.length === 0 && (
                <p className="mt-10 text-center text-[14px] text-muted-foreground">
                    {view === 'unread' ? 'You’re all caught up.' : 'No notifications in the last 30 days.'}
                </p>
            )}
        </div>
    );
}
