'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
    CheckIcon,
    CircleAlertIcon,
    CopyIcon,
    ExternalLinkIcon,
    FileUpIcon,
    LanguagesIcon,
    Loader2Icon,
    MessageSquareIcon,
    PlusIcon,
    RotateCcwIcon,
    SparklesIcon,
    Trash2Icon,
    TriangleAlertIcon,
    WandSparklesIcon,
    XIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { TagInput } from '@/components/contacts/tag-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { errorMessage, upload } from '@/lib/api';
import {
    addChatbotComment,
    autoTitle,
    blockOf,
    type ChatbotOptions,
    chatbotKeys,
    deleteChatbotComment,
    type FlowGraph,
    type FlowIssue,
    type FlowNode,
    type FlowSettings,
    formatMinutes,
    groupOf,
    isInput,
    LANGUAGES,
    LIMITS,
    type NodeComment,
    type NodeConfig,
    resolveChatbotComment,
    RTL,
    useChatbotComments,
    type Variable,
    variablesFor,
} from '@/lib/chatbots';
import type { UploadedMedia } from '@/lib/types';
import { cn } from '@/lib/utils';

import {
    AssignPicker,
    Choices,
    Hint,
    LimitedInput,
    type Patch,
    PickOrType,
    Row,
    Section,
    Segmented,
    SelectRow,
    TargetPicker,
    Toggle,
    VarText,
} from './inspector-fields';
import { messageOf, WaBubble } from './wa-preview';

type Ctx = {
    node: FlowNode;
    graph: FlowGraph;
    options: ChatbotOptions | undefined;
    set: Patch;
    vars: Variable[];
    settings: FlowSettings;
    webhookUrl: string | null;
    phone: string | null;
};

