'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
    ArrowLeftIcon,
    BarChart3Icon,
    CheckCircle2Icon,
    CircleAlertIcon,
    HistoryIcon,
    Loader2Icon,
    PlayIcon,
    Redo2Icon,
    RocketIcon,
    SettingsIcon,
    TriangleAlertIcon,
    Undo2Icon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ApiError, errorMessage } from '@/lib/api';
import {
    activateChatbot,
    type ChatbotFlowDetail,
    chatbotKeys,
    type FlowGraph,
    type FlowIssue,
    type FlowNode,
    type FlowSettings,
    NODE_KINDS,
    newNode,
    newNodeId,
    type NodeConfig,
    type NodeType,
    openBranches,
    publishChatbot,
    restoreChatbotVersion,
    saveChatbot,
    useChatbot,
    useChatbotAnalytics,
    useChatbotOptions,
    withOutputs,
} from '@/lib/chatbots';
import { cn } from '@/lib/utils';

import { FlowCanvas, PALETTE_MIME } from './flow-canvas';
import { FlowSettingsDialog } from './flow-settings-dialog';
import { NodeInspector } from './node-inspector';
import { TestChat } from './test-chat';

const NO_NUMBER = '__none__';

export function FlowBuilder({ flowId }: { flowId: string }) {
    const qc = useQueryClient();
    const flow = useChatbot(flowId);
    const options = useChatbotOptions();
    const [loaded, setLoaded] = useState<string | null>(null);
    const [graph, setGraph] = useState<FlowGraph | null>(null);
    const [settings, setSettings] = useState<FlowSettings | null>(null);
    const [name, setName] = useState('');
    const [issues, setIssues] = useState<FlowIssue[]>([]);
    const [past, setPast] = useState<FlowGraph[]>([]);
    const [future, setFuture] = useState<FlowGraph[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState<'idle' | 'saving' | 'error'>('idle');
    const [testing, setTesting] = useState(false);
    const [testNode, setTestNode] = useState<string | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [showStats, setShowStats] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [replace, setReplace] = useState<{ name: string } | null>(null);
    const [restore, setRestore] = useState<number | null>(null);
    const lastKey = useRef<{ key: string; at: number } | null>(null);
    const clock = useRef(Date.now); // read only in event handlers (undo grouping)
    const analytics = useChatbotAnalytics(flowId, 30, showStats);

    const data = flow.data;
    // Load the flow once into local editing state (adjusting state while rendering, not in an effect).
    if (data && loaded !== data.id) {
        setLoaded(data.id);
        setGraph(data.draft);
        setSettings(data.settings);
        setName(data.name);
        setIssues(data.issues);
        setPast([]);
        setFuture([]);
    }

    const readOnly = !(data?.can.manage ?? false);
    const problems = useMemo(() => {
        const map = new Map<string, 'error' | 'warning'>();
        for (const i of issues) if (i.node_id && map.get(i.node_id) !== 'error') map.set(i.node_id, i.level);
        if (graph) for (const id of openBranches(graph)) map.set(id, 'error');

        return map;
    }, [issues, graph]);
    const errors = issues.filter((i) => i.level === 'error');

    const updateCache = (detail: ChatbotFlowDetail) => {
        qc.setQueryData(chatbotKeys.flow(flowId), detail);
        void qc.invalidateQueries({ queryKey: chatbotKeys.all, exact: true });
    };

    // ── Editing with undo ───────────────────────────────────────────────────────────────────
    const change = (next: FlowGraph, key?: string) => {
        if (!graph || readOnly) return;
        const now = clock.current();
        const coalesce = key !== undefined && lastKey.current?.key === key && (key.startsWith('move:') || now - lastKey.current.at < 1500);
        if (!coalesce) setPast((p) => [...p.slice(-49), graph]);
        lastKey.current = key ? { key, at: now } : null;
        setFuture([]);
        setGraph(next);
        setDirty(true);
    };
    const updateNode = (id: string, fn: (n: FlowNode) => FlowNode, key?: string) =>
        graph && change({ nodes: graph.nodes.map((n) => (n.id === id ? fn(n) : n)) }, key);
    const undo = () => {
        if (!graph || past.length === 0) return;
        setFuture((f) => [graph, ...f].slice(0, 50));
        setGraph(past[past.length - 1]);
        setPast((p) => p.slice(0, -1));
        lastKey.current = null;
        setDirty(true);
    };
    const redo = () => {
        if (!graph || future.length === 0) return;
        setPast((p) => [...p, graph]);
        setGraph(future[0]);
        setFuture((f) => f.slice(1));
        lastKey.current = null;
        setDirty(true);
    };
    const addNode = (type: NodeType, x?: number, y?: number) => {
        if (!graph) return;
        const anchor = graph.nodes.find((n) => n.id === selected) ?? graph.nodes[graph.nodes.length - 1];
        let px = x ?? (anchor ? anchor.x : 80);
        const py = y ?? (anchor ? anchor.y + 200 : 80);
        if (x === undefined) {
            // Clicked in the palette: below the selected block, moved right until it overlaps nothing.
            const overlaps = (cx: number) => graph.nodes.some((n) => Math.abs(n.x - cx) < 240 && Math.abs(n.y - py) < 170);
            for (let i = 0; i < 12 && overlaps(px); i++) px += 250;
        }
        const node = newNode(type, px, py);
        change({ nodes: [...graph.nodes, node] });
        setSelected(node.id);
    };
    const deleteNode = (id: string) => {
        if (!graph) return;
        const node = graph.nodes.find((n) => n.id === id);
        if (!node || node.type === 'start') return;
        change({ nodes: graph.nodes.filter((n) => n.id !== id).map((n) => ({ ...n, outputs: n.outputs.map((o) => (o.to === id ? { ...o, to: null } : o)) })) });
        setSelected(null);
    };
    const duplicateNode = (id: string) => {
        const node = graph?.nodes.find((n) => n.id === id);
        if (!graph || !node || node.type === 'start') return;
        const copy: FlowNode = { ...structuredClone(node), id: newNodeId(node.type), title: `${node.title} copy`.slice(0, 60), x: node.x + 36, y: node.y + 36 };
        copy.outputs = copy.outputs.map((o) => ({ ...o, to: null }));
        change({ nodes: [...graph.nodes, copy] });
        setSelected(copy.id);
    };

    // ── Autosave ────────────────────────────────────────────────────────────────────────────
    const save = async (): Promise<boolean> => {
        if (!graph || !settings || readOnly) return true;
        setSaving('saving');
        setDirty(false);
        try {
            const detail = await saveChatbot(flowId, { draft: graph, settings, name: name.trim() || 'Untitled bot' });
            setIssues(detail.issues);
            updateCache({ ...detail, draft: graph }); // keep local edits made while saving
            setSaving('idle');

            return true;
        } catch (e) {
            setDirty(true);
            setSaving('error');
            toast.error(`Not saved: ${errorMessage(e)}`);

            return false;
        }
    };
    const autosave = useEffectEvent(() => void save());
    useEffect(() => {
        if (!dirty || saving === 'saving') return;
        const t = setTimeout(autosave, 900);

        return () => clearTimeout(t);
    }, [dirty, graph, settings, name, saving]);

    // ── Keyboard ────────────────────────────────────────────────────────────────────────────
    const onKey = useEffectEvent((e: KeyboardEvent) => {
        const t = e.target as HTMLElement | null;
        if (t && t.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="listbox"]') !== null) return;
        const mod = e.ctrlKey || e.metaKey;
        if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
            e.preventDefault();
            deleteNode(selected);
        } else if (mod && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
        } else if (mod && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            redo();
        } else if (mod && e.key.toLowerCase() === 'd' && selected) {
            e.preventDefault();
            duplicateNode(selected);
        } else if (e.key === 'Escape') {
            setSelected(null);
        }
    });
    useEffect(() => {
        const handler = (e: KeyboardEvent) => onKey(e);
        window.addEventListener('keydown', handler);

        return () => window.removeEventListener('keydown', handler);
    }, []);

    // Leaving with unsaved edits: the browser asks first.
    useEffect(() => {
        if (!dirty) return;
        const warn = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener('beforeunload', warn);

        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    // ── Publish / go live ───────────────────────────────────────────────────────────────────
    const publish = async () => {
        setPublishing(true);
        try {
            if (dirty && !(await save())) return;
            const detail = await publishChatbot(flowId);
            updateCache({ ...detail, draft: graph ?? detail.draft });
            setIssues(detail.issues);
            toast.success(`Version ${detail.published_version} published${detail.is_active ? ': it is live now' : '. Switch it on to go live.'}`);
        } catch (e) {
            if (e instanceof ApiError && Array.isArray(e.details?.issues)) {
                setIssues(e.details?.issues as FlowIssue[]);
                setSelected(null);
                toast.error('Fix the problems listed on the right before publishing.');
            } else {
                toast.error(errorMessage(e));
            }
        } finally {
            setPublishing(false);
        }
    };

    const setLive = async (active: boolean, replaceOther = false) => {
        try {
            const detail = await activateChatbot(flowId, active, replaceOther);
            updateCache({ ...detail, draft: graph ?? detail.draft });
            toast.success(active ? 'The bot is live on this number' : 'The bot is switched off');
        } catch (e) {
            if (e instanceof ApiError && e.status === 409) {
                const other = (e.details?.active_flow as { name?: string } | undefined)?.name ?? 'Another bot';
                setReplace({ name: other });
            } else {
                toast.error(errorMessage(e));
            }
        }
    };

    if (flow.isError) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <p className="text-[15px] font-semibold">This bot could not be opened.</p>
                <Button asChild variant="outline">
                    <Link href="/chatbots">Back to Chatbots</Link>
                </Button>
            </div>
        );
    }
    if (!data || !graph || !settings) {
        return (
            <div className="flex flex-1 flex-col gap-3 p-6">
                <Skeleton className="h-10 w-80" />
                <Skeleton className="h-[60vh] w-full" />
            </div>
        );
    }

    const node = graph.nodes.find((n) => n.id === selected) ?? null;
    const numbers = options.data?.numbers ?? [];

    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* Top bar */}
            <div className="flex flex-wrap items-center gap-2 border-b bg-card px-3 py-2">
                <Button asChild variant="ghost" size="icon-sm" aria-label="Back to Chatbots">
                    <Link href="/chatbots">
                        <ArrowLeftIcon />
                    </Link>
                </Button>
                <Input
                    value={name}
                    onChange={(e) => {
                        setName(e.target.value.slice(0, 120));
                        setDirty(true);
                    }}
                    disabled={readOnly}
                    className="h-8 w-56 font-semibold"
                    aria-label="Bot name"
                />
                <Select
                    value={data.phone_number_id ?? NO_NUMBER}
                    disabled={readOnly || data.is_active}
                    onValueChange={async (v) => {
                        try {
                            updateCache({ ...(await saveChatbot(flowId, { phone_number_id: v === NO_NUMBER ? null : v })), draft: graph });
                        } catch (e) {
                            toast.error(errorMessage(e));
                        }
                    }}
                >
                    <SelectTrigger
                        size="sm"
                        className="w-56"
                        aria-label="WhatsApp number"
                        title={data.is_active ? 'Switch the bot off to move it to another number.' : undefined}
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={NO_NUMBER}>No number yet</SelectItem>
                        {numbers.map((n) => (
                            <SelectItem key={n.id} value={n.id}>
                                {n.verified_name ?? n.display_phone_number} {n.verified_name ? `· ${n.display_phone_number}` : ''}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Badge tone={data.status === 'live' ? 'good' : data.status === 'paused' ? 'grey' : 'warn'} dot>
                    {data.status === 'live' ? `Live · v${data.published_version}` : data.status === 'paused' ? `Off · v${data.published_version}` : 'Draft'}
                </Badge>
                {data.published_version !== null && data.has_unpublished_changes && <Badge tone="info">Unpublished changes</Badge>}
                <span className="text-[11.5px] text-muted-foreground" aria-live="polite">
                    {readOnly ? 'View only' : saving === 'saving' ? 'Saving…' : saving === 'error' ? 'Not saved' : dirty ? 'Unsaved' : 'Saved'}
                </span>

                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                    {!readOnly && (
                        <>
                            <Button variant="ghost" size="icon-sm" onClick={undo} disabled={past.length === 0} aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)">
                                <Undo2Icon />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={redo}
                                disabled={future.length === 0}
                                aria-label="Redo (Ctrl+Shift+Z)"
                                title="Redo (Ctrl+Shift+Z)"
                            >
                                <Redo2Icon />
                            </Button>
                        </>
                    )}
                    <Button variant={showStats ? 'secondary' : 'ghost'} size="sm" onClick={() => setShowStats((v) => !v)} aria-pressed={showStats}>
                        <BarChart3Icon /> Funnel
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
                        <SettingsIcon /> Settings
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void save().then(() => setTesting(true))}>
                        <PlayIcon /> Test
                    </Button>
                    {!readOnly && (
                        <Button size="sm" onClick={publish} disabled={publishing}>
                            {publishing ? <Loader2Icon className="animate-spin" /> : <RocketIcon />} Publish
                        </Button>
                    )}
                    {!readOnly && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <label className="flex items-center gap-2 rounded-md border px-2.5 py-1 text-[12.5px] font-semibold">
                                    Live
                                    <Switch
                                        checked={data.is_active}
                                        onCheckedChange={(v) => void setLive(v)}
                                        disabled={data.published_version === null || !data.phone_number_id}
                                    />
                                </label>
                            </TooltipTrigger>
                            <TooltipContent>
                                {data.published_version === null
                                    ? 'Publish the flow first.'
                                    : !data.phone_number_id
                                      ? 'Choose a WhatsApp number first.'
                                      : 'Answer customers on this number with the published version.'}
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
            </div>

            <div className="flex min-h-0 flex-1">
                {/* Palette */}
                {!readOnly && (
                    <aside className="hidden w-48 shrink-0 overflow-y-auto border-r bg-card px-3 py-3 md:block" aria-label="Blocks">
                        {(['Content', 'Logic', 'Exit'] as const).map((group) => (
                            <div key={group} className="mb-4">
                                <p className="mb-2 text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">{group}</p>
                                {NODE_KINDS.filter((k) => k.group === group).map((k) => (
                                    <button
                                        key={k.type}
                                        draggable
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData(PALETTE_MIME, k.type);
                                            e.dataTransfer.effectAllowed = 'copy';
                                        }}
                                        onClick={() => addNode(k.type)}
                                        title={`${k.blurb} — drag onto the canvas, or click to add`}
                                        className="mb-1.5 flex w-full cursor-grab items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[12.5px] hover:border-brand-500/60 hover:bg-brand-50"
                                    >
                                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-[13px]" aria-hidden>
                                            {k.icon}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block font-medium">{k.label}</span>
                                            <span className="block truncate text-[10.5px] text-muted-foreground">{k.blurb}</span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        ))}
                    </aside>
                )}

                <FlowCanvas
                    graph={graph}
                    selectedId={selected ?? testNode}
                    onSelect={setSelected}
                    onMove={(id, x, y) => updateNode(id, (n) => ({ ...n, x, y }), `move:${id}`)}
                    onMoveEnd={() => {
                        lastKey.current = null;
                    }}
                    onConnect={(from, output, to) => updateNode(from, (n) => ({ ...n, outputs: n.outputs.map((o) => (o.id === output ? { ...o, to } : o)) }))}
                    onDropNode={(type, x, y) => addNode(type, x, y)}
                    problems={problems}
                    analytics={showStats ? (analytics.data ?? null) : null}
                    readOnly={readOnly}
                />

                {/* Inspector */}
                <aside className="flex w-[320px] shrink-0 flex-col border-l bg-card max-lg:w-[280px]" aria-label="Block settings">
                    {node ? (
                        <NodeInspector
                            key={node.id}
                            node={node}
                            graph={graph}
                            options={options.data}
                            issues={issues}
                            readOnly={readOnly}
                            onTitle={(title) => updateNode(node.id, (n) => ({ ...n, title }), `title:${node.id}`)}
                            onConfig={(config: NodeConfig) => updateNode(node.id, (n) => withOutputs({ ...n, config }), `config:${node.id}`)}
                            onDelete={() => deleteNode(node.id)}
                            onDuplicate={() => duplicateNode(node.id)}
                            onSelect={setSelected}
                        />
                    ) : (
                        <Overview
                            detail={data}
                            graph={graph}
                            issues={issues}
                            errors={errors}
                            analytics={showStats ? (analytics.data ?? null) : null}
                            readOnly={readOnly}
                            onSelect={setSelected}
                            onRestore={setRestore}
                        />
                    )}
                </aside>
            </div>

            {testing && <TestChat flowId={flowId} onClose={() => setTesting(false)} onNode={setTestNode} />}

            <FlowSettingsDialog
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                settings={settings}
                tags={options.data?.tags ?? []}
                readOnly={readOnly}
                onSave={(next) => {
                    setSettings(next);
                    setDirty(true);
                }}
            />

            <AlertDialog open={replace !== null} onOpenChange={(o) => !o && setReplace(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Replace the live bot on this number?</AlertDialogTitle>
                        <AlertDialogDescription>
                            “{replace?.name}” is live on this number. Only one bot answers per number, so it will be switched off and its running conversations
                            stop.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                setReplace(null);
                                void setLive(true, true);
                            }}
                        >
                            Switch this bot on
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={restore !== null} onOpenChange={(o) => !o && setRestore(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Roll back to version {restore}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Version {restore} becomes your draft and is published again as a new version{data.is_active ? ', live straight away' : ''}. Your
                            current draft is replaced. Customers already in a conversation finish on the version they started with.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                const v = restore;
                                setRestore(null);
                                if (v === null) return;
                                try {
                                    const detail = await restoreChatbotVersion(flowId, v);
                                    qc.setQueryData(chatbotKeys.flow(flowId), detail);
                                    setLoaded(null); // reload the editor with the restored draft
                                    toast.success(`Rolled back to version ${v}`);
                                } catch (e) {
                                    toast.error(errorMessage(e));
                                }
                            }}
                        >
                            Roll back
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function Overview({
    detail,
    graph,
    issues,
    errors,
    analytics,
    readOnly,
    onSelect,
    onRestore,
}: {
    detail: ChatbotFlowDetail;
    graph: FlowGraph;
    issues: FlowIssue[];
    errors: FlowIssue[];
    analytics: import('@/lib/chatbots').ChatbotAnalytics | null;
    readOnly: boolean;
    onSelect: (id: string) => void;
    onRestore: (v: number) => void;
}) {
    const warnings = issues.filter((i) => i.level === 'warning');
    const open = openBranches(graph).size;

    return (
        <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="border-b px-4 py-3">
                <p className="text-[14px] font-semibold">Flow overview</p>
                <p className="text-[12px] text-muted-foreground">Click a block to edit it. Drag blocks in from the left and connect their ● ports.</p>
            </div>
            <div className="space-y-5 px-4 py-4">
                <section>
                    <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Publish checks</p>
                    <ul className="space-y-1 text-[12.5px]">
                        <li className="flex items-center gap-2">
                            <CheckCircle2Icon className="size-4 text-good" /> {graph.nodes.length} blocks
                        </li>
                        <li className="flex items-center gap-2">
                            {open === 0 ? <CheckCircle2Icon className="size-4 text-good" /> : <CircleAlertIcon className="size-4 text-bad" />}
                            {open === 0 ? 'Every branch has a next step' : `${open} block(s) with an unconnected branch`}
                        </li>
                        <li className="flex items-center gap-2">
                            {graph.nodes.some((n) => n.type === 'handoff') ? (
                                <CheckCircle2Icon className="size-4 text-good" />
                            ) : (
                                <CircleAlertIcon className="size-4 text-bad" />
                            )}
                            A person is always reachable (Handoff)
                        </li>
                    </ul>
                    {errors.length === 0 && warnings.length === 0 ? (
                        <p className="mt-2 rounded-md bg-good-bg px-3 py-2 text-[12px] text-good">Ready to publish.</p>
                    ) : (
                        <div className="mt-2 space-y-1.5">
                            {[...errors, ...warnings].map((i, n) => (
                                <button
                                    key={n}
                                    onClick={() => i.node_id && onSelect(i.node_id)}
                                    className={cn(
                                        'flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left text-[12px]',
                                        i.level === 'error' ? 'bg-bad-bg text-bad' : 'bg-warn-bg text-warn',
                                        i.node_id && 'hover:underline',
                                    )}
                                >
                                    {i.level === 'error' ? (
                                        <CircleAlertIcon className="mt-px size-3.5 shrink-0" />
                                    ) : (
                                        <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
                                    )}
                                    {i.message}
                                </button>
                            ))}
                        </div>
                    )}
                    <p className="mt-2 text-[11.5px] text-muted-foreground">Publishing is blocked until every error is fixed.</p>
                </section>

                {analytics && (
                    <section>
                        <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Last {analytics.days} days</p>
                        <div className="grid grid-cols-2 gap-2 text-[12px]">
                            {(
                                [
                                    ['Started', analytics.sessions.started],
                                    ['Running now', analytics.sessions.running],
                                    ['Completed', analytics.sessions.completed],
                                    ['Handed off', analytics.sessions.handed_off],
                                    ['Abandoned', analytics.sessions.abandoned],
                                    ['Finished rate', analytics.sessions.completion_rate === null ? '—' : `${analytics.sessions.completion_rate}%`],
                                ] as [string, number | string][]
                            ).map(([l, v]) => (
                                <div key={l} className="rounded-md bg-muted px-2.5 py-2">
                                    <p className="text-[11px] text-muted-foreground">{l}</p>
                                    <p className="text-[15px] font-semibold tabular-nums">{v}</p>
                                </div>
                            ))}
                        </div>
                        <p className="mt-2 text-[11.5px] text-muted-foreground">Each block shows how many customers reached it and how many left there.</p>
                    </section>
                )}

                <section>
                    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                        <HistoryIcon className="size-3.5" /> Versions
                    </p>
                    {detail.versions.length === 0 ? (
                        <p className="text-[12px] text-muted-foreground">Not published yet. Publishing saves a version you can roll back to.</p>
                    ) : (
                        <ul className="divide-y rounded-md border text-[12.5px]">
                            {detail.versions.map((v) => (
                                <li key={v.version} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                                    <span>
                                        v{v.version}
                                        {v.version === detail.published_version && (
                                            <Badge tone="good" className="ml-1.5">
                                                current
                                            </Badge>
                                        )}
                                        <span className="block text-[11px] text-muted-foreground">
                                            {v.created_at ? new Date(v.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                                        </span>
                                    </span>
                                    {!readOnly && v.version !== detail.published_version && (
                                        <Button variant="ghost" size="sm" onClick={() => onRestore(v.version)}>
                                            Roll back
                                        </Button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section className="rounded-md bg-muted px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-2">
                    <p className="font-semibold">How the bot works with your inbox</p>
                    <p className="mt-1">
                        Every customer message lands in the Team Inbox straight away, and the bot answers alongside it. Agents see the conversation as “Bot” and
                        can take over at any moment; the bot never sends another message once a person has replied.
                    </p>
                </section>
            </div>
        </div>
    );
}
