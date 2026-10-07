'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CheckIcon, CopyIcon, KeyRoundIcon, PlusIcon, RefreshCwIcon, SendIcon, Trash2Icon, WebhookIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Field, FormError } from '@/components/app/field';
import { EmptyState, Forbidden, PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { Badge, type Tone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
    createApiKey,
    deleteWebhookEndpoint,
    resendWebhookDelivery,
    revokeApiKey,
    rotateWebhookSecret,
    saveWebhookEndpoint,
    testWebhookEndpoint,
    useApiKeys,
    useDeveloperOverview,
    useWebhookDeliveries,
    useWebhookEndpoints,
} from '@/lib/queries';
import type { ApiKey, DeveloperOverview, WebhookDelivery, WebhookEndpoint } from '@/lib/types';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const firstError = (e: unknown) => (e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? e.message) : errorMessage(e));

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
    const [done, setDone] = useState(false);

    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
                await navigator.clipboard.writeText(value).catch(() => undefined);
                setDone(true);
                setTimeout(() => setDone(false), 1500);
            }}
        >
            {done ? <CheckIcon /> : <CopyIcon />} {done ? 'Copied' : label}
        </Button>
    );
}

function Code({ children }: { children: string }) {
    return (
        <div className="relative">
            <pre className="overflow-x-auto rounded-lg bg-[#0d1109] p-4 font-mono text-[12.5px] leading-relaxed text-[#d7e9b0]">{children}</pre>
            <div className="absolute top-2 right-2">
                <CopyButton value={children} />
            </div>
        </div>
    );
}

