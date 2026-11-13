'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
    ArrowLeftIcon,
    CalendarClockIcon,
    CheckCircle2Icon,
    ChevronDownIcon,
    CircleAlertIcon,
    ClipboardCheckIcon,
    CopyIcon,
    HistoryIcon,
    LayoutDashboardIcon,
    Loader2Icon,
    PlayIcon,
    Redo2Icon,
    RocketIcon,
    Trash2Icon,
    TriangleAlertIcon,
    Undo2Icon,
    XIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, errorMessage } from '@/lib/api';
import {
    activateChatbot,
    CARD_WIDTH,
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
    isDraftConflict,
    type DraftConflict,
    getChatbotRevision,
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
    useChatbotOptions,
    withOutputs,
} from '@/lib/chatbots';
import { useStored } from '@/hooks/use-stored';
import { mergeDrafts } from '@/lib/flow-merge';
import { cn } from '@/lib/utils';

import { type CanvasApi, FlowCanvas } from './flow-canvas';
import { FlowSettingsDialog } from './flow-settings-dialog';
import { NodeInspector } from './node-inspector';
import { RunPeriodDialog } from './run-period-dialog';
import { HistoryPanel } from './studio/history-panel';
import { StepPalette } from './studio/palette';
import { type InsightMode, SimpleView } from './studio/simple-view';
import { TestChat } from './test-chat';

const NO_NUMBER = '__none__';

type RightTab = 'step' | 'test' | 'settings' | 'history';
const CLIPBOARD = 'engage.chatbot.clipboard';

