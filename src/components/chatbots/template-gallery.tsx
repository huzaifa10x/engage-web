'use client';

import { ArrowLeftIcon, Loader2Icon, PlusIcon, WorkflowIcon, XIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { FormError } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { createChatbot, type FlowTemplate, type TemplateField, useChatbotOptions, useChatbotTemplates } from '@/lib/chatbots';
import { cn } from '@/lib/utils';

const NO_NUMBER = '__none__';

type Product = { category: string; name: string; price: string; image_url: string; link: string };

/**
 * A new flow always starts from the template library: pick a ready-made flow for your kind of
 * business, fill in a short form (your details and lists), and the builder opens with it ready to
 * test — never a blank canvas (“Start from scratch” is a template too). Subflows start small.
 */
export function TemplateGallery({
    open,
    onOpenChange,
    folder,
    kind = 'bot',
    initial = null,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    folder?: string | null;
    kind?: 'bot' | 'subflow';
    /** Opens straight on this template's form (Templates page › Use this; My Flows › Start from scratch = "blank"). */
    initial?: string | null;
}) {
    const router = useRouter();
    const templates = useChatbotTemplates(open);
    const options = useChatbotOptions(open);
    const [picked, setPicked] = useState<FlowTemplate | null>(null);
    const [name, setName] = useState('');
    const [number, setNumber] = useState(NO_NUMBER);
    const [values, setValues] = useState<Record<string, unknown>>({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [wasOpen, setWasOpen] = useState(false);
    const [page, setPage] = useState(0);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            setPicked(null);
            setName('');
            setValues({});
            setError(null);
            setBusy(false);
            setPage(0);
        }
    }
    const variables = templates.data?.meta.variables ?? {};
    const numbers = (options.data?.numbers ?? []).filter((n) => n.status !== 'disconnected');
    const [autoPicked, setAutoPicked] = useState<string | null>(null);

    const choose = (t: FlowTemplate) => {
        setPicked(t);
        setPage(0);
        setName(t.key === 'blank' ? 'My chatbot' : t.name.split(' — ')[0]);
        const init: Record<string, unknown> = {};
        for (const f of t.fields) init[f.key] = f.scope === 'business' ? (variables[f.key] ?? f.default ?? '') : (f.default ?? (f.type === 'list' ? [] : ''));
        setValues(init);
        if (numbers.length === 1) setNumber(numbers[0].id);
    };

    if (open && initial && autoPicked !== initial && templates.data) {
        setAutoPicked(initial);
        const t = templates.data.data.find((x) => x.key === initial);
        if (t) choose(t);
    }
    if (!open && autoPicked !== null) setAutoPicked(null);

    const create = async () => {
        if (kind === 'bot' && !picked) return;
        const missing = picked?.fields.find((f) => f.required && !String(values[f.key] ?? '').trim());
        if (missing) {
            setError(`Fill in “${missing.label}”.`);

            return;
        }
        setBusy(true);
        setError(null);
        try {
            const flow = await createChatbot({
                name: name.trim() || (kind === 'subflow' ? 'Subflow' : 'My chatbot'),
                kind,
                folder: folder ?? null,
                phone_number_id: kind === 'bot' && number !== NO_NUMBER ? number : null,
                template: kind === 'bot' ? picked?.key : undefined,
                config: kind === 'bot' ? values : undefined,
            });
            router.push(`/chatbots/builder?id=${flow.id}`);
        } catch (e) {
            setError(errorMessage(e));
            setBusy(false);
        }
    };

    if (kind === 'subflow') {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <WorkflowIcon className="size-5" /> New subflow
                        </DialogTitle>
                        <DialogDescription>
                            A shared piece of conversation (e.g. “Collect contact details” or “FAQ”) that other flows run with a Subflow block. Change it once,
                            every flow using it changes.
                        </DialogDescription>
                    </DialogHeader>
                    <FormError message={error} />
                    <div className="grid gap-1.5">
                        <Label htmlFor="sf-name">Name</Label>
                        <Input
                            id="sf-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={120}
                            placeholder="Collect contact details"
                            autoFocus
                        />
                    </div>
                    <Button onClick={create} disabled={busy}>
                        {busy ? <Loader2Icon className="animate-spin" /> : null} Create and open the builder
                    </Button>
                </DialogContent>
            </Dialog>
        );
    }

    // One question at a time (approved design): the flow's name and number first, then each answer the template needs.
    const pages: ('basics' | TemplateField)[] = picked ? ['basics', ...picked.fields] : [];
    const at = Math.min(page, Math.max(0, pages.length - 1));
    const current = pages[at];
    const last = at === pages.length - 1;
    const next = () => {
        if (current && current !== 'basics' && current.required && !String(values[current.key] ?? '').trim()) {
            setError(`Fill in “${current.label}”.`);

            return;
        }
        setError(null);
        if (last) void create();
        else setPage(at + 1);
    };
    const sample = (v: unknown) => (Array.isArray(v) ? v.filter(Boolean).slice(0, 3).join(' · ') : String(v ?? ''));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="cbx flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
                <DialogHeader className="px-5 py-4" style={{ borderBottom: '1px solid var(--cb-line-2)' }}>
                    <DialogTitle className="flex items-center gap-2 text-[17px]">
                        {picked && !initial && (
                            <Button variant="ghost" size="icon-sm" onClick={() => setPicked(null)} aria-label="Back to the templates">
                                <ArrowLeftIcon />
                            </Button>
                        )}
                        {picked ? `Set up · ${picked.name}` : 'Start with a ready-made flow'}
                    </DialogTitle>
                    <DialogDescription className={picked ? 'sr-only' : undefined}>
                        {picked ? 'Answer a few questions; the flow is built from your answers.' : 'Pick the closest one to your business.'}
                    </DialogDescription>
                </DialogHeader>

                {!picked ? (
                    <div className="min-h-0 flex-1 overflow-y-auto p-5">
                        {templates.isLoading && <Skeleton className="h-72 w-full" />}
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {(templates.data?.data ?? []).map((t) => (
                                <button
                                    key={t.key}
                                    type="button"
                                    onClick={() => choose(t)}
                                    className="cb-card cb-col"
                                    style={{ padding: 16, textAlign: 'left', cursor: 'pointer', gap: 6 }}
                                >
                                    <span className="cb-row">
                                        <span className="cb-chip">{t.industry}</span>
                                        {t.recommended && <span className="cb-chip ok">Start here</span>}
                                        <span className="cb-spacer cb-small cb-muted">{t.steps.length} steps</span>
                                    </span>
                                    <b>{t.name}</b>
                                    <span className="cb-small" style={{ color: 'var(--cb-ink-2)' }}>
                                        {t.description}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[1fr_340px]">
                            <div className="min-h-0 space-y-4 overflow-y-auto p-5">
                                <p className="cb-small cb-muted">
                                    Question {at + 1} of {pages.length}
                                </p>
                                <div className="cb-bar" aria-hidden>
                                    <span style={{ width: `${Math.round(((at + 1) / pages.length) * 100)}%` }} />
                                </div>
                                <FormError message={error} />
                                {current === 'basics' ? (
                                    <div className="grid gap-4">
                                        <h3 style={{ fontSize: 17 }}>What should this flow be called, and which number does it answer on?</h3>
                                        <div className="grid gap-1.5">
                                            <Label htmlFor="tg-name">Flow name</Label>
                                            <Input id="tg-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
                                        </div>
                                        <div className="grid gap-1.5">
                                            <Label htmlFor="tg-number">WhatsApp number</Label>
                                            <Select value={number} onValueChange={setNumber}>
                                                <SelectTrigger id="tg-number">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value={NO_NUMBER}>Choose later</SelectItem>
                                                    {numbers.map((n) => (
                                                        <SelectItem key={n.id} value={n.id}>
                                                            {n.verified_name ?? n.display_phone_number} {n.verified_name ? `· ${n.display_phone_number}` : ''}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                ) : current ? (
                                    <div className="grid gap-3">
                                        <h3 style={{ fontSize: 17 }}>{current.label}</h3>
                                        {current.scope === 'business' && (
                                            <p className="cb-small cb-muted">
                                                Saved once for all your flows; messages use it as {`{{business.${current.key}}}`}.
                                            </p>
                                        )}
                                        <FieldInput
                                            key={current.key}
                                            field={current}
                                            value={values[current.key]}
                                            onChange={(v) => setValues((st) => ({ ...st, [current.key]: v }))}
                                            values={values}
                                            templates={options.data?.templates ?? []}
                                        />
                                    </div>
                                ) : null}
                            </div>
                            <aside className="hidden min-h-0 flex-col p-4 md:flex" style={{ borderLeft: '1px solid var(--cb-line-2)' }}>
                                <p className="cb-small cb-muted" style={{ marginBottom: 8 }}>
                                    Preview from your answers
                                </p>
                                <div className="cb-phone" style={{ minHeight: 0, flex: 1 }}>
                                    <div className="cb-ph">
                                        <span className="cb-av">{(name || 'Bot').slice(0, 2).toUpperCase()}</span>
                                        <span>
                                            <b>{name || picked.name}</b>
                                            <span style={{ display: 'block', fontSize: 11.5, opacity: 0.8 }}>Preview · not a real conversation</span>
                                        </span>
                                    </div>
                                    <div className="cb-chat">
                                        {picked.steps.map((st, i) => (
                                            <div key={i} className="cb-msg bot">
                                                {st}
                                            </div>
                                        ))}
                                        {picked.fields
                                            .filter((f) => sample(values[f.key]))
                                            .map((f) => (
                                                <div key={f.key} className="cb-sysmsg">
                                                    {f.label}: {sample(values[f.key])}
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            </aside>
                        </div>
                        <div className="cb-row" style={{ padding: '12px 20px', borderTop: '1px solid var(--cb-line-2)', justifyContent: 'flex-end' }}>
                            {at > 0 && (
                                <button type="button" className="cb-btn" onClick={() => setPage(at - 1)} disabled={busy}>
                                    Back
                                </button>
                            )}
                            <button type="button" className="cb-btn pri" onClick={next} disabled={busy}>
                                {busy && <Loader2Icon className="size-4 animate-spin" />}
                                {last ? 'Create and open the builder' : 'Next'}
                            </button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

function FieldInput({
    field,
    value,
    onChange,
    values,
    templates,
}: {
    field: TemplateField;
    value: unknown;
    onChange: (v: unknown) => void;
    values?: Record<string, unknown>;
    templates?: { name: string; language: string }[];
}) {
    const id = `tf-${field.key}`;
    const label = (
        <Label htmlFor={id}>
            {field.label}
            {field.required && <span className="text-bad"> *</span>}
        </Label>
    );
    const hint = field.hint ? <p className="text-[11.5px] text-muted-foreground">{field.hint}</p> : null;

    if (field.type === 'list') {
        const lines = Array.isArray(value) ? (value as string[]) : [];

        return (
            <div className="grid gap-1.5">
                {label}
                <textarea
                    id={id}
                    rows={Math.min(8, Math.max(3, lines.length + 1))}
                    value={lines.join('\n')}
                    onChange={(e) => onChange(e.target.value.split('\n').slice(0, field.max ?? 10))}
                    className="w-full rounded-lg border border-input px-3 py-2 text-[13px]"
                    placeholder="One per line"
                />
                <p className="text-[11.5px] text-muted-foreground">
                    One per line{field.max ? `, up to ${field.max}` : ''}; each becomes a menu row (24 characters max).
                </p>
            </div>
        );
    }
    if (field.type === 'prices') {
        const table = (value && typeof value === 'object' ? value : {}) as Record<string, number>;
        const rows = Object.entries(table);

        return (
            <div className="grid gap-1.5">
                {label}
                <div className="space-y-1">
                    {rows.map(([k, v], i) => (
                        <div key={i} className="flex gap-1">
                            <Input
                                value={k}
                                onChange={(e) => onChange(Object.fromEntries(rows.map(([kk, vv], n) => (n === i ? [e.target.value, vv] : [kk, vv]))))}
                                className="h-8"
                            />
                            <Input
                                type="number"
                                step="0.1"
                                value={v}
                                onChange={(e) => onChange({ ...table, [k]: Number(e.target.value) })}
                                className="h-8 w-28"
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => onChange(Object.fromEntries(rows.filter((_, n) => n !== i)))}
                                aria-label="Remove"
                            >
                                <XIcon />
                            </Button>
                        </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...table, [`Option ${rows.length + 1}`]: 0 })}>
                        <PlusIcon /> Add
                    </Button>
                </div>
                {hint}
            </div>
        );
    }
    if (field.type === 'products') {
        const items = (Array.isArray(value) ? value : []) as Product[];
        const categories = Array.isArray(values?.categories) ? (values?.categories as string[]).filter(Boolean) : [];
        const update = (i: number, patch: Partial<Product>) => onChange(items.map((p, n) => (n === i ? { ...p, ...patch } : p)));

        return (
            <div className="grid gap-1.5">
                {label}
                {hint}
                <div className="space-y-1.5">
                    {items.map((p, i) => (
                        <div key={i} className="grid gap-1 rounded-lg border p-2 sm:grid-cols-[130px_1fr_130px_auto]">
                            <Select value={p.category} onValueChange={(category) => update(i, { category })}>
                                <SelectTrigger size="sm" aria-label="Category">
                                    <SelectValue placeholder="Category" />
                                </SelectTrigger>
                                <SelectContent>
                                    {[...new Set([...categories, p.category].filter(Boolean))].map((c) => (
                                        <SelectItem key={c} value={c}>
                                            {c}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Input value={p.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Name" className="h-8" />
                            <Input value={p.price} onChange={(e) => update(i, { price: e.target.value })} placeholder="From AED 120" className="h-8" />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => onChange(items.filter((_, n) => n !== i))}
                                aria-label="Remove product"
                            >
                                <XIcon />
                            </Button>
                            <Input
                                value={p.image_url}
                                onChange={(e) => update(i, { image_url: e.target.value })}
                                placeholder="Photo link (https)"
                                className="h-8 font-mono text-[11.5px] sm:col-span-2"
                            />
                            <Input
                                value={p.link}
                                onChange={(e) => update(i, { link: e.target.value })}
                                placeholder="Product page (https)"
                                className="h-8 font-mono text-[11.5px] sm:col-span-2"
                            />
                        </div>
                    ))}
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onChange([...items, { category: categories[0] ?? '', name: '', price: '', image_url: '', link: '' }])}
                    >
                        <PlusIcon /> Add a product
                    </Button>
                </div>
            </div>
        );
    }
    if (field.type === 'template') {
        const t = (value && typeof value === 'object' ? value : null) as { name: string; language: string } | null;

        return (
            <div className="grid gap-1.5">
                {label}
                <Select
                    value={t ? `${t.name}|${t.language}` : '__none__'}
                    onValueChange={(v) => onChange(v === '__none__' ? null : { name: v.split('|')[0], language: v.split('|')[1] })}
                >
                    <SelectTrigger id={id}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__none__">No reminder</SelectItem>
                        {(templates ?? []).map((x) => (
                            <SelectItem key={`${x.name}|${x.language}`} value={`${x.name}|${x.language}`}>
                                {x.name} · {x.language}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {hint}
            </div>
        );
    }

    return (
        <div className={cn('grid gap-1.5', field.type === 'textarea' && 'sm:col-span-2')}>
            {label}
            <Input
                id={id}
                type={field.type === 'time' ? 'time' : field.type === 'number' ? 'number' : 'text'}
                value={String(value ?? '')}
                onChange={(e) => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)}
                placeholder={field.placeholder}
            />
            {hint}
        </div>
    );
}
