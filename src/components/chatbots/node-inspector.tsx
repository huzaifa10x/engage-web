'use client';

import { ArrowDownIcon, ArrowUpIcon, BracesIcon, CopyIcon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useId } from 'react';

import { TagInput } from '@/components/contacts/tag-input';
import { Badge } from '@/components/ui/badge';
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
import {
    type ChatbotOptions,
    type FlowGraph,
    type FlowIssue,
    type FlowNode,
    formatMinutes,
    kindOf,
    newChoiceId,
    type NodeConfig,
    VARIABLES,
} from '@/lib/chatbots';
import { cn } from '@/lib/utils';

type Patch = (patch: NodeConfig) => void;

const textareaClass =
    'w-full rounded-md border border-input bg-card px-3 py-2 text-[13px] leading-relaxed shadow-xs outline-none focus-visible:border-brand-500 focus-visible:ring-[3px] focus-visible:ring-ring/30';

/** Right-hand panel: edits the selected block. Changes apply as you type and are saved automatically. */
export function NodeInspector({
    node,
    graph,
    options,
    issues,
    readOnly,
    onTitle,
    onConfig,
    onDelete,
    onDuplicate,
    onSelect,
}: {
    node: FlowNode;
    graph: FlowGraph;
    options: ChatbotOptions | undefined;
    issues: FlowIssue[];
    readOnly: boolean;
    onTitle: (title: string) => void;
    onConfig: (config: NodeConfig) => void;
    onDelete: () => void;
    onDuplicate: () => void;
    onSelect: (id: string) => void;
}) {
    const kind = kindOf(node.type);
    const set: Patch = (patch) => onConfig({ ...node.config, ...patch });
    const titles = new Map(graph.nodes.map((n) => [n.id, n.title]));
    const mine = issues.filter((i) => i.node_id === node.id);

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2.5 border-b px-4 py-3">
                <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-base" aria-hidden>
                    {kind.icon}
                </span>
                <div className="min-w-0 flex-1">
                    <Input
                        value={node.title}
                        onChange={(e) => onTitle(e.target.value.slice(0, 60))}
                        disabled={readOnly}
                        className="h-8 font-semibold"
                        aria-label="Block name"
                    />
                    <p className="mt-0.5 text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">
                        {node.type === 'start' ? 'Trigger' : kind.label} block
                    </p>
                </div>
            </div>
            <fieldset disabled={readOnly} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                {mine.length > 0 && (
                    <div className="space-y-1.5">
                        {mine.map((i, n) => (
                            <p
                                key={n}
                                className={cn('rounded-md px-2.5 py-2 text-[12px]', i.level === 'error' ? 'bg-bad-bg text-bad' : 'bg-warn-bg text-warn')}
                            >
                                {i.message}
                            </p>
                        ))}
                    </div>
                )}
                <Editor node={node} graph={graph} options={options} set={set} />

                {node.outputs.length > 0 && (
                    <div className="space-y-1">
                        <Label>Connections</Label>
                        <p className="text-[11.5px] text-muted-foreground">Drag a ● port on the card onto another block to change where a branch goes.</p>
                        <div className="divide-y rounded-md border">
                            {node.outputs.map((o) => (
                                <div key={o.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[12.5px]">
                                    <span className="truncate">{o.label}</span>
                                    {o.to && titles.has(o.to) ? (
                                        <button className="truncate font-medium text-brand-600 hover:underline" onClick={() => onSelect(o.to as string)}>
                                            → {titles.get(o.to)}
                                        </button>
                                    ) : (
                                        <span className="text-warn">not connected</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </fieldset>
            {!readOnly && node.type !== 'start' && (
                <div className="flex gap-2 border-t px-4 py-3">
                    <Button variant="outline" size="sm" className="flex-1" onClick={onDuplicate}>
                        <CopyIcon /> Duplicate
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 text-bad hover:text-bad" onClick={onDelete}>
                        <Trash2Icon /> Delete
                    </Button>
                </div>
            )}
        </div>
    );
}

function Editor({ node, graph, options, set }: { node: FlowNode; graph: FlowGraph; options: ChatbotOptions | undefined; set: Patch }) {
    const c = node.config;
    const vars = variablesIn(graph, options);

    switch (node.type) {
        case 'start':
            return (
                <>
                    <Toggle
                        label="Any message"
                        hint="Every customer message that is not part of a running flow starts it."
                        checked={!!c.any_message}
                        onChange={(v) => set({ any_message: v })}
                    />
                    <Row label="Keywords" hint="The flow also starts when a message is (or begins with) one of these words.">
                        <TagInput
                            value={c.keywords ?? []}
                            onChange={(v) => set({ keywords: v.map((k) => k.toLowerCase()) })}
                            placeholder="e.g. menu, hi — press Enter"
                        />
                    </Row>
                    <Toggle
                        label="Click-to-WhatsApp ads"
                        hint="Customers arriving from one of your Meta ads start the flow."
                        checked={!!c.ad_referral}
                        onChange={(v) => set({ ad_referral: v })}
                    />
                    <Hint>Only one flow is live per number. While a person handles a conversation the bot stays quiet there.</Hint>
                </>
            );
        case 'message':
            return <MessageText value={c.text} onChange={(text) => set({ text })} vars={vars} max={4096} />;
        case 'buttons':
            return (
                <>
                    <Row label="Header (optional)">
                        <Input value={c.header ?? ''} maxLength={60} onChange={(e) => set({ header: e.target.value || null })} />
                    </Row>
                    <MessageText value={c.text} onChange={(text) => set({ text })} vars={vars} max={1024} />
                    <Row label="Footer (optional)">
                        <Input value={c.footer ?? ''} maxLength={60} onChange={(e) => set({ footer: e.target.value || null })} />
                    </Row>
                    <Choices
                        label="Buttons"
                        hint="Up to 3, 20 characters each. Each button is a branch."
                        items={c.buttons ?? []}
                        max={3}
                        titleMax={20}
                        onChange={(buttons) => set({ buttons })}
                    />
                    <Hint>Typed answers work too: the button text or its number. Anything else gets a retry, then the “No match” branch.</Hint>
                </>
            );
        case 'list':
            return (
                <>
                    <Row label="Header (optional)">
                        <Input value={c.header ?? ''} maxLength={60} onChange={(e) => set({ header: e.target.value || null })} />
                    </Row>
                    <MessageText value={c.text} onChange={(text) => set({ text })} vars={vars} max={1024} />
                    <div className="grid grid-cols-2 gap-2">
                        <Row label="Menu button">
                            <Input value={c.button_label ?? ''} maxLength={20} onChange={(e) => set({ button_label: e.target.value })} />
                        </Row>
                        <Row label="Section title">
                            <Input value={c.section_title ?? ''} maxLength={24} onChange={(e) => set({ section_title: e.target.value || null })} />
                        </Row>
                    </div>
                    <Choices
                        label="Rows"
                        hint="Up to 10. Title up to 24 characters, description up to 72."
                        items={c.rows ?? []}
                        max={10}
                        titleMax={24}
                        withDescription
                        onChange={(rows) => set({ rows })}
                    />
                </>
            );
        case 'question':
            return (
                <>
                    <MessageText value={c.text} onChange={(text) => set({ text })} vars={vars} max={1024} label="Question" />
                    <Row label="Expected answer">
                        <Select value={c.validate ?? 'any'} onValueChange={(validate) => set({ validate })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {[
                                    ['any', 'Anything'],
                                    ['text', 'Text'],
                                    ['number', 'A number'],
                                    ['email', 'An email address'],
                                    ['phone', 'A phone number'],
                                    ['date', 'A date'],
                                ].map(([v, l]) => (
                                    <SelectItem key={v} value={v}>
                                        {l}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Row>
                    <TargetPicker label="Save the answer to" value={c.save_to} options={options} onChange={(save_to) => set({ save_to })} />
                    <Row label="When the answer does not fit (optional)" hint="Sent before asking again. Default: the flow's retry message.">
                        <Input value={c.error_text ?? ''} maxLength={300} onChange={(e) => set({ error_text: e.target.value || null })} />
                    </Row>
                </>
            );
        case 'product':
            return <ProductEditor c={c} set={set} vars={vars} />;
        case 'media':
            return (
                <>
                    <Row label="Type">
                        <Select value={c.kind} onValueChange={(kind) => set({ kind })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="image">Image</SelectItem>
                                <SelectItem value="video">Video</SelectItem>
                                <SelectItem value="document">Document (PDF …)</SelectItem>
                                <SelectItem value="location">Location</SelectItem>
                            </SelectContent>
                        </Select>
                    </Row>
                    {c.kind === 'location' ? (
                        <>
                            <div className="grid grid-cols-2 gap-2">
                                <Row label="Latitude">
                                    <Input
                                        inputMode="decimal"
                                        value={c.latitude ?? ''}
                                        onChange={(e) => set({ latitude: e.target.value === '' ? null : e.target.value })}
                                        placeholder="25.2048"
                                    />
                                </Row>
                                <Row label="Longitude">
                                    <Input
                                        inputMode="decimal"
                                        value={c.longitude ?? ''}
                                        onChange={(e) => set({ longitude: e.target.value === '' ? null : e.target.value })}
                                        placeholder="55.2708"
                                    />
                                </Row>
                            </div>
                            <Row label="Place name">
                                <Input value={c.name ?? ''} maxLength={100} onChange={(e) => set({ name: e.target.value || null })} />
                            </Row>
                            <Row label="Address">
                                <Input value={c.address ?? ''} maxLength={300} onChange={(e) => set({ address: e.target.value || null })} />
                            </Row>
                        </>
                    ) : (
                        <>
                            <Row label="File link (https)" hint="A public link to the file; WhatsApp downloads it from there.">
                                <Input value={c.link ?? ''} onChange={(e) => set({ link: e.target.value })} placeholder="https://example.com/menu.pdf" />
                            </Row>
                            {c.kind === 'document' && (
                                <Row label="File name">
                                    <Input
                                        value={c.filename ?? ''}
                                        maxLength={120}
                                        onChange={(e) => set({ filename: e.target.value || null })}
                                        placeholder="Menu.pdf"
                                    />
                                </Row>
                            )}
                            <MessageText
                                value={c.caption ?? ''}
                                onChange={(caption) => set({ caption: caption || null })}
                                vars={vars}
                                max={1024}
                                label="Caption (optional)"
                            />
                        </>
                    )}
                </>
            );
        case 'template':
            return <TemplateEditor c={c} set={set} options={options} />;
        case 'condition':
            return <ConditionEditor c={c} set={set} options={options} vars={vars} />;
        case 'setfield':
            return (
                <>
                    <TargetPicker label="Field" value={c.target} options={options} onChange={(target) => set({ target })} />
                    <MessageText value={c.value ?? ''} onChange={(value) => set({ value })} vars={vars} max={1000} label="Value" rows={2} />
                    <Hint>Written through the same path as an edit in Contacts, so segments see the new value at once.</Hint>
                </>
            );
        case 'http':
            return <HttpEditor c={c} set={set} options={options} vars={vars} />;
        case 'delay': {
            const minutes = Number(c.minutes ?? 10);
            const unit = minutes % 1440 === 0 ? 1440 : minutes % 60 === 0 ? 60 : 1;

            return (
                <>
                    <Row label="Wait">
                        <div className="flex gap-2">
                            <Input
                                type="number"
                                min={1}
                                value={minutes / unit}
                                onChange={(e) => set({ minutes: Math.max(1, Math.min(10080, Math.round(Number(e.target.value || 1) * unit))) })}
                                className="w-24"
                            />
                            <Select
                                value={String(unit)}
                                onValueChange={(u) => set({ minutes: Math.max(1, Math.min(10080, Math.round((minutes / unit) * Number(u)))) })}
                            >
                                <SelectTrigger className="flex-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">minutes</SelectItem>
                                    <SelectItem value="60">hours</SelectItem>
                                    <SelectItem value="1440">days</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </Row>
                    <Hint>
                        The flow continues after {formatMinutes(minutes)}. Customers who write meanwhile stay in the flow. Messages more than 24 hours after the
                        customer last wrote need a Template block.
                    </Hint>
                </>
            );
        }
        case 'tag':
            return (
                <>
                    <Row label="Add tags">
                        <TagInput value={c.add ?? []} onChange={(add) => set({ add })} suggestions={options?.tags ?? []} />
                    </Row>
                    <Row label="Remove tags">
                        <TagInput value={c.remove ?? []} onChange={(remove) => set({ remove })} suggestions={options?.tags ?? []} />
                    </Row>
                    <AssignPicker c={c} set={set} options={options} noneLabel="Don't assign" />
                </>
            );
        case 'handoff':
            return (
                <>
                    <MessageText
                        value={c.text ?? ''}
                        onChange={(text) => set({ text: text || null })}
                        vars={vars}
                        max={1024}
                        label="Message to the customer"
                        rows={3}
                    />
                    <MessageText
                        value={c.offline_text ?? ''}
                        onChange={(offline_text) => set({ offline_text: offline_text || null })}
                        vars={vars}
                        max={1024}
                        label="Outside business hours (optional)"
                        rows={2}
                    />
                    <AssignPicker c={c} set={set} options={options} noneLabel="Use the inbox routing rule" />
                    <Hint>
                        The bot pauses in this conversation and a person takes over. It comes back after “Hand back to bot”, when the chat is closed, or after
                        the auto-resume time in Flow settings.
                    </Hint>
                </>
            );
        case 'end':
            return (
                <>
                    <MessageText
                        value={c.text ?? ''}
                        onChange={(text) => set({ text: text || null })}
                        vars={vars}
                        max={1024}
                        label="Closing message (optional)"
                        rows={2}
                    />
                    <Row label="Then">
                        <Select value={c.action ?? 'none'} onValueChange={(action) => set({ action })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Leave the conversation open</SelectItem>
                                <SelectItem value="close">Close the conversation</SelectItem>
                                <SelectItem value="assign">Assign it to a teammate</SelectItem>
                            </SelectContent>
                        </Select>
                    </Row>
                    {c.action === 'assign' && <AssignPicker c={c} set={set} options={options} noneLabel="Least busy teammate" />}
                </>
            );
    }
}

// ── Pieces ────────────────────────────────────────────────────────────────────────────────

function Row({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="grid gap-1.5">
            <Label className="text-[12px]">{label}</Label>
            {children}
            {hint && <p className="text-[11.5px] leading-snug text-muted-foreground">{hint}</p>}
        </div>
    );
}

function Hint({ children }: { children: React.ReactNode }) {
    return <p className="rounded-md bg-muted px-3 py-2 text-[11.5px] leading-relaxed text-ink-2">{children}</p>;
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
    const id = useId();

    return (
        <div className="flex items-start justify-between gap-3">
            <div>
                <Label htmlFor={id} className="text-[12.5px]">
                    {label}
                </Label>
                {hint && <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{hint}</p>}
            </div>
            <Switch id={id} checked={checked} onCheckedChange={onChange} />
        </div>
    );
}

type Var = { key: string; label: string };

function variablesIn(graph: FlowGraph, options: ChatbotOptions | undefined): Var[] {
    const out: Var[] = [...VARIABLES, ...(options?.fields ?? []).map((f) => ({ key: `contact.${f.key}`, label: f.label }))];
    const seen = new Set(out.map((v) => v.key));
    const add = (key: string, label: string) => {
        if (!seen.has(key)) {
            seen.add(key);
            out.push({ key, label });
        }
    };
    for (const n of graph.nodes) {
        const c = n.config;
        if (n.type === 'question' && typeof c.save_to === 'string' && c.save_to.startsWith('var:'))
            add(`var.${c.save_to.slice(4)}`, `Answer: ${c.save_to.slice(4)}`);
        if (n.type === 'setfield' && typeof c.target === 'string' && c.target.startsWith('var:'))
            add(`var.${c.target.slice(4)}`, `Value: ${c.target.slice(4)}`);
        if (n.type === 'product') {
            add(`var.${c.save_to ?? 'product'}.name`, 'Chosen product');
            add(`var.${c.save_to ?? 'product'}.price`, 'Chosen product price');
            add(`var.${c.save_to ?? 'product'}.link`, 'Chosen product link');
        }
        if (n.type === 'http') {
            for (const m of (c.save ?? []) as { to: string }[]) if (m.to?.startsWith('var:')) add(`var.${m.to.slice(4)}`, `API: ${m.to.slice(4)}`);
            add('var.http_status', 'API status code');
        }
        if (n.type === 'buttons' || n.type === 'list') add(`var.${n.id}`, `Choice in “${n.title}”`);
    }

    return out;
}

function VarMenu({ vars, onPick, secrets }: { vars: Var[]; onPick: (token: string) => void; secrets?: string[] }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[12px]">
                    <BracesIcon /> Insert
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                <DropdownMenuLabel>Contact & answers</DropdownMenuLabel>
                {vars.map((v) => (
                    <DropdownMenuItem key={v.key} onSelect={() => onPick(`{{${v.key}}}`)}>
                        <span className="flex-1">{v.label}</span>
                        <code className="ml-3 text-[10.5px] text-muted-foreground">{v.key}</code>
                    </DropdownMenuItem>
                ))}
                {secrets && secrets.length > 0 && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>API keys</DropdownMenuLabel>
                        {secrets.map((s) => (
                            <DropdownMenuItem key={s} onSelect={() => onPick(`{{secret.${s}}}`)}>
                                <code className="text-[11px]">secret.{s}</code>
                            </DropdownMenuItem>
                        ))}
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function MessageText({
    value,
    onChange,
    vars,
    max,
    label = 'Message',
    rows = 4,
    secrets,
}: {
    value: string | null;
    onChange: (v: string) => void;
    vars: Var[];
    max: number;
    label?: string;
    rows?: number;
    secrets?: string[];
}) {
    const id = useId();
    const text = value ?? '';

    return (
        <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
                <Label htmlFor={id} className="text-[12px]">
                    {label}
                </Label>
                <VarMenu vars={vars} secrets={secrets} onPick={(token) => onChange(`${text}${text && !text.endsWith(' ') ? ' ' : ''}${token}`.slice(0, max))} />
            </div>
            <textarea id={id} rows={rows} value={text} maxLength={max} onChange={(e) => onChange(e.target.value)} className={textareaClass} />
            <p className="text-right text-[10.5px] text-faint">
                {text.length}/{max}
            </p>
        </div>
    );
}

function Choices({
    label,
    hint,
    items,
    max,
    titleMax,
    withDescription,
    onChange,
}: {
    label: string;
    hint: string;
    items: { id: string; title: string; description?: string | null }[];
    max: number;
    titleMax: number;
    withDescription?: boolean;
    onChange: (items: { id: string; title: string; description?: string | null }[]) => void;
}) {
    const update = (i: number, patch: Partial<{ title: string; description: string | null }>) =>
        onChange(items.map((it, n) => (n === i ? { ...it, ...patch } : it)));
    const move = (i: number, d: number) => {
        const next = [...items];
        const [it] = next.splice(i, 1);
        next.splice(i + d, 0, it);
        onChange(next);
    };

    return (
        <div className="grid gap-1.5">
            <Label className="text-[12px]">{label}</Label>
            <div className="space-y-1.5">
                {items.map((it, i) => (
                    <div key={it.id} className="rounded-md border p-1.5">
                        <div className="flex items-center gap-1">
                            <Input
                                value={it.title}
                                maxLength={titleMax}
                                onChange={(e) => update(i, { title: e.target.value })}
                                className="h-8"
                                aria-label={`${label} ${i + 1}`}
                            />
                            <Button type="button" variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
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
                            <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange(items.filter((_, n) => n !== i))} aria-label="Remove">
                                <XIcon />
                            </Button>
                        </div>
                        {withDescription && (
                            <Input
                                value={it.description ?? ''}
                                maxLength={72}
                                placeholder="Description (optional)"
                                onChange={(e) => update(i, { description: e.target.value || null })}
                                className="mt-1 h-8 text-[12.5px]"
                            />
                        )}
                    </div>
                ))}
            </div>
            {items.length < max && (
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

function TargetPicker({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: string | null;
    options: ChatbotOptions | undefined;
    onChange: (v: string) => void;
}) {
    const isVar = typeof value === 'string' && value.startsWith('var:');

    return (
        <Row label={label} hint={isVar ? 'Kept for this conversation only; use it later as {{var.name}}.' : 'Saved on the contact.'}>
            <Select value={isVar ? VAR_PREFIX : (value ?? undefined)} onValueChange={(v) => onChange(v === VAR_PREFIX ? 'var:answer' : v)}>
                <SelectTrigger>
                    <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="name">Contact name</SelectItem>
                    <SelectItem value="email">Contact email</SelectItem>
                    {(options?.fields ?? []).map((f) => (
                        <SelectItem key={f.key} value={`field:${f.key}`}>
                            {f.label} <span className="text-muted-foreground">(custom field)</span>
                        </SelectItem>
                    ))}
                    <SelectItem value={VAR_PREFIX}>A variable of this conversation…</SelectItem>
                </SelectContent>
            </Select>
            {isVar && (
                <Input
                    value={value.slice(4)}
                    onChange={(e) => onChange(`var:${e.target.value.replace(/[^A-Za-z0-9_]/g, '').slice(0, 40) || 'answer'}`)}
                    placeholder="variable name"
                    className="h-8 font-mono text-[12.5px]"
                />
            )}
        </Row>
    );
}

function AssignPicker({ c, set, options, noneLabel }: { c: NodeConfig; set: Patch; options: ChatbotOptions | undefined; noneLabel: string }) {
    return (
        <>
            <Row label="Assign the conversation">
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
                            <SelectValue placeholder="Choose…" />
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

type Product = { id: string; name: string; price: string | null; description: string | null; image_url: string | null; link: string | null };

function ProductEditor({ c, set, vars }: { c: NodeConfig; set: Patch; vars: Var[] }) {
    const items = (c.items ?? []) as Product[];
    const update = (i: number, patch: Partial<Product>) => set({ items: items.map((it, n) => (n === i ? { ...it, ...patch } : it)) });

    return (
        <>
            <MessageText value={c.text} onChange={(text) => set({ text })} vars={vars} max={1024} label="Intro message" rows={2} />
            <Row label="Show as">
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
                    {[
                        ['list', 'List'],
                        ['images', 'Pictures + №'],
                        ['cards', 'Cards'],
                    ].map(([v, l]) => (
                        <button
                            key={v}
                            type="button"
                            onClick={() => set({ mode: v })}
                            className={cn('rounded-md px-2 py-1.5 text-[12px] font-semibold', c.mode === v ? 'bg-card shadow-xs' : 'text-muted-foreground')}
                        >
                            {l}
                        </button>
                    ))}
                </div>
            </Row>
            <Hint>
                {c.mode === 'images'
                    ? 'Each product is sent as a picture numbered 1, 2, 3…; the customer replies with the number. “2” always means the 2nd product shown in this turn.'
                    : c.mode === 'cards'
                      ? 'Each product is a picture card with an order button.'
                      : 'One WhatsApp list the customer taps to choose (up to 10 products).'}
            </Hint>
            {c.mode === 'list' ? (
                <Row label="List button">
                    <Input value={c.button_label ?? ''} maxLength={20} onChange={(e) => set({ button_label: e.target.value })} />
                </Row>
            ) : c.mode === 'cards' ? (
                <Row label="Order button">
                    <Input value={c.order_label ?? ''} maxLength={20} onChange={(e) => set({ order_label: e.target.value })} />
                </Row>
            ) : null}
            <div className="grid gap-1.5">
                <Label className="text-[12px]">Products ({items.length}/10)</Label>
                {items.map((p, i) => (
                    <div key={p.id} className="space-y-1 rounded-md border p-2">
                        <div className="flex gap-1">
                            <Input value={p.name} maxLength={60} placeholder="Name" onChange={(e) => update(i, { name: e.target.value })} className="h-8" />
                            <Input
                                value={p.price ?? ''}
                                maxLength={30}
                                placeholder="Price"
                                onChange={(e) => update(i, { price: e.target.value || null })}
                                className="h-8 w-28"
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => set({ items: items.filter((_, n) => n !== i) })}
                                aria-label="Remove product"
                            >
                                <XIcon />
                            </Button>
                        </div>
                        <Input
                            value={p.description ?? ''}
                            maxLength={300}
                            placeholder="Short description"
                            onChange={(e) => update(i, { description: e.target.value || null })}
                            className="h-8 text-[12.5px]"
                        />
                        <Input
                            value={p.image_url ?? ''}
                            placeholder="Picture link (https)"
                            onChange={(e) => update(i, { image_url: e.target.value || null })}
                            className="h-8 text-[12.5px]"
                        />
                        <Input
                            value={p.link ?? ''}
                            placeholder="Product / order page (https, optional)"
                            onChange={(e) => update(i, { link: e.target.value || null })}
                            className="h-8 text-[12.5px]"
                        />
                    </div>
                ))}
                {items.length < 10 && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                            set({
                                items: [
                                    ...items,
                                    { id: `p${Date.now().toString(36).slice(-5)}`, name: '', price: null, description: null, image_url: null, link: null },
                                ],
                            })
                        }
                    >
                        <PlusIcon /> Add product
                    </Button>
                )}
            </div>
            <Row label="Remember the choice as" hint={`Use it later as {{var.${c.save_to ?? 'product'}.name}}, .price or .link.`}>
                <Input
                    value={c.save_to ?? 'product'}
                    onChange={(e) => set({ save_to: e.target.value.replace(/[^A-Za-z0-9_]/g, '').slice(0, 40) || 'product' })}
                    className="font-mono text-[12.5px]"
                />
            </Row>
        </>
    );
}

function TemplateEditor({ c, set, options }: { c: NodeConfig; set: Patch; options: ChatbotOptions | undefined }) {
    const templates = options?.templates ?? [];
    const key = c.name ? `${c.name}|${c.language}` : undefined;
    const chosen = templates.find((t) => t.name === c.name && t.language === c.language);

    return (
        <>
            <Row label="Approved template" hint="Templates are delivered even when the customer has not written for 24 hours.">
                <Select
                    value={key}
                    onValueChange={(v) => {
                        const t = templates.find((x) => `${x.name}|${x.language}` === v);
                        if (t) set({ name: t.name, language: t.language, header: t.variables.header.map(() => ''), body: t.variables.body.map(() => '') });
                    }}
                >
                    <SelectTrigger>
                        <SelectValue placeholder={templates.length ? 'Choose…' : 'No approved templates yet'} />
                    </SelectTrigger>
                    <SelectContent>
                        {templates.map((t) => (
                            <SelectItem key={`${t.name}|${t.language}|${t.waba_account_id}`} value={`${t.name}|${t.language}`}>
                                {t.name} · {t.language}
                                {t.category ? ` · ${t.category.toLowerCase()}` : ''}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Row>
            {chosen?.variables.header_format && !['TEXT', null].includes(chosen.variables.header_format) && (
                <p className="rounded-md bg-warn-bg px-3 py-2 text-[12px] text-warn">
                    This template has a media header, which chatbots cannot fill in. Choose a template with a text header or none.
                </p>
            )}
            {(chosen?.variables.header ?? []).map((name, i) => (
                <Row key={`h${name}`} label={`Header {{${name}}}`}>
                    <Input
                        value={(c.header ?? [])[i] ?? ''}
                        onChange={(e) => set({ header: Object.assign([...(c.header ?? [])], { [i]: e.target.value }) })}
                        placeholder="e.g. {{contact.first_name}}"
                    />
                </Row>
            ))}
            {(chosen?.variables.body ?? []).map((name, i) => (
                <Row key={`b${name}`} label={`Body {{${name}}}`}>
                    <Input
                        value={(c.body ?? [])[i] ?? ''}
                        onChange={(e) => set({ body: Object.assign([...(c.body ?? [])], { [i]: e.target.value }) })}
                        placeholder="e.g. {{contact.first_name}}"
                    />
                </Row>
            ))}
        </>
    );
}

const SUBJECTS: [string, string][] = [
    ['name', 'Contact name'],
    ['email', 'Contact email'],
    ['phone', 'Contact phone'],
    ['tag', 'Tag'],
    ['segment', 'Segment'],
    ['consent', 'Marketing consent'],
    ['last_input', 'Last answer'],
];
const OPS: [string, string][] = [
    ['equals', 'is'],
    ['not_equals', 'is not'],
    ['contains', 'contains'],
    ['not_contains', 'does not contain'],
    ['gt', 'is greater than'],
    ['lt', 'is less than'],
    ['is_set', 'is filled in'],
    ['is_not_set', 'is empty'],
];

type Rule = { field: string; op: string; value: string | null };

function ConditionEditor({ c, set, options, vars }: { c: NodeConfig; set: Patch; options: ChatbotOptions | undefined; vars: Var[] }) {
    const rules = (c.rules ?? []) as Rule[];
    const update = (i: number, patch: Partial<Rule>) => set({ rules: rules.map((r, n) => (n === i ? { ...r, ...patch } : r)) });
    const subjects: [string, string][] = [
        ...SUBJECTS,
        ...(options?.fields ?? []).map((f) => [`field:${f.key}`, f.label] as [string, string]),
        ...vars.filter((v) => v.key.startsWith('var.')).map((v) => [`var:${v.key.slice(4)}`, v.label] as [string, string]),
    ];

    return (
        <>
            <Row label="Go to “Yes” when">
                <Select value={c.match ?? 'all'} onValueChange={(match) => set({ match })}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">all of these are true</SelectItem>
                        <SelectItem value="any">any of these is true</SelectItem>
                    </SelectContent>
                </Select>
            </Row>
            {rules.map((r, i) => {
                const special = r.field === 'tag' || r.field === 'segment';
                const ops: [string, string][] =
                    r.field === 'tag'
                        ? [
                              ['has_tag', 'has the tag'],
                              ['not_has_tag', 'does not have the tag'],
                          ]
                        : r.field === 'segment'
                          ? [
                                ['in_segment', 'is in the segment'],
                                ['not_in_segment', 'is not in the segment'],
                            ]
                          : OPS;
                const needsValue = !['is_set', 'is_not_set'].includes(r.op);

                return (
                    <div key={i} className="space-y-1.5 rounded-md border p-2">
                        <div className="flex gap-1">
                            <Select
                                value={r.field}
                                onValueChange={(field) =>
                                    update(i, {
                                        field,
                                        op: field === 'tag' ? 'has_tag' : field === 'segment' ? 'in_segment' : special ? 'equals' : r.op,
                                        value: null,
                                    })
                                }
                            >
                                <SelectTrigger className="h-8 flex-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {subjects.map(([v, l]) => (
                                        <SelectItem key={v} value={v}>
                                            {l}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => set({ rules: rules.filter((_, n) => n !== i) })}
                                aria-label="Remove rule"
                            >
                                <XIcon />
                            </Button>
                        </div>
                        <Select value={r.op} onValueChange={(op) => update(i, { op })}>
                            <SelectTrigger className="h-8">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {ops.map(([v, l]) => (
                                    <SelectItem key={v} value={v}>
                                        {l}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {needsValue &&
                            (r.field === 'tag' ? (
                                <PickOrType
                                    value={r.value}
                                    onChange={(value) => update(i, { value })}
                                    choices={(options?.tags ?? []).map((t) => [t, t])}
                                    placeholder="Tag"
                                />
                            ) : r.field === 'segment' ? (
                                <PickOrType
                                    value={r.value}
                                    onChange={(value) => update(i, { value })}
                                    choices={(options?.segments ?? []).map((s) => [s.id, s.name])}
                                    placeholder="Segment"
                                />
                            ) : r.field === 'consent' ? (
                                <PickOrType
                                    value={r.value}
                                    onChange={(value) => update(i, { value })}
                                    choices={[
                                        ['opted_in', 'Opted in'],
                                        ['opted_out', 'Opted out'],
                                        ['unknown', 'Not asked yet'],
                                    ]}
                                    placeholder="State"
                                />
                            ) : (
                                <Input
                                    value={r.value ?? ''}
                                    onChange={(e) => update(i, { value: e.target.value || null })}
                                    placeholder="Value (or {{variable}})"
                                    className="h-8"
                                />
                            ))}
                    </div>
                );
            })}
            {rules.length < 10 && (
                <Button type="button" variant="outline" size="sm" onClick={() => set({ rules: [...rules, { field: 'name', op: 'is_set', value: null }] })}>
                    <PlusIcon /> Add rule
                </Button>
            )}
        </>
    );
}

function PickOrType({
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

function HttpEditor({ c, set, options, vars }: { c: NodeConfig; set: Patch; options: ChatbotOptions | undefined; vars: Var[] }) {
    const headers = (c.headers ?? []) as { key: string; value: string }[];
    const save = (c.save ?? []) as { path: string; to: string }[];
    const secrets = options?.secrets ?? [];

    return (
        <>
            <div className="flex gap-2">
                <Select value={c.method ?? 'GET'} onValueChange={(method) => set({ method })}>
                    <SelectTrigger className="w-28">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                            <SelectItem key={m} value={m}>
                                {m}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Input
                    value={c.url ?? ''}
                    onChange={(e) => set({ url: e.target.value })}
                    placeholder="https://api.example.com/orders/{{var.order_no}}"
                    className="font-mono text-[12px]"
                />
            </div>
            <p className="-mt-2 text-[11.5px] text-muted-foreground">
                Placeholders may fill the path and query, not the address. Only public https addresses are called.
            </p>
            <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                    <Label className="text-[12px]">Headers</Label>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[12px]"
                        onClick={() => set({ headers: [...headers, { key: '', value: '' }] })}
                        disabled={headers.length >= 10}
                    >
                        <PlusIcon /> Add
                    </Button>
                </div>
                {headers.map((h, i) => (
                    <div key={i} className="flex gap-1">
                        <Input
                            value={h.key}
                            placeholder="Authorization"
                            onChange={(e) => set({ headers: headers.map((x, n) => (n === i ? { ...x, key: e.target.value } : x)) })}
                            className="h-8 w-32 text-[12px]"
                        />
                        <Input
                            value={h.value}
                            placeholder={secrets.length ? `Bearer {{secret.${secrets[0]}}}` : 'Bearer {{secret.MY_KEY}}'}
                            onChange={(e) => set({ headers: headers.map((x, n) => (n === i ? { ...x, value: e.target.value } : x)) })}
                            className="h-8 font-mono text-[12px]"
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => set({ headers: headers.filter((_, n) => n !== i) })}
                            aria-label="Remove header"
                        >
                            <XIcon />
                        </Button>
                    </div>
                ))}
                <p className="text-[11.5px] text-muted-foreground">
                    Put API keys in <b>API keys</b> (on the Chatbots page) and use them as {'{{secret.NAME}}'}: they are never stored in the flow.
                    {secrets.length > 0 && (
                        <>
                            {' '}
                            Available:{' '}
                            {secrets.map((s) => (
                                <Badge key={s} tone="grey" className="mr-1 font-mono">
                                    {s}
                                </Badge>
                            ))}
                        </>
                    )}
                </p>
            </div>
            {c.method !== 'GET' && (
                <MessageText
                    value={c.body ?? ''}
                    onChange={(body) => set({ body: body || null })}
                    vars={vars}
                    max={5000}
                    label="Body (JSON)"
                    rows={5}
                    secrets={secrets}
                />
            )}
            <div className="grid grid-cols-2 gap-2">
                <Row label="Timeout (seconds)">
                    <Input
                        type="number"
                        min={1}
                        max={10}
                        value={c.timeout ?? 5}
                        onChange={(e) => set({ timeout: Math.max(1, Math.min(10, Number(e.target.value || 5))) })}
                    />
                </Row>
                <Row label="Retries">
                    <Input
                        type="number"
                        min={0}
                        max={2}
                        value={c.retries ?? 1}
                        onChange={(e) => set({ retries: Math.max(0, Math.min(2, Number(e.target.value || 0))) })}
                    />
                </Row>
            </div>
            <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                    <Label className="text-[12px]">Save from the response</Label>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[12px]"
                        onClick={() => set({ save: [...save, { path: '', to: 'var:result' }] })}
                        disabled={save.length >= 10}
                    >
                        <PlusIcon /> Add
                    </Button>
                </div>
                {save.map((m, i) => (
                    <div key={i} className="space-y-1 rounded-md border p-1.5">
                        <div className="flex gap-1">
                            <Input
                                value={m.path}
                                placeholder="order.status"
                                onChange={(e) => set({ save: save.map((x, n) => (n === i ? { ...x, path: e.target.value } : x)) })}
                                className="h-8 font-mono text-[12px]"
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => set({ save: save.filter((_, n) => n !== i) })}
                                aria-label="Remove"
                            >
                                <XIcon />
                            </Button>
                        </div>
                        <TargetPicker
                            label="into"
                            value={m.to}
                            options={options}
                            onChange={(to) => set({ save: save.map((x, n) => (n === i ? { ...x, to } : x)) })}
                        />
                    </div>
                ))}
                <p className="text-[11.5px] text-muted-foreground">
                    Dot paths into the JSON answer, e.g. data.items.0.name. The status code is always in {'{{var.http_status}}'}.
                </p>
            </div>
            <Hint>
                “Success” is any 2xx answer. A timeout, a blocked address or any other status takes “Error” — connect it to a Handoff so the customer is never
                stuck.
            </Hint>
        </>
    );
}
