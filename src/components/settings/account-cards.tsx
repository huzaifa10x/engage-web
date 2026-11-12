'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import { date } from '@/lib/format';

export type EmailPreference = {
    key: string;
    label: string;
    description: string;
    group: string;
    owners_only: boolean;
    locked: boolean;
    enabled: boolean;
};

type RememberedDevices = {
    enabled: boolean;
    remember_days: number;
    this_device: { remembered: boolean; until: string | null };
    forgotten_at: string | null;
};

const PREFS = ['me', 'email-preferences'] as const;
const DEVICES = ['me', 'remembered-devices'] as const;

/**
 * Settings › Email notifications: the person's own choice of emails. All on by default; sign-in and
 * security emails (sign-in codes included) are always on. Each switch saves at once.
 */
export function EmailNotificationsCard() {
    const qc = useQueryClient();
    const prefs = useQuery({ queryKey: PREFS, queryFn: async () => (await api<{ data: EmailPreference[] }>('me/email-preferences')).data });
    const [saving, setSaving] = useState<string | null>(null);

    const toggle = async (row: EmailPreference, enabled: boolean) => {
        setSaving(row.key);
        // Shown at once; put back if the server refuses.
        qc.setQueryData<EmailPreference[]>(PREFS, (rows) => rows?.map((r) => (r.key === row.key ? { ...r, enabled } : r)));
        try {
            const res = await api<{ data: EmailPreference[] }>('me/email-preferences', { method: 'PUT', body: { preferences: { [row.key]: enabled } } });
            qc.setQueryData(PREFS, res.data);
            toast.success(enabled ? `${row.label} emails turned on` : `${row.label} emails turned off`);
        } catch (e) {
            qc.setQueryData<EmailPreference[]>(PREFS, (rows) => rows?.map((r) => (r.key === row.key ? { ...r, enabled: !enabled } : r)));
            toast.error(errorMessage(e));
        } finally {
            setSaving(null);
        }
    };

    const groups = (prefs.data ?? []).reduce<Record<string, EmailPreference[]>>((acc, row) => ((acc[row.group] ??= []).push(row), acc), {});

    return (
        <Card>
            <CardHeader>
                <CardTitle>Email notifications</CardTitle>
                <CardDescription>
                    Choose which emails you receive. Everything is on until you switch it off. The bell in the app still shows inbox alerts either way.
                </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5" data-testid="email-preferences">
                {prefs.isLoading ? (
                    <Skeleton className="h-64" />
                ) : prefs.isError ? (
                    <p className="text-sm text-destructive">{errorMessage(prefs.error)}</p>
                ) : (
                    Object.entries(groups).map(([group, rows]) => (
                        <div key={group} className="grid gap-2">
                            <p className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">{group}</p>
                            {rows.map((row) => (
                                <div key={row.key} className="flex items-start justify-between gap-4 rounded-md border p-3">
                                    <div>
                                        <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold">
                                            {row.label}
                                            {row.locked && <Badge tone="grey">Always on</Badge>}
                                            {row.owners_only && <Badge tone="grey">Workspace owners</Badge>}
                                        </p>
                                        <p className="text-[12.5px] text-muted-foreground">{row.description}</p>
                                    </div>
                                    <Switch
                                        checked={row.enabled}
                                        disabled={row.locked || saving === row.key}
                                        onCheckedChange={(v) => void toggle(row, v)}
                                        aria-label={`${row.label} emails`}
                                    />
                                </div>
                            ))}
                        </div>
                    ))
                )}
            </CardContent>
        </Card>
    );
}

/** Settings › Security: whether this browser is remembered, and "Forget remembered devices". */
export function RememberedDevicesCard() {
    const qc = useQueryClient();
    const devices = useQuery({ queryKey: DEVICES, queryFn: async () => (await api<{ data: RememberedDevices }>('auth/remembered-devices')).data });
    const [confirm, setConfirm] = useState(false);
    const [busy, setBusy] = useState(false);

    if (devices.data && !devices.data.enabled) return null; // sign-in codes switched off on this server

    const forget = async () => {
        setBusy(true);
        try {
            qc.setQueryData(DEVICES, (await api<{ data: RememberedDevices }>('auth/remembered-devices', { method: 'DELETE' })).data);
            toast.success('Remembered devices forgotten. Each browser will ask for a code at its next sign-in.');
            setConfirm(false);
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const here = devices.data?.this_device;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Remembered devices</CardTitle>
                <CardDescription>
                    When you tick “Remember this device for {devices.data?.remember_days ?? 30} days” at sign-in, that browser signs in without an emailed code
                    until the time is up. Resetting your password also forgets every device.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3" data-testid="remembered-devices">
                {devices.isLoading ? (
                    <Skeleton className="h-6 w-64" />
                ) : (
                    <p className="text-[13.5px]">
                        {here?.remembered && here.until ? (
                            <>
                                This browser is remembered until <span className="font-semibold">{date(here.until)}</span>.
                            </>
                        ) : (
                            'This browser is not remembered.'
                        )}
                        {devices.data?.forgotten_at && (
                            <span className="block text-[12.5px] text-muted-foreground">Devices last forgotten {date(devices.data.forgotten_at)}.</span>
                        )}
                    </p>
                )}
                <Button variant="outline" onClick={() => setConfirm(true)}>
                    Forget remembered devices
                </Button>
            </CardContent>
            <AlertDialog open={confirm} onOpenChange={setConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Forget all remembered devices?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Every browser, including this one, will ask for an emailed code at its next sign-in. Browsers signed in on a remembered device are
                            signed out. You stay signed in here.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={busy}
                            onClick={(e) => {
                                e.preventDefault();
                                void forget();
                            }}
                        >
                            {busy ? 'Forgetting…' : 'Forget devices'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}
