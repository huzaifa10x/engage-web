'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangleIcon, CheckCircle2Icon, DownloadIcon, InfoIcon, LockIcon, SearchIcon, XCircleIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Field } from '@/components/app/field';
import { EmptyState, Forbidden, PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { Badge, type Tone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorMessage } from '@/lib/api';
import { P } from '@/lib/permissions';
import { updateComplianceSettings, useComplianceOverview, useComplianceSettings, useConsentEvents } from '@/lib/queries';
import type { ComplianceCheck, ComplianceSettings } from '@/lib/types';

const ALL = '__all__';

const ACTION: Record<string, { label: string; tone: Tone }> = {
    opted_in: { label: 'Opted in', tone: 'good' },
    opted_out: { label: 'Opted out', tone: 'bad' },
    marketing_opted_in: { label: 'Marketing resumed', tone: 'good' },
    marketing_opted_out: { label: 'Marketing stopped', tone: 'warn' },
};

const SOURCE: Record<string, string> = {
    keyword: 'Keyword reply',
    in_chat_button: 'Subscribe button in chat',
    agent: 'Recorded by your team',
    import: 'CSV import',
    api: 'API',
    meta_preference: 'WhatsApp setting (by the customer)',
};

const textarea =
    'field-sizing-content min-h-20 w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm leading-5 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:opacity-60';

function CheckRow({ check }: { check: ComplianceCheck }) {
    const icon = {
        ok: <CheckCircle2Icon className="size-5 text-good" aria-label="OK" />,
        info: <InfoIcon className="size-5 text-info" aria-label="Note" />,
        warn: <AlertTriangleIcon className="size-5 text-warn" aria-label="Needs attention" />,
        bad: <XCircleIcon className="size-5 text-bad" aria-label="Problem" />,
    }[check.status];

    return (
        <li className="flex items-start gap-3 py-3">
            <span className="mt-0.5 shrink-0">{icon}</span>
            <div>
                <p className="text-sm font-medium">{check.title}</p>
                <p className="text-[13px] text-muted-foreground">{check.detail}</p>
            </div>
        </li>
    );
}

/** Keyword chips: locked words (STOP, START …) cannot be removed. */
function Keywords({
    value,
    locked,
    disabled,
    onChange,
    label,
}: {
    value: string[];
    locked: string[];
    disabled: boolean;
    onChange: (v: string[]) => void;
    label: string;
}) {
    const [text, setText] = useState('');
    const add = () => {
        const word = text.trim().toLowerCase().slice(0, 24);
        if (word && !value.includes(word)) onChange([...value, word]);
        setText('');
    };

    return (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1.5">
            {value.map((word) => (
                <Badge key={word} tone={locked.includes(word) ? 'grey' : 'info'} className="gap-1 uppercase">
                    {word}
                    {locked.includes(word) ? (
                        <LockIcon className="size-3" aria-label="Always active" />
                    ) : (
                        !disabled && (
                            <button type="button" onClick={() => onChange(value.filter((w) => w !== word))} aria-label={`Remove ${word}`}>
                                <XIcon className="size-3" />
                            </button>
                        )
                    )}
                </Badge>
            ))}
            {!disabled && (
                <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ',') && text.trim()) {
                            e.preventDefault();
                            add();
                        }
                    }}
                    onBlur={add}
                    placeholder="Add a word and press Enter"
                    aria-label={label}
                    className="min-w-40 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
                />
            )}
        </div>
    );
}

