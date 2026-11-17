'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, RefreshCwIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { FormError } from '@/components/app/field';
import { Badge, type Tone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError, errorMessage } from '@/lib/api';
import {
    type FormDefinitionData,
    type FormField,
    type FormFieldType,
    formKeys,
    type FormSubmissionRow,
    useWhatsappForms,
    type WhatsappForm,
} from '@/lib/chatbots';
import { relative } from '@/lib/format';
import { useContactFields, usePhoneNumbers } from '@/lib/queries';

const TYPES: [FormFieldType, string, number][] = [
    ['text', 'Short text', 20],
    ['textarea', 'Long text', 20],
    ['email', 'Email', 20],
    ['phone', 'Phone number', 20],
    ['number', 'Number', 20],
    ['dropdown', 'Dropdown (fixed list)', 20],
    ['radio', 'Choice (fixed list)', 30],
    ['date', 'Date', 40],
    ['optin', 'Tick box', 120],
];
const LABEL_MAX = Object.fromEntries(TYPES.map(([t, , m]) => [t, m])) as Record<FormFieldType, number>;
const NONE = '__none__';

const tone = (status: string | null): Tone =>
    status === 'PUBLISHED' ? 'good' : status === 'BLOCKED' || status === 'THROTTLED' ? 'bad' : status === 'DEPRECATED' ? 'grey' : 'warn';

const fieldError = (e: unknown) => (e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? errorMessage(e)) : errorMessage(e));

