'use client';

import { useQueryClient } from '@tanstack/react-query';
import { BellIcon, BellOffIcon, BellRingIcon, MessageCircleIcon, Volume2Icon, VolumeXIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
    type DesktopState,
    desktopState,
    disableDesktop,
    enableDesktop,
    playChime,
    setSoundEnabled,
    showDesktop,
    soundEnabled,
    startTicker,
    unlockSoundOnFirstInteraction,
} from '@/lib/notifier';
import { readNotifications, useNotifications } from '@/lib/queries';

const POLL_MS = 8000;

const ago = (iso: string | null) => {
    if (!iso) return '';
    const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;

    return `${Math.round(minutes / 1440)} d ago`;
};

/**
 * The header bell: new customer messages that are yours to answer, plus assignments, mentions
 * and returning snoozed conversations. It also raises a desktop notification and a short sound
 * for anything new, on every page of the app and while the tab is in the background.
 */
function Bell() {
    const qc = useQueryClient();
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const [open, setOpen] = useState(false);
    const [desktop, setDesktop] = useState<DesktopState>('unsupported');
    const [sound, setSound] = useState(true);
    const feed = useNotifications();
    const { refetch } = feed;

    // What has already been announced. Seeded by the first load, so opening the app is silent.
    const seen = useRef<Set<string> | null>(null);
    const here = `${pathname}${params.get('c') ? `?c=${params.get('c')}` : ''}`;
    const hereRef = useRef(here);
    useEffect(() => {
        hereRef.current = here;
    }, [here]);

    useEffect(() => {
        const stopUnlock = unlockSoundOnFirstInteraction();
        // Ask once per browser, with a button: browsers only allow the permission prompt from a click.
        let prompted = true;
        try {
            prompted = window.localStorage.getItem('engage.notify.prompted') === '1';
            window.localStorage.setItem('engage.notify.prompted', '1');
        } catch {
            // Private mode: skip the prompt rather than show it on every page load.
        }
        if (!prompted && desktopState() === 'ask') {
            toast.message('Get alerted when a customer writes', {
                description: 'Turn on desktop notifications and a sound for new messages.',
                duration: 20_000,
                action: {
                    label: 'Turn on',
                    onClick: () =>
                        void enableDesktop().then((state) => {
                            if (state === 'on') {
                                playChime(true);
                                showDesktop('Desktop notifications are on', 'You will be alerted here when a customer writes.', 'engage-test', () => undefined);
                            }
                        }),
                },
            });
        }
        // A worker-driven tick keeps checking while the tab is in the background.
        const stopTicker = startTicker(POLL_MS, () => void refetch());
        const onVisible = () => !document.hidden && void refetch();
        document.addEventListener('visibilitychange', onVisible);

        return () => {
            stopUnlock();
            stopTicker();
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [refetch]);

    const data = feed.data;
    const unreadItems = data?.unread ?? 0;
    const unreadChats = data?.unread_conversations ?? 0;
    const total = unreadItems + unreadChats;

    const go = useCallback(
        (url: string | null) => {
            if (url) router.push(url);
        },
        [router],
    );

    // Announce anything that was not there on the previous check.
    useEffect(() => {
        if (!data) return;
        const current = new Map<string, { title: string; body: string; url: string | null }>();
        for (const m of data.messages) {
            current.set(`m:${m.conversation_id}:${m.at}`, { title: `New message from ${m.contact}`, body: m.preview, url: m.url });
        }
        for (const n of data.items) {
            if (!n.read) current.set(`n:${n.id}`, { title: n.title, body: n.body ?? '', url: n.url });
        }

        if (seen.current === null) {
            seen.current = new Set(current.keys());

            return;
        }

        const fresh = [...current.entries()].filter(([key]) => !seen.current?.has(key));
        fresh.forEach(([key]) => seen.current?.add(key));
        // Not for the conversation the person is looking at right now.
        const worthIt = fresh.filter(([, item]) => document.hidden || item.url !== hereRef.current);
        if (worthIt.length === 0) return;

        playChime();
        const shown = worthIt.slice(0, 3).map(([key, item]) => showDesktop(item.title, item.body, key, () => go(item.url)));
        // No desktop notification possible (not enabled, or the tab is in front): show it in the page instead.
        if (!document.hidden && !shown.some(Boolean)) {
            const [, first] = worthIt[0];
            toast.message(first.title, { description: first.body, action: first.url ? { label: 'Open', onClick: () => go(first.url) } : undefined });
        }
    }, [data, go]);

    // Unread count in the browser tab title.
    useEffect(() => {
        const base = document.title.replace(/^\(\d+\+?\)\s*/, '');
        document.title = total > 0 ? `(${total > 99 ? '99+' : total}) ${base}` : base;
    }, [total, pathname]);

    const markRead = async (id?: string) => qc.setQueryData(['notifications'], await readNotifications(id));

    const toggleDesktop = async () => {
        if (desktop === 'on') {
            setDesktop(disableDesktop());

            return;
        }
        const next = await enableDesktop();
        setDesktop(next);
        if (next === 'on') {
            playChime(true);
            showDesktop('Desktop notifications are on', 'You will be alerted here when a customer writes.', 'engage-test', () => undefined);
        } else if (next === 'blocked') {
            toast.error('Notifications are blocked for this site in your browser. Allow them in the address bar (the lock icon), then try again.');
        }
    };

    const toggleSound = () => {
        const next = !sound;
        setSoundEnabled(next);
        setSound(next);
        if (next) playChime(true);
    };

    const close = (url: string | null, id?: string) => {
        setOpen(false);
        if (id) void markRead(id);
        go(url);
    };

    return (
        <DropdownMenu
            open={open}
            onOpenChange={(next) => {
                if (next) {
                    // Read the browser's current answer each time the panel opens (it can change outside the page).
                    setDesktop(desktopState());
                    setSound(soundEnabled());
                }
                setOpen(next);
            }}
        >
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative" aria-label={total > 0 ? `Notifications, ${total} new` : 'Notifications'}>
                    {total > 0 ? <BellRingIcon /> : <BellIcon />}
                    {total > 0 && (
                        <span className="absolute top-0.5 right-0.5 flex min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[10px] leading-4 font-semibold text-white">
                            {total > 9 ? '9+' : total}
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} className="w-[22rem] max-w-[calc(100vw-1.5rem)] p-0">
                <div className="flex items-center justify-between border-b px-3 py-2.5">
                    <p className="text-sm font-semibold">Notifications</p>
                    {unreadItems > 0 && (
                        <button onClick={() => markRead()} className="text-[12.5px] font-semibold text-brand-600 hover:underline">
                            Mark all read
                        </button>
                    )}
                </div>

                <div className="max-h-[60vh] overflow-y-auto">
                    {feed.isError && <p className="px-3 py-4 text-[13px] text-bad">Notifications could not be loaded. They will retry by themselves.</p>}

                    {(data?.messages ?? []).length > 0 && (
                        <>
                            <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                                New messages{unreadChats > (data?.messages.length ?? 0) ? ` · ${unreadChats} conversations` : ''}
                            </p>
                            {data?.messages.map((m) => (
                                <button
                                    key={m.conversation_id}
                                    onClick={() => close(m.url)}
                                    className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-muted"
                                >
                                    <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600">
                                        <MessageCircleIcon className="size-4" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-baseline justify-between gap-2">
                                            <span className="truncate text-[13.5px] font-semibold">{m.contact}</span>
                                            <span className="shrink-0 text-[11.5px] text-muted-foreground">{ago(m.at)}</span>
                                        </span>
                                        <span className="line-clamp-2 text-[12.5px] text-muted-foreground">{m.preview}</span>
                                    </span>
                                    {m.unread_count > 1 && (
                                        <span className="mt-1 shrink-0 rounded-full bg-primary px-1.5 text-[11px] leading-5 font-semibold text-primary-foreground">
                                            {m.unread_count}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </>
                    )}

                    {(data?.items ?? []).length > 0 && (
                        <>
                            <p className="border-t px-3 pt-2.5 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase first:border-t-0">
                                Activity
                            </p>
                            {data?.items.map((n) => (
                                <button
                                    key={n.id}
                                    onClick={() => close(n.url, n.read ? undefined : n.id)}
                                    className={`block w-full px-3 py-2 text-left hover:bg-muted ${n.read ? '' : 'bg-brand-50/70'}`}
                                >
                                    <span className="block text-[13.5px] font-medium">{n.title}</span>
                                    {n.body && <span className="line-clamp-2 text-[12.5px] text-muted-foreground">{n.body}</span>}
                                    <span className="text-[11.5px] text-muted-foreground">{ago(n.created_at)}</span>
                                </button>
                            ))}
                        </>
                    )}

                    {data && data.messages.length === 0 && data.items.length === 0 && (
                        <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">
                            You are all caught up. New customer messages, assignments and mentions appear here.
                        </p>
                    )}
                    {!data && !feed.isError && <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">Loading…</p>}
                </div>

                <div className="grid gap-1 border-t bg-muted/50 p-2">
                    <button
                        onClick={toggleDesktop}
                        disabled={desktop === 'unsupported'}
                        className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted disabled:opacity-60"
                    >
                        {desktop === 'on' ? <BellRingIcon className="size-4 text-brand-600" /> : <BellOffIcon className="size-4 text-muted-foreground" />}
                        <span className="flex-1">
                            <span className="block font-medium">Desktop notifications</span>
                            <span className="block text-[12px] text-muted-foreground">
                                {desktop === 'on'
                                    ? 'On for this browser'
                                    : desktop === 'blocked'
                                      ? 'Blocked in your browser settings for this site'
                                      : desktop === 'unsupported'
                                        ? 'Not supported by this browser'
                                        : 'Off. Click to turn on'}
                            </span>
                        </span>
                        <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${desktop === 'on' ? 'bg-brand-100 text-brand-600' : 'bg-grey-bg text-grey'}`}
                        >
                            {desktop === 'on' ? 'On' : 'Off'}
                        </span>
                    </button>
                    <button onClick={toggleSound} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted">
                        {sound ? <Volume2Icon className="size-4 text-brand-600" /> : <VolumeXIcon className="size-4 text-muted-foreground" />}
                        <span className="flex-1 font-medium">Notification sound</span>
                        <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${sound ? 'bg-brand-100 text-brand-600' : 'bg-grey-bg text-grey'}`}
                        >
                            {sound ? 'On' : 'Off'}
                        </span>
                    </button>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function NotificationBell() {
    return (
        <Suspense fallback={null}>
            <Bell />
        </Suspense>
    );
}