/** The full-screen flow builder: canvas · block settings, with test, review and publish. Blocks are added with "Add block", the "+" on a branch, or paste. */
export function FlowBuilder({ flowId, initialStep = null }: { flowId: string; initialStep?: string | null }) {
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
    const [tab, setTab] = useState<Exclude<RightTab, 'test'>>('step');
    const [view, setView] = useStored<'simple' | 'map'>('engage.chatbots.view', 'simple');
    const [insight, setInsight] = useState<InsightMode>('off');
    const [showIssues, setShowIssues] = useState(false);
    const [runPeriod, setRunPeriod] = useState(false);
    /** Leaving with changes that are not saved (or saved but not published): where to go once confirmed. */
    const [leaving, setLeaving] = useState<string | null>(null);
    const [leaveBusy, setLeaveBusy] = useState(false);
    const [touched, setTouched] = useState(false); // the draft was changed in this visit
    const router = useRouter();
    const [snapOn, setSnapOn] = useState(true);
    const [publishing, setPublishing] = useState(false);
    const [replace, setReplace] = useState<{ name: string } | null>(null);
    const [restore, setRestore] = useState<number | null>(null);
    const [reviewOpen, setReviewOpen] = useState(false);
    const lastKey = useRef<{ key: string; at: number } | null>(null);
    const clock = useRef(Date.now); // read only in event handlers (undo grouping)
    const canvas = useRef<CanvasApi | null>(null);
    const clipboard = useRef<FlowNode[]>([]);
    const analytics = useChatbotAnalytics(flowId, 30, insight !== 'off');

    const data = flow.data;
    /** The draft this editor last loaded or saved (and its revision): the base of a merge when a teammate saved first. */
    const [base, setBase] = useState<{ graph: FlowGraph; settings: FlowSettings; name: string; revision: number } | null>(null);
    const [conflict, setConflict] = useState<(DraftConflict & { mine: { graph: FlowGraph; settings: FlowSettings; name: string } }) | null>(null);
    // Load the flow once into local editing state (adjusting state while rendering, not in an effect).
    if (data && loaded !== data.id) {
        setLoaded(data.id);
        setGraph(data.draft);
        setSettings(data.settings);
        setName(data.name);
        setIssues(data.issues);
        setBase({ graph: data.draft, settings: data.settings, name: data.name, revision: data.draft_revision });
        setPast([]);
        setFuture([]);
        // Opened on a step (Runs › Open this step, Start rules › Edit): select it.
        const want = initialStep === 'start' ? data.draft.nodes.find((n) => n.type === 'start')?.id : initialStep;
        if (want && data.draft.nodes.some((n) => n.id === want)) {
            setSelection(new Set([want]));
            requestAnimationFrame(() => document.querySelector(`[data-step="${want}"]`)?.scrollIntoView({ block: 'center' }));
        }
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
        graph && change({ ...graph, nodes: graph.nodes.map((n) => (n.id === id ? fn(n) : n)) }, key);
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
        change({ ...graph, nodes });
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
    /** “+” on a path: the new step goes on that path, and whatever the path led to follows the new step. */
    const addOnPath = (from: string, output: string, type: NodeType) => {
        if (!graph) return;
        const source = graph.nodes.find((n) => n.id === from);
        if (!source) return;
        const index = Math.max(
            0,
            source.outputs.findIndex((o) => o.id === output),
        );
        const before = source.outputs.find((o) => o.id === output)?.to ?? null;
        const created = newNode(type, snap(source.x + CARD_WIDTH + COLUMN_GAP, snapOn), snap(source.y + index * 60, snapOn));
        const node =
            before && created.outputs.length > 0 ? { ...created, outputs: created.outputs.map((o, i) => (i === 0 ? { ...o, to: before } : o)) } : created;
        const section = (source as FlowNode & { section?: string }).section;
        const placed = section ? ({ ...node, section } as FlowNode) : node;
        change({
            ...graph,
            nodes: [
                ...graph.nodes.map((n) => (n.id === from ? { ...n, outputs: n.outputs.map((o) => (o.id === output ? { ...o, to: placed.id } : o)) } : n)),
                placed,
            ],
        });
        setSelection(new Set([placed.id]));
        setTesting(false);
        setTab('step');
        requestAnimationFrame(() => document.querySelector(`[data-step="${placed.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    };
    const deleteNodes = (ids: string[]) => {
        if (!graph) return;
        const gone = new Set(ids.filter((id) => graph.nodes.find((n) => n.id === id)?.type !== 'start'));
        if (gone.size === 0) return;
        change({
            ...graph,
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
        change({ ...graph, nodes: [...graph.nodes, ...copies] });
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
        change({ ...graph, nodes: [...graph.nodes, ...copies] });
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
        document.querySelector(`[data-step="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };

    // ── Autosave ────────────────────────────────────────────────────────────────────────────
    const save = async (): Promise<boolean> => {
        if (!graph || !settings || readOnly) return true;
        if (conflict) return false; // waiting for the merge decision
        setSaving('saving');
        setDirty(false);
        const sent = { graph, settings, name: name.trim() || 'Untitled bot' };
        try {
            const detail = await saveChatbot(flowId, { draft: sent.graph, settings: sent.settings, name: sent.name, base_revision: base?.revision });
            setIssues(detail.issues);
            setBase({ ...sent, revision: detail.draft_revision });
            updateCache({ ...detail, draft: graph }); // keep local edits made while saving
            setSaving('idle');

            return true;
        } catch (e) {
            setDirty(true);
            setSaving('error');
            if (isDraftConflict(e)) {
                setConflict({ ...e.details, mine: sent });

                return false;
            }
            toast.error(`Not saved: ${errorMessage(e)}`);

            return false;
        }
    };
    /** Resolves a refused save: merge both drafts (conflicting steps from `prefer`), or take the teammate's draft. */
    const resolveConflict = (how: 'mine' | 'theirs' | 'discard') => {
        if (!conflict || !base) return;
        const theirs = { graph: conflict.draft, settings: conflict.settings, name: conflict.name };
        const next = how === 'discard' ? { ...theirs, conflicts: [] } : mergeDrafts(base, conflict.mine, theirs, how);
        setPast((p) => (graph ? [...p.slice(-79), graph] : p));
        setFuture([]);
        setGraph(next.graph);
        setSettings(next.settings);
        setName(next.name);
        setBase({ ...theirs, revision: conflict.revision });
        setConflict(null);
        setSaving('idle');
        setDirty(how !== 'discard');
        toast.success(how === 'discard' ? 'You now have your teammate’s version.' : 'Merged. Saving…', { duration: 1800 });
    };
    const autosave = useEffectEvent(() => void save());
    useEffect(() => {
        if (!dirty || saving === 'saving' || conflict) return;
        const t = setTimeout(autosave, 800);

        return () => clearTimeout(t);
    }, [dirty, graph, settings, name, saving, conflict]);

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
        } else if (!mod && k === 'f' && view === 'map') {
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

    // Leaving with unsaved edits: the browser asks first (reload, close, typed address).
    const unsaved = dirty || saving !== 'idle';
    useEffect(() => {
        if (!unsaved) return;
        const warn = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener('beforeunload', warn);

        return () => window.removeEventListener('beforeunload', warn);
    }, [unsaved]);
    if (dirty && !touched) setTouched(true);

    // Leaving inside the app (back arrow, dashboard link, browser Back): our own dialog asks first
    // when something is not saved, or was changed here and is saved but not published yet.
    const unpublished = touched && (flow.data?.published_version ?? null) !== null && (flow.data?.has_unpublished_changes ?? false);
    const mustAsk = !readOnly && (unsaved || unpublished);
    const leave = (href: string) => {
        if (mustAsk) setLeaving(href);
        else router.push(href);
    };
    const onBack = useEffectEvent(() => {
        if (!mustAsk) {
            history.back();

            return;
        }
        history.pushState(history.state, '', location.href); // stay on the page while the dialog asks
        setLeaving('/chatbots');
    });
    useEffect(() => {
        history.pushState(history.state, '', location.href); // a step to come back to when Back is pressed
        const handler = () => onBack();
        window.addEventListener('popstate', handler);

        return () => window.removeEventListener('popstate', handler);
    }, []);
    const go = (href: string) => {
        setLeaving(null);
        setDirty(false);
        setTouched(false);
        router.push(href);
    };

    // ── Publish / go live ───────────────────────────────────────────────────────────────────
    const publish = async (thenLive = false) => {
        setPublishing(true);
        try {
            if (dirty && !(await save())) return;
            const detail = await publishChatbot(flowId, base?.revision);
            updateCache({ ...detail, draft: graph ?? detail.draft });
            setIssues(detail.issues);
            if (thenLive && !detail.is_active) {
                await setLive(true);
            } else {
                toast.success(`Version ${detail.published_version} published${detail.is_active ? ' — it is live now' : '. Switch it on to go live.'}`);
            }
        } catch (e) {
            if (isDraftConflict(e) && graph && settings) {
                setConflict({ ...e.details, mine: { graph, settings, name } });
            } else if (e instanceof ApiError && Array.isArray(e.details?.issues)) {
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

    const rightTab = testing ? 'test' : tab;
    const start = graph.nodes.find((n) => n.type === 'start');
    const openTab = (t: RightTab) => {
        if (t === 'test') {
            void save().then(() => setTesting(true));
        } else {
            setTesting(false);
            setTestNode(null);
            setTab(t);
        }
    };
    const sections = ((graph as FlowGraph & { sections?: { id: string; name: string }[] }).sections ?? []) as { id: string; name: string }[];
    const setSections = (next: { id: string; name: string }[], key?: string) => change({ ...graph, sections: next } as FlowGraph, key);
    const statusChip =
        data.status === 'live'
            ? { cls: 'live', label: `Live · v${data.published_version}` }
            : data.status === 'paused'
              ? { cls: 'off', label: `Off · v${data.published_version}` }
              : data.status === 'archived'
                ? { cls: 'off', label: 'Archived' }
                : { cls: 'draft', label: 'Draft' };
    const checkLabel =
        errors.length > 0
            ? `${errors.length} to fix${warnings.length ? ` · ${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : ''}`
            : warnings.length > 0
              ? `No errors · ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`
              : 'Ready';

    return (
        <div className="cb-bld flex h-full min-h-0 min-w-0 flex-1 flex-col" style={{ background: 'var(--cb-bg)' }}>
            <header className="cb-bhead">
                <button
                    type="button"
                    className="cb-btn sm cb-iconbtn"
                    aria-label="Back to My Flows"
                    onClick={() => leave('/chatbots')}
                    style={{ width: 36, height: 36 }}
                >
                    <ArrowLeftIcon className="size-4" />
                </button>
                <input
                    className="cb-name"
                    value={name}
                    onChange={(e) => {
                        setName(e.target.value.slice(0, 120));
                        setDirty(true);
                    }}
                    disabled={readOnly}
                    aria-label="Bot name"
                />
                {data.kind === 'subflow' && <span className="cb-chip info">Subflow</span>}
                <span className={`cb-chip ${statusChip.cls}`}>
                    <span className="dot" />
                    {statusChip.label}
                </span>
                {data.published_version !== null && data.has_unpublished_changes && <span className="cb-chip warn">Unpublished changes</span>}
                <span className="cb-small cb-muted" aria-live="polite">
                    {saving === 'saving' ? (
                        <>
                            <Loader2Icon className="inline size-3 animate-spin" /> Saving…
                        </>
                    ) : (
                        savedLabel
                    )}
                </span>
                <div className="cb-seg" aria-label="View">
                    <button type="button" className={view === 'simple' ? 'on' : undefined} aria-pressed={view === 'simple'} onClick={() => setView('simple')}>
                        Simple
                    </button>
                    <button type="button" className={view === 'map' ? 'on' : undefined} aria-pressed={view === 'map'} onClick={() => setView('map')}>
                        Map
                    </button>
                </div>
                <div className="cb-seg" aria-label="Insights on the steps">
                    {(
                        [
                            ['off', 'Insights off'],
                            ['counts', 'Counts'],
                            ['percent', '%'],
                            ['gaveup', 'Gave up'],
                        ] as const
                    ).map(([k, l]) => (
                        <button key={k} type="button" className={insight === k ? 'on' : undefined} aria-pressed={insight === k} onClick={() => setInsight(k)}>
                            {l}
                        </button>
                    ))}
                </div>
                <span className="cb-spacer" />
                {!readOnly && (
                    <>
                        <button
                            type="button"
                            className="cb-btn sm cb-iconbtn"
                            onClick={undo}
                            disabled={past.length === 0}
                            aria-label="Undo (Ctrl+Z)"
                            title="Undo (Ctrl+Z)"
                        >
                            <Undo2Icon className="size-4" />
                        </button>
                        <button
                            type="button"
                            className="cb-btn sm cb-iconbtn"
                            onClick={redo}
                            disabled={future.length === 0}
                            aria-label="Redo (Ctrl+Shift+Z)"
                            title="Redo (Ctrl+Shift+Z)"
                        >
                            <Redo2Icon className="size-4" />
                        </button>
                    </>
                )}
                <button
                    type="button"
                    className={cn('cb-btn sm', errors.length > 0 && 'danger')}
                    onClick={() => setShowIssues((v) => !v)}
                    aria-pressed={showIssues}
                    data-testid="checks"
                >
                    {errors.length > 0 ? (
                        <CircleAlertIcon className="size-4" />
                    ) : warnings.length > 0 ? (
                        <TriangleAlertIcon className="size-4" style={{ color: 'var(--cb-warn-i)' }} />
                    ) : (
                        <CheckCircle2Icon className="size-4" style={{ color: 'var(--cb-brand-deep)' }} />
                    )}
                    {checkLabel}
                </button>
                <button type="button" className="cb-btn sm" onClick={() => openTab('test')}>
                    <PlayIcon className="size-3.5" /> Test
                </button>
                {data.approvals_required && !readOnly && needsReview && (
                    <button
                        type="button"
                        className={cn('cb-btn sm', data.review?.status === 'changes_requested' && 'danger')}
                        onClick={() => setReviewOpen(true)}
                    >
                        <ClipboardCheckIcon className="size-4" /> {data.review?.status === 'requested' ? 'In review' : 'Review'}
                    </button>
                )}
                {data.can.publish && (
                    <div className="flex">
                        <button
                            type="button"
                            className="cb-btn sm pri"
                            onClick={() => void publish()}
                            disabled={publishing || readOnly}
                            style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                        >
                            {publishing && <Loader2Icon className="size-4 animate-spin" />}
                            {errors.length > 0 ? `Publish · ${errors.length} to fix` : 'Publish'}
                        </button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    className="cb-btn sm pri"
                                    aria-label="More publish options"
                                    disabled={publishing}
                                    style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeft: '1px solid rgba(0,0,0,.12)', padding: '0 6px' }}
                                >
                                    <ChevronDownIcon className="size-4" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {data.kind === 'bot' && !data.is_active && (
                                    <DropdownMenuItem disabled={!data.phone_number_id} onSelect={() => void publish(true)}>
                                        <RocketIcon /> Publish and go live
                                    </DropdownMenuItem>
                                )}
                                {data.kind === 'bot' && data.published_version !== null && (
                                    <DropdownMenuItem disabled={!data.phone_number_id} onSelect={() => void setLive(!data.is_active)}>
                                        <PlayIcon /> {data.is_active ? 'Switch off (stop answering)' : 'Switch on (published version)'}
                                    </DropdownMenuItem>
                                )}
                                {data.kind === 'bot' && (
                                    <DropdownMenuItem onSelect={() => setRunPeriod(true)}>
                                        <CalendarClockIcon /> Run period…
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => openTab('history')}>
                                    <HistoryIcon /> Versions & roll back
                                </DropdownMenuItem>
                                {data.approvals_required && (
                                    <DropdownMenuItem onSelect={() => setReviewOpen(true)}>
                                        <ClipboardCheckIcon /> Review
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onSelect={() => leave(`/chatbots/insights?flow=${flowId}`)}>
                                    <LayoutDashboardIcon /> Flow insights
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}
            </header>

            {data.review && data.approvals_required && data.review.status === 'changes_requested' && (
                <div className="cb-banner warn" style={{ borderRadius: 0 }}>
                    <TriangleAlertIcon className="size-4" /> {data.review.reviewer ?? 'The reviewer'} asked for changes
                    {data.review.note ? `: “${data.review.note}”` : '.'}
                </div>
            )}

            <div className="cb-bbody">
                <StepPalette
                    readOnly={readOnly}
                    onPick={paletteAdd}
                    hint={
                        selectedSingle && graph.nodes.find((n) => n.id === selectedSingle)?.outputs.length
                            ? `New steps go after “${titles.get(selectedSingle)}”. Or use + on any path in the flow.`
                            : view === 'map'
                              ? 'Select a step first, or drag a step onto the map, or use + on any path.'
                              : 'Select a step first, or use + on any path in the flow.'
                    }
                />

                <div className="cb-bcenter" data-testid="builder-center">
                    {view === 'simple' ? (
                        <SimpleView
                            graph={graph}
                            triggers={data.triggers}
                            selection={selection}
                            issues={allIssues}
                            analytics={insight !== 'off' ? (analytics.data ?? null) : null}
                            insight={insight}
                            readOnly={readOnly}
                            onSelect={(id) => {
                                setSelection(new Set([id]));
                                if (rightTab !== 'step') openTab('step');
                            }}
                            onOpenStep={(id) => {
                                setSelection(new Set([id]));
                                openTab('step');
                            }}
                            onConfig={(id, config) => updateNode(id, (n) => withOutputs({ ...n, config }), `config:${id}`)}
                            onConnect={connect}
                            onAddOnPath={addOnPath}
                            onDuplicate={(id) => duplicate([id])}
                            onDelete={(id) => deleteNodes([id])}
                            onTest={() => openTab('test')}
                            onStartRules={() => leave('/chatbots/start-rules')}
                            onRenameSection={(id, nm) =>
                                setSections(
                                    sections.map((x) => (x.id === id ? { ...x, name: nm.slice(0, 60) } : x)),
                                    `sec:${id}`,
                                )
                            }
                        />
                    ) : (
                        <div className="absolute inset-0 flex">
                            <FlowCanvas
                                graph={graph}
                                selection={selection}
                                focusId={testing ? testNode : null}
                                onSelect={select}
                                onMoveMany={(moves) => {
                                    const at = new Map(moves.map((m) => [m.id, m]));
                                    change(
                                        {
                                            ...graph,
                                            nodes: graph.nodes.map((n) => (at.has(n.id) ? { ...n, x: at.get(n.id)?.x ?? n.x, y: at.get(n.id)?.y ?? n.y } : n)),
                                        },
                                        `move:${moves.map((m) => m.id).join(',')}`,
                                    );
                                }}
                                onMoveEnd={() => {
                                    lastKey.current = null;
                                }}
                                onConnect={connect}
                                onDropNode={(type, x, y) => paletteAdd(type, { x, y })}
                                onQuickAdd={(from, output, type) => addOnPath(from, output, type)}
                                issues={allIssues}
                                openPorts={ports}
                                analytics={insight !== 'off' ? (analytics.data?.nodes ?? {}) : null}
                                comments={commentCounts}
                                titles={titles}
                                subflows={options.data?.subflows ?? []}
                                readOnly={readOnly}
                                snapOn={snapOn}
                                apiRef={canvas}
                                rtl={RTL.includes(settings.languages[0] ?? 'en')}
                            />
                            {!readOnly && (
                                <div className="cb-mapctl" style={{ left: 'auto', right: 12, top: 12, bottom: 'auto' }}>
                                    <button type="button" onClick={tidyUp}>
                                        Auto-arrange
                                    </button>
                                    <button
                                        type="button"
                                        aria-pressed={snapOn}
                                        onClick={() => setSnapOn((v) => !v)}
                                        style={snapOn ? { fontWeight: 600 } : undefined}
                                    >
                                        Snap {snapOn ? 'on' : 'off'}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                    {showIssues && <IssuesPanel errors={errors} warnings={warnings} titles={titles} onJump={jumpTo} onClose={() => setShowIssues(false)} />}
                </div>

                <aside className="cb-bright" aria-label="Step, test, flow settings and history">
                    <div className="cb-tabs" role="tablist">
                        {(
                            [
                                ['step', 'Step'],
                                ['test', 'Test'],
                                ['settings', 'Flow settings'],
                                ['history', 'History'],
                            ] as const
                        ).map(([k, l]) => (
                            <button
                                key={k}
                                type="button"
                                role="tab"
                                aria-selected={rightTab === k}
                                className={rightTab === k ? 'on' : undefined}
                                onClick={() => openTab(k)}
                            >
                                {l}
                            </button>
                        ))}
                    </div>
                    {rightTab === 'test' ? (
                        <div className="flex min-h-0 flex-1 flex-col">
                            <TestChat
                                flowId={flowId}
                                botName={name}
                                languages={settings.languages}
                                numberId={data.phone_number_id}
                                options={options.data}
                                onClose={() => openTab('step')}
                                onNode={(id) => {
                                    setTestNode(id);
                                    if (id) jumpTo(id);
                                }}
                            />
                        </div>
                    ) : rightTab === 'step' ? (
                        node ? (
                            <div className="flex min-h-0 flex-1 flex-col">
                                {sections.length > 0 && !readOnly && node.type !== 'start' && (
                                    <label className="cb-row cb-small" style={{ padding: '10px 16px 0' }}>
                                        <span className="cb-muted">Section</span>
                                        <select
                                            className="cb-in"
                                            style={{ width: 'auto', height: 30, minHeight: 30 }}
                                            value={(node as FlowNode & { section?: string }).section ?? ''}
                                            onChange={(e) => updateNode(node.id, (n) => ({ ...n, section: e.target.value || undefined }) as FlowNode)}
                                        >
                                            <option value="">Not in a section</option>
                                            {sections.map((x) => (
                                                <option key={x.id} value={x.id}>
                                                    {x.name}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                )}
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
                            </div>
                        ) : selectedNodes.length > 1 ? (
                            <MultiSelection
                                count={selectedNodes.length}
                                readOnly={readOnly}
                                onDuplicate={() => duplicate([...selection])}
                                onDelete={() => deleteNodes([...selection])}
                                onCopy={copy}
                            />
                        ) : (
                            <div className="cb-scroll">
                                <div className="cb-empty" style={{ padding: '24px 8px' }}>
                                    <b style={{ color: 'var(--cb-ink)' }}>Select a step to configure it.</b>
                                    <span>Click any step in the flow. Use + on a path to add a new one.</span>
                                </div>
                                <Overview detail={data} graph={graph} errors={errors} warnings={warnings} onJump={jumpTo} />
                            </div>
                        )
                    ) : rightTab === 'settings' ? (
                        <div className="cb-scroll" data-testid="flow-settings">
                            {data.kind === 'bot' && (
                                <>
                                    <label className="cb-field">
                                        <span className="l">Purpose</span>
                                        <input
                                            className="cb-in"
                                            list="cb-purposes"
                                            defaultValue={data.folder ?? ''}
                                            disabled={readOnly}
                                            placeholder="e.g. Bookings, Support, Lead capture"
                                            onBlur={async (e) => {
                                                const v = e.target.value.trim() || null;
                                                if (v === (data.folder ?? null)) return;
                                                try {
                                                    updateCache({ ...(await saveChatbot(flowId, { folder: v })), draft: graph });
                                                } catch (err) {
                                                    toast.error(errorMessage(err));
                                                }
                                            }}
                                        />
                                        <datalist id="cb-purposes">
                                            {['Bookings', 'Support', 'Lead capture', 'Sales', 'Orders'].map((x) => (
                                                <option key={x} value={x} />
                                            ))}
                                        </datalist>
                                    </label>
                                    <label className="cb-field">
                                        <span className="l">WhatsApp number</span>
                                        <select
                                            className="cb-in"
                                            value={data.phone_number_id ?? NO_NUMBER}
                                            disabled={readOnly || data.is_active}
                                            title={data.is_active ? 'Switch the flow off to move it to another number.' : undefined}
                                            onChange={async (e) => {
                                                const v = e.target.value;
                                                try {
                                                    updateCache({
                                                        ...(await saveChatbot(flowId, { phone_number_id: v === NO_NUMBER ? null : v })),
                                                        draft: graph,
                                                    });
                                                } catch (err) {
                                                    toast.error(errorMessage(err));
                                                }
                                            }}
                                        >
                                            <option value={NO_NUMBER}>No number yet</option>
                                            {numbers.map((n) => (
                                                <option key={n.id} value={n.id}>
                                                    {n.verified_name ?? n.display_phone_number} {n.verified_name ? `· ${n.display_phone_number}` : ''}
                                                    {n.status === 'disconnected' ? ' (disconnected)' : ''}
                                                </option>
                                            ))}
                                        </select>
                                        <span className="cb-h">
                                            {data.is_active
                                                ? 'Switch the flow off to move it to another number.'
                                                : 'Which messages start it is set in Start rules.'}
                                        </span>
                                    </label>
                                    <div className="cb-col" style={{ gap: 6 }}>
                                        <h3>Start rules for this flow</h3>
                                        <p className="cb-small">
                                            {data.triggers.length ? data.triggers.join(' · ') : 'Nothing starts it yet: open the Start step.'}
                                        </p>
                                        <div className="cb-row">
                                            <button type="button" className="cb-btn sm" onClick={() => leave('/chatbots/start-rules')}>
                                                Manage start rules
                                            </button>
                                            {start && (
                                                <button type="button" className="cb-btn sm" onClick={() => jumpTo(start.id)}>
                                                    Edit the Start step
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                            <div className="cb-col" style={{ gap: 6 }}>
                                <h3>Sections</h3>
                                <p className="cb-small cb-muted">Sections only group steps in the Simple view; they never change how a chat runs.</p>
                                {sections.map((x, i) => (
                                    <div key={x.id} className="cb-row" style={{ flexWrap: 'nowrap' }}>
                                        <input
                                            className="cb-in"
                                            value={x.name}
                                            disabled={readOnly}
                                            aria-label="Section name"
                                            onChange={(e) =>
                                                setSections(
                                                    sections.map((y) => (y.id === x.id ? { ...y, name: e.target.value.slice(0, 60) } : y)),
                                                    `secname:${x.id}`,
                                                )
                                            }
                                        />
                                        <span className="cb-small cb-muted" style={{ flex: 'none' }}>
                                            {graph.nodes.filter((n) => (n as FlowNode & { section?: string }).section === x.id).length} steps
                                        </span>
                                        <button
                                            type="button"
                                            className="cb-btn xs"
                                            aria-label="Move up"
                                            disabled={readOnly || i === 0}
                                            onClick={() => {
                                                const l = sections.slice();
                                                [l[i - 1], l[i]] = [l[i], l[i - 1]];
                                                setSections(l);
                                            }}
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            className="cb-btn xs"
                                            aria-label={`Delete section ${x.name}`}
                                            disabled={readOnly || graph.nodes.some((n) => (n as FlowNode & { section?: string }).section === x.id)}
                                            title="Only empty sections can be deleted"
                                            onClick={() => setSections(sections.filter((y) => y.id !== x.id))}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    className="cb-btn sm"
                                    style={{ alignSelf: 'flex-start' }}
                                    disabled={readOnly}
                                    onClick={() => setSections([...sections, { id: `sec_${Date.now().toString(36)}`, name: 'New section' }])}
                                >
                                    + Add section
                                </button>
                            </div>
                            <h3>Behaviour for this flow</h3>
                            <FlowSettingsDialog
                                inline
                                publishedLevel={data.published_engine_level}
                                open
                                onOpenChange={() => undefined}
                                settings={settings}
                                options={options.data}
                                readOnly={readOnly}
                                onSave={(next) => {
                                    setSettings(next);
                                    setDirty(true);
                                }}
                            />
                        </div>
                    ) : (
                        <div className="cb-scroll">
                            <HistoryPanel
                                detail={data}
                                canRestore={data.can.publish}
                                onRestore={setRestore}
                                canEdit={!readOnly}
                                onLoadDraft={async (revision) => {
                                    try {
                                        const r = await getChatbotRevision(flowId, revision);
                                        if (graph) setPast((p) => [...p.slice(-79), graph]);
                                        setFuture([]);
                                        setGraph(r.draft);
                                        setSettings(r.settings);
                                        setName(r.name);
                                        setDirty(true);
                                        toast.success(`Draft ${revision} loaded. It is saved as the newest draft; Undo brings back what you had.`);
                                    } catch (e) {
                                        toast.error(errorMessage(e));
                                    }
                                }}
                            />
                        </div>
                    )}
                </aside>
            </div>

            <RunPeriodDialog flow={runPeriod ? data : null} onClose={() => setRunPeriod(false)} onSaved={(d) => updateCache({ ...d, draft: graph })} />

            <DraftConflictDialog conflict={conflict} base={base} onResolve={resolveConflict} />
            <Dialog open={leaving !== null} onOpenChange={(o) => !o && !leaveBusy && setLeaving(null)}>
                <DialogContent className="sm:max-w-md">
                    {unsaved ? (
                        <>
                            <DialogHeader>
                                <DialogTitle>Save your changes before leaving?</DialogTitle>
                                <DialogDescription>
                                    {saving === 'error' ? 'Your last changes could not be saved. ' : 'Some changes to this flow are not saved yet. '}
                                    If you leave without saving, they will be lost.
                                </DialogDescription>
                            </DialogHeader>
                            <DialogFooter className="gap-2 sm:justify-between">
                                <Button variant="ghost" onClick={() => setLeaving(null)} disabled={leaveBusy}>
                                    Stay
                                </Button>
                                <div className="flex gap-2">
                                    <Button variant="outline" className="text-bad" onClick={() => leaving && go(leaving)} disabled={leaveBusy}>
                                        Leave without saving
                                    </Button>
                                    <Button
                                        disabled={leaveBusy}
                                        onClick={async () => {
                                            setLeaveBusy(true);
                                            const ok = await save();
                                            setLeaveBusy(false);
                                            if (ok && leaving) go(leaving);
                                        }}
                                    >
                                        {leaveBusy && <Loader2Icon className="animate-spin" />} Save and leave
                                    </Button>
                                </div>
                            </DialogFooter>
                        </>
                    ) : (
                        <>
                            <DialogHeader>
                                <DialogTitle>Publish your changes?</DialogTitle>
                                <DialogDescription>
                                    Your changes are saved as a draft, but customers still get version {data.published_version}
                                    {data.is_active ? ' (live now)' : ''} until you publish. You can also leave and publish later.
                                </DialogDescription>
                            </DialogHeader>
                            <DialogFooter className="gap-2 sm:justify-between">
                                <Button variant="ghost" onClick={() => setLeaving(null)} disabled={leaveBusy}>
                                    Stay
                                </Button>
                                <div className="flex gap-2">
                                    <Button variant="outline" onClick={() => leaving && go(leaving)} disabled={leaveBusy}>
                                        Leave, keep the draft
                                    </Button>
                                    {data.can.publish && (
                                        <Button
                                            disabled={leaveBusy || errors.length > 0 || needsReview}
                                            title={
                                                errors.length > 0
                                                    ? 'Fix the problems first'
                                                    : needsReview
                                                      ? 'This flow needs an approved review first'
                                                      : undefined
                                            }
                                            onClick={async () => {
                                                setLeaveBusy(true);
                                                try {
                                                    const detail = await publishChatbot(flowId, base?.revision);
                                                    updateCache({ ...detail, draft: graph });
                                                    toast.success(`Version ${detail.published_version} published`);
                                                    if (leaving) go(leaving);
                                                } catch (e) {
                                                    toast.error(errorMessage(e));
                                                } finally {
                                                    setLeaveBusy(false);
                                                }
                                            }}
                                        >
                                            {leaveBusy && <Loader2Icon className="animate-spin" />} Publish and leave
                                        </Button>
                                    )}
                                </div>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

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

/** Step tab with nothing selected: the publish checks, each problem one click from its step. */
function Overview({
    detail,
    graph,
    errors,
    warnings,
    onJump,
}: {
    detail: ChatbotFlowDetail;
    graph: FlowGraph;
    errors: FlowIssue[];
    warnings: FlowIssue[];
    onJump: (id: string) => void;
}) {
    const checks: [boolean, string][] = [
        [errors.filter((e) => e.code === 'unconnected').length === 0, 'Every path has a next step'],
        [errors.filter((e) => e.code === 'unreachable').length === 0, 'Every step can be reached'],
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
        <div className="cb-col" style={{ gap: 10 }}>
            <h3>Before publishing</h3>
            <ul className="cb-col" style={{ gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
                {checks.map(([ok, label]) => (
                    <li key={label} className="cb-row cb-small">
                        {ok ? (
                            <CheckCircle2Icon className="size-4 shrink-0" style={{ color: 'var(--cb-brand-deep)' }} />
                        ) : (
                            <CircleAlertIcon className="size-4 shrink-0" style={{ color: 'var(--cb-bad-i)' }} />
                        )}
                        {label}
                    </li>
                ))}
            </ul>
            {errors.length === 0 ? (
                <p className="cb-banner ok cb-small">
                    Ready to publish{warnings.length ? ` (${warnings.length} warning${warnings.length === 1 ? '' : 's'})` : ''}.
                </p>
            ) : (
                errors.slice(0, 8).map((i, n) => (
                    <button
                        key={n}
                        type="button"
                        onClick={() => i.node_id && onJump(i.node_id)}
                        className="cb-banner bad cb-small"
                        style={{ border: 0, textAlign: 'left', cursor: 'pointer' }}
                    >
                        {i.message}
                    </button>
                ))
            )}
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

/** A teammate saved this flow first: merge, keep mine for clashing steps, or take theirs. Nothing is overwritten silently. */
function DraftConflictDialog({
    conflict,
    base,
    onResolve,
}: {
    conflict: (DraftConflict & { mine: { graph: FlowGraph; settings: FlowSettings; name: string } }) | null;
    base: { graph: FlowGraph; settings: FlowSettings; name: string } | null;
    onResolve: (how: 'mine' | 'theirs' | 'discard') => void;
}) {
    const preview = useMemo(
        () => (conflict && base ? mergeDrafts(base, conflict.mine, { graph: conflict.draft, settings: conflict.settings, name: conflict.name }) : null),
        [conflict, base],
    );
    if (!conflict || !preview) return null;
    const who = conflict.edited_by ?? 'A teammate';
    const at = conflict.edited_at ? new Date(conflict.edited_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : null;

    return (
        <Dialog open onOpenChange={() => undefined}>
            <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>{who} saved this flow while you were editing</DialogTitle>
                    <DialogDescription>
                        {at ? `Saved at ${at}. ` : ''}Your changes are not lost and nothing was overwritten. Choose how to combine the two drafts.
                    </DialogDescription>
                </DialogHeader>
                {preview.conflicts.length === 0 ? (
                    <p className="text-sm">
                        You changed different steps, so both sets of changes fit together
                        {preview.fromTheirs > 0 ? ` (${preview.fromTheirs} step${preview.fromTheirs === 1 ? '' : 's'} from ${who})` : ''}.
                    </p>
                ) : (
                    <div className="space-y-2 text-sm">
                        <p>You both changed:</p>
                        <ul className="list-disc space-y-0.5 pl-5" data-testid="conflict-list">
                            {preview.conflicts.map((c) => (
                                <li key={c.id}>{c.title}</li>
                            ))}
                        </ul>
                        <p className="text-muted-foreground">Everything else is merged. For these, keep your version or theirs.</p>
                    </div>
                )}
                <DialogFooter className="gap-2 sm:justify-between">
                    <Button variant="ghost" onClick={() => onResolve('discard')}>
                        Discard my changes
                    </Button>
                    <div className="flex gap-2">
                        {preview.conflicts.length > 0 && (
                            <Button variant="outline" onClick={() => onResolve('theirs')}>
                                Merge, theirs for these
                            </Button>
                        )}
                        <Button onClick={() => onResolve('mine')}>{preview.conflicts.length > 0 ? 'Merge, mine for these' : 'Merge and save'}</Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
