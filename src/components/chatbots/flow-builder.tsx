'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
    ArrowLeftIcon,
    BarChart3Icon,
    BotIcon,
    CheckCircle2Icon,
    ChevronDownIcon,
    CircleAlertIcon,
    ClipboardCheckIcon,
    CopyIcon,
    Grid3x3Icon,
    HistoryIcon,
    LayoutDashboardIcon,
    Loader2Icon,
    PanelLeftCloseIcon,
    PanelLeftOpenIcon,
    PlayIcon,
    Redo2Icon,
    RocketIcon,
    SettingsIcon,
    Trash2Icon,
    TriangleAlertIcon,
    Undo2Icon,
    WandSparklesIcon,
    WorkflowIcon,
    XIcon,
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ApiError, errorMessage } from '@/lib/api';
import {
    activateChatbot,
    CARD_WIDTH,
    type ChatbotAnalytics,
    type ChatbotFlowDetail,
    chatbotKeys,
    COLUMN_GAP,
    type FlowGraph,
    type FlowIssue,
    type FlowNode,
    type FlowSettings,
    newNode,
    newNodeId,
    type NodeConfig,
    type NodeType,
    openPorts as findOpenPorts,
    publishChatbot,
    restoreChatbotVersion,
    reviewChatbot,
    RTL,
    saveChatbot,
    setChatbotWebhook,
    snap,
    tidy,
    useChatbot,
    useChatbotAnalytics,
    useChatbotComments,
    useChatbotHistory,
    useChatbotOptions,
    withOutputs,
} from '@/lib/chatbots';
import { cn } from '@/lib/utils';

import { BlockList } from './block-picker';
import { type CanvasApi, FlowCanvas } from './flow-canvas';
import { FlowSettingsDialog } from './flow-settings-dialog';
import { NodeInspector } from './node-inspector';
import { TestChat } from './test-chat';

const NO_NUMBER = '__none__';
const CLIPBOARD = 'engage.chatbot.clipboard';

const ACTIONS: Record<string, string> = {
    'chatbot.created': 'Created',
    'chatbot.published': 'Published',
    'chatbot.activated': 'Switched on',
    'chatbot.deactivated': 'Switched off',
    'chatbot.version_restored': 'Rolled back',
    'chatbot.archived': 'Archived',
    'chatbot.unarchived': 'Restored from the archive',
    'chatbot.scheduled': 'Scheduled',
    'chatbot.exported': 'Exported',
    'chatbot.imported': 'Imported',
    'chatbot.review_request': 'Asked for a review',
    'chatbot.review_approve': 'Approved',
    'chatbot.review_changes': 'Asked for changes',
    'chatbot.review_cancel': 'Cancelled the review',
    'chatbot.webhook_created': 'Created the webhook URL',
    'chatbot.webhook_removed': 'Removed the webhook URL',
};

