'use client';

import { ChevronDownIcon, ChevronRightIcon, CopyIcon, PlayIcon, XIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { BlockList } from '@/components/chatbots/block-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    blockOf,
    type ChatbotAnalytics,
    type FlowGraph,
    type FlowIssue,
    type FlowNode,
    type FlowOutput,
    LIMITS,
    type NodeConfig,
    nodeSummary,
    type NodeType,
} from '@/lib/chatbots';
import { cn } from '@/lib/utils';

import { KIND_LABEL, kindOf } from './kinds';

export type InsightMode = 'off' | 'counts' | 'percent' | 'gaveup';

type Section = { id: string; name: string };
type GraphWithSections = FlowGraph & { sections?: Section[] };
type NodeWithSection = FlowNode & { section?: string; setup?: boolean };

/** The text the customer sees, for the steps that have one: edited right on the card. */
const TEXT_TYPES: NodeType[] = [
    'message',
    'buttons',
    'list',
    'question',
    'product',
    'url',
    'form',
    'ask_media',
    'location',
    'rating',
    'optin',
    'optout',
    'handoff',
    'note',
];
const LONG_TEXT: NodeType[] = ['message', 'handoff', 'note', 'optin', 'optout'];

/** Steps in the order a customer meets them: from Start, path by path; steps nothing reaches come last. */
export function stepOrder(graph: FlowGraph): FlowNode[] {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const start = graph.nodes.find((n) => n.type === 'start');
    const seen = new Set<string>();
    const out: FlowNode[] = [];
    const queue = start ? [start.id] : [];
    while (queue.length) {
        const id = queue.shift() as string;
        if (seen.has(id)) continue;
        const n = byId.get(id);
        if (!n) continue;
        seen.add(id);
        out.push(n);
        for (const o of n.outputs) if (o.to && !seen.has(o.to)) queue.push(o.to);
    }
    for (const n of graph.nodes) if (!seen.has(n.id)) out.push(n);

    return out;
}

/**
 * Simple view (approved design): what starts the flow, then every step as a card in the order customers
 * meet them, grouped in sections. Texts are edited on the card; every path says where it goes, and + adds
 * a step on that path.
 */
