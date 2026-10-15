'use client';

import {
    ArrowLeftIcon,
    BotIcon,
    CakeIcon,
    CalendarIcon,
    CarIcon,
    CheckIcon,
    HomeIcon,
    Loader2Icon,
    type LucideIcon,
    MenuIcon,
    PlusIcon,
    SparklesIcon,
    StethoscopeIcon,
    UserIcon,
    WorkflowIcon,
    XIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { FormError } from '@/components/app/field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { createChatbot, type FlowTemplate, type TemplateField, useChatbotOptions, useChatbotTemplates } from '@/lib/chatbots';
import { cn } from '@/lib/utils';

const ICONS: Record<string, LucideIcon> = {
    calendar: CalendarIcon,
    cake: CakeIcon,
    home: HomeIcon,
    stethoscope: StethoscopeIcon,
    sparkles: SparklesIcon,
    car: CarIcon,
    menu: MenuIcon,
    user: UserIcon,
    plus: PlusIcon,
};

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
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    folder?: string | null;
    kind?: 'bot' | 'subflow';
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
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            setPicked(null);
            setName('');
            setValues({});
            setError(null);
            setBusy(false);
        }
    }
    const variables = templates.data?.meta.variables ?? {};
    const numbers = (options.data?.numbers ?? []).filter((n) => n.status !== 'disconnected');

    const choose = (t: FlowTemplate) => {
        setPicked(t);
        setName(t.key === 'blank' ? 'My chatbot' : t.name.split(' — ')[0]);
        const init: Record<string, unknown> = {};
        for (const f of t.fields) init[f.key] = f.scope === 'business' ? (variables[f.key] ?? f.default ?? '') : (f.default ?? (f.type === 'list' ? [] : ''));
        setValues(init);
        if (numbers.length === 1) setNumber(numbers[0].id);
    };

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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
                <DialogHeader className="border-b px-6 py-4">
                    <DialogTitle className="flex items-center gap-2 text-[17px]">
                        {picked && (
                            <Button variant="ghost" size="icon-sm" onClick={() => setPicked(null)} aria-label="Back to the templates">
                                <ArrowLeftIcon />
                            </Button>
                        )}
                        {picked ? picked.name : 'Start with a ready-made flow'}
                    </DialogTitle>
                    <DialogDescription>
                        {picked
                            ? 'Fill in your details — you can change everything in the builder afterwards.'
                            : 'Pick the closest one to your business. Every template is ready to publish as it is.'}
                    </DialogDescription>
                </DialogHeader>

                {!picked ? (
                    <div className="min-h-0 flex-1 overflow-y-auto p-6">
                        {templates.isLoading && <Skeleton className="h-72 w-full" />}
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {(templates.data?.data ?? []).map((t) => {
                                const Icon = ICONS[t.icon] ?? BotIcon;

                                return (
                                    <button
                                        key={t.key}
                                        type="button"
                                        onClick={() => choose(t)}
                                        className="group flex flex-col rounded-2xl border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-500/60 hover:shadow-[0_8px_24px_rgba(16,24,40,.08)]"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <span className="flex size-10 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
                                                <Icon className="size-5" />
                                            </span>
                                            {t.recommended && <Badge tone="brand">Start here</Badge>}
                                        </div>
                                        <p className="mt-3 text-[14.5px] font-bold">{t.name}</p>
                                        <p className="text-[11.5px] font-semibold text-muted-foreground">{t.industry}</p>
                                        <p className="mt-2 text-[12.5px] leading-snug text-ink-2">{t.description}</p>
                                        <ol className="mt-3 space-y-1 border-t pt-3 text-[11.5px] text-muted-foreground">
                                            {t.steps.slice(0, 5).map((s, i) => (
                                                <li key={i} className="flex gap-1.5">
                                                    <span className="font-bold text-brand-600">{i + 1}</span> {s}
                                                </li>
                                            ))}
                                            {t.steps.length > 5 && <li className="pl-3">+ {t.steps.length - 5} more steps</li>}
                                        </ol>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[1fr_300px]">
                        <div className="min-h-0 space-y-5 overflow-y-auto p-6">
                            <FormError message={error} />
                            <div className="grid gap-3 sm:grid-cols-2">
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
                            {picked.fields.some((f) => f.scope === 'business') && (
                                <section className="space-y-3">
                                    <div>
                                        <p className="text-[13px] font-bold">Your business</p>
                                        <p className="text-[11.5px] text-muted-foreground">
                                            Saved once for all your flows; the messages use them as {'{{business.…}}'}.
                                        </p>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        {picked.fields
                                            .filter((f) => f.scope === 'business')
                                            .map((f) => (
                                                <FieldInput
                                                    key={f.key}
                                                    field={f}
                                                    value={values[f.key]}
                                                    onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
                                                />
                                            ))}
                                    </div>
                                </section>
                            )}
                            {picked.fields.some((f) => f.scope === 'flow') && (
                                <section className="space-y-3">
                                    <p className="text-[13px] font-bold">This flow</p>
                                    {picked.fields
                                        .filter((f) => f.scope === 'flow')
                                        .map((f) => (
                                            <FieldInput
                                                key={f.key}
                                                field={f}
                                                value={values[f.key]}
                                                onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
                                                values={values}
                                                templates={options.data?.templates ?? []}
                                            />
                                        ))}
                                </section>
                            )}
                        </div>
                        <aside className="hidden min-h-0 flex-col border-l bg-muted/40 p-5 md:flex">
                            <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">What it does</p>
                            <ol className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
                                {picked.steps.map((s, i) => (
                                    <li key={i} className="flex gap-2 text-[12.5px]">
                                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10.5px] font-bold text-brand-600">
                                            {i + 1}
                                        </span>
                                        {s}
                                    </li>
                                ))}
                            </ol>
                            <p className="mt-3 flex items-start gap-1.5 text-[11.5px] text-muted-foreground">
                                <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-good" /> Passes the publish checks as it is. Test it in the builder, then
                                publish.
                            </p>
                            <Button className="mt-4" onClick={create} disabled={busy}>
                                {busy ? <Loader2Icon className="animate-spin" /> : null} Create and open the builder
                            </Button>
                        </aside>
                        <div className="border-t p-4 md:hidden">
                            <Button className="w-full" onClick={create} disabled={busy}>
                                Create and open the builder
                            </Button>
                        </div>
                    </div>
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
