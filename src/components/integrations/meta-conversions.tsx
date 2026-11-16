'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLinkIcon, MegaphoneIcon, PlusIcon, SendIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge, type Tone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useTags } from '@/lib/queries';

/**
 * Integrations › Meta conversion reporting (Conversions to Meta). Shown only to workspaces with the
 * conversions flag: for every other workspace the API answers 404 and nothing is rendered.
 */

type Account = {
    id: string;
    waba_id: string;
    name: string;
    permission: 'enabled' | 'not_enabled' | 'unknown';
    permission_checked_at: string | null;
    reporting: boolean;
    dataset_id: string | null;
};
type Step = { flow_id: string; step_id: string; label?: string };
type Overview = {
    accounts: Account[];
    rules: { lead_tags: string[]; lead_steps: Step[]; purchases: boolean };
    flows: { id: string; name: string; steps: { id: string; title: string; type: string }[] }[];
    help_url: string;
};
type LogRow = {
    id: string;
    time: string;
    contact: { id: string; name: string } | null;
    event: string;
    value: number | null;
    currency: string | null;
    ad: { source_id: string | null; headline: string | null } | null;
    status: 'queued' | 'sent' | 'failed' | 'expired' | 'skipped';
    status_label: string;
    reason: string | null;
    is_test: boolean;
};
type TestChat = { conversation_id: string; contact: string; ad: { source_id: string | null; headline: string | null }; clicked_at: string };
type TestResult = { status: LogRow['status']; status_label: string; reason: string | null; meta_response: Record<string, unknown> };

const STATUS_TONE: Record<LogRow['status'], Tone> = { queued: 'info', sent: 'good', failed: 'bad', expired: 'grey', skipped: 'warn' };
const EVENT_LABEL: Record<string, string> = { LeadSubmitted: 'Lead', Purchase: 'Purchase' };
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const firstError = (e: unknown) => (e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? e.message) : errorMessage(e));
const adLabel = (ad: LogRow['ad']) => (ad ? ad.headline || (ad.source_id ? `Ad ${ad.source_id}` : 'Meta ad') : '—');
const money = (value: number | null, currency: string | null) =>
    value === null ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'AED' }).format(value);

const KEY = ['conversions'] as const;

/** null = this workspace does not have Conversions to Meta (no card at all). */
function useConversions() {
    return useQuery({
        queryKey: KEY,
        queryFn: async () => {
            try {
                return (await api<{ data: Overview }>('conversions')).data;
            } catch (e) {
                if (e instanceof ApiError && e.status === 404) return null;
                throw e;
            }
        },
        retry: false,
    });
}

function Accounts({ data, canManage }: { data: Overview; canManage: boolean }) {
    const qc = useQueryClient();
    const toggle = useMutation({
        mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => api(`conversions/accounts/${id}/reporting`, { method: 'POST', body: { enabled } }),
        onSuccess: (_d, v) => {
            toast.success(v.enabled ? 'Conversion reporting is on for this account.' : 'Conversion reporting is off for this account.');
            void qc.invalidateQueries({ queryKey: KEY });
        },
        onError: (e) => {
            toast.error(firstError(e), { duration: 10_000 });
            void qc.invalidateQueries({ queryKey: KEY });
        },
    });

    return (
        <div className="grid gap-2">
            {data.accounts.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
                    <div className="min-w-0">
                        <p className="truncate font-medium">{a.name}</p>
                        <p className="text-[12.5px] text-muted-foreground">
                            WABA <span className="font-mono">{a.waba_id}</span>
                            {a.dataset_id && (
                                <>
                                    {' '}
                                    · Dataset <span className="font-mono">{a.dataset_id}</span>
                                </>
                            )}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Badge tone={a.permission === 'enabled' ? 'good' : a.permission === 'not_enabled' ? 'warn' : 'grey'} dot>
                            {a.permission === 'enabled' ? 'Permission given' : a.permission === 'not_enabled' ? 'Not enabled' : 'Not checked yet'}
                        </Badge>
                        <label className="flex items-center gap-2 text-[13px]">
                            <Switch
                                checked={a.reporting}
                                disabled={!canManage || toggle.isPending}
                                onCheckedChange={(enabled) => toggle.mutate({ id: a.id, enabled })}
                                aria-label={`Conversion reporting for ${a.name}`}
                            />
                            {a.reporting ? 'Reporting on' : 'Off'}
                        </label>
                    </div>
                </div>
            ))}
            {data.accounts.some((a) => a.permission === 'not_enabled') && (
                <p className="text-[12.5px] text-muted-foreground">
                    “Not enabled” means the account hasn’t given 10X Engage permission to send conversion events. Use “Reconnect to enable” on Channels, then
                    switch reporting on.
                </p>
            )}
        </div>
    );
}

