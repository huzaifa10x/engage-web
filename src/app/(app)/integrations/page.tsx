'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, BookOpenIcon, ExternalLinkIcon, PlugIcon, SendIcon, ShoppingBagIcon, StoreIcon, Trash2Icon, WorkflowIcon, ZapIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Field, FormError } from '@/components/app/field';
import { EmptyState, Forbidden, PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
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
import { Badge, type Tone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiError, errorMessage } from '@/lib/api';
import { P } from '@/lib/permissions';
import {
    connectWooCommerce,
    disconnectIntegration,
    saveIntegrationRule,
    startShopifyInstall,
    testIntegrationRule,
    updateIntegration,
    useIntegration,
    useIntegrationEvents,
    useIntegrations,
    usePhoneNumbers,
    useTemplates,
} from '@/lib/queries';
import type { Integration, IntegrationEvent, IntegrationProvider, IntegrationRule, IntegrationsOverview, MessageTemplate } from '@/lib/types';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const firstError = (e: unknown) => (e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? e.message) : errorMessage(e));
const PROVIDER: Record<IntegrationProvider, { name: string; blurb: string }> = {
    shopify: { name: 'Shopify', blurb: 'Order confirmations, shipping updates and abandoned-checkout reminders on WhatsApp.' },
    woocommerce: { name: 'WooCommerce', blurb: 'Order confirmations and shipping updates on WhatsApp for your WordPress store.' },
};
const CUSTOM = '__custom__';

// ── Connect dialogs ────────────────────────────────────────────────────────────────────────

