'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BellIcon, BellOffIcon, SmartphoneIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import { currentSubscription, disablePush, enablePush, permission, pushSupport, type PushState } from '@/lib/push';

export const PUSH_KEY = ['me', 'push'] as const;

/** The server's view of this phone and the person's choices; `endpoint` identifies this browser. */
export function usePushState() {
    const [endpoint, setEndpoint] = useState<string | null | undefined>(undefined);
    useEffect(() => {
        void currentSubscription().then((s) => setEndpoint(s?.endpoint ?? null));
    }, []);
    const q = useQuery({
        queryKey: [...PUSH_KEY, endpoint ?? null],
        queryFn: async () => (await api<{ data: PushState }>('push', { query: { endpoint: endpoint ?? undefined } })).data,
        enabled: endpoint !== undefined,
    });

    return { ...q, endpoint, setEndpoint };
}

/**
 * Settings › Notifications › This phone (mobile brief): turn notifications on or off for this phone or
 * browser, send a test, choose which kinds, hide message text on the lock screen, and see the other
 * phones with notifications on.
 */
export function PhoneNotificationsCard() {
    const qc = useQueryClient();
    const state = usePushState();
    const [busy, setBusy] = useState<string | null>(null);
    const support = pushSupport();
    const d = state.data;
    const on = !!d?.this_device && permission() === 'granted';

    const run = async (key: string, fn: () => Promise<unknown>) => {
        setBusy(key);
        try {
            await fn();
        } catch (e) {
            toast.error(e instanceof Error && !('status' in e) ? e.message : errorMessage(e));
        } finally {
            setBusy(null);
            void qc.invalidateQueries({ queryKey: PUSH_KEY });
        }
    };
    const turnOn = () =>
        run('on', async () => {
            if (!d?.public_key) throw new Error('Phone notifications are not set up on the server yet.');
            await enablePush(d.public_key);
            state.setEndpoint((await currentSubscription())?.endpoint ?? null);
            toast.success('Notifications are on for this phone');
        });
    const turnOff = () =>
        run('off', async () => {
            await disablePush();
            state.setEndpoint(null);
            toast.success('Notifications are off for this phone');
        });
    const test = () =>
        run('test', async () => {
            await api('push/test', { method: 'POST', body: { endpoint: state.endpoint } });
            toast.success('Test sent. Tap it when it arrives to finish the check.');
        });
    const setPref = (key: string, value: boolean) =>
        run(key, async () => {
            await api('push/preferences', { method: 'PUT', body: { [key]: value } });
        });

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <SmartphoneIcon className="size-4" /> Phone notifications
                </CardTitle>
                <CardDescription>A notification on this phone when a customer is waiting for you, even when engageX is closed.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
                {state.isLoading || state.endpoint === undefined ? (
                    <Skeleton className="h-32" />
                ) : d && !d.enabled ? (
                    <p className="text-[13px] text-muted-foreground">Phone notifications are not set up on this server yet.</p>
                ) : support === 'needs-install' ? (
                    <p className="rounded-md border bg-muted/40 p-3 text-[13px]">
                        On iPhone, notifications work from the installed app: in Safari tap Share, then <b>Add to Home Screen</b>, open engageX from your Home
                        Screen and turn them on there.
                    </p>
                ) : support === 'unsupported' ? (
                    <p className="text-[13px] text-muted-foreground">
                        This browser can’t show notifications. Use Chrome on Android, or the installed app on iPhone.
                    </p>
                ) : (
                    <>
                        <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                            {on ? <BellIcon className="size-5 text-good" /> : <BellOffIcon className="size-5 text-muted-foreground" />}
                            <div className="min-w-0 flex-1">
                                <p className="text-[13.5px] font-semibold">
                                    {on ? 'On for this phone' : permission() === 'denied' ? 'Blocked on this phone' : 'Off for this phone'}
                                </p>
                                <p className="text-[12.5px] text-muted-foreground">
                                    {on
                                        ? d?.this_device?.test_tapped_at
                                            ? 'Tested and working ✓'
                                            : 'Send a test and tap it to check it works.'
                                        : permission() === 'denied'
                                          ? 'Allow notifications for engageX in your phone’s settings, then turn them on here.'
                                          : 'You’ll be asked to allow notifications.'}
                                </p>
                            </div>
                            {on ? (
                                <div className="flex gap-2">
                                    <Button size="sm" variant="outline" onClick={() => void test()} disabled={busy !== null}>
                                        {busy === 'test' ? 'Sending…' : 'Send a test'}
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => void turnOff()} disabled={busy !== null}>
                                        Turn off
                                    </Button>
                                </div>
                            ) : (
                                <Button size="sm" onClick={() => void turnOn()} disabled={busy !== null || permission() === 'denied'}>
                                    {busy === 'on' ? 'Turning on…' : 'Turn on'}
                                </Button>
                            )}
                        </div>
                        {d && (
                            <div className="grid gap-2">
                                <p className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">What to send</p>
                                {d.preferences.categories.map((c) => (
                                    <div key={c.key} className="flex items-start justify-between gap-4 rounded-md border p-3">
                                        <div>
                                            <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold">
                                                {c.label} {c.locked && <Badge tone="grey">Always on</Badge>}
                                            </p>
                                            <p className="text-[12.5px] text-muted-foreground">{c.hint}</p>
                                        </div>
                                        <Switch
                                            checked={c.enabled}
                                            disabled={c.locked || busy === c.key}
                                            onCheckedChange={(v) => void setPref(c.key, v)}
                                            aria-label={c.label}
                                        />
                                    </div>
                                ))}
                                <div className="flex items-start justify-between gap-4 rounded-md border p-3">
                                    <div>
                                        <p className="text-[13.5px] font-semibold">Show message text</p>
                                        <p className="text-[12.5px] text-muted-foreground">
                                            Off: the notification only says who wrote. Your phone decides what shows on the lock screen.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={d.preferences.message_text}
                                        disabled={busy === 'message_text'}
                                        onCheckedChange={(v) => void setPref('message_text', v)}
                                        aria-label="Show message text"
                                    />
                                </div>
                            </div>
                        )}
                        {d && d.devices.length > 0 && (
                            <div className="grid gap-2">
                                <p className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">Phones with notifications on</p>
                                {d.devices.map((dev) => (
                                    <div key={dev.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-[13px]">
                                        <span className="min-w-0 truncate">
                                            {dev.label ?? 'Browser'}
                                            {dev.id === d.this_device?.id ? ' (this one)' : ''}
                                        </span>
                                        {dev.id !== d.this_device?.id && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => void run(dev.id, () => api('push/subscriptions', { method: 'DELETE', body: { id: dev.id } }))}
                                                disabled={busy !== null}
                                            >
                                                Turn off
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