function Rules({ data, canManage }: { data: Overview; canManage: boolean }) {
    const qc = useQueryClient();
    const tags = useTags(canManage);
    const [leadTags, setLeadTags] = useState<string[]>(data.rules.lead_tags);
    const [steps, setSteps] = useState<Step[]>(data.rules.lead_steps);
    const [purchases, setPurchases] = useState(data.rules.purchases);
    const [flowId, setFlowId] = useState('');
    const [tagPick, setTagPick] = useState('');
    const flow = data.flows.find((f) => f.id === flowId);

    const save = useMutation({
        mutationFn: () =>
            api('conversions/rules', {
                method: 'PUT',
                body: { lead_tags: leadTags, lead_steps: steps.map(({ flow_id, step_id }) => ({ flow_id, step_id })), purchases },
            }),
        onSuccess: () => {
            toast.success('Conversion rules saved.');
            void qc.invalidateQueries({ queryKey: KEY });
        },
        onError: (e) => toast.error(firstError(e)),
    });

    const stepLabel = (s: Step) =>
        s.label ??
        `${data.flows.find((f) => f.id === s.flow_id)?.name ?? 'Flow'} › ${data.flows.find((f) => f.id === s.flow_id)?.steps.find((n) => n.id === s.step_id)?.title ?? s.step_id}`;

    return (
        <div className="grid gap-4">
            <div>
                <p className="text-[13px] font-semibold">Lead (LeadSubmitted)</p>
                <p className="mb-2 text-[12.5px] text-muted-foreground">
                    Counts once per chat, when one of these tags is added or a person reaches one of these flow steps.
                </p>
                <div className="mb-2 flex flex-wrap gap-1.5">
                    {leadTags.map((t) => (
                        <Badge key={`t-${t}`} tone="brand">
                            Tag: {t}
                            {canManage && (
                                <button type="button" aria-label={`Remove tag ${t}`} onClick={() => setLeadTags(leadTags.filter((x) => x !== t))}>
                                    <XIcon className="size-3" />
                                </button>
                            )}
                        </Badge>
                    ))}
                    {steps.map((s) => (
                        <Badge key={`s-${s.flow_id}-${s.step_id}`} tone="violet">
                            Step: {stepLabel(s)}
                            {canManage && (
                                <button
                                    type="button"
                                    aria-label={`Remove step ${stepLabel(s)}`}
                                    onClick={() => setSteps(steps.filter((x) => !(x.flow_id === s.flow_id && x.step_id === s.step_id)))}
                                >
                                    <XIcon className="size-3" />
                                </button>
                            )}
                        </Badge>
                    ))}
                    {leadTags.length === 0 && steps.length === 0 && <span className="text-[12.5px] text-muted-foreground">No lead rule yet.</span>}
                </div>
                {canManage && (
                    <div className="flex flex-wrap items-center gap-2">
                        <Select
                            value={tagPick}
                            onValueChange={(v) => {
                                setTagPick('');
                                if (!leadTags.includes(v.toLowerCase())) setLeadTags([...leadTags, v.toLowerCase()]);
                            }}
                        >
                            <SelectTrigger className="w-48" aria-label="Add a tag">
                                <SelectValue placeholder="Add a tag…" />
                            </SelectTrigger>
                            <SelectContent>
                                {(tags.data ?? []).map((t) => (
                                    <SelectItem key={t.id} value={t.name}>
                                        {t.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={flowId} onValueChange={setFlowId}>
                            <SelectTrigger className="w-48" aria-label="Pick a flow">
                                <SelectValue placeholder={data.flows.length ? 'Or a flow…' : 'No published flows'} />
                            </SelectTrigger>
                            <SelectContent>
                                {data.flows.map((f) => (
                                    <SelectItem key={f.id} value={f.id}>
                                        {f.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {flow && (
                            <Select
                                value=""
                                onValueChange={(stepId) => {
                                    if (!steps.some((s) => s.flow_id === flow.id && s.step_id === stepId))
                                        setSteps([...steps, { flow_id: flow.id, step_id: stepId }]);
                                }}
                            >
                                <SelectTrigger className="w-56" aria-label="Pick a step">
                                    <SelectValue placeholder="…and its step" />
                                </SelectTrigger>
                                <SelectContent>
                                    {flow.steps.map((n) => (
                                        <SelectItem key={n.id} value={n.id}>
                                            {n.title}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                )}
            </div>
            <label className="flex items-start gap-3">
                <Switch checked={purchases} disabled={!canManage} onCheckedChange={setPurchases} aria-label="Report purchases" />
                <span>
                    <span className="block text-[13px] font-semibold">Purchase</span>
                    <span className="block text-[12.5px] text-muted-foreground">
                        A paid WooCommerce order linked to the chat, with its value and currency. Once per order: editing the order sends nothing new.
                    </span>
                </span>
            </label>
            {canManage && (
                <div>
                    <Button onClick={() => save.mutate()} disabled={save.isPending}>
                        {save.isPending ? 'Saving…' : 'Save rules'}
                    </Button>
                </div>
            )}
        </div>
    );
}

function TestEvent() {
    const qc = useQueryClient();
    const chats = useQuery({ queryKey: [...KEY, 'test-chats'], queryFn: () => api<{ data: TestChat[] }>('conversions/test-chats').then((r) => r.data) });
    const [chat, setChat] = useState('');
    const [result, setResult] = useState<TestResult | null>(null);
    const send = useMutation({
        mutationFn: () => api<{ data: TestResult }>('conversions/test-event', { method: 'POST', body: { conversation_id: chat } }).then((r) => r.data),
        onSuccess: (r) => {
            setResult(r);
            void qc.invalidateQueries({ queryKey: [...KEY, 'events'] });
        },
        onError: (e) => toast.error(firstError(e)),
    });

    return (
        <div className="grid gap-2">
            <p className="text-[12.5px] text-muted-foreground">
                Sends one Lead to Meta for a chat that started from your ad, right now, and shows Meta’s answer.
            </p>
            <div className="flex flex-wrap items-center gap-2">
                <Select
                    value={chat}
                    onValueChange={(v) => {
                        setChat(v);
                        setResult(null);
                    }}
                >
                    <SelectTrigger className="w-80 max-w-full" aria-label="Chat for the test event">
                        <SelectValue placeholder={chats.data?.length === 0 ? 'No chat from an ad yet' : 'Pick a chat that started from an ad'} />
                    </SelectTrigger>
                    <SelectContent>
                        {(chats.data ?? []).map((c) => (
                            <SelectItem key={c.conversation_id} value={c.conversation_id}>
                                {c.contact} · {c.ad.headline || c.ad.source_id || 'Meta ad'} · {when(c.clicked_at)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => send.mutate()} disabled={!chat || send.isPending}>
                    <SendIcon /> {send.isPending ? 'Sending…' : 'Send test event'}
                </Button>
            </div>
            {result && (
                <p role="status" className="text-[13px]">
                    <Badge tone={STATUS_TONE[result.status]} dot>
                        {result.status_label}
                    </Badge>{' '}
                    {result.status === 'sent'
                        ? `Meta received it${typeof result.meta_response.events_received === 'number' ? ` (${result.meta_response.events_received} event)` : ''}. It shows in Events Manager within a few minutes.`
                        : result.reason}
                </p>
            )}
        </div>
    );
}

function EventsLog() {
    const [status, setStatus] = useState('all');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [page, setPage] = useState(1);
    const log = useQuery({
        queryKey: [...KEY, 'events', status, from, to, page],
        queryFn: () =>
            api<{ data: LogRow[]; meta: { current_page: number; last_page: number; total: number } }>('conversions/events', {
                query: { status: status === 'all' ? undefined : status, from: from || undefined, to: to || undefined, page },
            }),
        // New events (a purchase from an order, a queued event being sent) show up without a reload.
        refetchInterval: 15_000,
    });

    return (
        <div className="grid gap-3">
            <div className="flex flex-wrap items-end gap-2">
                <Select
                    value={status}
                    onValueChange={(v) => {
                        setStatus(v);
                        setPage(1);
                    }}
                >
                    <SelectTrigger className="w-40" aria-label="Filter by status">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="sent">Sent</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                        <SelectItem value="skipped">Skipped</SelectItem>
                        <SelectItem value="queued">Waiting</SelectItem>
                    </SelectContent>
                </Select>
                <label className="grid gap-1 text-[12px] text-muted-foreground">
                    From
                    <Input
                        type="date"
                        value={from}
                        onChange={(e) => {
                            setFrom(e.target.value);
                            setPage(1);
                        }}
                        className="w-40"
                    />
                </label>
                <label className="grid gap-1 text-[12px] text-muted-foreground">
                    To
                    <Input
                        type="date"
                        value={to}
                        onChange={(e) => {
                            setTo(e.target.value);
                            setPage(1);
                        }}
                        className="w-40"
                    />
                </label>
            </div>
            <div className="overflow-x-auto rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent">
                            <TableHead>Time</TableHead>
                            <TableHead>Contact</TableHead>
                            <TableHead>Event</TableHead>
                            <TableHead>Value</TableHead>
                            <TableHead>Ad</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {(log.data?.data ?? []).map((e) => (
                            <TableRow key={e.id}>
                                <TableCell className="text-[13px] whitespace-nowrap">{when(e.time)}</TableCell>
                                <TableCell className="text-[13px]">{e.contact?.name ?? '—'}</TableCell>
                                <TableCell className="text-[13px]">
                                    {EVENT_LABEL[e.event] ?? e.event}
                                    {e.is_test && <span className="ml-1 text-[11.5px] text-muted-foreground">(test)</span>}
                                </TableCell>
                                <TableCell className="text-[13px] tabular-nums">{money(e.value, e.currency)}</TableCell>
                                <TableCell className="max-w-56 truncate text-[13px]" title={adLabel(e.ad)}>
                                    {adLabel(e.ad)}
                                </TableCell>
                                <TableCell className="text-[13px]">
                                    <Badge tone={STATUS_TONE[e.status]} dot>
                                        {e.status_label}
                                    </Badge>
                                    {e.reason && e.status !== 'sent' && <p className="mt-1 max-w-80 text-[12px] text-muted-foreground">{e.reason}</p>}
                                </TableCell>
                            </TableRow>
                        ))}
                        {log.data && log.data.data.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="py-6 text-center text-[13px] text-muted-foreground">
                                    No conversion events yet.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            {log.data && log.data.meta.last_page > 1 && (
                <div className="flex items-center gap-2 text-[13px]">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                        Previous
                    </Button>
                    Page {log.data.meta.current_page} of {log.data.meta.last_page}
                    <Button size="sm" variant="outline" disabled={page >= log.data.meta.last_page} onClick={() => setPage(page + 1)}>
                        Next
                    </Button>
                </div>
            )}
        </div>
    );
}

export function MetaConversionsSection({ canManage }: { canManage: boolean }) {
    const conversions = useConversions();
    const data = conversions.data;
    if (!data) return null;

    return (
        <Card className="mb-8" data-testid="meta-conversions">
            <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <div className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                            <MegaphoneIcon />
                        </div>
                        <div>
                            <CardTitle>Meta conversion reporting</CardTitle>
                            <CardDescription>
                                Tell Meta which chats from your Click-to-WhatsApp ads became leads and sales, so you see results per ad and Meta can optimise
                                your ads. Only the ad click ID and your WhatsApp account ID are sent: no names, numbers or messages.
                            </CardDescription>
                        </div>
                    </div>
                    <Button asChild variant="outline" size="sm">
                        <a href={data.help_url} target="_blank" rel="noreferrer">
                            <ExternalLinkIcon /> Check in Events Manager
                        </a>
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="grid gap-6">
                <section aria-label="WhatsApp accounts">
                    <h3 className="mb-2 text-[13px] font-semibold">WhatsApp accounts</h3>
                    <Accounts data={data} canManage={canManage} />
                </section>
                <section aria-label="Rules">
                    <h3 className="mb-2 text-[13px] font-semibold">What counts</h3>
                    <Rules key={JSON.stringify(data.rules)} data={data} canManage={canManage} />
                </section>
                {canManage && (
                    <section aria-label="Send test event">
                        <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
                            <PlusIcon className="size-3.5" /> Send test event
                        </h3>
                        <TestEvent />
                    </section>
                )}
                <section aria-label="Events log">
                    <h3 className="mb-2 text-[13px] font-semibold">Events log</h3>
                    <EventsLog />
                </section>
            </CardContent>
        </Card>
    );
}