/** One question of the form, with Meta's limits shown as you type. */
function QuestionRow({
    f,
    i,
    count,
    onChange,
    onMove,
    onRemove,
    targets,
    disabled,
}: {
    f: FormField;
    i: number;
    count: number;
    onChange: (f: FormField) => void;
    onMove: (to: number) => void;
    onRemove: () => void;
    targets: [string, string][];
    disabled: boolean;
}) {
    const max = LABEL_MAX[f.type];
    const listed = f.type === 'dropdown' || f.type === 'radio';

    return (
        <li className="grid gap-2 rounded-md border p-3" aria-label={`Question ${i + 1}`}>
            <div className="grid gap-2 sm:grid-cols-[12rem_1fr_auto]">
                <Select
                    value={f.type}
                    disabled={disabled}
                    onValueChange={(t) => onChange({ ...f, type: t as FormFieldType, consent: t === 'optin' ? f.consent : false })}
                >
                    <SelectTrigger aria-label={`Answer type ${i + 1}`}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {TYPES.map(([t, l]) => (
                            <SelectItem key={t} value={t}>
                                {l}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <div className="relative">
                    <Input
                        value={f.label}
                        maxLength={max}
                        disabled={disabled}
                        aria-label={`Question ${i + 1} text`}
                        onChange={(e) => onChange({ ...f, label: e.target.value })}
                        placeholder={f.type === 'optin' ? 'Send me offers and news on WhatsApp' : 'Your name'}
                    />
                    <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11px] text-faint">
                        {f.label.length}/{max}
                    </span>
                </div>
                <div className="flex gap-0.5">
                    <Button type="button" size="icon-sm" variant="ghost" disabled={disabled || i === 0} onClick={() => onMove(i - 1)} aria-label="Move up">
                        <ArrowUpIcon />
                    </Button>
                    <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={disabled || i === count - 1}
                        onClick={() => onMove(i + 1)}
                        aria-label="Move down"
                    >
                        <ArrowDownIcon />
                    </Button>
                    <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={disabled || count === 1}
                        onClick={onRemove}
                        aria-label={`Remove question ${i + 1}`}
                    >
                        <Trash2Icon />
                    </Button>
                </div>
            </div>
            {listed && (
                <div className="grid gap-1.5">
                    {f.options.map((o, k) => (
                        <div key={k} className="flex gap-1">
                            <Input
                                value={o.title}
                                maxLength={30}
                                disabled={disabled}
                                aria-label={`Option ${k + 1} of question ${i + 1}`}
                                onChange={(e) => onChange({ ...f, options: f.options.map((x, n) => (n === k ? { ...x, title: e.target.value } : x)) })}
                                className="h-8"
                            />
                            <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                disabled={disabled}
                                onClick={() => onChange({ ...f, options: f.options.filter((_, n) => n !== k) })}
                                aria-label="Remove option"
                            >
                                <XIcon />
                            </Button>
                        </div>
                    ))}
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="w-fit"
                        disabled={disabled}
                        onClick={() => onChange({ ...f, options: [...f.options, { title: '' }] })}
                    >
                        <PlusIcon /> Add option
                    </Button>
                    {f.type === 'radio' && <p className="text-[11.5px] text-muted-foreground">Up to 20 options, e.g. fixed time slots: 10:00, 12:00, 16:00.</p>}
                </div>
            )}
            <div className="flex flex-wrap items-center gap-4 text-[12.5px]">
                {f.type !== 'optin' && (
                    <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={f.required} disabled={disabled} onChange={(e) => onChange({ ...f, required: e.target.checked })} />{' '}
                        Required
                    </label>
                )}
                {f.type === 'optin' ? (
                    <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={f.consent} disabled={disabled} onChange={(e) => onChange({ ...f, consent: e.target.checked })} />{' '}
                        Marketing consent: ticked = opted in, with this form as the source
                    </label>
                ) : (
                    <label className="flex items-center gap-1.5">
                        Save to
                        <Select value={f.save_to ?? NONE} disabled={disabled} onValueChange={(v) => onChange({ ...f, save_to: v === NONE ? null : v })}>
                            <SelectTrigger className="h-8 w-56" aria-label={`Save question ${i + 1} to`}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {targets.map(([v, l]) => (
                                    <SelectItem key={v} value={v}>
                                        {l}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </label>
                )}
                {f.type === 'date' && <span className="text-muted-foreground">Saved day-first (20/11/2026), Dubai time; as YYYY-MM-DD in a date field.</span>}
            </div>
        </li>
    );
}

/** The customer's view: what the form looks like in WhatsApp. */
function Preview({ d }: { d: FormDefinitionData }) {
    return (
        <div className="rounded-xl bg-[#efeae2] p-3" aria-label="What the customer sees">
            <div className="mx-auto grid max-w-72 gap-2 rounded-lg bg-white p-3 text-[12.5px] shadow-sm">
                <p className="text-center text-[13px] font-semibold">{d.title || 'Form title'}</p>
                {d.intro && <p className="text-muted-foreground">{d.intro}</p>}
                {d.fields.map((f, i) =>
                    f.type === 'optin' ? (
                        <label key={i} className="flex items-start gap-1.5">
                            <input type="checkbox" disabled /> {f.label}
                        </label>
                    ) : f.type === 'radio' ? (
                        <div key={i}>
                            <p className="font-medium">{f.label}</p>
                            {f.options.map((o, k) => (
                                <p key={k} className="flex items-center gap-1.5">
                                    <span className="inline-block size-3 rounded-full border" /> {o.title}
                                </p>
                            ))}
                        </div>
                    ) : (
                        <div key={i} className="rounded border px-2 py-1.5 text-muted-foreground">
                            {f.label}
                            {f.required ? '' : ' (optional)'}
                            {f.type === 'dropdown' ? ' ▾' : f.type === 'date' ? ' 📅' : ''}
                        </div>
                    ),
                )}
                <div className="rounded-full bg-[#1fa855] py-1.5 text-center font-semibold text-white">{d.submit_label || 'Send'}</div>
            </div>
        </div>
    );
}

function FormDialog({ form, onClose, canManage, canPublish }: { form: WhatsappForm; onClose: () => void; canManage: boolean; canPublish: boolean }) {
    const qc = useQueryClient();
    const detail = useQuery({ queryKey: formKeys.one(form.id), queryFn: () => api<{ data: WhatsappForm }>(`chatbots/forms/${form.id}`).then((r) => r.data) });
    const subs = useQuery({
        queryKey: [...formKeys.one(form.id), 'submissions'],
        queryFn: () => api<{ data: FormSubmissionRow[] }>(`chatbots/forms/${form.id}/submissions`).then((r) => r.data),
    });
    const fields = useContactFields();
    const [draft, setDraft] = useState<FormDefinitionData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<'save' | 'publish' | 'refresh' | null>(null);
    const [tab, setTab] = useState<'questions' | 'answers'>('questions');
    const f = detail.data;
    const d = draft ?? f?.definition ?? null;
    const targets: [string, string][] = [
        [NONE, 'Not saved on the contact'],
        ['name', 'Name'],
        ['email', 'Email'],
        ...(fields.data ?? []).map((x): [string, string] => [`field:${x.key}`, x.label]),
    ];
    const set = (patch: Partial<FormDefinitionData>) => d && setDraft({ ...d, ...patch });
    const refresh = (next: WhatsappForm) => {
        qc.setQueryData(formKeys.one(form.id), next);
        void qc.invalidateQueries({ queryKey: formKeys.all });
    };

    const run = async (what: 'save' | 'publish' | 'refresh') => {
        setBusy(what);
        setError(null);
        try {
            if (what === 'save' || (what === 'publish' && draft)) {
                const saved = await api<{ data: WhatsappForm }>(`chatbots/forms/${form.id}`, { method: 'PATCH', body: { definition: d } });
                refresh(saved.data);
                setDraft(null);
                if (what === 'save') toast.success(`Saved (version ${saved.data.version})`);
            }
            if (what === 'publish') {
                refresh((await api<{ data: WhatsappForm }>(`chatbots/forms/${form.id}/publish`, { method: 'POST' })).data);
                toast.success('Published on WhatsApp. Flows that send this form use it now.');
            }
            if (what === 'refresh') refresh((await api<{ data: WhatsappForm }>(`chatbots/forms/${form.id}/refresh`, { method: 'POST' })).data);
        } catch (e) {
            setError(fieldError(e));
            void detail.refetch();
        } finally {
            setBusy(null);
        }
    };

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
                <DialogHeader>
                    <DialogTitle className="flex flex-wrap items-center gap-2">
                        {form.name}
                        {f && (
                            <Badge tone={tone(f.status)} dot>
                                Version {f.version} · {f.status_text}
                            </Badge>
                        )}
                        {f?.live_version && f.live_version !== f.version && <Badge tone="good">Live: version {f.live_version}</Badge>}
                    </DialogTitle>
                    <DialogDescription>
                        Questions and options are fixed in the form. Customers open it from a “Send form” step in a flow. Editing a published form makes a new
                        version; customers who already got the form keep their version.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex gap-1" role="tablist">
                    {(
                        [
                            ['questions', 'Questions'],
                            ['answers', `Answers${subs.data ? ` (${subs.data.length})` : ''}`],
                        ] as const
                    ).map(([k, l]) => (
                        <Button key={k} size="sm" variant={tab === k ? 'default' : 'ghost'} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                            {l}
                        </Button>
                    ))}
                </div>
                <FormError message={error} />
                {f && f.errors.length > 0 && (
                    <div role="alert" className="rounded-md border border-bad/20 bg-bad-bg px-3 py-2 text-[12.5px] text-bad">
                        WhatsApp says: {f.errors.join(' · ')}
                    </div>
                )}
                {!d ? (
                    <Skeleton className="h-64" />
                ) : tab === 'questions' ? (
                    <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
                        <div className="grid gap-3">
                            <div className="grid gap-2 sm:grid-cols-2">
                                <Input
                                    value={d.title}
                                    maxLength={30}
                                    aria-label="Form title"
                                    disabled={!canManage}
                                    onChange={(e) => set({ title: e.target.value })}
                                    placeholder="Form title"
                                />
                                <Input
                                    value={d.submit_label}
                                    maxLength={30}
                                    aria-label="Button"
                                    disabled={!canManage}
                                    onChange={(e) => set({ submit_label: e.target.value })}
                                    placeholder="Send"
                                />
                            </div>
                            <Input
                                value={d.intro}
                                maxLength={1000}
                                aria-label="Introduction"
                                disabled={!canManage}
                                onChange={(e) => set({ intro: e.target.value })}
                                placeholder="A line above the questions (optional)"
                            />
                            <ol className="grid gap-2" aria-label="Questions">
                                {d.fields.map((x, i) => (
                                    <QuestionRow
                                        key={i}
                                        f={x}
                                        i={i}
                                        count={d.fields.length}
                                        targets={targets}
                                        disabled={!canManage}
                                        onChange={(nf) => set({ fields: d.fields.map((y, n) => (n === i ? nf : y)) })}
                                        onRemove={() => set({ fields: d.fields.filter((_, n) => n !== i) })}
                                        onMove={(to) => {
                                            const next = [...d.fields];
                                            [next[i], next[to]] = [next[to], next[i]];
                                            set({ fields: next });
                                        }}
                                    />
                                ))}
                            </ol>
                            {canManage && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-fit"
                                    disabled={d.fields.length >= 20}
                                    onClick={() =>
                                        set({ fields: [...d.fields, { type: 'text', label: '', required: false, options: [], save_to: null, consent: false }] })
                                    }
                                >
                                    <PlusIcon /> Add question
                                </Button>
                            )}
                        </div>
                        <div className="grid content-start gap-2">
                            <p className="text-[12.5px] font-semibold text-muted-foreground">What the customer sees</p>
                            <Preview d={d} />
                            {f?.versions && (
                                <ul className="grid gap-1 text-[12px] text-muted-foreground" aria-label="Versions">
                                    {f.versions.map((v) => (
                                        <li key={v.version}>
                                            Version {v.version}: {v.status_text}
                                            {v.published_at ? `, published ${relative(v.published_at)}` : ''}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                ) : (
                    <ul className="grid gap-2" aria-label="Answers">
                        {(subs.data ?? []).map((s) => (
                            <li key={s.id} className="rounded-md border px-3 py-2 text-[12.5px]">
                                <p className="font-medium">
                                    {s.contact?.display_name ?? 'Deleted contact'} · {s.received_at} · version {s.version}
                                    {s.consent === true ? ' · opted in' : ''}
                                </p>
                                <dl className="mt-1 grid grid-cols-[10rem_1fr] gap-x-2">
                                    {s.answers.map((a) => (
                                        <div key={a.label} className="contents">
                                            <dt className="text-muted-foreground">{a.label}</dt>
                                            <dd>{a.value || '—'}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </li>
                        ))}
                        {subs.data?.length === 0 && <p className="text-[13px] text-muted-foreground">No answers yet.</p>}
                    </ul>
                )}
                <DialogFooter className="flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => run('refresh')} disabled={busy !== null}>
                        <RefreshCwIcon /> Check status on WhatsApp
                    </Button>
                    {canManage && draft && (
                        <Button variant="outline" onClick={() => run('save')} disabled={busy !== null}>
                            {busy === 'save' ? 'Saving…' : f?.editing_creates_version ? 'Save as new version' : 'Save'}
                        </Button>
                    )}
                    {canPublish && (draft || (f && f.status !== 'PUBLISHED')) && (
                        <Button onClick={() => run('publish')} disabled={busy !== null}>
                            {busy === 'publish' ? 'Publishing…' : 'Publish on WhatsApp'}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Bot settings › WhatsApp forms: simple forms with fixed questions, published on WhatsApp. */
export function FormsSettings({ canManage, canPublish }: { canManage: boolean; canPublish: boolean }) {
    const qc = useQueryClient();
    const forms = useWhatsappForms();
    const numbers = usePhoneNumbers().data ?? [];
    const accounts = Array.from(new Map(numbers.map((n) => [n.waba_account_id, n.verified_name ?? n.display_phone_number ?? 'WhatsApp account'])).entries());
    const [open, setOpen] = useState<WhatsappForm | null>(null);
    const [name, setName] = useState('');
    const [kind, setKind] = useState<'booking' | 'lead' | 'custom'>('lead');
    const [account, setAccount] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    if (!forms.data) return <Skeleton className="h-40" />;
    const waba = account ?? accounts[0]?.[0] ?? null;

    const create = async () => {
        setError(null);
        try {
            const r = await api<{ data: WhatsappForm }>('chatbots/forms', { method: 'POST', body: { waba_account_id: waba, name, kind } });
            void qc.invalidateQueries({ queryKey: formKeys.all });
            setName('');
            setOpen(r.data);
        } catch (e) {
            setError(fieldError(e));
        }
    };
    const archive = async (f: WhatsappForm) => {
        try {
            await api(`chatbots/forms/${f.id}`, { method: 'DELETE' });
            toast.success('Form deleted. It is retired on WhatsApp.');
            void qc.invalidateQueries({ queryKey: formKeys.all });
        } catch (e) {
            toast.error(errorMessage(e));
        }
    };

    return (
        <div className="space-y-3" role="region" aria-label="WhatsApp forms">
            <p className="text-[12.5px] text-muted-foreground">
                A form opens inside WhatsApp, the customer fills it in and taps the button; the answers land on the contact. Send it with a “WhatsApp form” step
                in any flow.
            </p>
            <ul className="grid gap-2" aria-label="Forms">
                {forms.data.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                        <button type="button" className="text-left" onClick={() => setOpen(f)}>
                            <p className="text-[13px] font-semibold">{f.name}</p>
                            <p className="text-[12px] text-muted-foreground">
                                Version {f.version} · {f.status_text}
                                {f.live_version ? ` · live: version ${f.live_version}` : ''} · {f.submissions ?? 0} answers
                            </p>
                        </button>
                        <div className="flex items-center gap-1">
                            <Badge tone={tone(f.status)} dot>
                                {f.status === 'PUBLISHED' ? 'Published' : f.live_version ? 'Changes not published' : 'Not published'}
                            </Badge>
                            {canPublish && (
                                <Button size="icon-sm" variant="ghost" aria-label={`Delete ${f.name}`} onClick={() => archive(f)}>
                                    <Trash2Icon />
                                </Button>
                            )}
                        </div>
                    </li>
                ))}
                {forms.data.length === 0 && <p className="text-[13px] text-muted-foreground">No forms yet. Start from a booking form or a lead form.</p>}
            </ul>
            {canManage && (
                <div className="grid gap-2 rounded-md border p-3">
                    <FormError message={error} />
                    <div className="grid gap-2 sm:grid-cols-[1fr_12rem_14rem_auto]">
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Form name, e.g. Book a visit"
                            aria-label="Form name"
                            maxLength={80}
                        />
                        <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                            <SelectTrigger aria-label="Start from">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="booking">Booking form</SelectItem>
                                <SelectItem value="lead">Lead form</SelectItem>
                                <SelectItem value="custom">Blank form</SelectItem>
                            </SelectContent>
                        </Select>
                        {accounts.length > 1 ? (
                            <Select value={waba ?? ''} onValueChange={setAccount}>
                                <SelectTrigger aria-label="WhatsApp account">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {accounts.map(([id, label]) => (
                                        <SelectItem key={id} value={id}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <span />
                        )}
                        <Button onClick={create} disabled={!name.trim() || !waba}>
                            <PlusIcon /> New form
                        </Button>
                    </div>
                </div>
            )}
            {open && <FormDialog key={open.id} form={open} onClose={() => setOpen(null)} canManage={canManage} canPublish={canPublish} />}
        </div>
    );
}
