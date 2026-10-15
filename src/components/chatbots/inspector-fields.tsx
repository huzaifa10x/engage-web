'use client';

import { ArrowDownIcon, ArrowUpIcon, BracesIcon, PlusIcon, ScrollTextIcon, XIcon } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { type ChatbotOptions, newChoiceId, type NodeConfig, type Variable } from '@/lib/chatbots';
import { cn } from '@/lib/utils';

export type Patch = (patch: NodeConfig) => void;

export const textareaClass =
    'w-full rounded-lg border border-input bg-card px-3 py-2 text-[13px] leading-relaxed shadow-xs outline-none placeholder:text-faint focus-visible:border-brand-500 focus-visible:ring-[3px] focus-visible:ring-ring/30';

export function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
    return (
        <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">{title}</p>
                {aside}
            </div>
            {children}
        </section>
    );
}

export function Row({
    label,
    hint,
    children,
    htmlFor,
    counter,
}: {
    label: string;
    hint?: React.ReactNode;
    children: React.ReactNode;
    htmlFor?: string;
    counter?: React.ReactNode;
}) {
    return (
        <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2">
                <Label htmlFor={htmlFor} className="text-[12px] font-semibold">
                    {label}
                </Label>
                {counter}
            </div>
            {children}
            {hint && <p className="text-[11.5px] leading-snug text-muted-foreground">{hint}</p>}
        </div>
    );
}

export function Hint({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'info' | 'warn' }) {
    return (
        <p
            className={cn(
                'rounded-lg px-3 py-2 text-[11.5px] leading-relaxed',
                tone === 'info' ? 'bg-info-bg text-info' : tone === 'warn' ? 'bg-warn-bg text-warn' : 'bg-muted text-ink-2',
            )}
        >
            {children}
        </p>
    );
}

export function Counter({ length, max }: { length: number; max: number }) {
    return (
        <span
            className={cn('text-[10.5px] tabular-nums', length >= max ? 'font-bold text-bad' : length > max * 0.9 ? 'font-semibold text-warn' : 'text-faint')}
        >
            {length}/{max}
        </span>
    );
}

export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
    const id = useId();

    return (
        <div className="flex items-start justify-between gap-3">
            <div>
                <Label htmlFor={id} className="text-[12.5px] font-semibold">
                    {label}
                </Label>
                {hint && <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{hint}</p>}
            </div>
            <Switch id={id} checked={checked} onCheckedChange={onChange} />
        </div>
    );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
    return (
        <div className="grid gap-1 rounded-lg bg-muted p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup">
            {options.map(([v, l]) => (
                <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={value === v}
                    onClick={() => onChange(v)}
                    className={cn(
                        'rounded-md px-2 py-1.5 text-[12px] font-semibold',
                        value === v ? 'bg-card shadow-xs' : 'text-muted-foreground hover:text-foreground',
                    )}
                >
                    {l}
                </button>
            ))}
        </div>
    );
}

/**
 * Text with {{variables}}: typing "{{" opens suggestions (contact data, answers, business
 * variables), "Insert" lists them all, snippets paste saved text, and WhatsApp's limit is counted.
 */