function ShopifyDialog({ open, initialShop, onClose }: { open: boolean; initialShop: string; onClose: () => void }) {
    const [shop, setShop] = useState(initialShop);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const go = async () => {
        setBusy(true);
        setError(null);
        try {
            // Shopify asks the store owner to approve, then sends them back here.
            window.location.assign(await startShopifyInstall(shop.trim()));
        } catch (e) {
            setError(firstError(e));
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Connect Shopify</DialogTitle>
                    <DialogDescription>
                        Enter your store&apos;s Shopify address. You will be taken to Shopify to approve the connection, then brought back here.
                    </DialogDescription>
                </DialogHeader>
                <Field label="Store address" htmlFor="shop" hint="For example my-store.myshopify.com. You find it in Shopify under Settings → Domains.">
                    <Input id="shop" value={shop} onChange={(e) => setShop(e.target.value)} placeholder="my-store.myshopify.com" autoFocus />
                </Field>
                <FormError message={error} />
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={go} disabled={busy || shop.trim() === ''}>
                        {busy ? 'Opening Shopify…' : 'Continue to Shopify'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function WooDialog({ open, onClose, onConnected }: { open: boolean; onClose: () => void; onConnected: (i: Integration) => void }) {
    const [form, setForm] = useState({ store_url: '', consumer_key: '', consumer_secret: '', default_country_code: '' });
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

    const connect = async () => {
        setBusy(true);
        setError(null);
        try {
            onConnected(
                await connectWooCommerce({
                    store_url: form.store_url.trim(),
                    consumer_key: form.consumer_key.trim(),
                    consumer_secret: form.consumer_secret.trim(),
                    default_country_code: form.default_country_code.trim() || null,
                }),
            );
            setForm({ store_url: '', consumer_key: '', consumer_secret: '', default_country_code: '' });
        } catch (e) {
            setError(firstError(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Connect WooCommerce</DialogTitle>
                    <DialogDescription>
                        In your WordPress admin open WooCommerce → Settings → Advanced → REST API, choose &quot;Add key&quot;, set Permissions to Read/Write,
                        and paste the two keys below. We then set up the order notifications in your store for you.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4">
                    <Field label="Store address" htmlFor="woo-url" hint="The address of your shop, for example https://shop.example.com">
                        <Input id="woo-url" value={form.store_url} onChange={set('store_url')} placeholder="https://shop.example.com" autoFocus />
                    </Field>
                    <Field label="Consumer key" htmlFor="woo-key">
                        <Input
                            id="woo-key"
                            value={form.consumer_key}
                            onChange={set('consumer_key')}
                            placeholder="ck_…"
                            autoComplete="off"
                            className="font-mono"
                        />
                    </Field>
                    <Field label="Consumer secret" htmlFor="woo-secret">
                        <Input
                            id="woo-secret"
                            type="password"
                            value={form.consumer_secret}
                            onChange={set('consumer_secret')}
                            placeholder="cs_…"
                            autoComplete="new-password"
                            className="font-mono"
                        />
                    </Field>
                    <Field
                        label="Default country code (optional)"
                        htmlFor="woo-cc"
                        hint="Added to phone numbers customers typed without a country code, when the order has no country. For the UAE: 971."
                    >
                        <Input
                            id="woo-cc"
                            value={form.default_country_code}
                            onChange={set('default_country_code')}
                            placeholder="971"
                            className="w-28"
                            inputMode="numeric"
                        />
                    </Field>
                    <FormError message={error} />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={connect} disabled={busy || !form.store_url.trim() || !form.consumer_key.trim() || !form.consumer_secret.trim()}>
                        {busy ? 'Connecting…' : 'Connect store'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function AutomationDialog({ platform, overview, onClose }: { platform: 'Zapier' | 'Make' | null; overview: IntegrationsOverview; onClose: () => void }) {
    const ready = overview.can.api && overview.can.webhooks;

    return (
        <Dialog open={platform !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Connect {platform}</DialogTitle>
                    <DialogDescription>
                        {platform} connects 10X Engage to thousands of other apps: start an automation when a WhatsApp message arrives, or send a WhatsApp
                        message when something happens elsewhere.
                    </DialogDescription>
                </DialogHeader>
                {!ready && (
                    <div className="rounded-md border border-warn/40 bg-warn-bg px-3 py-2 text-[13px]">
                        {platform} uses API access and webhooks, which are not in your current plan.{' '}
                        <Link href="/billing" className="font-medium underline">
                            See plans
                        </Link>
                    </div>
                )}
                <ol className="grid list-decimal gap-3 pl-5 text-sm">
                    <li>
                        Create an API key under{' '}
                        <Link href="/developer" className="font-medium text-brand-600 underline">
                            Developer → API keys
                        </Link>
                        . Tick <span className="font-medium">Subscribe to events</span> for triggers, plus the actions you want (send messages, create
                        contacts).
                    </li>
                    <li>
                        In {platform}, add {platform === 'Zapier' ? 'a "Webhooks by Zapier" step' : 'an "HTTP" or "Webhooks" module'} and use this address with
                        your key in the Authorization header:
                        <pre className="mt-2 overflow-x-auto rounded-lg bg-[#0d1109] p-3 font-mono text-[12.5px] text-[#d7e9b0]">{`${overview.api_base_url}\nAuthorization: Bearer eng_live_YOUR_KEY`}</pre>
                    </li>
                    <li>
                        <span className="font-medium">To start an automation from WhatsApp</span> (a message arrives, a contact is added): copy the webhook
                        address {platform} gives you and subscribe it with <span className="font-mono text-[12.5px]">POST /webhooks</span>, or paste it under
                        Developer → Webhooks.
                    </li>
                    <li>
                        <span className="font-medium">To act in WhatsApp from another app</span> (new row, new lead, new booking): call{' '}
                        <span className="font-mono text-[12.5px]">POST /messages</span> to send a template, or{' '}
                        <span className="font-mono text-[12.5px]">POST /contacts</span> to add a contact.
                    </li>
                </ol>
                <DialogFooter>
                    <Button asChild variant="outline">
                        <a href="/docs/api" target="_blank" rel="noopener">
                            <BookOpenIcon /> API documentation
                        </a>
                    </Button>
                    <Button asChild>
                        <Link href="/developer">Open Developer</Link>
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── One store: messages, activity, settings ────────────────────────────────────────────────

/** One template variable: pick a value from the order, or type fixed text. */
function VariableInput({
    label,
    value,
    fields,
    onChange,
}: {
    label: string;
    value: string;
    fields: IntegrationsOverview['fields'];
    onChange: (v: string) => void;
}) {
    const token = /^\{\{([a-z_]+)\}\}$/.exec(value)?.[1];
    const isField = token !== undefined && fields.some((f) => f.key === token);
    const [custom, setCustom] = useState(value !== '' && !isField);

    return (
        <div className="grid gap-1.5 sm:grid-cols-[110px_1fr] sm:items-center">
            <span className="font-mono text-[12.5px] text-muted-foreground">{label}</span>
            <div className="flex flex-wrap gap-2">
                <Select
                    value={custom ? CUSTOM : isField ? token : ''}
                    onValueChange={(v) => {
                        setCustom(v === CUSTOM);
                        onChange(v === CUSTOM ? '' : `{{${v}}}`);
                    }}
                >
                    <SelectTrigger className="w-full sm:w-64">
                        <SelectValue placeholder="Choose a value" />
                    </SelectTrigger>
                    <SelectContent>
                        {fields.map((f) => (
                            <SelectItem key={f.key} value={f.key}>
                                {f.label}
                            </SelectItem>
                        ))}
                        <SelectItem value={CUSTOM}>Fixed text…</SelectItem>
                    </SelectContent>
                </Select>
                {custom && <Input className="min-w-40 flex-1" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Text to use every time" />}
            </div>
        </div>
    );
}

function RuleEditor({
    integration,
    rule,
    meta,
    overview,
    templates,
    numbers,
    canManage,
    onSaved,
}: {
    integration: Integration;
    rule: IntegrationRule;
    meta: IntegrationsOverview['events'][number];
    overview: IntegrationsOverview;
    templates: MessageTemplate[];
    numbers: { id: string; label: string; waba: string }[];
    canManage: boolean;
    onSaved: (i: Integration) => void;
}) {
    const [draft, setDraft] = useState<IntegrationRule>(rule);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [testOpen, setTestOpen] = useState(false);
    const [testPhone, setTestPhone] = useState('');

    // Templates belong to a WhatsApp account: offer the ones the chosen number can send.
    const waba = numbers.find((n) => n.id === draft.phone_number_id)?.waba;
    const usable = templates.filter(
        (t) => t.sendable && (!waba || t.waba_account_id === waba) && !['IMAGE', 'VIDEO', 'DOCUMENT', 'LOCATION'].includes(t.variables.header_format ?? ''),
    );
    const key = (t: { name: string; language: string }) => `${t.name}::${t.language}`;
    const template = usable.find((t) => t.name === draft.template_name && t.language === draft.template_language);
    const body = template?.components.find((c) => c.type.toUpperCase() === 'BODY')?.text ?? '';
    const urlButtons = template?.variables.buttons.filter((b) => b.variable && b.type === 'URL') ?? [];
    const dirty = JSON.stringify(draft) !== JSON.stringify(rule);
    const setVariable = (part: 'header' | 'body', index: number, value: string) =>
        setDraft((d) => {
            const list = [...(d.variables?.[part] ?? [])];
            list[index] = value;

            return { ...d, variables: { ...d.variables, [part]: list } };
        });

    const save = async (next: IntegrationRule = draft) => {
        setSaving(true);
        setError(null);
        try {
            const { event, ...payload } = next;
            onSaved(await saveIntegrationRule(integration.id, event, payload));
            toast.success(next.enabled ? `"${meta.label}" message is on` : 'Saved');
        } catch (e) {
            setError(firstError(e));
            setDraft((d) => ({ ...d, enabled: rule.enabled }));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader className="flex-row items-start justify-between gap-4">
                <div>
                    <CardTitle className="flex items-center gap-2">
                        {meta.label}{' '}
                        {rule.enabled ? (
                            <Badge tone="good" dot>
                                On
                            </Badge>
                        ) : (
                            <Badge>Off</Badge>
                        )}
                    </CardTitle>
                    <CardDescription>{meta.hint}</CardDescription>
                </div>
                <Switch
                    checked={draft.enabled}
                    disabled={!canManage || saving}
                    aria-label={`Send a message when: ${meta.label}`}
                    onCheckedChange={(enabled) => {
                        const next = { ...draft, enabled };
                        setDraft(next);
                        // Switching off is saved at once; switching on is saved with the template.
                        if (!enabled && rule.enabled) void save(next);
                    }}
                />
            </CardHeader>
            <CardContent className="grid gap-4">
                {numbers.length > 1 && (
                    <Field label="Send from" htmlFor={`${rule.event}-number`}>
                        <Select
                            value={draft.phone_number_id ?? ''}
                            onValueChange={(v) =>
                                setDraft((d) => ({ ...d, phone_number_id: v, template_name: null, template_language: null, variables: null }))
                            }
                            disabled={!canManage}
                        >
                            <SelectTrigger id={`${rule.event}-number`} className="w-full sm:w-80">
                                <SelectValue placeholder="Choose a number" />
                            </SelectTrigger>
                            <SelectContent>
                                {numbers.map((n) => (
                                    <SelectItem key={n.id} value={n.id}>
                                        {n.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                )}
                <Field
                    label="Template"
                    htmlFor={`${rule.event}-template`}
                    hint={
                        usable.length === 0 ? (
                            <>
                                No approved template yet.{' '}
                                <Link href="/templates" className="underline">
                                    Create one
                                </Link>{' '}
                                (text header or no header).
                            </>
                        ) : meta.key === 'checkout_abandoned' ? (
                            'Reminders are marketing: with a Marketing template they only go to customers who opted in.'
                        ) : (
                            'Use a Utility template for order updates.'
                        )
                    }
                >
                    <Select
                        value={template ? key(template) : ''}
                        onValueChange={(v) => {
                            const t = usable.find((x) => key(x) === v);
                            setDraft((d) => ({ ...d, template_name: t?.name ?? null, template_language: t?.language ?? null, variables: null }));
                        }}
                        disabled={!canManage || usable.length === 0}
                    >
                        <SelectTrigger id={`${rule.event}-template`} className="w-full sm:w-80">
                            <SelectValue placeholder="Choose an approved template" />
                        </SelectTrigger>
                        <SelectContent>
                            {usable.map((t) => (
                                <SelectItem key={t.id} value={key(t)}>
                                    {t.name} · {t.language} · {(t.category ?? '').toLowerCase()}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>

                {template && (
                    <>
                        <div className="rounded-lg border bg-muted/50 p-3 text-[13.5px] whitespace-pre-wrap">{body}</div>
                        {(template.variables.header.length > 0 || template.variables.body.length > 0 || urlButtons.length > 0) && (
                            <div className="grid gap-2.5">
                                <p className="text-sm font-medium">What goes into each variable</p>
                                {template.variables.header.map((name, i) => (
                                    <VariableInput
                                        key={`h-${template.id}-${name}`}
                                        label={`Header {{${name}}}`}
                                        value={draft.variables?.header?.[i] ?? ''}
                                        fields={overview.fields}
                                        onChange={(v) => setVariable('header', i, v)}
                                    />
                                ))}
                                {template.variables.body.map((name, i) => (
                                    <VariableInput
                                        key={`b-${template.id}-${name}`}
                                        label={`{{${name}}}`}
                                        value={draft.variables?.body?.[i] ?? ''}
                                        fields={overview.fields}
                                        onChange={(v) => setVariable('body', i, v)}
                                    />
                                ))}
                                {urlButtons.map((b) => (
                                    <VariableInput
                                        key={`u-${template.id}-${b.index}`}
                                        label={`Button "${b.text}"`}
                                        value={draft.variables?.buttons?.[String(b.index)] ?? ''}
                                        fields={overview.fields}
                                        onChange={(v) =>
                                            setDraft((d) => ({
                                                ...d,
                                                variables: { ...d.variables, buttons: { ...d.variables?.buttons, [String(b.index)]: v } },
                                            }))
                                        }
                                    />
                                ))}
                            </div>
                        )}
                    </>
                )}

                {meta.key === 'checkout_abandoned' && (
                    <Field
                        label="Send the reminder after"
                        htmlFor="delay"
                        hint="Minutes after the customer last touched the checkout. Nothing is sent if they complete the order first."
                    >
                        <Input
                            id="delay"
                            type="number"
                            min={15}
                            max={4320}
                            className="w-28"
                            value={draft.delay_minutes}
                            disabled={!canManage}
                            onChange={(e) => setDraft((d) => ({ ...d, delay_minutes: Number(e.target.value) }))}
                        />
                    </Field>
                )}

                <FormError message={error} />
                {canManage && (
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={() => save()} disabled={saving || !dirty}>
                            {saving ? 'Saving…' : 'Save'}
                        </Button>
                        <Button variant="outline" onClick={() => setTestOpen(true)} disabled={dirty || !rule.template_name}>
                            <SendIcon /> Send a test
                        </Button>
                    </div>
                )}
            </CardContent>

            <Dialog open={testOpen} onOpenChange={setTestOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Send a test message</DialogTitle>
                        <DialogDescription>The template is sent to this number with sample values (Sara, order 1042, AED 249.00).</DialogDescription>
                    </DialogHeader>
                    <Field label="WhatsApp number" htmlFor="test-phone">
                        <Input id="test-phone" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="+971501234567" autoFocus />
                    </Field>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTestOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            disabled={testPhone.trim() === ''}
                            onClick={async () => {
                                try {
                                    await testIntegrationRule(integration.id, rule.event, testPhone.trim());
                                    toast.success('Test message sent');
                                    setTestOpen(false);
                                } catch (e) {
                                    toast.error(firstError(e));
                                }
                            }}
                        >
                            Send
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}

const EVENT_TONE: Record<IntegrationEvent['status'], Tone> = { sent: 'good', pending: 'info', skipped: 'grey', cancelled: 'grey', failed: 'bad' };
const EVENT_LABEL: Record<IntegrationEvent['status'], string> = {
    sent: 'Sent',
    pending: 'Waiting',
    skipped: 'Not sent',
    cancelled: 'Cancelled',
    failed: 'Failed',
};

function Activity({ integration, overview }: { integration: Integration; overview: IntegrationsOverview }) {
    const [status, setStatus] = useState('all');
    const events = useIntegrationEvents(integration.id, status === 'all' ? undefined : status);
    const label = (key: string) => overview.events.find((e) => e.key === key)?.label ?? key;

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between gap-4">
                <div>
                    <CardTitle>Activity</CardTitle>
                    <CardDescription>Everything this store reported in the last 60 days, and what was sent for it.</CardDescription>
                </div>
                <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="w-36">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {Object.entries(EVENT_LABEL).map(([k, v]) => (
                            <SelectItem key={k} value={k}>
                                {v}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </CardHeader>
            <CardContent>
                {!events.data ? (
                    <Skeleton className="h-32" />
                ) : events.data.data.length === 0 ? (
                    <EmptyState
                        icon={<StoreIcon />}
                        title="Nothing yet"
                        description="Orders appear here as soon as the store reports them. Place a test order to try it."
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>When</TableHead>
                                    <TableHead>Event</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Result</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {events.data.data.map((e) => (
                                    <TableRow key={e.id}>
                                        <TableCell className="whitespace-nowrap text-muted-foreground">{when(e.created_at)}</TableCell>
                                        <TableCell>
                                            {label(e.event)}
                                            {e.reference && <span className="text-muted-foreground"> · #{e.reference}</span>}
                                        </TableCell>
                                        <TableCell>
                                            {e.customer ?? '—'}
                                            {e.phone && <span className="block text-[12.5px] text-muted-foreground">{e.phone}</span>}
                                        </TableCell>
                                        <TableCell className="max-w-sm">
                                            <Badge tone={EVENT_TONE[e.status]}>{EVENT_LABEL[e.status]}</Badge>
                                            <span className="mt-1 block text-[12.5px] text-muted-foreground">
                                                {e.status === 'pending' && e.due_at ? `Reminder goes out ${when(e.due_at)}` : e.detail}
                                            </span>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function StoreSettings({
    integration,
    canManage,
    onSaved,
    onDisconnected,
}: {
    integration: Integration;
    canManage: boolean;
    onSaved: (i: Integration) => void;
    onDisconnected: () => void;
}) {
    const [code, setCode] = useState(integration.default_country_code ?? '');
    const [tag, setTag] = useState(integration.tag ?? '');
    const [confirm, setConfirm] = useState(false);
    const patch = async (body: Parameters<typeof updateIntegration>[1], done = 'Saved') => {
        try {
            onSaved(await updateIntegration(integration.id, body));
            toast.success(done);
        } catch (e) {
            toast.error(firstError(e));
        }
    };

    return (
        <div className="grid gap-5">
            <Card>
                <CardHeader>
                    <div>
                        <CardTitle>Customers from this store</CardTitle>
                        <CardDescription>Every customer who gives a phone number is saved as a contact, whether or not a message is sent.</CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="grid gap-4">
                    <Field
                        label="Default country code"
                        htmlFor="cc"
                        hint="Added to numbers typed without a country code when the order does not say which country it is. For the UAE: 971."
                    >
                        <Input
                            id="cc"
                            className="w-28"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            placeholder="971"
                            inputMode="numeric"
                            disabled={!canManage}
                        />
                    </Field>
                    <Field label="Tag for these contacts" htmlFor="tag" hint="Makes it easy to reach store customers in a campaign. Leave empty for no tag.">
                        <Input id="tag" className="w-60" value={tag} onChange={(e) => setTag(e.target.value)} disabled={!canManage} />
                    </Field>
                    {integration.provider === 'shopify' && (
                        <label className="flex items-start gap-3 text-sm">
                            <Switch
                                checked={integration.trust_store_consent}
                                disabled={!canManage}
                                onCheckedChange={(v) => patch({ trust_store_consent: v })}
                                aria-label="Treat customers who accepted SMS marketing at checkout as opted in"
                            />
                            <span>
                                Treat customers who accepted text-message marketing at checkout as opted in
                                <span className="block text-[12.5px] text-muted-foreground">
                                    Only switch this on if your checkout&apos;s consent wording covers WhatsApp. The opt-in is written to the consent ledger.
                                </span>
                            </span>
                        </label>
                    )}
                    {canManage && (
                        <div>
                            <Button onClick={() => patch({ default_country_code: code.trim() || null, tag: tag.trim() || null })}>Save</Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {canManage && (
                <Card>
                    <CardHeader>
                        <div>
                            <CardTitle>Pause or disconnect</CardTitle>
                            <CardDescription>
                                While paused, orders are still recorded but no messages are sent. Disconnecting removes the store, its messages and its activity
                                here; contacts and conversations stay.
                            </CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                        <Button
                            variant="outline"
                            onClick={() =>
                                patch({ status: integration.status === 'active' ? 'paused' : 'active' }, integration.status === 'active' ? 'Paused' : 'Resumed')
                            }
                        >
                            {integration.status === 'active' ? 'Pause messages' : 'Resume messages'}
                        </Button>
                        <Button variant="outline" className="text-bad" onClick={() => setConfirm(true)}>
                            <Trash2Icon /> Disconnect
                        </Button>
                    </CardContent>
                </Card>
            )}

            <AlertDialog open={confirm} onOpenChange={setConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Disconnect {integration.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Messages for this store stop immediately.
                            {integration.provider === 'shopify' &&
                                ' To remove the app from Shopify as well, uninstall it under Settings → Apps in your Shopify admin.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                try {
                                    await disconnectIntegration(integration.id);
                                    toast.success('Store disconnected');
                                    onDisconnected();
                                } catch (e) {
                                    toast.error(firstError(e));
                                }
                            }}
                        >
                            Disconnect
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function StoreDetail({ id, overview, canManage, onBack }: { id: string; overview: IntegrationsOverview; canManage: boolean; onBack: () => void }) {
    const qc = useQueryClient();
    const store = useIntegration(id);
    const templates = useTemplates({ status: 'APPROVED' });
    const phoneNumbers = usePhoneNumbers();
    const numbers = useMemo(
        () =>
            (phoneNumbers.data ?? [])
                .filter((n) => n.status === 'connected')
                .map((n) => ({
                    id: n.id,
                    label: `${n.display_phone_number ?? n.e164 ?? 'Number'}${n.verified_name ? ` · ${n.verified_name}` : ''}`,
                    waba: n.waba_account_id,
                })),
        [phoneNumbers.data],
    );
    const saved = (i: Integration) => {
        qc.setQueryData(['integrations', 'one', id], i);
        void qc.invalidateQueries({ queryKey: ['integrations', 'overview'] });
    };
    const integration = store.data;

    return (
        <>
            <Button variant="ghost" size="sm" className="mb-3 -ml-2" onClick={onBack}>
                <ArrowLeftIcon /> All integrations
            </Button>
            {!integration || !integration.rules ? (
                <Skeleton className="h-64" />
            ) : (
                <>
                    <PageHeader
                        title={integration.name}
                        description={
                            <>
                                {PROVIDER[integration.provider].name} · {integration.store} · last event {when(integration.last_event_at)}
                            </>
                        }
                        actions={
                            integration.status === 'active' ? (
                                <Badge tone="good" dot>
                                    Connected
                                </Badge>
                            ) : (
                                <Badge tone="warn" dot>
                                    Paused
                                </Badge>
                            )
                        }
                    />
                    {numbers.length === 0 && phoneNumbers.data && (
                        <div className="mb-4 rounded-md border border-warn/40 bg-warn-bg px-3 py-2 text-[13px]">
                            No WhatsApp number is connected, so nothing can be sent yet.{' '}
                            <Link href="/channels?connect=1" className="font-medium underline">
                                Connect a number
                            </Link>
                        </div>
                    )}
                    <Tabs defaultValue="messages">
                        <TabsList>
                            <TabsTrigger value="messages">Messages</TabsTrigger>
                            <TabsTrigger value="activity">Activity</TabsTrigger>
                            <TabsTrigger value="settings">Settings</TabsTrigger>
                        </TabsList>
                        <TabsContent value="messages" className="grid gap-5">
                            {integration.rules.map((rule) => {
                                const meta = overview.events.find((e) => e.key === rule.event);

                                return meta ? (
                                    <RuleEditor
                                        key={`${rule.event}-${JSON.stringify(rule)}`}
                                        integration={integration}
                                        rule={rule}
                                        meta={meta}
                                        overview={overview}
                                        templates={templates.data?.data ?? []}
                                        numbers={numbers}
                                        canManage={canManage}
                                        onSaved={saved}
                                    />
                                ) : null;
                            })}
                        </TabsContent>
                        <TabsContent value="activity">
                            <Activity integration={integration} overview={overview} />
                        </TabsContent>
                        <TabsContent value="settings">
                            <StoreSettings
                                integration={integration}
                                canManage={canManage}
                                onSaved={saved}
                                onDisconnected={() => {
                                    void qc.invalidateQueries({ queryKey: ['integrations', 'overview'] });
                                    onBack();
                                }}
                            />
                        </TabsContent>
                    </Tabs>
                </>
            )}
        </>
    );
}

// ── Catalog ────────────────────────────────────────────────────────────────────────────────

function CatalogCard({ icon, title, blurb, children }: { icon: React.ReactNode; title: string; blurb: string; children: React.ReactNode }) {
    return (
        <Card className="flex flex-col">
            <CardContent className="flex flex-1 flex-col gap-3 pt-5">
                <div className="inline-flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{icon}</div>
                <div className="flex-1">
                    <p className="text-[15px] font-semibold">{title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
                </div>
                <div className="flex flex-wrap gap-2">{children}</div>
            </CardContent>
        </Card>
    );
}

export default function IntegrationsPage() {
    const { can } = useSession();
    const qc = useQueryClient();
    const allowed = can(P.IntegrationsView);
    const overview = useIntegrations(allowed);
    const canManage = can(P.IntegrationsManage);
    // Coming back from Shopify: ?connected=<id> opens the new store, ?error= explains what went wrong,
    // and ?shopify=<store> (the app was installed from Shopify's side) opens the connect window for that store.
    const [arrival] = useState(() => {
        const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);

        return { connected: params.get('connected'), error: params.get('error'), shop: params.get('shopify') };
    });
    const [selected, setSelected] = useState<string | null>(arrival.connected);
    const [shopify, setShopify] = useState<{ open: boolean; shop: string }>({ open: arrival.shop !== null, shop: arrival.shop ?? '' });
    const [woo, setWoo] = useState(false);
    const [platform, setPlatform] = useState<'Zapier' | 'Make' | null>(null);

    useEffect(() => {
        if (arrival.connected) toast.success('Shopify store connected. Choose the messages to send.');
        if (arrival.error) toast.error(arrival.error, { duration: 10_000 });
        if (arrival.connected || arrival.error || arrival.shop) window.history.replaceState(null, '', window.location.pathname);
    }, [arrival]);

    if (!allowed) return <Forbidden />;
    if (!overview.data) return <Skeleton className="h-64" />;
    const data = overview.data;

    if (selected) return <StoreDetail id={selected} overview={data} canManage={canManage} onBack={() => setSelected(null)} />;

    const connect = (provider: IntegrationProvider) => (provider === 'shopify' ? setShopify({ open: true, shop: '' }) : setWoo(true));

    return (
        <>
            <PageHeader
                title="Integrations"
                description="Connect your store and other apps, so WhatsApp messages go out by themselves when something happens there."
            />

            {!data.can.stores && (
                <div className="mb-5 rounded-md border border-warn/40 bg-warn-bg px-4 py-3 text-sm">
                    Store integrations are not in your current plan.{' '}
                    <Link href="/billing" className="font-medium underline">
                        See plans
                    </Link>
                </div>
            )}

            {data.integrations.length > 0 && (
                <Card className="mb-6">
                    <CardHeader>
                        <div>
                            <CardTitle>Connected stores</CardTitle>
                            <CardDescription>Open a store to choose its messages and see what was sent.</CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="grid gap-2">
                        {data.integrations.map((i) => (
                            <button
                                key={i.id}
                                type="button"
                                onClick={() => setSelected(i.id)}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted/60"
                            >
                                <span className="min-w-0">
                                    <span className="block truncate font-medium">{i.name}</span>
                                    <span className="block truncate text-[13px] text-muted-foreground">
                                        {PROVIDER[i.provider].name} · {i.store}
                                    </span>
                                </span>
                                <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
                                    {i.active_rules === 0 ? (
                                        <Badge tone="warn">No messages switched on</Badge>
                                    ) : (
                                        <Badge tone="brand">
                                            {i.active_rules} message{i.active_rules === 1 ? '' : 's'} on
                                        </Badge>
                                    )}
                                    {i.status === 'active' ? (
                                        <Badge tone="good" dot>
                                            Connected
                                        </Badge>
                                    ) : (
                                        <Badge tone="warn" dot>
                                            Paused
                                        </Badge>
                                    )}
                                </span>
                            </button>
                        ))}
                    </CardContent>
                </Card>
            )}

            <h2 className="mb-3 text-[15px] font-semibold">Stores</h2>
            <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {(['shopify', 'woocommerce'] as const).map((provider) => (
                    <CatalogCard
                        key={provider}
                        icon={provider === 'shopify' ? <ShoppingBagIcon /> : <StoreIcon />}
                        title={PROVIDER[provider].name}
                        blurb={PROVIDER[provider].blurb}
                    >
                        {!data.providers[provider].available ? (
                            <Badge>Coming soon</Badge>
                        ) : (
                            canManage && (
                                <Button onClick={() => connect(provider)} disabled={!data.can.stores}>
                                    <PlugIcon /> Connect
                                </Button>
                            )
                        )}
                    </CatalogCard>
                ))}
            </div>

            <h2 className="mb-3 text-[15px] font-semibold">Automation platforms</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <CatalogCard icon={<ZapIcon />} title="Zapier" blurb="Link WhatsApp to 7,000+ apps: Google Sheets, HubSpot, Calendly, Typeform and more.">
                    <Button variant="outline" onClick={() => setPlatform('Zapier')}>
                        How to connect
                    </Button>
                </CatalogCard>
                <CatalogCard icon={<WorkflowIcon />} title="Make" blurb="Build multi-step scenarios that start from a WhatsApp message or send one.">
                    <Button variant="outline" onClick={() => setPlatform('Make')}>
                        How to connect
                    </Button>
                </CatalogCard>
                <CatalogCard icon={<ExternalLinkIcon />} title="Your own system" blurb="Use the API and webhooks directly from your CRM, ERP or website.">
                    <Button asChild variant="outline">
                        <Link href="/developer">Open Developer</Link>
                    </Button>
                </CatalogCard>
            </div>

            <ShopifyDialog key={shopify.shop} open={shopify.open} initialShop={shopify.shop} onClose={() => setShopify({ open: false, shop: '' })} />
            <WooDialog
                open={woo}
                onClose={() => setWoo(false)}
                onConnected={(i) => {
                    setWoo(false);
                    toast.success('Store connected. Choose the messages to send.');
                    void qc.invalidateQueries({ queryKey: ['integrations', 'overview'] });
                    setSelected(i.id);
                }}
            />
            <AutomationDialog platform={platform} overview={data} onClose={() => setPlatform(null)} />
        </>
    );
}