/** The full-screen flow builder: palette · canvas · block settings, with test, review and publish. */
export function FlowBuilder({ flowId }: { flowId: string }) {
    const qc = useQueryClient();
    const flow = useChatbot(flowId);
    const options = useChatbotOptions();
    const comments = useChatbotComments(flowId);
    const [loaded, setLoaded] = useState<string | null>(null);
    const [graph, setGraph] = useState<FlowGraph | null>(null);
    const [settings, setSettings] = useState<FlowSettings | null>(null);
    const [name, setName] = useState('');
    const [issues, setIssues] = useState<FlowIssue[]>([]);
    const [past, setPast] = useState<FlowGraph[]>([]);
    const [future, setFuture] = useState<FlowGraph[]>([]);
    const [selection, setSelection] = useState<Set<string>>(new Set());
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState<'idle' | 'saving' | 'error'>('idle');
    const [testing, setTesting] = useState(false);
    const [testNode, setTestNode] = useState<string | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [showStats, setShowStats] = useState(false);
    const [showIssues, setShowIssues] = useState(false);
    const [palette, setPalette] = useState(true);
    const [snapOn, setSnapOn] = useState(true);
    const [publishing, setPublishing] = useState(false);
    const [replace, setReplace] = useState<{ name: string } | null>(null);
    const [restore, setRestore] = useState<number | null>(null);
    const [reviewOpen, setReviewOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const lastKey = useRef<{ key: string; at: number } | null>(null);
    const clock = useRef(Date.now); // read only in event handlers (undo grouping)
    const canvas = useRef<CanvasApi | null>(null);
    const clipboard = useRef<FlowNode[]>([]);
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

    const readOnly = !(data?.can.edit ?? false);
    const ports = useMemo(() => (graph ? findOpenPorts(graph) : new Map<string, Set<string>>()), [graph]);
    const clientIssues: FlowIssue[] = useMemo(() => {
        if (!graph) return [];
        const known = new Set(issues.filter((i) => i.code === 'unconnected').map((i) => `${i.node_id}:${i.output_id}`));
        const out: FlowIssue[] = [];
        for (const n of graph.nodes) {
            for (const o of n.outputs) {
                if (ports.get(n.id)?.has(o.id) && !known.has(`${n.id}:${o.id}`)) {
                    out.push({
                        level: 'error',
                        code: 'unconnected',
                        node_id: n.id,
                        output_id: o.id,
                        message: `“${n.title}”: the “${o.label}” branch goes nowhere.`,
                        fix: 'Drag from its dot to the next block, or click + on it to add one.',
                    });
                }
            }
        }

        return out;
    }, [graph, ports, issues]);
    const allIssues = useMemo(() => {
        // Server checks lag a save behind: drop "goes nowhere" errors for branches that are connected now.
        const fresh = issues.filter((i) => !(i.code === 'unconnected' && i.node_id && i.output_id && !ports.get(i.node_id)?.has(i.output_id)));

        return [...fresh, ...clientIssues];
    }, [issues, clientIssues, ports]);
    const errors = allIssues.filter((i) => i.level === 'error');
    const warnings = allIssues.filter((i) => i.level === 'warning');

    const updateCache = (detail: ChatbotFlowDetail) => {
        qc.setQueryData(chatbotKeys.flow(flowId), detail);
        void qc.invalidateQueries({ queryKey: ['chatbots', 'list'] });
    };

    // ── Editing with undo ───────────────────────────────────────────────────────────────────
    const change = (next: FlowGraph, key?: string) => {
        if (!graph || readOnly) return;
        const now = clock.current();
        const coalesce = key !== undefined && lastKey.current?.key === key && (key.startsWith('move:') || now - lastKey.current.at < 1500);
        if (!coalesce) setPast((p) => [...p.slice(-79), graph]);
        lastKey.current = key ? { key, at: now } : null;
        setFuture([]);
        setGraph(next);
        setDirty(true);
    };
    const updateNode = (id: string, fn: (n: FlowNode) => FlowNode, key?: string) =>
        graph && change({ nodes: graph.nodes.map((n) => (n.id === id ? fn(n) : n)) }, key);
    const connect = (from: string, output: string, to: string | null) =>
        updateNode(from, (n) => ({ ...n, outputs: n.outputs.map((o) => (o.id === output ? { ...o, to } : o)) }));
    const undo = () => {
        if (!graph || past.length === 0) return;
        setFuture((f) => [graph, ...f].slice(0, 80));
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
    const select = (ids: string[], mode: 'replace' | 'toggle' | 'add' = 'replace') =>
        setSelection((cur) => {
            if (mode === 'replace') return new Set(ids);
            const next = new Set(cur);
            for (const id of ids) {
                if (mode === 'toggle' && next.has(id)) next.delete(id);
                else next.add(id);
            }

            return next;
        });

    /** Adds a block. With a source (the "+" on a branch, or the selected block), it is placed to its right and connected. */
    const addNode = (type: NodeType, at?: { x: number; y: number }, from?: { node: string; output: string | null }) => {
        if (!graph) return;
        const source = from ? graph.nodes.find((n) => n.id === from.node) : undefined;
        const output = source ? (from?.output ?? source.outputs.find((o) => !o.to)?.id ?? null) : null;
        let x = at?.x;
        let y = at?.y;
        if (x === undefined || y === undefined) {
            if (source) {
                const index = Math.max(
                    0,
                    source.outputs.findIndex((o) => o.id === output),
                );
                x = source.x + CARD_WIDTH + COLUMN_GAP;
                y = source.y + index * 60;
            } else {
                const mid = canvas.current?.middle() ?? { x: 200, y: 120 };
                x = mid.x;
                y = mid.y;
            }
            // Never on top of another block (measured heights, with a gap).
            const hs = canvas.current?.heights() ?? new Map<string, number>();
            const clash = (cy: number) =>
                graph.nodes.find((n) => Math.abs(n.x - (x as number)) < CARD_WIDTH + 20 && cy < n.y + (hs.get(n.id) ?? 200) + 30 && cy + 220 > n.y);
            for (let i = 0, hit = clash(y); i < 40 && hit; i++, hit = clash(y)) y = hit.y + (hs.get(hit.id) ?? 200) + 40;
        }
        const node = newNode(type, snap(x, snapOn), snap(y, snapOn));
        const nodes = [...graph.nodes, node].map((n) =>
            source && output && n.id === source.id ? { ...n, outputs: n.outputs.map((o) => (o.id === output ? { ...o, to: node.id } : o)) } : n,
        );
        change({ nodes });
        setSelection(new Set([node.id]));
        if (source && output) toast.success(`Added after “${source.outputs.find((o) => o.id === output)?.label}”`, { duration: 1500 });
    };
    const selectedSingle = selection.size === 1 ? [...selection][0] : null;
    const paletteAdd = (type: NodeType, at?: { x: number; y: number }) => {
        // Auto-connect to the selected block's first open branch.
        const sel = selectedSingle ? graph?.nodes.find((n) => n.id === selectedSingle) : undefined;
        const open = sel?.outputs.find((o) => !o.to);
        addNode(type, at, sel && open ? { node: sel.id, output: open.id } : undefined);
    };
    const deleteNodes = (ids: string[]) => {
        if (!graph) return;
        const gone = new Set(ids.filter((id) => graph.nodes.find((n) => n.id === id)?.type !== 'start'));
        if (gone.size === 0) return;
        change({
            nodes: graph.nodes
                .filter((n) => !gone.has(n.id))
                .map((n) => ({ ...n, outputs: n.outputs.map((o) => (o.to && gone.has(o.to) ? { ...o, to: null } : o)) })),
        });
        setSelection(new Set());
    };
    const cloneNodes = (nodes: FlowNode[], dx: number, dy: number): FlowNode[] => {
        const ids = new Map(nodes.map((n) => [n.id, newNodeId(n.type)]));

        return nodes
            .filter((n) => n.type !== 'start')
            .map((n) => ({
                ...structuredClone(n),
                id: ids.get(n.id) as string,
                x: n.x + dx,
                y: n.y + dy,
                outputs: n.outputs.map((o) => ({ ...o, to: o.to && ids.has(o.to) ? (ids.get(o.to) as string) : null })),
            }));
    };
    const duplicate = (ids: string[]) => {
        if (!graph) return;
        const copies = cloneNodes(
            graph.nodes.filter((n) => ids.includes(n.id)),
            40,
            40,
        );
        if (copies.length === 0) return;
        change({ nodes: [...graph.nodes, ...copies] });
        setSelection(new Set(copies.map((n) => n.id)));
    };
    const copy = () => {
        if (!graph || selection.size === 0) return;
        const nodes = graph.nodes.filter((n) => selection.has(n.id) && n.type !== 'start');
        try {
            localStorage.setItem(CLIPBOARD, JSON.stringify(nodes));
        } catch {
            /* storage unavailable: copy only within this page */
        }
        clipboard.current = nodes;
        toast.success(`${nodes.length} block${nodes.length === 1 ? '' : 's'} copied`, { duration: 1200 });
    };
    const paste = () => {
        if (!graph) return;
        let nodes = clipboard.current;
        try {
            const stored = JSON.parse(localStorage.getItem(CLIPBOARD) ?? 'null');
            if (Array.isArray(stored) && stored.length) nodes = stored as FlowNode[];
        } catch {
            /* use the in-page copy */
        }
        if (nodes.length === 0) return;
        const copies = cloneNodes(nodes, 60, 60);
        change({ nodes: [...graph.nodes, ...copies] });
        setSelection(new Set(copies.map((n) => n.id)));
    };
    const tidyUp = () => {
        if (!graph) return;
        change(tidy(graph, canvas.current?.heights() ?? new Map()));
        requestAnimationFrame(() => canvas.current?.fit());
    };
    const jumpTo = (id: string) => {
        setSelection(new Set([id]));
        canvas.current?.center(id);
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
        const t = setTimeout(autosave, 800);

        return () => clearTimeout(t);
    }, [dirty, graph, settings, name, saving]);

    // ── Keyboard ────────────────────────────────────────────────────────────────────────────
    const onKey = useEffectEvent((e: KeyboardEvent) => {
        const t = e.target as HTMLElement | null;
        if (t && t.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="listbox"], [role="menu"]') !== null) return;
        const mod = e.ctrlKey || e.metaKey;
        const k = e.key.toLowerCase();
        if ((e.key === 'Delete' || e.key === 'Backspace') && selection.size > 0 && !readOnly) {
            e.preventDefault();
            deleteNodes([...selection]);
        } else if (mod && k === 'z') {
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
        } else if (mod && k === 'y') {
            e.preventDefault();
            redo();
        } else if (mod && k === 'd' && selection.size > 0) {
            e.preventDefault();
            duplicate([...selection]);
        } else if (mod && k === 'c' && selection.size > 0) {
            copy();
        } else if (mod && k === 'v' && !readOnly) {
            e.preventDefault();
            paste();
        } else if (mod && k === 'a' && graph) {
            e.preventDefault();
            setSelection(new Set(graph.nodes.map((n) => n.id)));
        } else if (!mod && k === 'f') {
            canvas.current?.fit();
        } else if (e.key === 'Escape') {
            setSelection(new Set());
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
    const publish = async (thenLive = false) => {
        setPublishing(true);
        try {
            if (dirty && !(await save())) return;
            const detail = await publishChatbot(flowId);
            updateCache({ ...detail, draft: graph ?? detail.draft });
            setIssues(detail.issues);
            if (thenLive && !detail.is_active) {
                await setLive(true);
            } else {
                toast.success(`Version ${detail.published_version} published${detail.is_active ? ' — it is live now' : '. Switch it on to go live.'}`);
            }
        } catch (e) {
            if (e instanceof ApiError && Array.isArray(e.details?.issues)) {
                setIssues(e.details?.issues as FlowIssue[]);
                setShowIssues(true);
                const first = (e.details?.issues as FlowIssue[]).find((i) => i.level === 'error' && i.node_id);
                if (first?.node_id) jumpTo(first.node_id);
                toast.error('Fix the problems listed below before publishing.');
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
            toast.success(active ? 'Live: the bot answers on this number now' : 'Switched off');
        } catch (e) {
            if (e instanceof ApiError && e.status === 409) {
                setReplace({ name: (e.details?.active_flow as { name?: string } | undefined)?.name ?? 'Another flow' });
            } else {
                toast.error(errorMessage(e));
            }
        }
    };

    const commentCounts = useMemo(() => {
        const m = new Map<string, number>();
        for (const c of comments.data ?? []) if (!c.resolved_at) m.set(c.node_id, (m.get(c.node_id) ?? 0) + 1);

        return m;
    }, [comments.data]);

    if (flow.isError) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <p className="text-[15px] font-semibold">This flow could not be opened.</p>
                <Button asChild variant="outline">
                    <Link href="/chatbots">Back to Chatbots</Link>
                </Button>
            </div>
        );
    }
    if (!data || !graph || !settings) {
        return (
            <div className="flex flex-1 flex-col gap-3 p-6">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-[75vh] w-full" />
            </div>
        );
    }

    const selectedNodes = graph.nodes.filter((n) => selection.has(n.id));
    const node = selectedNodes.length === 1 ? selectedNodes[0] : null;
    const numbers = options.data?.numbers ?? [];
    const titles = new Map(graph.nodes.map((n) => [n.id, n.title]));
    const phone = data.phone_number?.display_phone_number ?? null;
    const needsReview = data.approvals_required && !(data.review?.status === 'approved' && data.review.current);
    const savedLabel = readOnly ? 'View only' : saving === 'saving' ? 'Saving…' : saving === 'error' ? 'Not saved' : dirty ? 'Unsaved' : 'All changes saved';

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background">
            {/* Top bar */}
            <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3">
                <Button asChild variant="ghost" size="icon-sm" aria-label="Back to Chatbots">
                    <Link href="/chatbots">
                        <ArrowLeftIcon />
                    </Link>
                </Button>
                <span className="flex size-8 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
                    {data.kind === 'subflow' ? <WorkflowIcon className="size-4" /> : <BotIcon className="size-4" />}
                </span>
                <div className="min-w-0">
                    <Input
                        value={name}
                        onChange={(e) => {
                            setName(e.target.value.slice(0, 120));
                            setDirty(true);
                        }}
                        disabled={readOnly}
                        className="h-7 w-[min(22rem,40vw)] border-transparent px-1.5 text-[14.5px] font-bold shadow-none hover:border-input focus-visible:border-brand-500"
                        aria-label="Bot name"
                    />
                    <p className="flex items-center gap-1.5 px-1.5 text-[11px] text-muted-foreground" aria-live="polite">
                        {saving === 'saving' && <Loader2Icon className="size-3 animate-spin" />}
                        {savedLabel}
                        {data.kind === 'subflow' && (
                            <Badge tone="info" className="py-0 text-[10px]">
                                Subflow
                            </Badge>
                        )}
                    </p>
                </div>
                {data.kind === 'bot' && (
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
                            className="hidden w-52 md:flex"
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
                )}
                <Badge tone={data.status === 'live' ? 'good' : data.status === 'paused' ? 'grey' : data.status === 'archived' ? 'grey' : 'warn'} dot>
                    {data.status === 'live'
                        ? `Live · v${data.published_version}`
                        : data.status === 'paused'
                          ? `Published · v${data.published_version}`
                          : data.status === 'archived'
                            ? 'Archived'
                            : 'Draft'}
                </Badge>
                {data.published_version !== null && data.has_unpublished_changes && (
                    <Badge tone="info" className="hidden lg:inline-flex">
                        Unpublished changes
                    </Badge>
                )}

                <div className="ml-auto flex items-center gap-1">
                    {!readOnly && (
                        <div className="hidden items-center gap-0.5 rounded-lg border p-0.5 lg:flex">
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
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={tidyUp}
                                aria-label="Tidy up the layout"
                                title="Tidy up: arrange the blocks left to right"
                            >
                                <WandSparklesIcon />
                            </Button>
                            <Button
                                variant={snapOn ? 'secondary' : 'ghost'}
                                size="icon-sm"
                                onClick={() => setSnapOn((v) => !v)}
                                aria-pressed={snapOn}
                                aria-label="Snap to grid"
                                title="Snap to grid"
                            >
                                <Grid3x3Icon />
                            </Button>
                        </div>
                    )}
                    <Button
                        variant={showStats ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setShowStats((v) => !v)}
                        aria-pressed={showStats}
                        title="Show how many customers reach each block (last 30 days)"
                    >
                        <BarChart3Icon /> <span className="hidden xl:inline">Analytics</span>
                    </Button>
                    <Button
                        variant={showIssues ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setShowIssues((v) => !v)}
                        aria-pressed={showIssues}
                        className={cn(errors.length > 0 && 'text-bad')}
                    >
                        {errors.length > 0 ? (
                            <CircleAlertIcon />
                        ) : warnings.length > 0 ? (
                            <TriangleAlertIcon className="text-warn" />
                        ) : (
                            <CheckCircle2Icon className="text-good" />
                        )}
                        {errors.length > 0
                            ? `${errors.length} to fix`
                            : warnings.length > 0
                              ? `${warnings.length} warning${warnings.length === 1 ? '' : 's'}`
                              : 'Ready'}
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label="More">
                                <SettingsIcon />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                                <SettingsIcon /> Flow settings
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
                                <HistoryIcon /> Versions & history
                            </DropdownMenuItem>
                            {data.approvals_required && (
                                <DropdownMenuItem onSelect={() => setReviewOpen(true)}>
                                    <ClipboardCheckIcon /> Review
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                                <Link href={`/chatbots?analytics=${flowId}`}>
                                    <LayoutDashboardIcon /> Flow dashboard
                                </Link>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                            void save().then(() => {
                                setTesting(true);
                                setSelection(new Set());
                            })
                        }
                    >
                        <PlayIcon /> Test
                    </Button>
                    {data.approvals_required && !readOnly && needsReview && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setReviewOpen(true)}
                            className={cn(data.review?.status === 'changes_requested' && 'border-warn text-warn')}
                        >
                            <ClipboardCheckIcon /> {data.review?.status === 'requested' ? 'In review' : 'Review'}
                        </Button>
                    )}
                    {data.can.publish && (
                        <div className="flex">
                            <Button size="sm" onClick={() => void publish()} disabled={publishing || readOnly} className="rounded-r-none">
                                {publishing ? <Loader2Icon className="animate-spin" /> : <RocketIcon />} Publish
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        size="sm"
                                        className="rounded-l-none border-l border-l-black/10 px-1.5"
                                        aria-label="More publish options"
                                        disabled={publishing}
                                    >
                                        <ChevronDownIcon />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    {data.kind === 'bot' && !data.is_active && (
                                        <DropdownMenuItem disabled={!data.phone_number_id} onSelect={() => void publish(true)}>
                                            <RocketIcon /> Publish and go live
                                        </DropdownMenuItem>
                                    )}
                                    {data.kind === 'bot' && data.published_version !== null && (
                                        <DropdownMenuItem onSelect={() => void setLive(!data.is_active)}>
                                            <PlayIcon /> {data.is_active ? 'Switch off' : 'Switch on (published version)'}
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
                                        <HistoryIcon /> Versions & roll back
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    )}
                    {data.kind === 'bot' && data.can.publish && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <label className="ml-1 hidden items-center gap-2 rounded-lg border px-2.5 py-1 text-[12.5px] font-semibold sm:flex">
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
            </header>

            {data.review && data.approvals_required && data.review.status === 'changes_requested' && (
                <div className="flex items-center gap-2 border-b bg-warn-bg px-4 py-1.5 text-[12.5px] text-warn">
                    <TriangleAlertIcon className="size-4" /> {data.review.reviewer ?? 'The reviewer'} asked for changes
                    {data.review.note ? `: “${data.review.note}”` : '.'}
                </div>
            )}

            <div className="flex min-h-0 flex-1">
                {/* Palette */}
                {!readOnly &&
                    (palette ? (
                        <aside className="flex w-64 shrink-0 flex-col border-r bg-[#fafaf8] px-3 pt-3" aria-label="Blocks">
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-[13px] font-bold">Blocks</p>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => setPalette(false)}
                                    aria-label="Hide the blocks"
                                    title="Hide the blocks for more room"
                                >
                                    <PanelLeftCloseIcon />
                                </Button>
                            </div>
                            <p className="mb-2 text-[11.5px] leading-snug text-muted-foreground">
                                Drag onto the canvas, or click to add after the selected block — it connects itself.
                            </p>
                            <div className="min-h-0 flex-1 pb-3">
                                <BlockList onPick={(t) => paletteAdd(t)} draggable />
                            </div>
                        </aside>
                    ) : (
                        <div className="flex w-11 shrink-0 flex-col items-center border-r bg-[#fafaf8] pt-3">
                            <Button variant="ghost" size="icon-sm" onClick={() => setPalette(true)} aria-label="Show the blocks" title="Show the blocks">
                                <PanelLeftOpenIcon />
                            </Button>
                        </div>
                    ))}

                <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                    <FlowCanvas
                        graph={graph}
                        selection={selection}
                        focusId={testing ? testNode : null}
                        onSelect={select}
                        onMoveMany={(moves) => {
                            const at = new Map(moves.map((m) => [m.id, m]));
                            change(
                                { nodes: graph.nodes.map((n) => (at.has(n.id) ? { ...n, x: at.get(n.id)?.x ?? n.x, y: at.get(n.id)?.y ?? n.y } : n)) },
                                `move:${moves.map((m) => m.id).join(',')}`,
                            );
                        }}
                        onMoveEnd={() => {
                            lastKey.current = null;
                        }}
                        onConnect={connect}
                        onDropNode={(type, x, y) => paletteAdd(type, { x, y })}
                        onQuickAdd={(from, output, type) => addNode(type, undefined, { node: from, output })}
                        issues={allIssues}
                        openPorts={ports}
                        analytics={showStats ? (analytics.data?.nodes ?? {}) : null}
                        comments={commentCounts}
                        titles={titles}
                        subflows={options.data?.subflows ?? []}
                        readOnly={readOnly}
                        snapOn={snapOn}
                        apiRef={canvas}
                        rtl={RTL.includes(settings.languages[0] ?? 'en')}
                    />
                    {showIssues && <IssuesPanel errors={errors} warnings={warnings} titles={titles} onJump={jumpTo} onClose={() => setShowIssues(false)} />}
                    {showStats && analytics.data && <StatsStrip analytics={analytics.data} />}
                </div>

                {/* Right panel */}
                <aside className="flex w-[400px] shrink-0 flex-col border-l bg-card max-xl:w-[360px]" aria-label="Block settings">
                    {testing ? (
                        <TestChat
                            flowId={flowId}
                            botName={name}
                            languages={settings.languages}
                            onClose={() => {
                                setTesting(false);
                                setTestNode(null);
                            }}
                            onNode={(id) => {
                                setTestNode(id);
                                if (id) canvas.current?.center(id);
                            }}
                        />
                    ) : node ? (
                        <NodeInspector
                            key={node.id}
                            flowId={flowId}
                            node={node}
                            graph={graph}
                            settings={settings}
                            options={options.data}
                            issues={allIssues}
                            readOnly={readOnly}
                            webhookUrl={data.webhook_url}
                            phone={phone}
                            onTitle={(title, auto) => updateNode(node.id, (n) => ({ ...n, title, auto_title: auto }), `title:${node.id}`)}
                            onConfig={(config: NodeConfig) => updateNode(node.id, (n) => withOutputs({ ...n, config }), `config:${node.id}`)}
                            onDelete={() => deleteNodes([node.id])}
                            onDuplicate={() => duplicate([node.id])}
                            onSelect={jumpTo}
                            onConnect={(output, to) => connect(node.id, output, to)}
                            onWebhook={async (enabled) => {
                                if (!data.can.publish) return;
                                try {
                                    updateCache({ ...(await setChatbotWebhook(flowId, enabled)), draft: graph });
                                } catch (e) {
                                    toast.error(errorMessage(e));
                                }
                            }}
                        />
                    ) : selectedNodes.length > 1 ? (
                        <MultiSelection
                            count={selectedNodes.length}
                            readOnly={readOnly}
                            onDuplicate={() => duplicate([...selection])}
                            onDelete={() => deleteNodes([...selection])}
                            onCopy={copy}
                        />
                    ) : (
                        <Overview
                            detail={data}
                            graph={graph}
                            errors={errors}
                            warnings={warnings}
                            analytics={showStats ? (analytics.data ?? null) : null}
                            onJump={jumpTo}
                            onSettings={() => setSettingsOpen(true)}
                            onTidy={tidyUp}
                            readOnly={readOnly}
                        />
                    )}
                </aside>
            </div>

            <FlowSettingsDialog
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                settings={settings}
                options={options.data}
                readOnly={readOnly}
                onSave={(next) => {
                    setSettings(next);
                    setDirty(true);
                }}
            />

            <ReviewDialog
                open={reviewOpen}
                onOpenChange={setReviewOpen}
                detail={data}
                onDone={(detail) => {
                    updateCache({ ...detail, draft: graph });
                    setIssues(detail.issues);
                }}
                beforeRequest={save}
            />

            <HistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} detail={data} canRestore={data.can.publish} onRestore={setRestore} />

            <AlertDialog open={replace !== null} onOpenChange={(o) => !o && setReplace(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Replace “{replace?.name}”?</AlertDialogTitle>
                        <AlertDialogDescription>
                            “{replace?.name}” already answers every message on this number (or greets first-time customers). One flow can have that role per
                            number, so it will be switched off and its running conversations stop. Keyword, QR and campaign flows can run side by side.
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
                            Switch this flow on
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
                                    if (e instanceof ApiError && Array.isArray(e.details?.issues)) {
                                        setLoaded(null);
                                        toast.error('Restored as the draft, but it needs fixes before it can be published.');
                                    } else {
                                        toast.error(errorMessage(e));
                                    }
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

function IssuesPanel({
    errors,
    warnings,
    titles,
    onJump,
    onClose,
}: {
    errors: FlowIssue[];
    warnings: FlowIssue[];
    titles: Map<string, string>;
    onJump: (id: string) => void;
    onClose: () => void;
}) {
    const list = [...errors, ...warnings];

    return (
        <div className="absolute bottom-3 left-3 z-20 flex max-h-[45%] w-[min(560px,calc(100%-14rem))] flex-col overflow-hidden rounded-xl border bg-card shadow-[0_12px_40px_rgba(16,24,40,.18)]">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
                <p className="text-[13px] font-bold">
                    {errors.length > 0 ? `${errors.length} problem${errors.length === 1 ? '' : 's'} to fix before publishing` : 'Ready to publish'}
                    {warnings.length > 0 && (
                        <span className="ml-2 font-medium text-warn">
                            · {warnings.length} warning{warnings.length === 1 ? '' : 's'}
                        </span>
                    )}
                </p>
                <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
                    <XIcon />
                </Button>
            </div>
            <div className="min-h-0 flex-1 divide-y overflow-y-auto">
                {list.length === 0 && (
                    <p className="flex items-center gap-2 px-4 py-4 text-[12.5px] text-good">
                        <CheckCircle2Icon className="size-4" /> Every branch has a next step, a person can always be reached, and WhatsApp’s rules are met.
                    </p>
                )}
                {list.map((i, n) => (
                    <button
                        key={n}
                        type="button"
                        onClick={() => i.node_id && onJump(i.node_id)}
                        disabled={!i.node_id}
                        className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left hover:bg-muted/60 disabled:cursor-default"
                    >
                        {i.level === 'error' ? (
                            <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-bad" />
                        ) : (
                            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warn" />
                        )}
                        <span className="min-w-0 flex-1">
                            <span className="block text-[12.5px] font-semibold">{i.message}</span>
                            {i.fix && <span className="block text-[12px] text-muted-foreground">How to fix: {i.fix}</span>}
                        </span>
                        {i.node_id && (
                            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
                                Show “{(titles.get(i.node_id) ?? '').slice(0, 18)}”
                            </span>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}

function StatsStrip({ analytics }: { analytics: ChatbotAnalytics }) {
    const s = analytics.sessions;
    const stat = (label: string, value: string | number) => (
        <div className="px-3">
            <p className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">{label}</p>
            <p className="text-[15px] font-bold tabular-nums">{value}</p>
        </div>
    );

    return (
        <div className="pointer-events-none absolute top-3 left-1/2 z-10 flex -translate-x-1/2 divide-x rounded-xl border bg-card/95 py-1.5 shadow-sm backdrop-blur">
            {stat('Started (30d)', s.started)}
            {stat('Completed', s.completion_rate === null ? '—' : `${s.completion_rate}%`)}
            {stat('Handed off', s.handoff_rate === null ? '—' : `${s.handoff_rate}%`)}
            {stat('Avg. time', s.avg_seconds === null ? '—' : s.avg_seconds < 60 ? `${s.avg_seconds}s` : `${Math.round(s.avg_seconds / 60)} min`)}
            {stat('Left midway', s.abandoned)}
        </div>
    );
}

function MultiSelection({
    count,
    readOnly,
    onDuplicate,
    onDelete,
    onCopy,
}: {
    count: number;
    readOnly: boolean;
    onDuplicate: () => void;
    onDelete: () => void;
    onCopy: () => void;
}) {
    return (
        <div className="space-y-3 px-4 py-4">
            <p className="text-[14px] font-bold">{count} blocks selected</p>
            <p className="text-[12px] text-muted-foreground">Drag any of them to move them together. Ctrl/⌘ + C copies them, also into another flow.</p>
            {!readOnly && (
                <div className="grid gap-2">
                    <Button variant="outline" size="sm" onClick={onCopy}>
                        <CopyIcon /> Copy
                    </Button>
                    <Button variant="outline" size="sm" onClick={onDuplicate}>
                        <CopyIcon /> Duplicate
                    </Button>
                    <Button variant="outline" size="sm" className="text-bad hover:text-bad" onClick={onDelete}>
                        <Trash2Icon /> Delete {count} blocks
                    </Button>
                </div>
            )}
        </div>
    );
}

function Overview({
    detail,
    graph,
    errors,
    warnings,
    analytics,
    onJump,
    onSettings,
    onTidy,
    readOnly,
}: {
    detail: ChatbotFlowDetail;
    graph: FlowGraph;
    errors: FlowIssue[];
    warnings: FlowIssue[];
    analytics: ChatbotAnalytics | null;
    onJump: (id: string) => void;
    onSettings: () => void;
    onTidy: () => void;
    readOnly: boolean;
}) {
    const start = graph.nodes.find((n) => n.type === 'start');
    const checks: [boolean, string][] = [
        [errors.filter((e) => e.code === 'unconnected').length === 0, 'Every branch has a next step'],
        [errors.filter((e) => e.code === 'unreachable').length === 0, 'Every block can be reached'],
        [detail.kind === 'subflow' || graph.nodes.some((n) => n.type === 'handoff'), 'A person can always be reached'],
        [
            errors.filter((e) => ['needs_template', 'missing_template', 'template_status'].includes(e.code ?? '')).length === 0,
            'Messages after 24 hours use a template',
        ],
        [
            errors.filter((e) => ['missing_text', 'no_buttons', 'no_rows', 'bad_url', 'no_template', 'missing_target'].includes(e.code ?? '')).length === 0,
            'Required fields are filled in',
        ],
        [errors.filter((e) => e.code?.startsWith('deleted') || e.code?.startsWith('missing_')).length === 0, 'Templates, fields and keys it uses exist'],
    ];
    if (detail.approvals_required) checks.push([!errors.some((e) => e.code === 'approval'), 'Approved by a reviewer']);

    return (
        <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="border-b px-4 py-3.5">
                <p className="text-[14.5px] font-bold">Flow overview</p>
                <p className="text-[12px] text-muted-foreground">Click a block to edit it. Nothing selected right now.</p>
            </div>
            <div className="space-y-5 px-4 py-4">
                <section>
                    <p className="mb-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">What starts it</p>
                    <button
                        type="button"
                        onClick={() => start && onJump(start.id)}
                        className="w-full rounded-lg border px-3 py-2 text-left text-[12.5px] hover:bg-muted/60"
                    >
                        {detail.triggers.length ? detail.triggers.join(' · ') : <span className="text-warn">Nothing yet — open the Start block</span>}
                    </button>
                </section>
                <section>
                    <p className="mb-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Before publishing</p>
                    <ul className="space-y-1.5 text-[12.5px]">
                        {checks.map(([ok, label]) => (
                            <li key={label} className="flex items-center gap-2">
                                {ok ? <CheckCircle2Icon className="size-4 shrink-0 text-good" /> : <CircleAlertIcon className="size-4 shrink-0 text-bad" />}{' '}
                                {label}
                            </li>
                        ))}
                    </ul>
                    {errors.length === 0 ? (
                        <p className="mt-3 rounded-lg bg-good-bg px-3 py-2 text-[12px] text-good">
                            Ready to publish{warnings.length ? ` (${warnings.length} warning${warnings.length === 1 ? '' : 's'})` : ''}.
                        </p>
                    ) : (
                        <div className="mt-3 space-y-1.5">
                            {errors.slice(0, 6).map((i, n) => (
                                <button
                                    key={n}
                                    type="button"
                                    onClick={() => i.node_id && onJump(i.node_id)}
                                    className="block w-full rounded-lg bg-bad-bg px-3 py-2 text-left text-[12px] text-bad hover:underline"
                                >
                                    {i.message}
                                </button>
                            ))}
                            {errors.length > 6 && (
                                <p className="text-[11.5px] text-muted-foreground">…and {errors.length - 6} more (see “to fix” at the top).</p>
                            )}
                        </div>
                    )}
                </section>
                {analytics && (
                    <section>
                        <p className="mb-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Where customers leave</p>
                        {analytics.dropoff.length === 0 ? (
                            <p className="text-[12px] text-muted-foreground">Nobody left midway in the last {analytics.days} days.</p>
                        ) : (
                            <ul className="space-y-1">
                                {analytics.dropoff.map((d) => (
                                    <li key={d.node_id}>
                                        <button
                                            type="button"
                                            onClick={() => onJump(d.node_id)}
                                            className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-[12.5px] hover:bg-muted"
                                        >
                                            <span className="truncate">{d.title}</span>
                                            <span className="font-semibold text-warn tabular-nums">
                                                {d.abandoned} of {d.entries}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                )}
                {!readOnly && (
                    <section className="grid grid-cols-2 gap-2">
                        <Button variant="outline" size="sm" onClick={onSettings}>
                            <SettingsIcon /> Flow settings
                        </Button>
                        <Button variant="outline" size="sm" onClick={onTidy}>
                            <WandSparklesIcon /> Tidy up
                        </Button>
                    </section>
                )}
                <section className="rounded-lg bg-muted px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-2">
                    <p className="font-semibold">Shortcuts</p>
                    <p className="mt-1">
                        Delete · Ctrl/⌘ Z undo · Ctrl/⌘ Shift Z redo · Ctrl/⌘ C / V copy & paste · Ctrl/⌘ D duplicate · Ctrl/⌘ A select all · F fit · Shift +
                        drag to select a group · Ctrl + scroll to zoom
                    </p>
                </section>
            </div>
        </div>
    );
}

function ReviewDialog({
    open,
    onOpenChange,
    detail,
    onDone,
    beforeRequest,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    detail: ChatbotFlowDetail;
    onDone: (d: ChatbotFlowDetail) => void;
    beforeRequest: () => Promise<boolean>;
}) {
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const run = async (action: 'request' | 'approve' | 'changes' | 'cancel') => {
        setBusy(true);
        try {
            if (action === 'request' && !(await beforeRequest())) return;
            onDone(await reviewChatbot(detail.id, action, note || undefined));
            toast.success(
                { request: 'Review requested', approve: 'Approved — it can be published now', changes: 'Changes requested', cancel: 'Review cancelled' }[
                    action
                ],
            );
            setNote('');
            onOpenChange(false);
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };
    const r = detail.review;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Review before publishing</DialogTitle>
                    <DialogDescription>
                        This workspace publishes a flow only after a publisher approved this exact version of the draft. Any later edit needs a new approval.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <p className="rounded-lg bg-muted px-3 py-2 text-[12.5px]">
                        {r === null
                            ? 'Not reviewed yet.'
                            : r.status === 'requested'
                              ? `Waiting for a reviewer${r.note ? ` — “${r.note}”` : ''}.`
                              : r.status === 'approved'
                                ? r.current
                                    ? `Approved by ${r.reviewer ?? 'a reviewer'}.`
                                    : `Approved by ${r.reviewer ?? 'a reviewer'}, but the flow changed since.`
                                : `${r.reviewer ?? 'The reviewer'} asked for changes${r.note ? `: “${r.note}”` : '.'}`}
                    </p>
                    <textarea
                        rows={3}
                        value={note}
                        onChange={(e) => setNote(e.target.value.slice(0, 500))}
                        placeholder="Note (optional)"
                        className="w-full rounded-lg border border-input px-3 py-2 text-[13px]"
                        aria-label="Note"
                    />
                </div>
                <DialogFooter className="gap-2 sm:justify-between">
                    {detail.can.edit && (
                        <Button variant="outline" disabled={busy} onClick={() => void run(r?.status === 'requested' ? 'cancel' : 'request')}>
                            {r?.status === 'requested' ? 'Cancel the request' : 'Request review'}
                        </Button>
                    )}
                    {detail.can.publish && (
                        <div className="flex gap-2">
                            <Button variant="outline" disabled={busy} onClick={() => void run('changes')}>
                                Ask for changes
                            </Button>
                            <Button disabled={busy} onClick={() => void run('approve')}>
                                Approve
                            </Button>
                        </div>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function HistoryDialog({
    open,
    onOpenChange,
    detail,
    canRestore,
    onRestore,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    detail: ChatbotFlowDetail;
    canRestore: boolean;
    onRestore: (v: number) => void;
}) {
    const history = useChatbotHistory(detail.id, open);
    const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Versions & history</DialogTitle>
                    <DialogDescription>Every publish is a version you can roll back to. The log shows who changed what.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-5 sm:grid-cols-2">
                    <section>
                        <p className="mb-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Versions</p>
                        {detail.versions.length === 0 ? (
                            <p className="text-[12px] text-muted-foreground">Not published yet.</p>
                        ) : (
                            <ul className="divide-y rounded-lg border text-[12.5px]">
                                {detail.versions.map((v) => (
                                    <li key={v.version} className="flex items-center justify-between gap-2 px-3 py-1.5">
                                        <span>
                                            v{v.version}
                                            {v.version === detail.published_version && (
                                                <Badge tone="good" className="ml-1.5">
                                                    current
                                                </Badge>
                                            )}
                                            <span className="block text-[11px] text-muted-foreground">{when(v.created_at)}</span>
                                        </span>
                                        {canRestore && v.version !== detail.published_version && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => {
                                                    onOpenChange(false);
                                                    onRestore(v.version);
                                                }}
                                            >
                                                Roll back
                                            </Button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                    <section>
                        <p className="mb-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Activity</p>
                        <ul className="space-y-2 text-[12.5px]">
                            {(history.data ?? []).map((h, i) => (
                                <li key={i}>
                                    <span className="font-semibold">{ACTIONS[h.action] ?? h.action.replace(/^chatbot\./, '').replace(/_/g, ' ')}</span>
                                    {typeof h.meta?.version === 'number' && ` v${h.meta.version}`} <span className="text-muted-foreground">· {h.actor}</span>
                                    <span className="block text-[11px] text-muted-foreground">{when(h.created_at)}</span>
                                </li>
                            ))}
                            {history.isLoading && <Skeleton className="h-20 w-full" />}
                        </ul>
                    </section>
                </div>
            </DialogContent>
        </Dialog>
    );
}