/** Right-hand panel: edits the selected block. Changes apply as you type and are saved automatically. */
export function NodeInspector({
    flowId,
    node,
    graph,
    settings,
    options,
    issues,
    readOnly,
    webhookUrl,
    phone,
    onTitle,
    onConfig,
    onDelete,
    onDuplicate,
    onSelect,
    onConnect,
    onWebhook,
}: {
    flowId: string;
    node: FlowNode;
    graph: FlowGraph;
    settings: FlowSettings;
    options: ChatbotOptions | undefined;
    issues: FlowIssue[];
    readOnly: boolean;
    webhookUrl: string | null;
    phone: string | null;
    onTitle: (title: string, auto: boolean) => void;
    onConfig: (config: NodeConfig) => void;
    onDelete: () => void;
    onDuplicate: () => void;
    onSelect: (id: string) => void;
    onConnect: (output: string, to: string | null) => void;
    onWebhook: (enabled: boolean) => void;
}) {
    const [tab, setTab] = useState<'edit' | 'comments'>('edit');
    const [lang, setLang] = useState(settings.languages[0] ?? 'en');
    const comments = useChatbotComments(flowId);
    const mine = (comments.data ?? []).filter((c) => c.node_id === node.id);
    const open = mine.filter((c) => !c.resolved_at).length;
    const block = blockOf(node.type);
    const group = groupOf(node.type);
    const Icon = block.icon;
    const set: Patch = (patch) => onConfig({ ...node.config, ...patch });
    const vars = variablesFor(graph, options);
    const problems = issues.filter((i) => i.node_id === node.id);
    const defaultLang = settings.languages[0] ?? 'en';
    const translating = lang !== defaultLang && settings.languages.includes(lang);
    const ctx: Ctx = { node, graph, options, set, vars, settings, webhookUrl, phone };
    const preview = messageOf(translating ? localized(node, lang) : node);

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b px-4 pt-3.5">
                <div className="flex items-start gap-3">
                    <span className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl', group.chip)}>
                        <Icon className="size-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                            <Input
                                value={node.title}
                                onChange={(e) => onTitle(e.target.value.slice(0, 60), false)}
                                disabled={readOnly}
                                className="h-8 border-transparent px-1.5 text-[14.5px] font-semibold shadow-none hover:border-input focus-visible:border-brand-500"
                                aria-label="Block name"
                            />
                            {!readOnly && !node.auto_title && node.type !== 'start' && (
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    title="Name it from its content again"
                                    aria-label="Automatic name"
                                    onClick={() => onTitle(autoTitle(node), true)}
                                >
                                    <WandSparklesIcon />
                                </Button>
                            )}
                        </div>
                        <p className="px-1.5 text-[11.5px] text-muted-foreground">
                            <span className={cn('font-bold tracking-wide uppercase', group.tone)}>{node.type === 'start' ? 'Trigger' : block.label}</span> ·{' '}
                            {block.blurb}
                        </p>
                    </div>
                </div>
                <div className="mt-3 flex gap-4 text-[12.5px] font-semibold">
                    {(
                        [
                            ['edit', 'Settings'],
                            ['comments', `Comments${open ? ` (${open})` : ''}`],
                        ] as const
                    ).map(([k, l]) => (
                        <button
                            key={k}
                            onClick={() => setTab(k)}
                            className={cn(
                                '-mb-px border-b-2 pb-2',
                                tab === k ? 'border-brand-500 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {l}
                        </button>
                    ))}
                </div>
            </div>

            {tab === 'comments' ? (
                <Comments flowId={flowId} nodeId={node.id} comments={mine} />
            ) : (
                <fieldset disabled={readOnly} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
                    {problems.length > 0 && (
                        <div className="space-y-1.5">
                            {problems.map((i, n) => (
                                <div
                                    key={n}
                                    className={cn('rounded-lg px-3 py-2 text-[12px]', i.level === 'error' ? 'bg-bad-bg text-bad' : 'bg-warn-bg text-warn')}
                                >
                                    <p className="flex items-start gap-1.5 font-semibold">
                                        {i.level === 'error' ? (
                                            <CircleAlertIcon className="mt-px size-3.5 shrink-0" />
                                        ) : (
                                            <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
                                        )}
                                        {i.message.replace(/^“[^”]+”:?\s*/, '').replace(/^./, (m) => m.toUpperCase())}
                                    </p>
                                    {i.fix && <p className="mt-0.5 pl-5 text-ink-2">{i.fix}</p>}
                                </div>
                            ))}
                        </div>
                    )}

                    {preview && (
                        <div className="rounded-xl bg-[#efeae2] p-3" aria-label="Preview on WhatsApp">
                            <p className="mb-1.5 text-[10px] font-bold tracking-wider text-[#54656f] uppercase">Preview{translating ? ` · ${lang}` : ''}</p>
                            <div className="max-w-[92%]">
                                <WaBubble message={preview} rtl={RTL.includes(translating ? lang : defaultLang)} />
                            </div>
                        </div>
                    )}

                    {settings.languages.length > 1 && hasText(node) && (
                        <div className="flex items-center gap-2">
                            <LanguagesIcon className="size-4 text-muted-foreground" />
                            <Segmented value={lang} options={settings.languages.map((l) => [l, l.toUpperCase()] as [string, string])} onChange={setLang} />
                        </div>
                    )}

                    {translating ? <TranslationEditor ctx={ctx} lang={lang} /> : <Editor ctx={ctx} onWebhook={onWebhook} />}

                    {isInput(node) && !translating && <NoMatch ctx={ctx} />}

                    {node.outputs.length > 0 && (
                        <Section title="Connections">
                            <div className="divide-y rounded-lg border">
                                {node.outputs.map((o) => (
                                    <div key={o.id} className="flex items-center gap-2 px-2.5 py-1.5 text-[12.5px]">
                                        <span className="w-24 shrink-0 truncate font-medium" title={o.label}>
                                            {o.label}
                                        </span>
                                        <Select value={o.to ?? '__none__'} onValueChange={(v) => onConnect(o.id, v === '__none__' ? null : v)}>
                                            <SelectTrigger size="sm" className={cn('h-7 min-w-0 flex-1 text-[12px]', !o.to && 'border-warn/60 text-warn')}>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__none__">Not connected</SelectItem>
                                                {graph.nodes
                                                    .filter((n) => n.id !== node.id && n.type !== 'start')
                                                    .map((n) => (
                                                        <SelectItem key={n.id} value={n.id}>
                                                            → {n.title}
                                                        </SelectItem>
                                                    ))}
                                            </SelectContent>
                                        </Select>
                                        {o.to && (
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                onClick={() => onSelect(o.to as string)}
                                                aria-label="Go to that block"
                                                title="Go to that block"
                                            >
                                                <ExternalLinkIcon />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </Section>
                    )}
                </fieldset>
            )}
            {!readOnly && node.type !== 'start' && tab === 'edit' && (
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

// ── Translations ───────────────────────────────────────────────────────────────────────────

const TRANSLATABLE: [string, string, number][] = [
    ['header', 'Header', LIMITS.header],
    ['text', 'Message', LIMITS.body],
    ['footer', 'Footer', LIMITS.footer],
    ['caption', 'Caption', 1024],
    ['button_label', 'Menu button', 20],
    ['cta', 'Button text', 20],
    ['order_label', 'Card button', 20],
    ['all_label', '“See all” button', 20],
    ['error_text', 'When the answer does not fit', 300],
    ['offline_text', 'Outside business hours', 1024],
];

function hasText(node: FlowNode) {
    return TRANSLATABLE.some(([f]) => f in node.config) || ['buttons', 'list', 'product'].includes(node.type);
}

function localized(node: FlowNode, lang: string): FlowNode {
    const t = (node.config.i18n ?? {})[lang] as Record<string, any> | undefined;
    if (!t) return node;
    const c = { ...node.config };
    for (const [f] of TRANSLATABLE) if (t[f]) c[f] = t[f];
    if (t.buttons && c.buttons) c.buttons = c.buttons.map((b: { id: string; title: string }) => ({ ...b, title: t.buttons[b.id] || b.title }));
    if (t.rows && c.sections)
        c.sections = c.sections.map((s: { rows: { id: string; title: string; description?: string | null }[] }) => ({
            ...s,
            rows: s.rows.map((r) => {
                const v = t.rows[r.id];

                return typeof v === 'object' && v
                    ? { ...r, title: v.title || r.title, description: v.description ?? r.description }
                    : { ...r, title: v || r.title };
            }),
        }));
    if (t.items && c.items) c.items = c.items.map((p: { id: string; name: string }) => ({ ...p, name: t.items[p.id] || p.name }));

    return { ...node, config: c };
}

function TranslationEditor({ ctx, lang }: { ctx: Ctx; lang: string }) {
    const { node, set, vars } = ctx;
    const c = node.config;
    const tr = ((c.i18n ?? {})[lang] ?? {}) as Record<string, any>;
    const dir = RTL.includes(lang) ? 'rtl' : 'ltr';
    const setTr = (patch: Record<string, unknown>) => {
        const next = { ...tr, ...patch };
        for (const k of Object.keys(next)) if (next[k] === null || next[k] === '') delete next[k];
        set({ i18n: { ...(c.i18n ?? {}), [lang]: next } });
    };
    const setItem = (list: 'buttons' | 'rows' | 'items', id: string, value: unknown) => {
        const current = { ...(tr[list] ?? {}) };
        if (value === null || value === '') delete current[id];
        else current[id] = value;
        setTr({ [list]: current });
    };

    return (
        <Section title={`${LANGUAGES[lang] ?? lang} version`}>
            <Hint tone="info">
                Customers whose language is {LANGUAGES[lang] ?? lang} get this text. Empty fields use the {ctx.settings.languages[0]?.toUpperCase()} text.
                Connections and settings are shared by all languages.
            </Hint>
            {TRANSLATABLE.filter(([f]) => f in c && f !== 'text').map(([f, label, max]) =>
                f === 'header' || f === 'footer' || f === 'button_label' || f === 'cta' || f === 'order_label' || f === 'all_label' ? (
                    <LimitedInput key={f} label={label} value={tr[f]} onChange={(v) => setTr({ [f]: v })} max={max} placeholder={c[f] ?? ''} dir={dir} />
                ) : (
                    <VarText
                        key={f}
                        label={label}
                        value={tr[f]}
                        onChange={(v) => setTr({ [f]: v })}
                        vars={vars}
                        max={max}
                        placeholder={c[f] ?? ''}
                        dir={dir}
                        rows={2}
                    />
                ),
            )}
            {'text' in c && (
                <VarText
                    label="Message"
                    value={tr.text}
                    onChange={(v) => setTr({ text: v })}
                    vars={vars}
                    max={node.type === 'message' ? LIMITS.text : LIMITS.body}
                    placeholder={c.text ?? ''}
                    dir={dir}
                    rows={4}
                />
            )}
            {node.type === 'buttons' && (
                <Choices
                    label="Buttons"
                    hint="Translated button titles. Customers can also type the title in any language."
                    items={c.buttons ?? []}
                    max={3}
                    titleMax={20}
                    onChange={() => undefined}
                    translations={tr.buttons}
                    onTranslate={(id, v) => setItem('buttons', id, v)}
                    dir={dir}
                />
            )}
            {node.type === 'list' &&
                (c.sections ?? []).map((s: { title: string | null; rows: { id: string; title: string; description?: string | null }[] }, i: number) => (
                    <Choices
                        key={i}
                        label={s.title || `Section ${i + 1}`}
                        hint="Translated rows."
                        items={s.rows}
                        max={10}
                        titleMax={24}
                        withDescription
                        onChange={() => undefined}
                        translations={tr.rows}
                        onTranslate={(id, v) => setItem('rows', id, v)}
                        dir={dir}
                    />
                ))}
            {node.type === 'product' && (
                <div className="grid gap-1.5">
                    <Label className="text-[12px] font-semibold">Product names</Label>
                    {(c.items ?? []).map((p: { id: string; name: string }) => (
                        <Input
                            key={p.id}
                            value={tr.items?.[p.id] ?? ''}
                            placeholder={p.name}
                            dir={dir}
                            maxLength={60}
                            onChange={(e) => setItem('items', p.id, e.target.value)}
                        />
                    ))}
                </div>
            )}
        </Section>
    );
}

// ── "No match" & "No reply" ────────────────────────────────────────────────────────────────

function NoMatch({ ctx }: { ctx: Ctx }) {
    const { node, set, settings } = ctx;
    const c = node.config;
    const mode = (c.no_match ?? 'handoff') as 'handoff' | 'branch' | 'off';
    const retries = c.retries === null || c.retries === undefined ? settings.retry_limit : Number(c.retries);
    const what =
        node.type === 'question'
            ? 'an answer that does not fit'
            : node.type === 'ask_media'
              ? 'something that is not a file'
              : 'something that is not one of the options';
    const choices: { v: typeof mode; title: string; body: string; recommended?: boolean }[] = [
        {
            v: 'handoff',
            title: 'Ask again, then connect to a person',
            body: `After ${retries} ${retries === 1 ? 'retry' : 'retries'}, the customer goes to your team (your first “Talk to a person” block). Nothing to connect.`,
            recommended: true,
        },
        { v: 'branch', title: 'Ask again, then go to a block I choose', body: `Adds a “No match” connector to this block. Connect it, e.g. to a help menu.` },
        { v: 'off', title: 'Don’t reply — keep waiting', body: 'Unknown answers get no reply. Only for blocks where the customer must tap.' },
    ];

    return (
        <Section title="If the customer replies with something else">
            <p className="-mt-1 text-[11.5px] leading-snug text-muted-foreground">
                When the customer sends {what}. Voice notes, stickers and emoji get a friendly hint and never count as a wrong answer. Typing{' '}
                <b>{settings.handoff_keywords[0] ?? 'agent'}</b>, <b>{settings.menu_keywords[0] ?? 'menu'}</b> or <b>{settings.back_keywords[0] ?? 'back'}</b>{' '}
                always works.
            </p>
            <div className="space-y-1.5" role="radiogroup">
                {choices.map((ch) => (
                    <button
                        key={ch.v}
                        type="button"
                        role="radio"
                        aria-checked={mode === ch.v}
                        onClick={() => set({ no_match: ch.v })}
                        className={cn(
                            'flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left',
                            mode === ch.v ? 'border-brand-500 bg-brand-50' : 'hover:bg-muted/60',
                        )}
                    >
                        <span
                            className={cn(
                                'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2',
                                mode === ch.v ? 'border-brand-500 bg-brand-500' : 'border-input',
                            )}
                        >
                            {mode === ch.v && <span className="size-1.5 rounded-full bg-white" />}
                        </span>
                        <span>
                            <span className="block text-[12.5px] font-semibold">
                                {ch.title}{' '}
                                {ch.recommended && (
                                    <Badge tone="brand" className="ml-1 py-0 text-[10px]">
                                        Recommended
                                    </Badge>
                                )}
                            </span>
                            <span className="block text-[11.5px] leading-snug text-muted-foreground">{ch.body}</span>
                        </span>
                    </button>
                ))}
            </div>
            {mode !== 'off' && (
                <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                    <Label className="text-[12px] font-semibold">Ask again up to</Label>
                    <Select
                        value={c.retries === null || c.retries === undefined ? 'default' : String(c.retries)}
                        onValueChange={(v) => set({ retries: v === 'default' ? null : Number(v) })}
                    >
                        <SelectTrigger size="sm" className="w-44">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="default">Flow default ({settings.retry_limit})</SelectItem>
                            {[0, 1, 2, 3, 4, 5].map((n) => (
                                <SelectItem key={n} value={String(n)}>
                                    {n === 0 ? 'Don’t ask again' : `${n} time${n === 1 ? '' : 's'}`}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}
            <Toggle
                label="If there is no reply"
                hint="Adds a “No reply” connector that runs after this long without an answer (e.g. a reminder, or a handoff)."
                checked={!!c.timeout_minutes}
                onChange={(v) => set({ timeout_minutes: v ? 30 : null })}
            />
            {!!c.timeout_minutes && (
                <Duration minutes={Number(c.timeout_minutes)} onChange={(timeout_minutes) => set({ timeout_minutes })} label="No reply after" max={10080} />
            )}
        </Section>
    );
}

function Duration({ minutes, onChange, label, max = 10080 }: { minutes: number; onChange: (m: number) => void; label: string; max?: number }) {
    const unit = minutes % 1440 === 0 ? 1440 : minutes % 60 === 0 ? 60 : 1;

    return (
        <Row label={label} hint={`= ${formatMinutes(minutes)}`}>
            <div className="flex gap-2">
                <Input
                    type="number"
                    min={1}
                    value={minutes / unit}
                    onChange={(e) => onChange(Math.max(1, Math.min(max, Math.round(Number(e.target.value || 1) * unit))))}
                    className="w-24"
                    aria-label={`${label} amount`}
                />
                <Select value={String(unit)} onValueChange={(u) => onChange(Math.max(1, Math.min(max, Math.round((minutes / unit) * Number(u)))))}>
                    <SelectTrigger className="flex-1" aria-label={`${label} unit`}>
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
    );
}

// ── Comments ───────────────────────────────────────────────────────────────────────────────

function Comments({ flowId, nodeId, comments }: { flowId: string; nodeId: string; comments: NodeComment[] }) {
    const qc = useQueryClient();
    const [body, setBody] = useState('');
    const [busy, setBusy] = useState(false);
    const store = (rows: NodeComment[]) => qc.setQueryData(chatbotKeys.comments(flowId), rows);

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
                {comments.length === 0 && (
                    <div className="rounded-lg border border-dashed px-4 py-6 text-center">
                        <MessageSquareIcon className="mx-auto size-5 text-muted-foreground" />
                        <p className="mt-2 text-[12.5px] font-semibold">No comments on this block</p>
                        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                            Leave a note for your team or your client — e.g. “Check the price before publishing”.
                        </p>
                    </div>
                )}
                {comments.map((c) => (
                    <div key={c.id} className={cn('rounded-lg border px-3 py-2', c.resolved_at && 'opacity-60')}>
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-[12px] font-semibold">{c.author}</p>
                            <span className="text-[10.5px] text-muted-foreground">
                                {c.created_at ? new Date(c.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                            </span>
                        </div>
                        <p className="mt-0.5 text-[12.5px] whitespace-pre-wrap">{c.body}</p>
                        <div className="mt-1.5 flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1.5 text-[11.5px]"
                                onClick={async () => {
                                    try {
                                        store(await resolveChatbotComment(flowId, c.id, !c.resolved_at));
                                    } catch (e) {
                                        toast.error(errorMessage(e));
                                    }
                                }}
                            >
                                {c.resolved_at ? <RotateCcwIcon /> : <CheckIcon />} {c.resolved_at ? 'Reopen' : 'Resolve'}
                            </Button>
                            {c.resolved_by && <span className="text-[10.5px] text-muted-foreground">Resolved by {c.resolved_by}</span>}
                            {c.mine && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="ml-auto h-6 px-1.5 text-[11.5px] text-bad"
                                    onClick={async () => {
                                        try {
                                            store(await deleteChatbotComment(flowId, c.id));
                                        } catch (e) {
                                            toast.error(errorMessage(e));
                                        }
                                    }}
                                >
                                    <XIcon /> Delete
                                </Button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
            <form
                className="space-y-2 border-t px-4 py-3"
                onSubmit={async (e) => {
                    e.preventDefault();
                    if (!body.trim()) return;
                    setBusy(true);
                    try {
                        store(await addChatbotComment(flowId, nodeId, body.trim()));
                        setBody('');
                    } catch (err) {
                        toast.error(errorMessage(err));
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                <textarea
                    rows={2}
                    value={body}
                    maxLength={2000}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Add a comment for your team…"
                    className="w-full rounded-lg border border-input px-3 py-2 text-[13px] outline-none focus-visible:border-brand-500"
                    aria-label="Comment"
                />
                <Button size="sm" type="submit" disabled={busy || !body.trim()}>
                    {busy ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} Comment
                </Button>
            </form>
        </div>
    );
}

// ── Editors ────────────────────────────────────────────────────────────────────────────────

function Editor({ ctx, onWebhook }: { ctx: Ctx; onWebhook: (enabled: boolean) => void }) {
    const { node, options, set, vars, graph } = ctx;
    const c = node.config;
    const snippets = options?.snippets ?? [];
    const text = (label = 'Message', max: number = LIMITS.body, hint?: React.ReactNode, placeholder?: string, rows = 4) => (
        <VarText
            label={label}
            value={c.text}
            onChange={(v) => set({ text: v })}
            vars={vars}
            max={max}
            hint={hint}
            placeholder={placeholder}
            rows={rows}
            snippets={snippets}
        />
    );
    const headerFooter = (
        <div className="grid grid-cols-2 gap-2">
            <LimitedInput label="Header" value={c.header} onChange={(header) => set({ header })} max={LIMITS.header} placeholder="Optional bold title" />
            <LimitedInput label="Footer" value={c.footer} onChange={(footer) => set({ footer })} max={LIMITS.footer} placeholder="Optional small print" />
        </div>
    );

    switch (node.type) {
        case 'start':
            return <StartEditor ctx={ctx} onWebhook={onWebhook} />;
        case 'message':
            return text(
                'Message',
                LIMITS.text,
                'Use *bold* and _italic_ like in WhatsApp. Type {{ to insert the customer’s name or an answer.',
                'Hi {{contact.first_name}} 👋 Thanks for reaching out!',
                5,
            );
        case 'media':
            return <MediaEditor ctx={ctx} />;
        case 'buttons':
            return (
                <>
                    {text('Message', LIMITS.body, undefined, 'How can we help you today?')}
                    {headerFooter}
                    <Choices
                        label="Buttons"
                        hint="Each button is a branch. Customers can also type the button text or its number."
                        items={c.buttons ?? []}
                        max={LIMITS.buttons}
                        titleMax={LIMITS.button}
                        onChange={(buttons) => set({ buttons })}
                    />
                    {(c.buttons ?? []).length >= 3 && <Hint>Need more than 3 options? Use a List menu block (up to 10 rows).</Hint>}
                </>
            );
        case 'list':
            return <ListEditor ctx={ctx} text={text('Message', LIMITS.body, undefined, 'Pick a category 👇')} headerFooter={headerFooter} />;
        case 'product':
            return <ProductEditor ctx={ctx} />;
        case 'template':
            return <TemplateEditor ctx={ctx} />;
        case 'url':
            return (
                <>
                    {text('Message', LIMITS.body, undefined, 'Tap below to book online 👇')}
                    {headerFooter}
                    <div className="grid grid-cols-[1fr_2fr] gap-2">
                        <LimitedInput label="Button" value={c.cta} onChange={(cta) => set({ cta: cta ?? 'Open' })} max={LIMITS.button} placeholder="Book now" />
                        <VarText
                            label="Link"
                            value={c.url}
                            onChange={(url) => set({ url })}
                            vars={vars.filter((v) => v.group === 'Business' || v.group === 'Answers')}
                            max={1000}
                            multiline={false}
                            mono
                            placeholder="https://… or {{business.store_url}}"
                        />
                    </div>
                    <Hint>The customer opens the page in their browser; the flow continues straight away. Payments always finish on your website.</Hint>
                </>
            );
        case 'form':
            return <FormEditor ctx={ctx} text={text('Message', LIMITS.body, undefined, 'Please fill in this short form 📝')} headerFooter={headerFooter} />;
        case 'question':
            return (
                <>
                    {text('Question', LIMITS.body, undefined, 'What is your email address?', 3)}
                    <SelectRow
                        label="Expected answer"
                        value={c.validate ?? 'any'}
                        onChange={(validate) => set({ validate })}
                        options={[
                            ['any', 'Anything'],
                            ['text', 'Text (with letters)'],
                            ['number', 'A number'],
                            ['email', 'An email address'],
                            ['phone', 'A phone number'],
                            ['date', 'A date'],
                            ['future_date', 'A date in the future'],
                            ['workday', 'A future working day'],
                            ['regex', 'Matches a pattern'],
                        ]}
                        hint={
                            c.validate === 'workday'
                                ? 'Days follow your inbox business hours. Dates are read day-first (25/10/2026).'
                                : c.validate?.includes('date')
                                  ? 'Dates are read day-first (25/10/2026), or like “tomorrow”.'
                                  : undefined
                        }
                    />
                    {c.validate === 'regex' && (
                        <LimitedInput
                            label="Pattern (regular expression)"
                            value={c.pattern}
                            onChange={(pattern) => set({ pattern })}
                            max={200}
                            mono
                            placeholder="^[A-Z]{2}\d{4}$"
                        />
                    )}
                    <TargetPicker label="Save the answer to" value={c.save_to} options={options} onChange={(save_to) => set({ save_to })} />
                    <VarText
                        label="When the answer does not fit"
                        value={c.error_text}
                        onChange={(v) => set({ error_text: v || null })}
                        vars={vars}
                        max={300}
                        rows={2}
                        placeholder="That doesn’t look right — please try again, e.g. name@example.com"
                        hint="Sent before asking again. Empty = the flow’s standard retry message."
                    />
                </>
            );
        case 'ask_media':
            return (
                <>
                    {text('Message', LIMITS.body, undefined, 'Please send a photo of the item 📷', 3)}
                    <SelectRow
                        label="Accept"
                        value={c.accept ?? 'image'}
                        onChange={(accept) => set({ accept })}
                        options={[
                            ['image', 'A photo'],
                            ['document', 'A document or photo'],
                            ['any', 'Any file (also video or voice)'],
                        ]}
                    />
                    <Toggle label="Optional" hint="Adds a skip button." checked={!!c.optional} onChange={(optional) => set({ optional })} />
                    {c.optional && (
                        <LimitedInput
                            label="Skip button"
                            value={c.skip_label}
                            onChange={(skip_label) => set({ skip_label: skip_label ?? 'Skip' })}
                            max={20}
                            placeholder="Skip"
                        />
                    )}
                    <TargetPicker
                        label="Remember the file as"
                        value={c.save_to}
                        options={options}
                        onChange={(save_to) => set({ save_to })}
                        hint="Agents see the file in the conversation; this keeps a reference to it."
                    />
                    <VarText
                        label="When it is not a file"
                        value={c.error_text}
                        onChange={(v) => set({ error_text: v || null })}
                        vars={vars}
                        max={300}
                        rows={2}
                        placeholder="Please send a photo using the 📎 button."
                    />
                </>
            );
        case 'location':
            return (
                <>
                    {text(
                        'Message',
                        LIMITS.body,
                        'The customer gets a “Send location” button, and may also type an area or address.',
                        'Please share your location 📍',
                        3,
                    )}
                    <LimitedInput
                        label="Remember it as"
                        value={c.save_to}
                        onChange={(save_to) => set({ save_to: (save_to ?? 'location').replace(/[^A-Za-z0-9_]/g, '') || 'location' })}
                        max={40}
                        mono
                        hint={`Use {{var.${c.save_to ?? 'location'}.address}} or .map (a Google Maps link).`}
                    />
                </>
            );
        case 'rating':
            return (
                <>
                    {text('Question', LIMITS.body, undefined, 'How would you rate your experience today?', 2)}
                    <LimitedInput
                        label="Menu button"
                        value={c.button_label}
                        onChange={(button_label) => set({ button_label: button_label ?? 'Rate us' })}
                        max={20}
                        placeholder="Rate us"
                    />
                    <TargetPicker label="Save the rating (1–5) to" value={c.save_to} options={options} onChange={(save_to) => set({ save_to })} />
                </>
            );
        case 'condition':
            return <ConditionEditor ctx={ctx} />;
        case 'setfield':
            return (
                <>
                    <TargetPicker label="Save to" value={c.target} options={options} onChange={(target) => set({ target })} />
                    <VarText
                        label="Value"
                        value={c.value}
                        onChange={(value) => set({ value })}
                        vars={vars}
                        max={1000}
                        rows={2}
                        placeholder="Gold, or {{var.answer}}"
                    />
                    <Hint>Written like an edit in Contacts, so segments see the new value at once.</Hint>
                </>
            );
        case 'calculate':
            return (
                <>
                    <VarText
                        label="Formula"
                        value={c.expression}
                        onChange={(expression) => set({ expression })}
                        vars={vars}
                        max={500}
                        rows={2}
                        mono
                        placeholder="{{var.nights}} * 450"
                        hint={
                            <>
                                Numbers, {'{{variables}}'}, + − × ÷ and ( ). Functions: <code>round(x, 2)</code> <code>min()</code> <code>max()</code>{' '}
                                <code>days_between(a, b)</code> <code>add_days(date, n)</code> <code>today()</code> and{' '}
                                <code>pick({'{{var.size}}'}, &apos;Studio&apos;, 150, &apos;Villa&apos;, 550)</code> for price tables.
                            </>
                        }
                    />
                    <div className="grid grid-cols-[2fr_1fr] gap-2">
                        <TargetPicker label="Save the result to" value={c.target} options={options} onChange={(target) => set({ target })} />
                        <Row label="Decimals">
                            <Input
                                type="number"
                                min={0}
                                max={6}
                                value={c.decimals ?? 2}
                                onChange={(e) => set({ decimals: Math.max(0, Math.min(6, Number(e.target.value || 0))) })}
                            />
                        </Row>
                    </div>
                </>
            );
        case 'delay':
            return (
                <>
                    <Segmented
                        value={c.mode ?? 'duration'}
                        options={[
                            ['duration', 'Wait for…'],
                            ['until', 'Wait until a date'],
                        ]}
                        onChange={(mode) => set({ mode })}
                    />
                    {c.mode === 'until' ? (
                        <>
                            <VarText
                                label="Date and time"
                                value={c.until}
                                onChange={(until) => set({ until })}
                                vars={vars}
                                max={200}
                                multiline={false}
                                placeholder="{{var.date}} {{var.time}}"
                                hint="A date answered earlier, e.g. the appointment. Without a time, 09:00 is used (your workspace time zone)."
                            />
                            <Row label="Run">
                                <div className="flex gap-2">
                                    <Input
                                        type="number"
                                        min={0}
                                        value={Math.abs(Number(c.offset_minutes ?? 0)) / 60}
                                        onChange={(e) =>
                                            set({
                                                offset_minutes: Math.sign(Number(c.offset_minutes ?? -1) || -1) * Math.round(Number(e.target.value || 0) * 60),
                                            })
                                        }
                                        className="w-24"
                                        aria-label="Hours"
                                    />
                                    <Select
                                        value={Number(c.offset_minutes ?? 0) > 0 ? 'after' : 'before'}
                                        onValueChange={(v) => set({ offset_minutes: Math.abs(Number(c.offset_minutes ?? 0)) * (v === 'after' ? 1 : -1) })}
                                    >
                                        <SelectTrigger className="flex-1">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="before">hours before</SelectItem>
                                            <SelectItem value="after">hours after</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </Row>
                        </>
                    ) : (
                        <Duration minutes={Number(c.minutes ?? 10)} onChange={(minutes) => set({ minutes })} label="Wait" />
                    )}
                    <Hint>
                        Customers who write meanwhile stay in the flow. More than 24 hours after the customer last wrote, only a Template block is delivered.
                    </Hint>
                </>
            );
        case 'tag':
            return (
                <>
                    <Row label="Add tags" hint="Placeholders work, e.g. “Lead – {{var.purpose}}”.">
                        <TagInput value={c.add ?? []} onChange={(add) => set({ add })} suggestions={options?.tags ?? []} placeholder="Lead, VIP… press Enter" />
                    </Row>
                    <Row label="Remove tags">
                        <TagInput value={c.remove ?? []} onChange={(remove) => set({ remove })} suggestions={options?.tags ?? []} />
                    </Row>
                    <AssignPicker c={c} set={set} options={options} noneLabel="Don’t assign" />
                </>
            );
        case 'optin':
            return (
                <>
                    <Hint>
                        Records that the customer agreed to receive messages, marketing included. Put it after their “yes” — for example on a “Yes, send me
                        offers” button of a Buttons block. (A reply of just “Subscribe” or “Start” is already recorded by the opt-in keywords.) It is saved in
                        Compliance › Consent ledger like any other opt-in.
                    </Hint>
                    {text('Confirmation', LIMITS.body, undefined, 'Thank you! You’re subscribed to our updates.', 2)}
                </>
            );
        case 'optout':
            return (
                <>
                    <SelectRow
                        label="Opt the customer out of"
                        value={c.scope ?? 'marketing'}
                        onChange={(scope) => set({ scope })}
                        options={[
                            ['marketing', 'Marketing messages (campaigns)'],
                            ['all', 'All messages (full unsubscribe)'],
                        ]}
                        hint="Recorded in Compliance like any other opt-out. The customer can reply START to subscribe again."
                    />
                    {text('Confirmation', LIMITS.body, undefined, 'Done — you won’t receive offers from us anymore.', 2)}
                    {c.scope === 'all' && <Hint tone="warn">After a full opt-out nothing more can be sent, so the flow ends here.</Hint>}
                </>
            );
        case 'hours':
            return <HoursEditor ctx={ctx} />;
        case 'split':
            return (
                <>
                    <Row
                        label={`Share of customers in A: ${c.percent_a ?? 50}%`}
                        hint={`B gets ${100 - Number(c.percent_a ?? 50)}%. Each customer is picked at random.`}
                    >
                        <input
                            type="range"
                            min={1}
                            max={99}
                            value={c.percent_a ?? 50}
                            onChange={(e) => set({ percent_a: Number(e.target.value) })}
                            className="w-full accent-[#689d0f]"
                            aria-label="Share in A"
                        />
                    </Row>
                    <Row label="Goal (what counts as success)" hint="Compared for A and B in Analytics.">
                        <Select value={c.goal ?? '__end__'} onValueChange={(v) => set({ goal: v === '__end__' ? null : v })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__end__">The customer finished the flow (or was handed over)</SelectItem>
                                {graph.nodes
                                    .filter((n) => n.id !== node.id && n.type !== 'start')
                                    .map((n) => (
                                        <SelectItem key={n.id} value={n.id}>
                                            Reached “{n.title}”
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </Row>
                </>
            );
        case 'http':
            return <HttpEditor ctx={ctx} />;
        case 'order':
            return (
                <>
                    {!options?.store_connected && <Hint tone="warn">Connect your Shopify or WooCommerce store in Integrations first.</Hint>}
                    <VarText
                        label="Order number"
                        value={c.order_number}
                        onChange={(order_number) => set({ order_number })}
                        vars={vars}
                        max={200}
                        multiline={false}
                        placeholder="{{last_input}}"
                        hint="Usually the answer to a question “What is your order number?” just before."
                    />
                    <LimitedInput
                        label="Remember the order as"
                        value={c.save_to}
                        onChange={(save_to) => set({ save_to: (save_to ?? 'order').replace(/[^A-Za-z0-9_]/g, '') || 'order' })}
                        max={40}
                        mono
                        hint={`Then use {{var.${c.save_to ?? 'order'}.status}}, .total, .tracking_url.`}
                    />
                    <Hint>Only the status of the customer’s own orders is shown (matched by their phone number). “Not found” runs for anything else.</Hint>
                </>
            );
        case 'sheets':
            return <SheetsEditor ctx={ctx} />;
        case 'goto':
            return (
                <Row label="Continue at" hint="Jumps to another block of this flow — handy to go back to a menu without long wires.">
                    <Select value={c.target ?? undefined} onValueChange={(target) => set({ target })}>
                        <SelectTrigger>
                            <SelectValue placeholder="Choose a block…" />
                        </SelectTrigger>
                        <SelectContent>
                            {graph.nodes
                                .filter((n) => n.id !== node.id && n.type !== 'start')
                                .map((n) => (
                                    <SelectItem key={n.id} value={n.id}>
                                        {n.title}
                                    </SelectItem>
                                ))}
                        </SelectContent>
                    </Select>
                </Row>
            );
        case 'subflow':
            return (
                <>
                    <Row label="Subflow" hint="Runs the shared flow, then continues here. Change the subflow once and every flow using it changes.">
                        <Select value={c.flow_id ?? undefined} onValueChange={(flow_id) => set({ flow_id })}>
                            <SelectTrigger>
                                <SelectValue placeholder={(options?.subflows ?? []).length ? 'Choose a subflow…' : 'No subflows yet'} />
                            </SelectTrigger>
                            <SelectContent>
                                {(options?.subflows ?? []).map((f) => (
                                    <SelectItem key={f.id} value={f.id}>
                                        {f.name} {!f.published && '(not published)'}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Row>
                    <Hint>Create subflows on the Chatbots page (New → Subflow). An End block in a subflow returns here.</Hint>
                </>
            );
        case 'note':
            return (
                <VarText
                    label="Note for your team"
                    value={c.text}
                    onChange={(v) => set({ text: v })}
                    vars={vars}
                    max={2000}
                    rows={4}
                    placeholder="Customer asked about bulk pricing: {{var.quantity}} units"
                    hint="Added to the conversation as an internal note, signed with this bot’s name. The customer never sees it."
                />
            );
        case 'handoff':
            return (
                <>
                    <VarText
                        label="Message to the customer"
                        value={c.text}
                        onChange={(v) => set({ text: v || null })}
                        vars={vars}
                        max={LIMITS.body}
                        rows={3}
                        snippets={snippets}
                        placeholder="Connecting you with our team 👩‍💼"
                    />
                    <VarText
                        label="Outside business hours"
                        value={c.offline_text}
                        onChange={(v) => set({ offline_text: v || null })}
                        vars={vars}
                        max={LIMITS.body}
                        rows={2}
                        placeholder="Thanks! We’re closed now and will reply first thing tomorrow."
                        hint="Optional. Used when your inbox business hours say you are closed."
                    />
                    <AssignPicker c={c} set={set} options={options} noneLabel="Use the inbox routing rule" />
                    <Toggle
                        label="Leave a summary note"
                        hint="Agents get a note with this bot’s name and the answers collected so far."
                        checked={c.note !== false}
                        onChange={(note) => set({ note })}
                    />
                    <Hint>
                        The bot pauses in this conversation and a person takes over. It comes back after “Hand back to bot”, when the chat is closed, or after
                        the auto-resume time in Flow settings.
                    </Hint>
                </>
            );
        case 'end':
            return (
                <>
                    <VarText
                        label="Closing message"
                        value={c.text}
                        onChange={(v) => set({ text: v || null })}
                        vars={vars}
                        max={LIMITS.body}
                        rows={2}
                        placeholder="Thanks for chatting with us! 😊"
                        hint="Optional."
                    />
                    <SelectRow
                        label="Then"
                        value={c.action ?? 'none'}
                        onChange={(action) => set({ action })}
                        options={[
                            ['none', 'Leave the conversation open'],
                            ['close', 'Close the conversation'],
                            ['assign', 'Assign it to a teammate'],
                        ]}
                    />
                    {c.action === 'assign' && <AssignPicker c={c} set={set} options={options} noneLabel="Least busy teammate" />}
                </>
            );
    }
}

function StartEditor({ ctx, onWebhook }: { ctx: Ctx; onWebhook: (enabled: boolean) => void }) {
    const { node, set, options, webhookUrl, phone } = ctx;
    const c = node.config;
    const waLink = phone && c.qr_code ? `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(c.qr_code)}` : null;

    return (
        <>
            <Section title="When the customer writes">
                <Toggle
                    label="Any message (default flow)"
                    hint="Answers every message that no other flow claims. One default flow per number."
                    checked={!!c.any_message}
                    onChange={(v) => set({ any_message: v })}
                />
                <Toggle
                    label="First message ever (greeting)"
                    hint="Only customers writing to this number for the first time. One greeting flow per number."
                    checked={!!c.greeting}
                    onChange={(v) => set({ greeting: v })}
                />
                <Row label="Keywords" hint="Keyword flows win over the default flow.">
                    <TagInput
                        value={c.keywords ?? []}
                        onChange={(v) => set({ keywords: v.map((k) => k.toLowerCase()) })}
                        placeholder="hi, menu, مرحبا… press Enter"
                    />
                </Row>
                {(c.keywords ?? []).length > 0 && (
                    <SelectRow
                        label="A keyword matches when the message"
                        value={c.keyword_match ?? 'starts'}
                        onChange={(keyword_match) => set({ keyword_match })}
                        options={[
                            ['exact', 'is exactly the keyword'],
                            ['starts', 'starts with the keyword'],
                            ['contains', 'contains the keyword'],
                        ]}
                    />
                )}
                <LimitedInput
                    label="Or matches this pattern (advanced)"
                    value={c.regex}
                    onChange={(regex) => set({ regex })}
                    max={200}
                    mono
                    placeholder="order\s*#?\d+"
                    hint="A regular expression, not case-sensitive."
                />
            </Section>
            <Section title="From your marketing">
                <Toggle
                    label="Click-to-WhatsApp ads"
                    hint="Customers arriving from one of your Meta ads."
                    checked={!!c.ad_referral}
                    onChange={(v) => set({ ad_referral: v })}
                />
                <LimitedInput
                    label="QR code / link text"
                    value={c.qr_code}
                    onChange={(qr_code) => set({ qr_code })}
                    max={40}
                    placeholder="TABLE-12 or SUMMER-PROMO"
                    hint="Put this text in a WhatsApp link or QR code; messages containing it start this flow."
                />
                {waLink && (
                    <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                        <code className="min-w-0 flex-1 truncate text-[11.5px]">{waLink}</code>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Copy the link"
                            onClick={() =>
                                void navigator.clipboard.writeText(waLink).then(() => toast.success('Link copied — turn it into a QR code anywhere'))
                            }
                        >
                            <CopyIcon />
                        </Button>
                    </div>
                )}
                <Row label="Campaign button replies" hint="Customers tapping one of these quick-reply buttons on a campaign template.">
                    <TagInput value={c.campaign_buttons ?? []} onChange={(v) => set({ campaign_buttons: v })} placeholder="Yes, I'm interested… press Enter" />
                </Row>
            </Section>
            <Section title="From your data">
                <Row
                    label="A contact gets one of these tags"
                    hint="Starts the flow for that contact. Begin with a Template block: they may not have written in the last 24 hours."
                >
                    <TagInput
                        value={c.tags_added ?? []}
                        onChange={(v) => set({ tags_added: v })}
                        suggestions={options?.tags ?? []}
                        placeholder="VIP… press Enter"
                    />
                </Row>
                <Row label="A custom field changes">
                    <TagInput
                        value={c.fields_changed ?? []}
                        onChange={(v) => set({ fields_changed: v.filter((k) => (options?.fields ?? []).some((f) => f.key === k)) })}
                        suggestions={(options?.fields ?? []).map((f) => f.key)}
                        placeholder="field key… press Enter"
                    />
                </Row>
            </Section>
            <Section title="From another system">
                <Toggle
                    label="Incoming webhook"
                    hint="Your booking tool, form or Zapier starts the flow for a phone number."
                    checked={!!c.webhook}
                    onChange={(v) => {
                        set({ webhook: v });
                        if (v && !webhookUrl) onWebhook(true);
                    }}
                />
                {c.webhook &&
                    (webhookUrl ? (
                        <div className="space-y-1.5 rounded-lg bg-muted px-3 py-2 text-[11.5px]">
                            <div className="flex items-center gap-2">
                                <code className="min-w-0 flex-1 truncate">{webhookUrl}</code>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="Copy the webhook URL"
                                    onClick={() => void navigator.clipboard.writeText(webhookUrl).then(() => toast.success('Webhook URL copied'))}
                                >
                                    <CopyIcon />
                                </Button>
                            </div>
                            <p className="text-muted-foreground">
                                POST JSON: {'{"phone": "+9715…", "name": "Sara", "vars": {"order": "1042"}}'} — the vars are available as {'{{var.order}}'}.
                                Publish the flow and switch it on first.
                            </p>
                            <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[11.5px]" onClick={() => onWebhook(true)}>
                                <RotateCcwIcon /> New URL (the old one stops working)
                            </Button>
                        </div>
                    ) : (
                        <Hint>Only someone who can publish can create the webhook URL.</Hint>
                    ))}
            </Section>
            <Section title="Re-entry">
                <SelectRow
                    label="A customer can start this flow"
                    value={c.reentry ?? 'always'}
                    onChange={(reentry) => set({ reentry })}
                    options={[
                        ['always', 'Every time'],
                        ['once', 'Only once'],
                        ['cooldown', 'Again after a pause'],
                    ]}
                    hint="When skipped, the next flow in line (e.g. the default flow) answers instead."
                />
                {c.reentry === 'cooldown' && (
                    <Row label="Pause (hours)">
                        <Input
                            type="number"
                            min={1}
                            max={720}
                            value={c.cooldown_hours ?? 24}
                            onChange={(e) => set({ cooldown_hours: Math.max(1, Math.min(720, Number(e.target.value || 24))) })}
                        />
                    </Row>
                )}
            </Section>
            <Hint>
                Who answers a message: a person handling the chat → a running flow → campaign / QR / ad / keyword flows → the greeting flow → the default flow.
                STOP is always handled by the opt-out, never by a bot.
            </Hint>
        </>
    );
}

function MediaEditor({ ctx }: { ctx: Ctx }) {
    const { node, set, vars } = ctx;
    const c = node.config;
    const [busy, setBusy] = useState(false);
    const accept =
        { image: 'image/jpeg,image/png', video: 'video/mp4,video/3gpp', document: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt', audio: 'audio/*' }[
            c.kind as string
        ] ?? '*/*';

    return (
        <>
            <Segmented
                value={c.kind ?? 'image'}
                options={[
                    ['image', 'Image'],
                    ['video', 'Video'],
                    ['document', 'Document'],
                    ['audio', 'Audio'],
                ]}
                onChange={(kind) => set({ kind, media_id: null, media_name: null })}
            />
            <Row label="File" hint={c.kind === 'audio' ? 'Audio must be uploaded (OGG, MP3, M4A, AAC or AMR).' : 'Upload it, or paste a public https link.'}>
                {c.media_id ? (
                    <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px]">
                        <FileUpIcon className="size-4 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{c.media_name ?? 'Uploaded file'}</span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Remove the file"
                            onClick={() => set({ media_id: null, media_name: null })}
                        >
                            <XIcon />
                        </Button>
                    </div>
                ) : (
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 text-[12.5px] font-semibold text-muted-foreground hover:border-brand-500 hover:bg-brand-50 hover:text-brand-600">
                        {busy ? <Loader2Icon className="size-4 animate-spin" /> : <FileUpIcon className="size-4" />} Upload a file
                        <input
                            type="file"
                            accept={accept}
                            className="sr-only"
                            onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                setBusy(true);
                                try {
                                    const form = new FormData();
                                    form.append('file', file);
                                    const res = await upload<{ data: UploadedMedia }>('media', form);
                                    set({
                                        media_id: res.data.id,
                                        media_name: res.data.filename,
                                        kind: res.data.type === 'sticker' ? 'image' : res.data.type,
                                        link: null,
                                    });
                                } catch (err) {
                                    toast.error(errorMessage(err));
                                } finally {
                                    setBusy(false);
                                }
                            }}
                        />
                    </label>
                )}
            </Row>
            {!c.media_id && c.kind !== 'audio' && (
                <LimitedInput
                    label="…or a link (https)"
                    value={c.link}
                    onChange={(link) => set({ link })}
                    max={1000}
                    mono
                    placeholder="https://example.com/menu.pdf"
                />
            )}
            {c.kind === 'document' && (
                <LimitedInput label="File name shown" value={c.filename} onChange={(filename) => set({ filename })} max={120} placeholder="Menu.pdf" />
            )}
            {c.kind !== 'audio' && (
                <VarText
                    label="Caption"
                    value={c.caption}
                    onChange={(v) => set({ caption: v || null })}
                    vars={vars}
                    max={1024}
                    rows={2}
                    placeholder="Our menu for this week 🍰"
                    hint="Optional."
                />
            )}
        </>
    );
}

function ListEditor({ ctx, text, headerFooter }: { ctx: Ctx; text: React.ReactNode; headerFooter: React.ReactNode }) {
    const { node, set } = ctx;
    const c = node.config;
    const sections = (c.sections ?? [{ title: null, rows: [] }]) as {
        title: string | null;
        rows: { id: string; title: string; description?: string | null }[];
    }[];
    const total = sections.reduce((n, s) => n + s.rows.length, 0);
    const update = (i: number, patch: Partial<(typeof sections)[number]>) => set({ sections: sections.map((s, n) => (n === i ? { ...s, ...patch } : s)) });

    return (
        <>
            {text}
            {headerFooter}
            <LimitedInput
                label="Menu button"
                value={c.button_label}
                onChange={(button_label) => set({ button_label: button_label ?? 'Choose' })}
                max={20}
                placeholder="Choose"
                hint="The button the customer taps to open the list."
            />
            {sections.map((s, i) => (
                <div key={i} className="space-y-2 rounded-xl border bg-muted/30 p-2.5">
                    <div className="flex items-center gap-1">
                        <Input
                            value={s.title ?? ''}
                            maxLength={24}
                            placeholder={sections.length > 1 ? 'Section title (required)' : 'Section title (optional)'}
                            onChange={(e) => update(i, { title: e.target.value || null })}
                            className="h-8 font-semibold"
                            aria-label={`Section ${i + 1} title`}
                        />
                        {sections.length > 1 && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => set({ sections: sections.filter((_, n) => n !== i) })}
                                aria-label="Remove section"
                            >
                                <XIcon />
                            </Button>
                        )}
                    </div>
                    <Choices
                        label="Rows"
                        hint={`Title up to 24 characters, description up to 72. ${total}/10 rows in total.`}
                        items={s.rows}
                        max={Math.max(s.rows.length, 10 - (total - s.rows.length))}
                        titleMax={LIMITS.row_title}
                        withDescription
                        onChange={(rows) => update(i, { rows })}
                    />
                </div>
            ))}
            {total < 10 && sections.length < 10 && (
                <Button type="button" variant="outline" size="sm" onClick={() => set({ sections: [...sections, { title: null, rows: [] }] })}>
                    <PlusIcon /> Add a section
                </Button>
            )}
        </>
    );
}

type Product = { id: string; name: string; price: string | null; description: string | null; image_url: string | null; link: string | null };

function ProductEditor({ ctx }: { ctx: Ctx }) {
    const { node, set, vars } = ctx;
    const c = node.config;
    const items = (c.items ?? []) as Product[];
    const update = (i: number, patch: Partial<Product>) => set({ items: items.map((it, n) => (n === i ? { ...it, ...patch } : it)) });

    return (
        <>
            <VarText
                label="Intro message"
                value={c.text}
                onChange={(text) => set({ text })}
                vars={vars}
                max={1024}
                rows={2}
                placeholder="Here are our best sellers 👇"
            />
            <Row label="Show as">
                <Segmented
                    value={c.mode ?? 'cards'}
                    options={[
                        ['cards', 'Cards + link'],
                        ['list', 'List to choose'],
                        ['images', 'Pictures + №'],
                    ]}
                    onChange={(mode) => set({ mode })}
                />
            </Row>
            <Hint>
                {c.mode === 'images'
                    ? 'Each product is sent as a picture numbered 1, 2, 3…; the customer replies with the number. “2” always means the 2nd product shown.'
                    : c.mode === 'list'
                      ? 'One WhatsApp list the customer taps to choose (up to 10). The choice is saved and the flow continues.'
                      : 'Each product is a picture card with a button to its page on your website, where the customer orders and pays. The flow then continues.'}
            </Hint>
            {c.mode === 'list' && (
                <LimitedInput
                    label="List button"
                    value={c.button_label}
                    onChange={(button_label) => set({ button_label: button_label ?? 'View products' })}
                    max={20}
                />
            )}
            {c.mode === 'cards' && (
                <div className="grid grid-cols-2 gap-2">
                    <LimitedInput
                        label="Card button"
                        value={c.order_label}
                        onChange={(order_label) => set({ order_label: order_label ?? 'View & order' })}
                        max={20}
                        placeholder="View & order"
                    />
                    <LimitedInput label="“See all” button" value={c.all_label} onChange={(all_label) => set({ all_label })} max={20} placeholder="See all →" />
                </div>
            )}
            {c.mode === 'cards' && (
                <LimitedInput
                    label="“See all” link"
                    value={c.all_url}
                    onChange={(all_url) => set({ all_url })}
                    max={1000}
                    mono
                    placeholder="{{business.store_url}}/collections/cakes"
                />
            )}
            <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                    <Label className="text-[12px] font-semibold">Products</Label>
                    <span className="text-[10.5px] text-faint tabular-nums">{items.length}/10</span>
                </div>
                {items.length === 0 && (
                    <p className="rounded-lg border border-dashed px-3 py-4 text-center text-[12px] text-muted-foreground">
                        Add your first product: name, photo link, price and its page.
                    </p>
                )}
                {items.map((p, i) => (
                    <div key={p.id} className="space-y-1 rounded-lg border p-2">
                        <div className="flex gap-1">
                            <Input
                                value={p.name}
                                maxLength={60}
                                placeholder="Name"
                                onChange={(e) => update(i, { name: e.target.value })}
                                className="h-8 font-semibold"
                            />
                            <Input
                                value={p.price ?? ''}
                                maxLength={30}
                                placeholder="From AED 120"
                                onChange={(e) => update(i, { price: e.target.value || null })}
                                className="h-8 w-32"
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
                            placeholder="Short description (optional)"
                            onChange={(e) => update(i, { description: e.target.value || null })}
                            className="h-8 text-[12.5px]"
                        />
                        <Input
                            value={p.image_url ?? ''}
                            placeholder="Photo link — https://…"
                            onChange={(e) => update(i, { image_url: e.target.value || null })}
                            className="h-8 font-mono text-[11.5px]"
                        />
                        <Input
                            value={p.link ?? ''}
                            placeholder="Product page — https://… or {{business.store_url}}/product/…"
                            onChange={(e) => update(i, { link: e.target.value || null })}
                            className="h-8 font-mono text-[11.5px]"
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
            {c.mode !== 'cards' && (
                <LimitedInput
                    label="Remember the choice as"
                    value={c.save_to}
                    onChange={(save_to) => set({ save_to: (save_to ?? 'product').replace(/[^A-Za-z0-9_]/g, '') || 'product' })}
                    max={40}
                    mono
                    hint={`Use {{var.${c.save_to ?? 'product'}.name}}, .price or .link later.`}
                />
            )}
            <Hint>Products are added here by hand for now; syncing from your store comes later.</Hint>
        </>
    );
}

function TemplateEditor({ ctx }: { ctx: Ctx }) {
    const { node, set, options, vars } = ctx;
    const c = node.config;
    const templates = options?.templates ?? [];
    const key = c.name ? `${c.name}|${c.language}` : undefined;
    const chosen = templates.find((t) => t.name === c.name && t.language === c.language);

    return (
        <>
            <Row label="Approved template" hint="Delivered even when the customer has not written for 24 hours — use it after long waits and for reminders.">
                <Select
                    value={key}
                    onValueChange={(v) => {
                        const t = templates.find((x) => `${x.name}|${x.language}` === v);
                        if (t) set({ name: t.name, language: t.language, header: t.variables.header.map(() => ''), body: t.variables.body.map(() => '') });
                    }}
                >
                    <SelectTrigger>
                        <SelectValue placeholder={templates.length ? 'Choose a template…' : 'No approved templates yet'} />
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
                <Hint tone="warn">This template has a media header, which a bot cannot fill in. Choose one with a text header or none.</Hint>
            )}
            {(chosen?.variables.header ?? []).map((name, i) => (
                <VarText
                    key={`h${name}`}
                    label={`Header {{${name}}}`}
                    value={(c.header ?? [])[i] ?? ''}
                    onChange={(v) => set({ header: Object.assign([...(c.header ?? [])], { [i]: v }) })}
                    vars={vars}
                    max={500}
                    multiline={false}
                    placeholder="{{contact.first_name}}"
                />
            ))}
            {(chosen?.variables.body ?? []).map((name, i) => (
                <VarText
                    key={`b${name}`}
                    label={`Body {{${name}}}`}
                    value={(c.body ?? [])[i] ?? ''}
                    onChange={(v) => set({ body: Object.assign([...(c.body ?? [])], { [i]: v }) })}
                    vars={vars}
                    max={500}
                    multiline={false}
                    placeholder="{{var.date}}"
                />
            ))}
            <Toggle
                label="“Not delivered” branch"
                hint="Adds a connector for when WhatsApp cannot deliver it (e.g. the number is not on WhatsApp). The bot waits up to 3 minutes for the delivery report."
                checked={!!c.on_failure}
                onChange={(on_failure) => set({ on_failure })}
            />
        </>
    );
}

function FormEditor({ ctx, text, headerFooter }: { ctx: Ctx; text: React.ReactNode; headerFooter: React.ReactNode }) {
    const { node, set, options } = ctx;
    const c = node.config;
    const fields = (c.fields ?? []) as { key: string; to: string }[];

    return (
        <>
            {text}
            {headerFooter}
            <div className="grid grid-cols-2 gap-2">
                <LimitedInput
                    label="Flow ID"
                    value={c.flow_id}
                    onChange={(flow_id) => set({ flow_id: flow_id?.replace(/\D/g, '') || null })}
                    max={25}
                    mono
                    placeholder="1234567890123456"
                    hint="WhatsApp Manager → Flows."
                />
                <LimitedInput
                    label="First screen"
                    value={c.screen}
                    onChange={(screen) => set({ screen })}
                    max={60}
                    mono
                    placeholder="WELCOME"
                    hint="The screen id in the Flow JSON."
                />
            </div>
            <LimitedInput label="Button" value={c.cta} onChange={(cta) => set({ cta: cta ?? 'Open form' })} max={20} placeholder="Open form" />
            <Toggle
                label="Draft form (for testing)"
                hint="Sends the form’s draft version; switch off before going live."
                checked={!!c.draft}
                onChange={(draft) => set({ draft })}
            />
            <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                    <Label className="text-[12px] font-semibold">Save the answers</Label>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-[11.5px]"
                        onClick={() => set({ fields: [...fields, { key: '', to: 'var:answer' }] })}
                        disabled={fields.length >= 20}
                    >
                        <PlusIcon /> Add
                    </Button>
                </div>
                {fields.map((f, i) => (
                    <div key={i} className="space-y-1 rounded-lg border p-2">
                        <div className="flex gap-1">
                            <Input
                                value={f.key}
                                placeholder="Form field name, e.g. email"
                                onChange={(e) => set({ fields: fields.map((x, n) => (n === i ? { ...x, key: e.target.value } : x)) })}
                                className="h-8 font-mono text-[12px]"
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => set({ fields: fields.filter((_, n) => n !== i) })}
                                aria-label="Remove"
                            >
                                <XIcon />
                            </Button>
                        </div>
                        <TargetPicker
                            label="into"
                            value={f.to}
                            options={options}
                            onChange={(to) => set({ fields: fields.map((x, n) => (n === i ? { ...x, to } : x)) })}
                        />
                    </div>
                ))}
                <p className="text-[11.5px] text-muted-foreground">All answers are also kept as {`{{var.${node.id}.<field>}}`}.</p>
            </div>
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
    ['language', 'Language'],
    ['last_input', 'Last answer'],
];
const OPS: [string, string][] = [
    ['equals', 'is'],
    ['not_equals', 'is not'],
    ['contains', 'contains'],
    ['not_contains', 'does not contain'],
    ['gt', 'is more than'],
    ['gte', 'is at least'],
    ['lt', 'is less than'],
    ['lte', 'is at most'],
    ['is_set', 'is filled in'],
    ['is_not_set', 'is empty'],
];

type Rule = { field: string; op: string; value: string | null };

function ConditionEditor({ ctx }: { ctx: Ctx }) {
    const { node, set, options, vars } = ctx;
    const c = node.config;
    const rules = (c.rules ?? []) as Rule[];
    const update = (i: number, patch: Partial<Rule>) => set({ rules: rules.map((r, n) => (n === i ? { ...r, ...patch } : r)) });
    const subjects: [string, string][] = [
        ...SUBJECTS,
        ...(options?.fields ?? []).map((f) => [`field:${f.key}`, `${f.label} (field)`] as [string, string]),
        ...vars.filter((v) => v.key.startsWith('var.')).map((v) => [`var:${v.key.slice(4)}`, v.label] as [string, string]),
        ...vars.filter((v) => v.key.startsWith('business.')).map((v) => [`business:${v.key.slice(9)}`, `${v.label} (business)`] as [string, string]),
    ];

    return (
        <>
            <SelectRow
                label="Go to “Yes” when"
                value={c.match ?? 'all'}
                onChange={(match) => set({ match })}
                options={[
                    ['all', 'all of these are true'],
                    ['any', 'any of these is true'],
                ]}
            />
            {rules.map((r, i) => {
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
                    <div key={i} className="space-y-1.5 rounded-lg border bg-muted/30 p-2">
                        <div className="flex gap-1">
                            <Select
                                value={r.field}
                                onValueChange={(field) =>
                                    update(i, {
                                        field,
                                        op:
                                            field === 'tag'
                                                ? 'has_tag'
                                                : field === 'segment'
                                                  ? 'in_segment'
                                                  : ['tag', 'segment'].includes(r.field)
                                                    ? 'equals'
                                                    : r.op,
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
                                    placeholder="Value, or {{business.min_age}}"
                                    className="h-8"
                                />
                            ))}
                    </div>
                );
            })}
            {rules.length < 10 && (
                <Button type="button" variant="outline" size="sm" onClick={() => set({ rules: [...rules, { field: 'name', op: 'is_set', value: null }] })}>
                    <PlusIcon /> Add a rule
                </Button>
            )}
            <Hint>Numbers compare as numbers, dates (2026-10-15) as dates.</Hint>
        </>
    );
}

const DAYS: [string, string][] = [
    ['mon', 'Mon'],
    ['tue', 'Tue'],
    ['wed', 'Wed'],
    ['thu', 'Thu'],
    ['fri', 'Fri'],
    ['sat', 'Sat'],
    ['sun', 'Sun'],
];

function HoursEditor({ ctx }: { ctx: Ctx }) {
    const { node, set, options } = ctx;
    const c = node.config;
    const days = (c.days ?? []) as string[];

    return (
        <>
            <Segmented
                value={c.mode ?? 'business'}
                options={[
                    ['business', 'Inbox business hours'],
                    ['custom', 'Custom hours'],
                ]}
                onChange={(mode) => set({ mode })}
            />
            {c.mode === 'custom' ? (
                <>
                    <Row label="Open on">
                        <div className="flex flex-wrap gap-1">
                            {DAYS.map(([d, l]) => (
                                <button
                                    key={d}
                                    type="button"
                                    aria-pressed={days.includes(d)}
                                    onClick={() => set({ days: days.includes(d) ? days.filter((x) => x !== d) : [...days, d] })}
                                    className={cn(
                                        'rounded-md border px-2.5 py-1 text-[12px] font-semibold',
                                        days.includes(d) ? 'border-brand-500 bg-brand-50 text-brand-600' : 'text-muted-foreground',
                                    )}
                                >
                                    {l}
                                </button>
                            ))}
                        </div>
                    </Row>
                    <div className="grid grid-cols-2 gap-2">
                        <Row label="From">
                            <Input type="time" value={c.from ?? '09:00'} onChange={(e) => set({ from: e.target.value })} />
                        </Row>
                        <Row label="To">
                            <Input type="time" value={c.to ?? '18:00'} onChange={(e) => set({ to: e.target.value })} />
                        </Row>
                    </div>
                    <Row label="Closed on (holidays)" hint="Dates as YYYY-MM-DD.">
                        <TagInput
                            value={c.closed_dates ?? []}
                            onChange={(v) => set({ closed_dates: v.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) })}
                            placeholder="2026-12-02… press Enter"
                        />
                    </Row>
                    <Hint>Times are in your workspace time zone ({options?.timezone ?? 'UTC'}). “To” before “From” spans midnight.</Hint>
                </>
            ) : (
                <Hint>Uses the business hours in Settings → Inbox. If they are not switched on, it is always “Open”.</Hint>
            )}
        </>
    );
}

function HttpEditor({ ctx }: { ctx: Ctx }) {
    const { node, set, options, vars } = ctx;
    const c = node.config;
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
                    aria-label="URL"
                />
            </div>
            <p className="-mt-2 text-[11.5px] text-muted-foreground">
                Placeholders may fill the path and query, not the address. Only public https addresses are called.
            </p>
            <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                    <Label className="text-[12px] font-semibold">Headers</Label>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-[11.5px]"
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
                    Keep keys in Chatbots → Workspace → API keys and use them as {'{{secret.NAME}}'}; they are never stored in the flow.
                </p>
            </div>
            {c.method !== 'GET' && (
                <VarText
                    label="Body (JSON)"
                    value={c.body}
                    onChange={(body) => set({ body: body || null })}
                    vars={vars}
                    max={5000}
                    rows={5}
                    secrets={secrets}
                    mono
                    placeholder={'{"phone": "{{contact.phone}}"}'}
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
                    <Label className="text-[12px] font-semibold">Save from the response</Label>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-[11.5px]"
                        onClick={() => set({ save: [...save, { path: '', to: 'var:result' }] })}
                        disabled={save.length >= 10}
                    >
                        <PlusIcon /> Add
                    </Button>
                </div>
                {save.map((m, i) => (
                    <div key={i} className="space-y-1 rounded-lg border p-2">
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
                “Success” is any 2xx answer. Use Test (top right) to try the call: API blocks call the real address in a test. Connect “Error” to a Handoff so
                nobody gets stuck.
            </Hint>
        </>
    );
}

const SHEET_SCRIPT = `function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = data.sheet ? book.getSheetByName(data.sheet) : book.getSheets()[0];
  var cols = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
  Object.keys(data.row).forEach(function (k) { if (cols.indexOf(k) < 0) { cols.push(k); sheet.getRange(1, cols.length).setValue(k); } });
  sheet.appendRow(cols.map(function (k) { return data.row[k] || ''; }));
  return ContentService.createTextOutput('ok');
}`;

function SheetsEditor({ ctx }: { ctx: Ctx }) {
    const { node, set, vars } = ctx;
    const c = node.config;
    const columns = (c.columns ?? []) as { name: string; value: string }[];

    return (
        <>
            <details className="rounded-lg border bg-muted/40 px-3 py-2 text-[12px]">
                <summary className="cursor-pointer font-semibold">
                    <SparklesIcon className="mr-1 inline size-3.5" /> Set up your sheet (2 minutes)
                </summary>
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-ink-2">
                    <li>Open your Google Sheet → Extensions → Apps Script.</li>
                    <li>Paste this script and save:</li>
                </ol>
                <pre className="mt-1 max-h-40 overflow-auto rounded bg-card p-2 text-[10.5px]">{SHEET_SCRIPT}</pre>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[11.5px]"
                    onClick={() => void navigator.clipboard.writeText(SHEET_SCRIPT).then(() => toast.success('Script copied'))}
                >
                    <CopyIcon /> Copy the script
                </Button>
                <ol start={3} className="mt-1 list-decimal space-y-1 pl-4 text-ink-2">
                    <li>Deploy → New deployment → Web app; execute as you, access: Anyone.</li>
                    <li>Copy the web app URL and paste it below.</li>
                </ol>
            </details>
            <LimitedInput
                label="Web app URL"
                value={c.webapp_url}
                onChange={(webapp_url) => set({ webapp_url })}
                max={1000}
                mono
                placeholder="https://script.google.com/macros/s/…/exec"
            />
            <LimitedInput label="Sheet (tab) name" value={c.sheet} onChange={(sheet) => set({ sheet })} max={100} placeholder="Leads (empty = the first tab)" />
            <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                    <Label className="text-[12px] font-semibold">Columns</Label>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-[11.5px]"
                        onClick={() => set({ columns: [...columns, { name: '', value: '' }] })}
                        disabled={columns.length >= 20}
                    >
                        <PlusIcon /> Add
                    </Button>
                </div>
                {columns.map((col, i) => (
                    <div key={i} className="flex items-start gap-1">
                        <Input
                            value={col.name}
                            placeholder="Column"
                            onChange={(e) => set({ columns: columns.map((x, n) => (n === i ? { ...x, name: e.target.value } : x)) })}
                            className="h-8 w-28 text-[12px]"
                        />
                        <div className="min-w-0 flex-1">
                            <VarText
                                label=""
                                value={col.value}
                                onChange={(value) => set({ columns: columns.map((x, n) => (n === i ? { ...x, value } : x)) })}
                                vars={vars}
                                max={500}
                                multiline={false}
                                placeholder="{{contact.name}}"
                            />
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => set({ columns: columns.filter((_, n) => n !== i) })}
                            aria-label="Remove column"
                        >
                            <XIcon />
                        </Button>
                    </div>
                ))}
            </div>
        </>
    );
}