export function SimpleView({
    graph,
    triggers,
    selection,
    issues,
    analytics,
    insight,
    readOnly,
    onSelect,
    onOpenStep,
    onConfig,
    onConnect,
    onAddOnPath,
    onDuplicate,
    onDelete,
    onTest,
    onStartRules,
    onRenameSection,
}: {
    graph: FlowGraph;
    triggers: string[];
    selection: Set<string>;
    issues: FlowIssue[];
    analytics: ChatbotAnalytics | null;
    insight: InsightMode;
    readOnly: boolean;
    onSelect: (id: string) => void;
    onOpenStep: (id: string) => void;
    onConfig: (id: string, config: NodeConfig) => void;
    onConnect: (from: string, output: string, to: string | null) => void;
    onAddOnPath: (from: string, output: string, type: NodeType) => void;
    onDuplicate: (id: string) => void;
    onDelete: (id: string) => void;
    onTest: () => void;
    onStartRules: () => void;
    onRenameSection: (id: string, name: string) => void;
}) {
    const g = graph as GraphWithSections;
    const order = useMemo(() => stepOrder(graph), [graph]);
    const index = new Map(order.map((n, i) => [n.id, i]));
    const titles = new Map(graph.nodes.map((n) => [n.id, n.title]));
    const start = graph.nodes.find((n) => n.type === 'start');
    const first = start?.outputs[0]?.to ? graph.nodes.find((n) => n.id === start.outputs[0].to) : null;
    const [closed, setClosed] = useState<Set<string>>(new Set());
    const byNode = new Map<string, FlowIssue[]>();
    for (const i of issues) if (i.node_id) byNode.set(i.node_id, [...(byNode.get(i.node_id) ?? []), i]);
    const errorsOf = (id: string) => (byNode.get(id) ?? []).filter((i) => i.level === 'error').length;
    const sectionName = (id: string | undefined) => (id ? (g.sections ?? []).find((s) => s.id === id)?.name : undefined);

    const steps = order.filter((n) => n.type !== 'start') as NodeWithSection[];
    const groups: { id: string; name: string; nodes: NodeWithSection[]; editable: boolean }[] = [];
    if ((g.sections ?? []).length > 0) {
        const secs = [...(g.sections ?? [])].sort(
            (a, b) =>
                Math.min(...steps.filter((n) => n.section === a.id).map((n) => index.get(n.id) ?? 1e9)) -
                Math.min(...steps.filter((n) => n.section === b.id).map((n) => index.get(n.id) ?? 1e9)),
        );
        for (const s of secs) groups.push({ id: s.id, name: s.name, nodes: steps.filter((n) => n.section === s.id), editable: true });
        const loose = steps.filter((n) => !n.section || !secs.some((s) => s.id === n.section));
        if (loose.length) groups.push({ id: '__loose__', name: 'Not in a section', nodes: loose, editable: false });
    } else {
        groups.push({ id: '__all__', name: 'Steps', nodes: steps, editable: false });
    }
    const started = analytics?.sessions.started ?? 0;
    const maxGaveUp = Math.max(0, ...Object.values(analytics?.nodes ?? {}).map((s) => s.abandoned));

    const pathPlus = (n: FlowNode, o: FlowOutput, label: string) =>
        readOnly ? (
            <span className="cb-plus" aria-hidden style={{ visibility: 'hidden' }} />
        ) : (
            <Popover>
                <PopoverTrigger asChild>
                    <button type="button" className="cb-plus" aria-label={`Add a step: ${label}`} title="Add a step on this path">
                        +
                    </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-80 p-2.5">
                    <p className="mb-2 text-[11.5px] text-muted-foreground">Added on this path{o.to ? `, before “${titles.get(o.to)}”` : ''}.</p>
                    <BlockList onPick={(t) => onAddOnPath(n.id, o.id, t)} autoFocus dense />
                </PopoverContent>
            </Popover>
        );

    const pathLabel = (n: FlowNode, o: FlowOutput) => {
        if (n.type === 'buttons' || n.type === 'list') return o.id === 'fallback' ? 'If the answer doesn’t fit' : `If they choose “${o.label}”`;
        if (n.outputs.length === 1 && ['Next', 'next'].includes(o.label)) return 'Done';

        return o.label;
    };

    return (
        <div className="cb-flowcol" data-testid="simple-view">
            <div className="cb-when">
                <div className="cb-row">
                    <span className="cb-chip">WHEN</span>
                    <span style={{ fontWeight: 500 }} className="cb-grow">
                        {triggers.length ? triggers.join(' · ') : 'Nothing starts this flow yet'}
                    </span>
                    <button type="button" className="cb-btn sm" onClick={onStartRules} style={{ color: 'var(--cb-ink)' }}>
                        Start rules
                    </button>
                </div>
                <div className="cb-row cb-small" style={{ color: '#d6dccf' }}>
                    Then:{' '}
                    {first ? (
                        <button type="button" className="cb-link" onClick={() => onSelect(first.id)}>
                            {first.title}
                        </button>
                    ) : (
                        <span>nothing yet</span>
                    )}
                    {start && start.outputs[0] && pathPlus(start, start.outputs[0], 'after the start')}
                    {start && (
                        <button type="button" className="cb-link" onClick={() => onOpenStep(start.id)} style={{ marginLeft: 'auto' }}>
                            Edit what starts it
                        </button>
                    )}
                </div>
            </div>

            {groups.map((grp) => {
                const errs = grp.nodes.reduce((t, n) => t + errorsOf(n.id), 0);
                const isClosed = closed.has(grp.id);

                return (
                    <section key={grp.id} className="cb-col" style={{ gap: 10 }} aria-label={grp.name}>
                        <div className="cb-sechead">
                            <button
                                type="button"
                                className="cb-btn ghost xs"
                                aria-expanded={!isClosed}
                                aria-label={isClosed ? `Show ${grp.name}` : `Hide ${grp.name}`}
                                onClick={() =>
                                    setClosed((c) => {
                                        const next = new Set(c);
                                        if (next.has(grp.id)) next.delete(grp.id);
                                        else next.add(grp.id);

                                        return next;
                                    })
                                }
                            >
                                {isClosed ? <ChevronRightIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
                            </button>
                            {grp.editable && !readOnly ? (
                                <input className="cb-nm" value={grp.name} onChange={(e) => onRenameSection(grp.id, e.target.value)} aria-label="Section name" />
                            ) : (
                                <span className="cb-nm">{grp.name}</span>
                            )}
                            <span className="cb-small cb-muted">
                                {grp.nodes.length} step{grp.nodes.length === 1 ? '' : 's'}
                            </span>
                            {errs > 0 && <span className="cb-chip bad">{errs} to fix</span>}
                            <span className="cb-line" />
                        </div>
                        {!isClosed &&
                            grp.nodes.map((n) => {
                                const k = kindOf(n.type);
                                const errs = errorsOf(n.id);
                                const sel = selection.has(n.id);
                                const text = typeof n.config.text === 'string' && TEXT_TYPES.includes(n.type) ? (n.config.text as string) : null;
                                const limit = LONG_TEXT.includes(n.type) ? LIMITS.text : LIMITS.body;
                                const stats = analytics?.nodes[n.id];
                                const buttons = n.type === 'buttons' ? ((n.config.buttons as { title: string }[] | undefined) ?? []) : null;

                                return (
                                    <article
                                        key={n.id}
                                        className={cn('cb-step', sel && 'sel', errs > 0 && !sel && 'bad')}
                                        onClick={(e) =>
                                            !(e.target as HTMLElement).closest('button, textarea, input, select, a, [role="dialog"]') && onSelect(n.id)
                                        }
                                        data-step={n.id}
                                    >
                                        <div className="cb-head">
                                            <span className={`cb-chip cb-kind ${k}`}>{KIND_LABEL[k]}</span>
                                            <span className="cb-small cb-muted">{blockOf(n.type).label}</span>
                                            <button type="button" className="cb-ttl" onClick={() => onSelect(n.id)}>
                                                {n.title}
                                            </button>
                                            {n.setup && <span className="cb-chip ok">Set up by you</span>}
                                            {errs > 0 && <span className="cb-chip bad">{errs} to fix</span>}
                                            <span className="cb-spacer" />
                                            <button type="button" className="cb-btn sm" onClick={() => onOpenStep(n.id)} aria-label={`Settings of ${n.title}`}>
                                                Settings
                                            </button>
                                            <button
                                                type="button"
                                                className="cb-btn sm cb-iconbtn"
                                                onClick={onTest}
                                                aria-label="Test the flow"
                                                title="Test the flow"
                                            >
                                                <PlayIcon className="size-3.5" />
                                            </button>
                                            {!readOnly && (
                                                <>
                                                    <button
                                                        type="button"
                                                        className="cb-btn sm cb-iconbtn"
                                                        onClick={() => onDuplicate(n.id)}
                                                        aria-label={`Duplicate ${n.title}`}
                                                        title="Duplicate"
                                                    >
                                                        <CopyIcon className="size-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="cb-btn sm cb-iconbtn"
                                                        onClick={() => onDelete(n.id)}
                                                        aria-label={`Delete ${n.title}`}
                                                        title="Delete"
                                                    >
                                                        <XIcon className="size-3.5" />
                                                    </button>
                                                </>
                                            )}
                                        </div>

                                        {insight !== 'off' && stats && (
                                            <div
                                                className={cn('cb-fig', insight === 'gaveup' && stats.abandoned > 0 && stats.abandoned === maxGaveUp && 'big')}
                                            >
                                                {insight === 'counts' && (
                                                    <>
                                                        <b className="cb-num">{stats.entries}</b> reached this step
                                                        {stats.handoffs > 0 && <span>· {stats.handoffs} handed over</span>}
                                                    </>
                                                )}
                                                {insight === 'percent' && (
                                                    <>
                                                        <b className="cb-num">{started > 0 ? Math.round((100 * stats.entries) / started) : 0}%</b> of {started}{' '}
                                                        chats started
                                                    </>
                                                )}
                                                {insight === 'gaveup' && (
                                                    <>
                                                        <b className="cb-num">{stats.abandoned}</b> gave up here
                                                        {stats.abandoned > 0 && stats.abandoned === maxGaveUp && (
                                                            <span className="cb-chip warn">Biggest drop</span>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        )}

                                        {text !== null ? (
                                            <>
                                                <div className="cb-row cb-small cb-muted">
                                                    <span className="cb-grow">{n.type === 'note' ? 'Note your team sees' : 'Message the customer sees'}</span>
                                                    <span className="cb-num">
                                                        {text.length} / {limit.toLocaleString()}
                                                    </span>
                                                </div>
                                                <textarea
                                                    className="cb-in"
                                                    rows={Math.min(6, Math.max(2, Math.ceil(text.length / 80)))}
                                                    value={text}
                                                    maxLength={limit}
                                                    disabled={readOnly}
                                                    aria-label={`Message of ${n.title}`}
                                                    onFocus={() => onSelect(n.id)}
                                                    onChange={(e) => onConfig(n.id, { ...n.config, text: e.target.value })}
                                                />
                                            </>
                                        ) : (
                                            <p className="cb-small" style={{ color: 'var(--cb-ink-2)' }}>
                                                {nodeSummary(n, { titles })}
                                            </p>
                                        )}
                                        {buttons && (
                                            <div className="cb-row">
                                                {buttons.map((b, i) => (
                                                    <span
                                                        key={i}
                                                        className="cb-chip"
                                                        style={{ background: 'var(--cb-surface)', border: '1px solid var(--cb-line)', height: 28 }}
                                                    >
                                                        {b.title || 'Untitled'}
                                                    </span>
                                                ))}
                                                <span className="cb-small cb-muted">{buttons.length} of 3 buttons</span>
                                            </div>
                                        )}

                                        {n.outputs.length > 0 ? (
                                            <div className="cb-paths">
                                                {n.outputs.map((o) => {
                                                    const target = o.to ? graph.nodes.find((x) => x.id === o.to) : null;
                                                    const otherSection =
                                                        target && (target as NodeWithSection).section !== n.section
                                                            ? sectionName((target as NodeWithSection).section)
                                                            : undefined;
                                                    const label = pathLabel(n, o);

                                                    return (
                                                        <div key={o.id} className="cb-pathrow">
                                                            {pathPlus(n, o, label)}
                                                            <span
                                                                className="cb-lbl"
                                                                style={o.id === 'else' || o.id === 'fallback' ? { color: 'var(--cb-warn-i)' } : undefined}
                                                            >
                                                                {label}
                                                            </span>
                                                            <span aria-hidden>→</span>
                                                            {target ? (
                                                                <>
                                                                    <button type="button" className="cb-link cb-to" onClick={() => onSelect(target.id)}>
                                                                        {target.title}
                                                                    </button>
                                                                    {otherSection && <span className="cb-small cb-muted">in {otherSection}</span>}
                                                                </>
                                                            ) : (
                                                                <select
                                                                    className="cb-in"
                                                                    style={{ width: 'auto', height: 32, minHeight: 32, borderColor: '#e9a59b' }}
                                                                    value=""
                                                                    disabled={readOnly}
                                                                    aria-label={`Next step: ${label}`}
                                                                    onChange={(e) => e.target.value && onConnect(n.id, o.id, e.target.value)}
                                                                >
                                                                    <option value="">Not connected · choose a step</option>
                                                                    {order
                                                                        .filter((x) => x.type !== 'start' && x.id !== n.id)
                                                                        .map((x) => (
                                                                            <option key={x.id} value={x.id}>
                                                                                {x.title}
                                                                            </option>
                                                                        ))}
                                                                </select>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="cb-small cb-muted">
                                                {n.type === 'handoff' ? 'The chat goes to your team here.' : 'The conversation ends here.'}
                                            </p>
                                        )}
                                    </article>
                                );
                            })}
                    </section>
                );
            })}
        </div>
    );
}