function SettingsForm({ initial, canManage }: { initial: ComplianceSettings; canManage: boolean }) {
    const qc = useQueryClient();
    const [s, setS] = useState(initial);
    const [saving, setSaving] = useState(false);
    const set = (patch: Partial<ComplianceSettings>) => setS({ ...s, ...patch });
    const dirty = JSON.stringify(s) !== JSON.stringify(initial);

    const save = async () => {
        if (s.retention_enabled && !initial.retention_enabled) {
            const ok = window.confirm(
                `Turn on retention? Every night, message content older than ${s.message_retention_days} days will be permanently removed and files older than ${s.media_retention_days} days deleted. This cannot be undone.`,
            );
            if (!ok) return;
        }
        setSaving(true);
        try {
            const saved = await updateComplianceSettings({
                opt_out_keywords: s.opt_out_keywords,
                opt_in_keywords: s.opt_in_keywords,
                confirm_opt_out: s.confirm_opt_out,
                opt_out_reply: s.opt_out_reply,
                confirm_opt_in: s.confirm_opt_in,
                opt_in_reply: s.opt_in_reply,
                consent_request_text: s.consent_request_text,
                retention_enabled: s.retention_enabled,
                message_retention_days: s.message_retention_days,
                media_retention_days: s.media_retention_days,
            });
            setS(saved);
            void qc.invalidateQueries({ queryKey: ['compliance'] });
            toast.success('Compliance settings saved');
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="grid gap-4">
            <Card className="gap-4 p-5">
                <div>
                    <p className="text-sm font-semibold">Opt-out and opt-in keywords</p>
                    <p className="text-[13px] text-muted-foreground">
                        When a customer’s whole message is one of these words, their consent changes immediately. A word inside a longer sentence never counts.
                    </p>
                </div>
                <Field label="Unsubscribe when a customer sends" htmlFor="kw-out">
                    <Keywords
                        label="Add an opt-out keyword"
                        value={s.opt_out_keywords}
                        locked={s.locked_opt_out_keywords}
                        disabled={!canManage}
                        onChange={(v) => set({ opt_out_keywords: v })}
                    />
                </Field>
                <Field label="Subscribe when a customer sends" htmlFor="kw-in">
                    <Keywords
                        label="Add an opt-in keyword"
                        value={s.opt_in_keywords}
                        locked={s.locked_opt_in_keywords}
                        disabled={!canManage}
                        onChange={(v) => set({ opt_in_keywords: v })}
                    />
                </Field>
            </Card>

            <Card className="gap-4 p-5">
                <p className="text-sm font-semibold">Automatic replies</p>
                <div className="grid gap-2">
                    <label className="flex items-center justify-between gap-3 text-sm">
                        Confirm when someone unsubscribes
                        <Switch checked={s.confirm_opt_out} disabled={!canManage} onCheckedChange={(v) => set({ confirm_opt_out: v })} />
                    </label>
                    <textarea
                        className={textarea}
                        aria-label="Unsubscribe confirmation"
                        maxLength={500}
                        disabled={!canManage || !s.confirm_opt_out}
                        value={s.opt_out_reply}
                        onChange={(e) => set({ opt_out_reply: e.target.value })}
                    />
                </div>
                <div className="grid gap-2">
                    <label className="flex items-center justify-between gap-3 text-sm">
                        Confirm when someone subscribes
                        <Switch checked={s.confirm_opt_in} disabled={!canManage} onCheckedChange={(v) => set({ confirm_opt_in: v })} />
                    </label>
                    <textarea
                        className={textarea}
                        aria-label="Subscribe confirmation"
                        maxLength={500}
                        disabled={!canManage || !s.confirm_opt_in}
                        value={s.opt_in_reply}
                        onChange={(e) => set({ opt_in_reply: e.target.value })}
                    />
                </div>
                <Field
                    label="Consent request"
                    htmlFor="consent-text"
                    hint="Sent with Subscribe / No thanks buttons when an agent presses “Ask for consent” in a conversation. Name your business and say the messages come on WhatsApp."
                >
                    <textarea
                        id="consent-text"
                        className={textarea}
                        maxLength={900}
                        disabled={!canManage}
                        value={s.consent_request_text}
                        onChange={(e) => set({ consent_request_text: e.target.value })}
                    />
                </Field>
            </Card>

            <Card className="gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-sm font-semibold">Data retention</p>
                        <p className="text-[13px] text-muted-foreground">
                            When on, old message content is removed every night and old files are deleted. Delivery records, the consent ledger and the audit
                            log are kept. Removed content cannot be restored.
                        </p>
                    </div>
                    <Switch
                        checked={s.retention_enabled}
                        disabled={!canManage}
                        onCheckedChange={(v) => set({ retention_enabled: v })}
                        aria-label="Enable retention"
                    />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Remove message content after (days)" htmlFor="ret-msg" hint={`At least ${s.min_message_retention_days} days`}>
                        <Input
                            id="ret-msg"
                            type="number"
                            min={s.min_message_retention_days}
                            max={3650}
                            disabled={!canManage || !s.retention_enabled}
                            value={s.message_retention_days}
                            onChange={(e) => set({ message_retention_days: Number(e.target.value) })}
                        />
                    </Field>
                    <Field label="Delete photos, videos and files after (days)" htmlFor="ret-media" hint={`At least ${s.min_media_retention_days} days`}>
                        <Input
                            id="ret-media"
                            type="number"
                            min={s.min_media_retention_days}
                            max={3650}
                            disabled={!canManage || !s.retention_enabled}
                            value={s.media_retention_days}
                            onChange={(e) => set({ media_retention_days: Number(e.target.value) })}
                        />
                    </Field>
                </div>
            </Card>

            {canManage && (
                <div className="flex justify-end">
                    <Button onClick={save} disabled={saving || !dirty}>
                        {saving ? 'Saving…' : 'Save changes'}
                    </Button>
                </div>
            )}
        </div>
    );
}

function Ledger() {
    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState<{ action?: string; q?: string }>({});
    const events = useConsentEvents(filters);
    const rows = events.data?.pages.flatMap((p) => p.data) ?? [];
    const exportUrl = `/api/v1/compliance/consent-events/export?${new URLSearchParams(Object.entries(filters).filter((e): e is [string, string] => Boolean(e[1]))).toString()}`;

    return (
        <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        setFilters((f) => ({ ...f, q: search.trim() || undefined }));
                    }}
                    className="relative w-full sm:w-72"
                >
                    <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Name or number"
                        className="pl-8"
                        aria-label="Search the ledger"
                    />
                </form>
                <Select value={filters.action ?? ALL} onValueChange={(v) => setFilters((f) => ({ ...f, action: v === ALL ? undefined : v }))}>
                    <SelectTrigger className="w-48" aria-label="Event">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL}>All events</SelectItem>
                        {Object.entries(ACTION).map(([key, a]) => (
                            <SelectItem key={key} value={key}>
                                {a.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button asChild variant="outline" className="ml-auto">
                    <a href={exportUrl} download>
                        <DownloadIcon /> Export CSV
                    </a>
                </Button>
            </div>
            <Card className="overflow-hidden p-0">
                {events.isLoading ? (
                    <div className="p-5">
                        <Skeleton className="h-40" />
                    </div>
                ) : rows.length === 0 ? (
                    <EmptyState
                        title="No consent events yet"
                        description="Every opt-in and opt-out is recorded here permanently, with how and when it happened."
                    />
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent">
                                <TableHead>When</TableHead>
                                <TableHead>Contact</TableHead>
                                <TableHead>Event</TableHead>
                                <TableHead>How</TableHead>
                                <TableHead>Detail</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((e) => (
                                <TableRow key={e.id}>
                                    <TableCell className="whitespace-nowrap text-muted-foreground">
                                        {e.created_at ? new Date(e.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                                    </TableCell>
                                    <TableCell>
                                        <span className="font-medium">{e.contact?.display_name ?? 'Deleted contact'}</span>{' '}
                                        <span className="font-mono text-[12px] text-muted-foreground">{e.contact?.phone}</span>
                                    </TableCell>
                                    <TableCell>
                                        <Badge tone={ACTION[e.action]?.tone ?? 'grey'}>{ACTION[e.action]?.label ?? e.action}</Badge>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{SOURCE[e.source] ?? e.source}</TableCell>
                                    <TableCell className="max-w-64 truncate text-muted-foreground" title={e.detail ?? undefined}>
                                        {e.detail ?? ''}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </Card>
            {events.hasNextPage && (
                <div className="flex justify-center">
                    <Button variant="outline" onClick={() => events.fetchNextPage()} disabled={events.isFetchingNextPage}>
                        {events.isFetchingNextPage ? 'Loading…' : 'Load more'}
                    </Button>
                </div>
            )}
        </div>
    );
}

export default function CompliancePage() {
    const { can } = useSession();
    const allowed = can(P.ComplianceView);
    const overview = useComplianceOverview(allowed);
    const settings = useComplianceSettings(allowed);

    if (!allowed) return <Forbidden />;

    const o = overview.data;
    const stats: [string, number | undefined, string][] = [
        ['Opted in', o?.contacts.opted_in, 'Can receive marketing'],
        ['No consent recorded', o?.contacts.unknown, 'Service and utility messages only'],
        ['Opted out', o?.contacts.opted_out, 'Receive nothing'],
        ['Opt-outs, last 30 days', o?.last_30_days.opt_outs, `${o?.last_30_days.opt_ins ?? 0} opt-ins in the same period`],
    ];

    return (
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
            <PageHeader title="Compliance" description="Consent, opt-outs and data retention for your WhatsApp messaging." />
            <Tabs defaultValue="overview">
                <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="ledger">Consent ledger</TabsTrigger>
                    <TabsTrigger value="settings">Keywords, replies & retention</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="grid gap-4">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {stats.map(([label, value, hint]) => (
                            <Card key={label} className="gap-1 p-4">
                                <p className="text-[12.5px] text-muted-foreground">{label}</p>
                                <p className="text-2xl font-semibold tabular-nums">{value === undefined ? '—' : value.toLocaleString()}</p>
                                <p className="text-[12px] text-muted-foreground">{hint}</p>
                            </Card>
                        ))}
                    </div>
                    <Card className="p-5">
                        <p className="text-sm font-semibold">Policy checks</p>
                        {overview.isLoading ? (
                            <Skeleton className="mt-3 h-40" />
                        ) : overview.isError ? (
                            <p className="mt-2 text-[13px] text-bad">{errorMessage(overview.error)}</p>
                        ) : (
                            <ul className="mt-1 divide-y">
                                {(o?.checks ?? []).map((check) => (
                                    <CheckRow key={check.key} check={check} />
                                ))}
                            </ul>
                        )}
                    </Card>
                </TabsContent>

                <TabsContent value="ledger">
                    <Ledger />
                </TabsContent>

                <TabsContent value="settings">
                    {settings.data ? (
                        <SettingsForm key={JSON.stringify(settings.data)} initial={settings.data} canManage={can(P.ComplianceManage)} />
                    ) : (
                        <Skeleton className="h-64" />
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}
