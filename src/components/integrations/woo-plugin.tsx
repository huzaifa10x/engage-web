'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangleIcon, CheckCircle2Icon, CopyIcon, DownloadIcon, KeyRoundIcon, Loader2Icon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Field } from '@/components/app/field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import { createPluginKey, PLUGIN_ZIP_URL, updateIntegration, useStages } from '@/lib/queries';
import type { Integration, IntegrationsOverview } from '@/lib/types';

const ago = (iso: string | null | undefined) => {
    if (!iso) return 'Never';
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 90) return 'Just now';
    if (s < 5400) return `${Math.round(s / 60)} min ago`;
    if (s < 129600) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} days ago`;
};

async function copy(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        toast.success('Copied');
    } catch {
        toast.error('Copy failed. Select the key and copy it.');
    }
}

/**
 * Integrations › WooCommerce › Connect with the plugin (Engagement Plan step D): download the
 * "10X Engage for WooCommerce" plugin, get a one-time workspace key, paste it in WordPress. The
 * dialog watches for the store to connect and opens it. Render it only while open (a fresh dialog per use).
 */
export function PluginConnectDialog({
    open,
    upgrade,
    onClose,
    onConnected,
}: {
    open: boolean;
    /** A store already connected with REST keys: the key upgrades it to the plugin. */
    upgrade?: Integration;
    onClose: () => void;
    onConnected: (id: string) => void;
}) {
    const qc = useQueryClient();
    const [key, setKey] = useState<{ key: string; id: string; days: number } | null>(null);
    const [busy, setBusy] = useState(false);
    // While a key is shown, look for the store to connect every few seconds.
    const watch = useQuery({
        queryKey: ['integrations', 'overview'],
        queryFn: () => api<{ data: IntegrationsOverview }>('integrations').then((r) => r.data),
        enabled: open && key !== null,
        refetchInterval: 4000,
    });
    const store = key ? watch.data?.integrations.find((i) => i.id === key.id) : undefined;
    // Connected: the plugin used the key (it is cleared). A REST store is upgraded in place; a new store keeps its id.
    const connected = !!store && store.via === 'plugin' && !store.health?.key_expires_at;
    const fired = useRef(false);
    useEffect(() => {
        if (connected && key && !fired.current) {
            fired.current = true;
            toast.success(`${store?.name ?? 'Store'} connected with the plugin.`);
            void qc.invalidateQueries({ queryKey: ['integrations'] });
            onConnected(key.id);
        }
    }, [connected, key, store, onConnected, qc]);

    const create = async () => {
        setBusy(true);
        try {
            const r = await createPluginKey(upgrade?.id);
            setKey({ key: r.key, id: r.integration.id, days: r.expires_in_days });
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (!o) {
                    setKey(null);
                    onClose();
                }
            }}
        >
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{upgrade ? `Install the plugin on ${upgrade.name}` : 'Connect WooCommerce with the plugin'}</DialogTitle>
                    <DialogDescription>
                        The plugin installs the website tracker for you, keeps the chat link on the order through checkout and sends every order update, signed
                        — so you can see which WhatsApp chats became orders.
                    </DialogDescription>
                </DialogHeader>
                <ol className="grid gap-4 text-[13.5px]">
                    <li className="grid gap-1.5">
                        <p className="font-medium">1. Install the plugin</p>
                        <p className="text-muted-foreground">In WordPress: Plugins → Add New → Upload Plugin, choose the file, then Activate.</p>
                        <Button asChild variant="outline" className="w-fit">
                            <a href={PLUGIN_ZIP_URL} download>
                                <DownloadIcon /> Download 10X Engage for WooCommerce
                            </a>
                        </Button>
                    </li>
                    <li className="grid gap-1.5">
                        <p className="font-medium">2. Get your workspace key</p>
                        {key ? (
                            <>
                                <div className="flex items-start gap-2">
                                    <pre className="flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-[11.5px] break-all whitespace-pre-wrap">
                                        {key.key}
                                    </pre>
                                    <Button variant="outline" size="sm" onClick={() => copy(key.key)} aria-label="Copy key">
                                        <CopyIcon />
                                    </Button>
                                </div>
                                <p className="text-[12.5px] text-muted-foreground">
                                    Works once and expires in {key.days} days. It is shown only now — get a new one if you lose it.
                                </p>
                            </>
                        ) : (
                            <Button className="w-fit" onClick={create} disabled={busy}>
                                <KeyRoundIcon /> {busy ? 'Creating…' : 'Get workspace key'}
                            </Button>
                        )}
                    </li>
                    <li className="grid gap-1.5">
                        <p className="font-medium">3. Paste it in WordPress</p>
                        <p className="text-muted-foreground">
                            WooCommerce → 10X Engage, paste the key and choose Connect. The store then shows as Connected here.
                        </p>
                        {key && (
                            <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                                <Loader2Icon className="size-4 animate-spin" /> Waiting for the store to connect…
                            </p>
                        )}
                    </li>
                </ol>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {key ? 'Close — I’ll finish later' : 'Cancel'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Settings › Sales from chats: connection health, chat-link validity, paid order → CRM stage, tracker. */
export function StoreSalesSettings({
    integration,
    canManage,
    canSales,
    onSaved,
    onInstallPlugin,
}: {
    integration: Integration;
    canManage: boolean;
    canSales: boolean;
    onSaved: (i: Integration) => void;
    onInstallPlugin: () => void;
}) {
    const stages = useStages(integration.via === 'plugin');
    const [days, setDays] = useState(String(integration.link_days ?? 14));
    const h = integration.health;
    const NONE = '__none__';
    const patch = async (body: Parameters<typeof updateIntegration>[1]) => {
        try {
            onSaved(await updateIntegration(integration.id, body));
            toast.success('Saved');
        } catch (e) {
            toast.error(errorMessage(e));
        }
    };

    if (integration.via !== 'plugin') {
        return (
            <Card>
                <CardHeader>
                    <div>
                        <CardTitle>Sales from chats</CardTitle>
                        <CardDescription>
                            {integration.via === 'waiting'
                                ? 'Waiting for the plugin: paste the workspace key in WooCommerce → 10X Engage.'
                                : 'This store is connected with REST keys, so order messages work, but chat links cannot be followed to the order. Install the plugin to see which chats became orders.'}
                        </CardDescription>
                    </div>
                </CardHeader>
                {canManage && (
                    <CardContent>
                        <Button onClick={onInstallPlugin} disabled={!canSales}>
                            <KeyRoundIcon /> {integration.via === 'waiting' ? 'Get a new key' : 'Install the plugin'}
                        </Button>
                        {!canSales && <p className="mt-2 text-[12.5px] text-muted-foreground">Sales from chats is part of the Pro plan.</p>}
                    </CardContent>
                )}
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div>
                    <CardTitle className="flex items-center gap-2">
                        Sales from chats
                        {h?.state === 'warning' ? (
                            <Badge tone="warn" dot>
                                Check the connection
                            </Badge>
                        ) : (
                            <Badge tone="good" dot>
                                Plugin connected
                            </Badge>
                        )}
                    </CardTitle>
                    <CardDescription>
                        Store links sent from a chat get a token (?xl=…) that the plugin saves on the order. Only those orders count as revenue from a chat.
                    </CardDescription>
                </div>
            </CardHeader>
            <CardContent className="grid gap-4">
                {h && h.warnings.length > 0 && (
                    <div className="grid gap-1 rounded-md bg-warn-bg px-3 py-2 text-[13px] text-warn">
                        {h.warnings.map((w) => (
                            <p key={w.code} className="flex items-start gap-2">
                                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" /> {w.message}
                            </p>
                        ))}
                    </div>
                )}
                <dl className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
                    {(
                        [
                            ['Last order event', ago(h?.last_event_at)],
                            ['Plugin last reported', ago(h?.heartbeat_at)],
                            ['Nightly catch-up', ago(h?.reconciled_at)],
                            ['Orders · 30 days', String(integration.orders_30d ?? 0)],
                            ['Plugin', h?.plugin_version ? `v${h.plugin_version}` : '—'],
                            ['WooCommerce', h?.wc_version ?? '—'],
                            ['Order storage', h?.hpos === null || h?.hpos === undefined ? '—' : h.hpos ? 'HPOS' : 'Posts'],
                            ['Checkout', h?.block_checkout === null || h?.block_checkout === undefined ? '—' : h.block_checkout ? 'Block' : 'Classic'],
                        ] as const
                    ).map(([k, v]) => (
                        <div key={k}>
                            <dt className="text-[12px] text-muted-foreground">{k}</dt>
                            <dd className="font-medium">{v}</dd>
                        </div>
                    ))}
                </dl>

                <Field label="Chat links are valid for" htmlFor="link-days" hint="An order placed after this does not count as an order from the chat link.">
                    <div className="flex items-center gap-2">
                        <Input
                            id="link-days"
                            className="w-20"
                            inputMode="numeric"
                            value={days}
                            onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))}
                            disabled={!canManage}
                        />
                        <span className="text-[13px] text-muted-foreground">days</span>
                        {canManage && Number(days) !== integration.link_days && (
                            <Button size="sm" onClick={() => patch({ link_days: Math.min(90, Math.max(1, Number(days) || 14)) })}>
                                Save
                            </Button>
                        )}
                    </div>
                </Field>

                <Field
                    label="When an order is paid, move the contact to"
                    htmlFor="paid-stage"
                    hint="Order status stays on the order. Only orders matched to a contact move the stage, once."
                >
                    <Select
                        value={integration.paid_stage_id ?? NONE}
                        onValueChange={(v) => patch({ paid_stage_id: v === NONE ? null : v })}
                        disabled={!canManage}
                    >
                        <SelectTrigger id="paid-stage" className="w-64">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NONE}>Don’t change the stage</SelectItem>
                            {(stages.data ?? []).map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                    {s.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>

                <label className="flex items-start gap-3 text-sm">
                    <Switch
                        checked={integration.tracker_auto ?? true}
                        disabled={!canManage}
                        onCheckedChange={(v) => patch({ tracker_auto: v })}
                        aria-label="Install the website tracker on the store"
                    />
                    <span>
                        Install the website tracker on the store
                        <span className="block text-[12.5px] text-muted-foreground">
                            The plugin adds the Growth Hub tracker to every page, so WhatsApp taps on the store are matched too. No snippet to paste.
                        </span>
                    </span>
                </label>

                {canManage && (
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={onInstallPlugin}>
                            <KeyRoundIcon /> Reconnect with a new key
                        </Button>
                        <Button asChild variant="ghost">
                            <a href={PLUGIN_ZIP_URL} download>
                                <DownloadIcon /> Download the plugin
                            </a>
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

/** The badge on a connected store row. */
export function StoreViaBadge({ integration }: { integration: Integration }) {
    if (integration.provider !== 'woocommerce') return null;
    if (integration.via === 'waiting')
        return (
            <Badge tone="warn" dot>
                Waiting for the plugin
            </Badge>
        );
    if (integration.via === 'plugin')
        return integration.health?.state === 'warning' ? (
            <Badge tone="warn">
                <AlertTriangleIcon className="size-3" /> Check the plugin
            </Badge>
        ) : (
            <Badge tone="good">
                <CheckCircle2Icon className="size-3" /> Plugin
            </Badge>
        );

    return <Badge>REST keys</Badge>;
}
