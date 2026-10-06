'use client';

import { useQueryClient } from '@tanstack/react-query';
import { BellIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { readNotifications, useNotifications } from '@/lib/queries';
import type { MemberNotification } from '@/lib/types';

const ago = (iso: string | null) => {
    if (!iso) return '';
    const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;

    return `${Math.round(minutes / 1440)} d ago`;
};

/** Assignments, mentions and returning snoozed conversations for the signed-in member. */
export function NotificationBell() {
    const qc = useQueryClient();
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const feed = useNotifications();
    const unread = feed.data?.unread ?? 0;

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
        document.addEventListener('mousedown', close);

        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    const markRead = async (id?: string) => qc.setQueryData(['notifications'], await readNotifications(id));

    const openItem = (n: MemberNotification) => {
        setOpen(false);
        if (!n.read) void markRead(n.id);
        if (n.url) router.push(n.url);
    };

    return (
        <div ref={root} className="relative">
            <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen((o) => !o)}
                aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
                aria-expanded={open}
            >
                <BellIcon />
                {unread > 0 && (
                    <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[10px] leading-4 font-semibold text-white">
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
            </Button>
            {open && (
                <div role="dialog" aria-label="Notifications" className="absolute top-11 right-0 z-40 w-80 rounded-lg border bg-card shadow-lg">
                    <div className="flex items-center justify-between border-b px-3 py-2">
                        <p className="text-sm font-semibold">Notifications</p>
                        {unread > 0 && (
                            <button onClick={() => markRead()} className="text-[12.5px] font-semibold text-primary hover:underline">
                                Mark all read
                            </button>
                        )}
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                        {(feed.data?.items ?? []).map((n) => (
                            <button
                                key={n.id}
                                onClick={() => openItem(n)}
                                className={`block w-full border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-muted ${n.read ? '' : 'bg-brand-50/60'}`}
                            >
                                <span className="block text-[13.5px] font-medium">{n.title}</span>
                                {n.body && <span className="line-clamp-2 text-[12.5px] text-muted-foreground">{n.body}</span>}
                                <span className="text-[11.5px] text-muted-foreground">{ago(n.created_at)}</span>
                            </button>
                        ))}
                        {(feed.data?.items ?? []).length === 0 && (
                            <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">Nothing yet. Assignments and mentions appear here.</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