/** Shown once, right after a key or signing secret is created: it cannot be read again afterwards. */
function SecretDialog({ secret, title, onClose }: { secret: { value: string; what: string } | null; title: string; onClose: () => void }) {
    return (
        <Dialog open={secret !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>Copy it now and keep it somewhere safe. For your security it is not stored and cannot be shown again.</DialogDescription>
                </DialogHeader>
                <div className="rounded-lg border border-warn/40 bg-warn-bg p-3">
                    <p className="font-mono text-[13px] break-all">{secret?.value}</p>
                </div>
                <DialogFooter>
                    <CopyButton value={secret?.value ?? ''} label={`Copy ${secret?.what ?? ''}`} />
                    <Button onClick={onClose}>I have saved it</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── API keys ───────────────────────────────────────────────────────────────────────────────

const KEY_TONE: Record<ApiKey['status'], Tone> = { active: 'good', revoked: 'grey', expired: 'warn' };

function KeysTab({ overview, canManage }: { overview: DeveloperOverview; canManage: boolean }) {
    const qc = useQueryClient();
    const keys = useApiKeys();
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [scopes, setScopes] = useState<string[]>([]);
    const [expiry, setExpiry] = useState('never');
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [secret, setSecret] = useState<{ value: string; what: string } | null>(null);
    const refresh = () => qc.invalidateQueries({ queryKey: ['developer', 'keys'] });

    const create = async () => {
        setSaving(true);
        setError(null);
        try {
            const key = await createApiKey({ name: name.trim(), scopes, expires_in_days: expiry === 'never' ? null : Number(expiry) });
            setOpen(false);
            setName('');
            setScopes([]);
            setSecret({ value: key.key ?? '', what: 'key' });
            void refresh();
        } catch (e) {
            setError(firstError(e));
        } finally {
            setSaving(false);
        }
    };

    if (!overview.can.api) {
        return (
            <EmptyState
                icon={<KeyRoundIcon />}
                title="API access is not in your plan"
                description="Upgrade your plan to create API keys and connect your own systems."
            />
        );
    }

    return (
        <Card>
            <CardHeader>
                <div>
                    <CardTitle>API keys</CardTitle>
                    <CardDescription>
                        A key lets your own system act for this workspace. Give each system its own key with only the permissions it needs.
                    </CardDescription>
                </div>
                {canManage && (
                    <Button onClick={() => setOpen(true)}>
                        <PlusIcon /> New key
                    </Button>
                )}
            </CardHeader>
            <CardContent>
                {keys.isLoading ? (
                    <Skeleton className="h-24" />
                ) : (keys.data ?? []).length === 0 ? (
                    <p className="text-[13.5px] text-muted-foreground">No keys yet.</p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Key</TableHead>
                                <TableHead>Permissions</TableHead>
                                <TableHead>Last used</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(keys.data ?? []).map((k) => (
                                <TableRow key={k.id}>
                                    <TableCell className="font-medium">{k.name}</TableCell>
                                    <TableCell className="font-mono text-[12.5px]">{k.prefix}…</TableCell>
                                    <TableCell className="max-w-64 text-[12.5px] text-muted-foreground">{k.scopes.join(', ')}</TableCell>
                                    <TableCell className="text-[13px] text-muted-foreground">
                                        {when(k.last_used_at)}
                                        {k.last_used_ip && <span className="block font-mono text-[11.5px]">{k.last_used_ip}</span>}
                                    </TableCell>
                                    <TableCell>
                                        <Badge tone={KEY_TONE[k.status]}>
                                            {k.status === 'active' ? 'Active' : k.status === 'revoked' ? 'Revoked' : 'Expired'}
                                        </Badge>
                                        {k.status === 'active' && k.expires_at && (
                                            <span className="mt-0.5 block text-[11.5px] text-muted-foreground">until {when(k.expires_at)}</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {canManage && k.status === 'active' && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-bad"
                                                onClick={async () => {
                                                    if (!window.confirm(`Revoke “${k.name}”? Anything using this key stops working immediately.`)) return;
                                                    await revokeApiKey(k.id).catch((e: unknown) => toast.error(errorMessage(e)));
                                                    void refresh();
                                                }}
                                            >
                                                Revoke
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>New API key</DialogTitle>
                        <DialogDescription>The key is shown once after you create it.</DialogDescription>
                    </DialogHeader>
                    <FormError message={error} />
                    <Field label="Name" htmlFor="key-name" hint="Where it will be used, for example “CRM sync”.">
                        <Input id="key-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
                    </Field>
                    <fieldset className="grid gap-2">
                        <legend className="mb-1 text-sm font-medium">Permissions</legend>
                        {overview.scopes.map((s) => (
                            <label key={s.key} className="flex items-start gap-2.5 text-sm">
                                <Checkbox
                                    checked={scopes.includes(s.key)}
                                    onCheckedChange={(c) => setScopes((cur) => (c ? [...cur, s.key] : cur.filter((x) => x !== s.key)))}
                                    className="mt-0.5"
                                />
                                <span>
                                    {s.label}
                                    <span className="block font-mono text-[11.5px] text-muted-foreground">{s.key}</span>
                                </span>
                            </label>
                        ))}
                    </fieldset>
                    <Field label="Expires" htmlFor="key-expiry">
                        <Select value={expiry} onValueChange={setExpiry}>
                            <SelectTrigger id="key-expiry">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="never">Never</SelectItem>
                                <SelectItem value="30">In 30 days</SelectItem>
                                <SelectItem value="90">In 90 days</SelectItem>
                                <SelectItem value="365">In 1 year</SelectItem>
                            </SelectContent>
                        </Select>
                    </Field>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={create} disabled={saving || !name.trim() || scopes.length === 0}>
                            {saving ? 'Creating…' : 'Create key'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <SecretDialog secret={secret} title="Your new API key" onClose={() => setSecret(null)} />
        </Card>
    );
}

// ── Webhooks ───────────────────────────────────────────────────────────────────────────────

const ENDPOINT: Record<WebhookEndpoint['status'], [string, Tone]> = {
    active: ['On', 'good'],
    paused: ['Paused', 'grey'],
    disabled: ['Switched off after failures', 'bad'],
};

function WebhooksTab({ overview, canManage }: { overview: DeveloperOverview; canManage: boolean }) {
    const qc = useQueryClient();
    const endpoints = useWebhookEndpoints();
    const [editing, setEditing] = useState<WebhookEndpoint | 'new' | null>(null);
    const [url, setUrl] = useState('');
    const [description, setDescription] = useState('');
    const [events, setEvents] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [secret, setSecret] = useState<{ value: string; what: string } | null>(null);
    const refresh = () => qc.invalidateQueries({ queryKey: ['developer'] });

    const openEditor = (item: WebhookEndpoint | 'new') => {
        setEditing(item);
        setUrl(item === 'new' ? '' : item.url);
        setDescription(item === 'new' ? '' : (item.description ?? ''));
        setEvents(item === 'new' ? [] : item.events);
        setError(null);
    };

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            const saved = await saveWebhookEndpoint(editing === 'new' || editing === null ? null : editing.id, {
                url: url.trim(),
                description: description.trim() || null,
                events,
            });
            setEditing(null);
            if (saved.secret) setSecret({ value: saved.secret, what: 'secret' });
            void refresh();
        } catch (e) {
            setError(firstError(e));
        } finally {
            setSaving(false);
        }
    };

    const act = async (work: () => Promise<unknown>, done: string) => {
        try {
            await work();
            toast.success(done);
            void refresh();
        } catch (e) {
            toast.error(firstError(e));
        }
    };

    if (!overview.can.webhooks) {
        return (
            <EmptyState icon={<WebhookIcon />} title="Webhooks are not in your plan" description="Upgrade your plan to receive events in your own systems." />
        );
    }

    return (
        <Card>
            <CardHeader>
                <div>
                    <CardTitle>Webhook endpoints</CardTitle>
                    <CardDescription>
                        We send a signed request to your URL when something happens in this workspace. Reply with any 2xx status within 10 seconds.
                    </CardDescription>
                </div>
                {canManage && (
                    <Button onClick={() => openEditor('new')}>
                        <PlusIcon /> Add endpoint
                    </Button>
                )}
            </CardHeader>
            <CardContent className="grid gap-3">
                {endpoints.isLoading && <Skeleton className="h-20" />}
                {!endpoints.isLoading && (endpoints.data ?? []).length === 0 && <p className="text-[13.5px] text-muted-foreground">No endpoints yet.</p>}
                {(endpoints.data ?? []).map((e) => {
                    const [label, tone] = ENDPOINT[e.status];

                    return (
                        <div key={e.id} className="rounded-lg border p-4">
                            <div className="flex flex-wrap items-start gap-3">
                                <div className="min-w-0 flex-1">
                                    <p className="font-mono text-[13px] break-all">{e.url}</p>
                                    {e.description && <p className="mt-0.5 text-[13px] text-muted-foreground">{e.description}</p>}
                                </div>
                                <Badge tone={tone}>{label}</Badge>
                                {canManage && (
                                    <Switch
                                        checked={e.status === 'active'}
                                        aria-label="Endpoint on"
                                        onCheckedChange={(on) =>
                                            act(
                                                () => saveWebhookEndpoint(e.id, { status: on ? 'active' : 'paused' }),
                                                on ? 'Endpoint switched on' : 'Endpoint paused',
                                            )
                                        }
                                    />
                                )}
                            </div>
                            <p className="mt-2 text-[12.5px] text-muted-foreground">
                                {e.events.length} event{e.events.length === 1 ? '' : 's'}: {e.events.join(', ')}
                            </p>
                            <p className="mt-1 text-[12.5px] text-muted-foreground">
                                Last success {when(e.last_success_at)} · last failure {when(e.last_failure_at)}
                                {e.consecutive_failures > 0 && ` · ${e.consecutive_failures} failed in a row`}
                            </p>
                            {canManage && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => act(() => testWebhookEndpoint(e.id), 'Test event sent. See the result under Logs.')}
                                    >
                                        <SendIcon /> Send test event
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => openEditor(e)}>
                                        Edit
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={async () => {
                                            if (!window.confirm('Create a new signing secret? The current one stops working immediately.')) return;
                                            try {
                                                const rotated = await rotateWebhookSecret(e.id);
                                                if (rotated.secret) setSecret({ value: rotated.secret, what: 'secret' });
                                            } catch (err) {
                                                toast.error(firstError(err));
                                            }
                                        }}
                                    >
                                        <RefreshCwIcon /> New secret
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-bad"
                                        onClick={() =>
                                            window.confirm('Delete this endpoint and its delivery log?') &&
                                            act(() => deleteWebhookEndpoint(e.id), 'Endpoint deleted')
                                        }
                                    >
                                        <Trash2Icon /> Delete
                                    </Button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </CardContent>

            <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editing === 'new' ? 'Add endpoint' : 'Edit endpoint'}</DialogTitle>
                        <DialogDescription>Use a public https:// address on your own server.</DialogDescription>
                    </DialogHeader>
                    <FormError message={error} />
                    <Field label="Endpoint URL" htmlFor="wh-url">
                        <Input
                            id="wh-url"
                            type="url"
                            inputMode="url"
                            placeholder="https://example.com/webhooks/engage"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                        />
                    </Field>
                    <Field label="Description (optional)" htmlFor="wh-desc">
                        <Input id="wh-desc" maxLength={160} value={description} onChange={(e) => setDescription(e.target.value)} />
                    </Field>
                    <fieldset className="grid gap-2">
                        <legend className="mb-1 flex w-full items-center justify-between text-sm font-medium">
                            Events
                            <button
                                type="button"
                                className="text-[12.5px] font-semibold text-brand-600 hover:underline"
                                onClick={() => setEvents(events.length === overview.events.length ? [] : overview.events.map((x) => x.key))}
                            >
                                {events.length === overview.events.length ? 'Clear all' : 'Select all'}
                            </button>
                        </legend>
                        {overview.events.map((ev) => (
                            <label key={ev.key} className="flex items-start gap-2.5 text-sm">
                                <Checkbox
                                    checked={events.includes(ev.key)}
                                    onCheckedChange={(c) => setEvents((cur) => (c ? [...cur, ev.key] : cur.filter((x) => x !== ev.key)))}
                                    className="mt-0.5"
                                />
                                <span>
                                    {ev.label}
                                    <span className="block font-mono text-[11.5px] text-muted-foreground">{ev.key}</span>
                                </span>
                            </label>
                        ))}
                    </fieldset>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditing(null)}>
                            Cancel
                        </Button>
                        <Button onClick={save} disabled={saving || !url.trim() || events.length === 0}>
                            {saving ? 'Saving…' : 'Save'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <SecretDialog secret={secret} title="Signing secret" onClose={() => setSecret(null)} />
        </Card>
    );
}

// ── Logs ───────────────────────────────────────────────────────────────────────────────────

const DELIVERY: Record<WebhookDelivery['status'], [string, Tone]> = {
    delivered: ['Delivered', 'good'],
    pending: ['Retrying', 'warn'],
    failed: ['Failed', 'bad'],
};

function LogsTab({ canManage }: { canManage: boolean }) {
    const qc = useQueryClient();
    const [status, setStatus] = useState('all');
    const [open, setOpen] = useState<WebhookDelivery | null>(null);
    const deliveries = useWebhookDeliveries(status === 'all' ? {} : { status });
    const rows = deliveries.data?.data ?? [];

    return (
        <Card>
            <CardHeader>
                <div>
                    <CardTitle>Delivery log</CardTitle>
                    <CardDescription>Every event sent to your endpoints in the last 30 days, with what your server answered.</CardDescription>
                </div>
                <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="w-40" aria-label="Status">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="delivered">Delivered</SelectItem>
                        <SelectItem value="pending">Retrying</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                </Select>
            </CardHeader>
            <CardContent>
                {deliveries.isLoading ? (
                    <Skeleton className="h-24" />
                ) : rows.length === 0 ? (
                    <p className="text-[13.5px] text-muted-foreground">Nothing sent yet. Use “Send test event” on an endpoint to try it.</p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Time</TableHead>
                                <TableHead>Event</TableHead>
                                <TableHead>Result</TableHead>
                                <TableHead>Response</TableHead>
                                <TableHead>Attempts</TableHead>
                                <TableHead />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((d) => {
                                const [label, tone] = DELIVERY[d.status];

                                return (
                                    <TableRow key={d.id}>
                                        <TableCell className="text-[13px] whitespace-nowrap text-muted-foreground">{when(d.created_at)}</TableCell>
                                        <TableCell className="font-mono text-[12.5px]">{d.event}</TableCell>
                                        <TableCell>
                                            <Badge tone={tone}>{label}</Badge>
                                        </TableCell>
                                        <TableCell className="text-[13px] text-muted-foreground">
                                            {d.response_status ?? 'No answer'}
                                            {d.duration_ms !== null && ` · ${d.duration_ms} ms`}
                                        </TableCell>
                                        <TableCell className="text-[13px]">{d.attempts}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="sm" onClick={() => setOpen(d)}>
                                                Details
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </CardContent>

            <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="font-mono text-base">{open?.event}</DialogTitle>
                        <DialogDescription>
                            {when(open?.created_at ?? null)} · {open?.attempts} attempt{open?.attempts === 1 ? '' : 's'}
                            {open?.next_attempt_at && ` · next try ${when(open.next_attempt_at)}`}
                        </DialogDescription>
                    </DialogHeader>
                    <p className="text-sm font-medium">What we sent</p>
                    <Code>{JSON.stringify(open?.payload ?? {}, null, 2)}</Code>
                    <p className="text-sm font-medium">What your server answered ({open?.response_status ?? 'no answer'})</p>
                    <pre className="max-h-40 overflow-auto rounded-lg border bg-muted p-3 font-mono text-[12.5px] whitespace-pre-wrap">
                        {open?.response_excerpt || '—'}
                    </pre>
                    <DialogFooter>
                        {canManage && open && (
                            <Button
                                variant="outline"
                                onClick={async () => {
                                    try {
                                        await resendWebhookDelivery(open.id);
                                        toast.success('Sent again as a new delivery');
                                        setOpen(null);
                                        void qc.invalidateQueries({ queryKey: ['developer', 'deliveries'] });
                                    } catch (e) {
                                        toast.error(firstError(e));
                                    }
                                }}
                            >
                                <SendIcon /> Resend
                            </Button>
                        )}
                        <Button onClick={() => setOpen(null)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}

// ── Reference ──────────────────────────────────────────────────────────────────────────────

const ENDPOINTS: [string, string, string, string][] = [
    ['GET', '/me', '—', 'The workspace and key in use. A quick way to check a key works.'],
    ['POST', '/messages', 'messages:send', 'Send a text (inside the 24-hour window) or an approved template.'],
    ['GET', '/messages/{id}', 'messages:read', 'One message with its current status.'],
    ['GET', '/conversations', 'messages:read', 'Conversations, newest first. Filter with ?status=open|closed.'],
    ['GET', '/conversations/{id}/messages', 'messages:read', 'Messages in a conversation, newest first.'],
    ['GET', '/contacts', 'contacts:read', 'Contacts. Find one with ?phone=+9715… or filter with ?tag=.'],
    ['GET', '/contacts/{id}', 'contacts:read', 'One contact.'],
    ['POST', '/contacts', 'contacts:write', 'Add a contact.'],
    ['PATCH', '/contacts/{id}', 'contacts:write', 'Change name, email, tags or attributes.'],
    ['POST', '/contacts/{id}/opt-in', 'contacts:write', 'Record that the contact agreed to messages.'],
    ['POST', '/contacts/{id}/opt-out', 'contacts:write', 'Record that the contact refused messages.'],
    ['GET', '/templates', 'templates:read', 'Your message templates. Filter with ?status=approved.'],
    ['GET', '/phone-numbers', 'templates:read', 'Your connected numbers and their ids.'],
];

function ReferenceTab({ overview }: { overview: DeveloperOverview }) {
    const base = overview.base_url;

    return (
        <div className="grid gap-5">
            <Card>
                <CardHeader>
                    <div>
                        <CardTitle>Getting started</CardTitle>
                        <CardDescription>
                            Base URL <span className="font-mono text-foreground">{base}</span>
                            {overview.rate_limit_per_minute && ` · up to ${overview.rate_limit_per_minute.toLocaleString()} requests per minute on your plan`}
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="grid gap-4">
                    <p className="text-sm text-muted-foreground">Send your key in the Authorization header. All requests and answers are JSON.</p>
                    <Code>{`curl ${base}/me \\\n  -H "Authorization: Bearer eng_live_YOUR_KEY"`}</Code>
                    <p className="text-sm font-medium">Send a text message</p>
                    <Code>{`curl -X POST ${base}/messages \\\n  -H "Authorization: Bearer eng_live_YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -H "Idempotency-Key: order-1001" \\\n  -d '{"to": "+971501234567", "type": "text", "text": "Your order is on its way"}'`}</Code>
                    <p className="text-sm font-medium">Send an approved template</p>
                    <Code>{`curl -X POST ${base}/messages \\\n  -H "Authorization: Bearer eng_live_YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"to": "+971501234567", "type": "template",\n       "template": {"name": "order_update", "language": "en",\n                    "variables": {"body": ["Sara", "#1001"]}}}'`}</Code>
                    <ul className="grid list-disc gap-1.5 pl-5 text-[13.5px] text-muted-foreground">
                        <li>202 means the message is queued for WhatsApp. Follow it with the message.* webhook events or GET /messages/{'{id}'}.</li>
                        <li>Text can only be sent within 24 hours of the customer&apos;s last message; outside that window use a template.</li>
                        <li>Messages to opted-out contacts are refused. Sending speed per number is limited automatically.</li>
                        <li>Repeat a request with the same Idempotency-Key and the message is not sent twice.</li>
                        <li>If the workspace has several numbers, add &quot;from&quot; with the number&apos;s id (GET /phone-numbers).</li>
                        <li>Lists return a next_cursor; pass it as ?cursor= to get the next page.</li>
                    </ul>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Endpoints</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Request</TableHead>
                                <TableHead>Permission</TableHead>
                                <TableHead>What it does</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {ENDPOINTS.map(([method, path, scope, what]) => (
                                <TableRow key={method + path}>
                                    <TableCell className="font-mono text-[12.5px] whitespace-nowrap">
                                        <span className="mr-2 font-semibold text-brand-600">{method}</span>
                                        {path}
                                    </TableCell>
                                    <TableCell className="font-mono text-[12px] text-muted-foreground">{scope}</TableCell>
                                    <TableCell className="text-[13.5px]">{what}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div>
                        <CardTitle>Verifying webhooks</CardTitle>
                        <CardDescription>
                            Each request carries an X-Engage-Signature header: <span className="font-mono">t=&lt;unix time&gt;,v1=&lt;signature&gt;</span>. The
                            signature is the HMAC-SHA256 of <span className="font-mono">&lt;t&gt;.&lt;raw body&gt;</span> with your endpoint&apos;s signing
                            secret.
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="grid gap-4">
                    <Code>{`// Node.js\nconst crypto = require('crypto');\n\nfunction isFromEngage(rawBody, header, secret) {\n  const { t, v1 } = Object.fromEntries(header.split(',').map((p) => p.split('=')));\n  const expected = crypto.createHmac('sha256', secret).update(t + '.' + rawBody).digest('hex');\n  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300; // reject old requests\n  return fresh && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));\n}`}</Code>
                    <ul className="grid list-disc gap-1.5 pl-5 text-[13.5px] text-muted-foreground">
                        <li>Answer with any 2xx status within 10 seconds; do slow work after answering.</li>
                        <li>A failed delivery is retried after 1 minute, 5 minutes, 30 minutes, 2 hours and 6 hours.</li>
                        <li>After 15 failures in a row the endpoint is switched off and the workspace owners are emailed.</li>
                        <li>The same event can arrive more than once: use its &quot;id&quot; to ignore repeats.</li>
                    </ul>
                </CardContent>
            </Card>
        </div>
    );
}

export default function DeveloperPage() {
    const { can } = useSession();
    const overview = useDeveloperOverview();
    const canManage = can(P.DeveloperManage);

    if (!can(P.DeveloperView)) return <Forbidden />;

    return (
        <>
            <PageHeader title="Developer" description="Connect your own systems: create API keys, receive events on your servers, and see every delivery." />
            {!overview.data ? (
                <Skeleton className="h-64" />
            ) : (
                <Tabs defaultValue="keys">
                    <TabsList>
                        <TabsTrigger value="keys">API keys</TabsTrigger>
                        <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
                        <TabsTrigger value="logs">Logs</TabsTrigger>
                        <TabsTrigger value="reference">API reference</TabsTrigger>
                    </TabsList>
                    <TabsContent value="keys">
                        <KeysTab overview={overview.data} canManage={canManage} />
                    </TabsContent>
                    <TabsContent value="webhooks">
                        <WebhooksTab overview={overview.data} canManage={canManage} />
                    </TabsContent>
                    <TabsContent value="logs">
                        <LogsTab canManage={canManage} />
                    </TabsContent>
                    <TabsContent value="reference">
                        <ReferenceTab overview={overview.data} />
                    </TabsContent>
                </Tabs>
            )}
        </>
    );
}