export function VarText({
    label,
    value,
    onChange,
    vars,
    max,
    hint,
    placeholder,
    rows = 3,
    multiline = true,
    snippets,
    secrets,
    dir,
    mono,
}: {
    label: string;
    value: string | null | undefined;
    onChange: (v: string) => void;
    vars: Variable[];
    max: number;
    hint?: React.ReactNode;
    placeholder?: string;
    rows?: number;
    multiline?: boolean;
    snippets?: { id: string; name: string; body: string }[];
    secrets?: string[];
    dir?: 'rtl' | 'ltr';
    mono?: boolean;
}) {
    const id = useId();
    const text = value ?? '';
    const field = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
    const [query, setQuery] = useState<string | null>(null);
    const [active, setActive] = useState(0);
    const all: { key: string; label: string; group: string }[] = [
        ...vars,
        ...(secrets ?? []).map((s) => ({ key: `secret.${s}`, label: s, group: 'API keys' })),
    ];
    const suggestions = query === null ? [] : all.filter((v) => `${v.key} ${v.label}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8);

    const track = (el: HTMLTextAreaElement | HTMLInputElement) => {
        const before = el.value.slice(0, el.selectionStart ?? el.value.length);
        const m = /\{\{\s*([\w.]*)$/.exec(before);
        setQuery(m ? m[1] : null);
        setActive(0);
    };
    const insert = (key: string) => {
        const el = field.current;
        const caret = el?.selectionStart ?? text.length;
        const before = text.slice(0, caret);
        const after = text.slice(caret);
        const m = /\{\{\s*([\w.]*)$/.exec(before);
        const start = m ? caret - m[0].length : caret;
        const token = `{{${key}}}`;
        const next = `${text.slice(0, start)}${token}${after.replace(/^\s*[\w.]*\}\}/, '')}`.slice(0, max);
        onChange(next);
        setQuery(null);
        requestAnimationFrame(() => {
            el?.focus();
            const pos = Math.min(next.length, start + token.length);
            el?.setSelectionRange(pos, pos);
        });
    };
    const append = (piece: string) => {
        onChange(`${text}${text && !/\s$/.test(text) ? ' ' : ''}${piece}`.slice(0, max));
    };
    const common = {
        id,
        ref: field,
        value: text,
        maxLength: max,
        placeholder,
        dir,
        onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
            onChange(e.target.value);
            track(e.target);
        },
        onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
            if (suggestions.length === 0) return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => (a + 1) % suggestions.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                insert(suggestions[active].key);
            } else if (e.key === 'Escape') {
                setQuery(null);
            }
        },
        onClick: (e: React.MouseEvent<HTMLTextAreaElement | HTMLInputElement>) => track(e.currentTarget),
        onBlur: () => setTimeout(() => setQuery(null), 150),
    };

    return (
        <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-1">
                <Label htmlFor={id} className="text-[12px] font-semibold">
                    {label}
                </Label>
                <div className="flex items-center gap-0.5">
                    {snippets && snippets.length > 0 && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[11.5px]" title="Insert a saved snippet">
                                    <ScrollTextIcon /> Snippet
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="max-h-72 w-72">
                                {snippets.map((s) => (
                                    <DropdownMenuItem key={s.id} onSelect={() => append(s.body)} className="flex-col items-start gap-0">
                                        <span className="font-semibold">{s.name}</span>
                                        <span className="line-clamp-2 text-[11.5px] text-muted-foreground">{s.body}</span>
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                    <VarMenu vars={all} onPick={(key) => append(`{{${key}}}`)} />
                    <Counter length={text.length} max={max} />
                </div>
            </div>
            <div className="relative">
                {multiline ? (
                    <textarea rows={rows} className={cn(textareaClass, mono && 'font-mono text-[12px]')} {...common} />
                ) : (
                    <Input className={cn(mono && 'font-mono text-[12px]')} {...common} />
                )}
                {suggestions.length > 0 && (
                    <div className="absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-lg border bg-popover shadow-lg" role="listbox">
                        {suggestions.map((s, i) => (
                            <button
                                key={s.key}
                                type="button"
                                role="option"
                                aria-selected={i === active}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    insert(s.key);
                                }}
                                className={cn('flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[12px]', i === active && 'bg-muted')}
                            >
                                <span className="truncate">{s.label}</span>
                                <code className="shrink-0 text-[10.5px] text-muted-foreground">{s.key}</code>
                            </button>
                        ))}
                    </div>
                )}
            </div>
            {hint && <p className="text-[11.5px] leading-snug text-muted-foreground">{hint}</p>}
        </div>
    );
}

function VarMenu({ vars, onPick }: { vars: { key: string; label: string; group: string }[]; onPick: (key: string) => void }) {
    const groups = [...new Set(vars.map((v) => v.group))];

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[11.5px]" title="Insert a variable (or type {{ )">
                    <BracesIcon /> Variable
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 w-72 overflow-y-auto">
                {groups.map((g, n) => (
                    <div key={g}>
                        {n > 0 && <DropdownMenuSeparator />}
                        <DropdownMenuLabel>{g}</DropdownMenuLabel>
                        {vars
                            .filter((v) => v.group === g)
                            .map((v) => (
                                <DropdownMenuItem key={v.key} onSelect={() => onPick(v.key)}>
                                    <span className="flex-1 truncate">{v.label}</span>
                                    <code className="ml-3 text-[10.5px] text-muted-foreground">{v.key}</code>
                                </DropdownMenuItem>
                            ))}
                    </div>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function LimitedInput({
    label,
    value,
    onChange,
    max,
    placeholder,
    hint,
    dir,
    mono,
}: {
    label: string;
    value: string | null | undefined;
    onChange: (v: string | null) => void;
    max: number;
    placeholder?: string;
    hint?: React.ReactNode;
    dir?: 'rtl' | 'ltr';
    mono?: boolean;
}) {
    const id = useId();

    return (
        <Row label={label} htmlFor={id} hint={hint} counter={<Counter length={(value ?? '').length} max={max} />}>
            <Input
                id={id}
                value={value ?? ''}
                maxLength={max}
                placeholder={placeholder}
                dir={dir}
                className={cn(mono && 'font-mono text-[12px]')}
                onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
            />
        </Row>
    );
}

type Choice = { id: string; title: string; description?: string | null };

/** Buttons / list rows: title (and description) with live limits, reorder, add, remove. */
export function Choices({
    label,
    hint,
    items,
    max,
    titleMax,
    withDescription,
    onChange,
    translations,
    onTranslate,
    dir,
}: {
    label: string;
    hint: string;
    items: Choice[];
    max: number;
    titleMax: number;
    withDescription?: boolean;
    onChange: (items: Choice[]) => void;
    /** When editing another language: the translated titles by id. */
    translations?: Record<string, string | { title: string; description?: string | null }>;
    onTranslate?: (id: string, value: string | { title: string; description: string | null } | null) => void;
    dir?: 'rtl' | 'ltr';
}) {
    const update = (i: number, patch: Partial<Choice>) => onChange(items.map((it, n) => (n === i ? { ...it, ...patch } : it)));
    const move = (i: number, d: number) => {
        const next = [...items];
        const [it] = next.splice(i, 1);
        next.splice(i + d, 0, it);
        onChange(next);
    };
    const translating = onTranslate !== undefined;

    return (
        <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
                <Label className="text-[12px] font-semibold">{label}</Label>
                <span className={cn('text-[10.5px] tabular-nums', items.length >= max ? 'font-semibold text-warn' : 'text-faint')}>
                    {items.length}/{max}
                </span>
            </div>
            <div className="space-y-1.5">
                {items.map((it, i) => {
                    const tr = translations?.[it.id];
                    const trTitle = typeof tr === 'string' ? tr : (tr?.title ?? '');
                    const trDesc = typeof tr === 'object' && tr ? (tr.description ?? '') : '';

                    return (
                        <div key={it.id} className="rounded-lg border bg-card p-1.5">
                            <div className="flex items-center gap-1">
                                <span className="w-4 shrink-0 text-center text-[11px] font-semibold text-faint">{i + 1}</span>
                                {translating ? (
                                    <Input
                                        value={trTitle}
                                        maxLength={titleMax}
                                        placeholder={it.title}
                                        dir={dir}
                                        onChange={(e) =>
                                            onTranslate?.(
                                                it.id,
                                                withDescription ? { title: e.target.value, description: trDesc || null } : e.target.value || null,
                                            )
                                        }
                                        className="h-8"
                                        aria-label={`${label} ${i + 1} (translation)`}
                                    />
                                ) : (
                                    <Input
                                        value={it.title}
                                        maxLength={titleMax}
                                        onChange={(e) => update(i, { title: e.target.value })}
                                        className="h-8"
                                        aria-label={`${label} ${i + 1}`}
                                        placeholder={`Option ${i + 1}`}
                                    />
                                )}
                                <Counter length={(translating ? trTitle : it.title).length} max={titleMax} />
                                {!translating && (
                                    <>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            disabled={i === 0}
                                            onClick={() => move(i, -1)}
                                            aria-label="Move up"
                                        >
                                            <ArrowUpIcon />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            disabled={i === items.length - 1}
                                            onClick={() => move(i, 1)}
                                            aria-label="Move down"
                                        >
                                            <ArrowDownIcon />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            onClick={() => onChange(items.filter((_, n) => n !== i))}
                                            aria-label="Remove"
                                        >
                                            <XIcon />
                                        </Button>
                                    </>
                                )}
                            </div>
                            {withDescription && (
                                <Input
                                    value={translating ? trDesc : (it.description ?? '')}
                                    maxLength={72}
                                    placeholder={translating ? (it.description ?? 'Description') : 'Description (optional, up to 72 characters)'}
                                    dir={translating ? dir : undefined}
                                    onChange={(e) =>
                                        translating
                                            ? onTranslate?.(it.id, { title: trTitle || it.title, description: e.target.value || null })
                                            : update(i, { description: e.target.value || null })
                                    }
                                    className="mt-1 h-8 text-[12.5px]"
                                />
                            )}
                        </div>
                    );
                })}
            </div>
            {!translating && items.length < max && (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                        onChange([...items, { id: newChoiceId(), title: `Option ${items.length + 1}`, ...(withDescription ? { description: null } : {}) }])
                    }
                >
                    <PlusIcon /> Add
                </Button>
            )}
            <p className="text-[11.5px] text-muted-foreground">{hint}</p>
        </div>
    );
}

const VAR_PREFIX = '__var__';

/** Where a value is saved: a contact field (kept on the contact) or a variable of this conversation. */
export function TargetPicker({
    label,
    value,
    options,
    onChange,
    hint,
}: {
    label: string;
    value: string | null;
    options: ChatbotOptions | undefined;
    onChange: (v: string) => void;
    hint?: string;
}) {
    const isVar = typeof value === 'string' && value.startsWith('var:');

    return (
        <Row
            label={label}
            hint={
                hint ??
                (isVar
                    ? `Kept for this conversation; use it later as {{var.${(value ?? '').slice(4)}}}.`
                    : value
                      ? 'Saved on the contact, visible in Contacts.'
                      : undefined)
            }
        >
            <Select value={isVar ? VAR_PREFIX : (value ?? undefined)} onValueChange={(v) => onChange(v === VAR_PREFIX ? 'var:answer' : v)}>
                <SelectTrigger>
                    <SelectValue placeholder="Choose where to save…" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={VAR_PREFIX}>A variable of this conversation…</SelectItem>
                    <SelectItem value="name">Contact name</SelectItem>
                    <SelectItem value="email">Contact email</SelectItem>
                    {(options?.fields ?? []).map((f) => (
                        <SelectItem key={f.key} value={`field:${f.key}`}>
                            {f.label} <span className="text-muted-foreground">(custom field)</span>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {isVar && (
                <Input
                    value={(value ?? '').slice(4)}
                    onChange={(e) => onChange(`var:${e.target.value.replace(/[^A-Za-z0-9_]/g, '').slice(0, 40) || 'answer'}`)}
                    placeholder="variable_name"
                    className="h-8 font-mono text-[12.5px]"
                    aria-label="Variable name"
                />
            )}
        </Row>
    );
}

export function AssignPicker({ c, set, options, noneLabel }: { c: NodeConfig; set: Patch; options: ChatbotOptions | undefined; noneLabel: string }) {
    return (
        <>
            <Row label="Assign the conversation" hint="Teams follow your inbox routing; pick a teammate to send it to one person.">
                <Select value={c.assign ?? 'none'} onValueChange={(assign) => set({ assign })}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">{noneLabel}</SelectItem>
                        <SelectItem value="auto">The least busy teammate on this number</SelectItem>
                        <SelectItem value="member">A specific teammate</SelectItem>
                    </SelectContent>
                </Select>
            </Row>
            {c.assign === 'member' && (
                <Row label="Teammate">
                    <Select value={c.member_id ?? undefined} onValueChange={(member_id) => set({ member_id })}>
                        <SelectTrigger>
                            <SelectValue placeholder="Choose a teammate…" />
                        </SelectTrigger>
                        <SelectContent>
                            {(options?.members ?? []).map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                    {m.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Row>
            )}
        </>
    );
}

export function PickOrType({
    value,
    onChange,
    choices,
    placeholder,
}: {
    value: string | null;
    onChange: (v: string | null) => void;
    choices: [string, string][];
    placeholder: string;
}) {
    return (
        <Select value={value ?? undefined} onValueChange={onChange}>
            <SelectTrigger className="h-8">
                <SelectValue placeholder={choices.length ? `${placeholder}…` : `No ${placeholder.toLowerCase()}s yet`} />
            </SelectTrigger>
            <SelectContent>
                {choices.map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                        {l}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

export function SelectRow<T extends string>({
    label,
    value,
    options,
    onChange,
    hint,
}: {
    label: string;
    value: T;
    options: [T, string][];
    onChange: (v: T) => void;
    hint?: React.ReactNode;
}) {
    return (
        <Row label={label} hint={hint}>
            <Select value={value} onValueChange={(v) => onChange(v as T)}>
                <SelectTrigger>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {options.map(([v, l]) => (
                        <SelectItem key={v} value={v}>
                            {l}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </Row>
    );
}
