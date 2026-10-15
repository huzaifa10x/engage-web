'use client';

import { CircleAlertIcon, LocateFixedIcon, MaximizeIcon, MessageSquareIcon, MinusIcon, PlusIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';

import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import {
    blockOf,
    CARD_WIDTH,
    type FlowGraph,
    type FlowIssue,
    type FlowNode,
    groupOf,
    isInput,
    type NodeStats,
    nodeSummary,
    type NodeType,
    snap,
} from '@/lib/chatbots';
import { cn } from '@/lib/utils';

import { BlockList, PALETTE_MIME } from './block-picker';
import { messageOf, WaBubble } from './wa-preview';

export type CanvasApi = {
    fit: () => void;
    center: (id: string) => void;
    heights: () => Map<string, number>;
    /** Canvas point at the middle of what is on screen (where a clicked block is placed when nothing is selected). */
    middle: () => { x: number; y: number };
};

type View = { x: number; y: number; z: number };
type Drag =
    | { kind: 'nodes'; start: { x: number; y: number }; origin: Map<string, { x: number; y: number }>; moved: boolean }
    | { kind: 'wire'; from: string; output: string; x: number; y: number }
    | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
    | { kind: 'marquee'; x0: number; y0: number; x1: number; y1: number };

const MIN_Z = 0.25;
const MAX_Z = 1.6;

/**
 * The canvas: horizontal cards with one connector per branch on their right edge, auto-routed
 * wires to the next block's left edge, pan (drag the background), zoom (Ctrl/⌘ + wheel or the
 * buttons), a minimap, snap-to-grid, multi-select (Shift + click, Shift + drag a box) and a "+"
 * on every open branch that adds and connects the next block in one click.
 */
export function FlowCanvas({
    graph,
    selection,
    focusId,
    onSelect,
    onMoveMany,
    onMoveEnd,
    onConnect,
    onDropNode,
    onQuickAdd,
    issues,
    openPorts,
    analytics,
    comments,
    titles,
    subflows,
    readOnly,
    snapOn,
    apiRef,
    rtl,
}: {
    graph: FlowGraph;
    selection: Set<string>;
    focusId: string | null;
    onSelect: (ids: string[], mode?: 'replace' | 'toggle' | 'add') => void;
    onMoveMany: (moves: { id: string; x: number; y: number }[]) => void;
    onMoveEnd: () => void;
    onConnect: (from: string, output: string, to: string | null) => void;
    onDropNode: (type: NodeType, x: number, y: number) => void;
    onQuickAdd: (from: string, output: string, type: NodeType) => void;
    issues: FlowIssue[];
    openPorts: Map<string, Set<string>>;
    analytics: Record<string, NodeStats> | null;
    comments: Map<string, number>;
    titles: Map<string, string>;
    subflows: { id: string; name: string }[];
    readOnly: boolean;
    snapOn: boolean;
    apiRef: React.RefObject<CanvasApi | null>;
    rtl: boolean;
}) {
    const viewport = useRef<HTMLDivElement>(null);
    const layer = useRef<HTMLDivElement>(null);
    const wires = useRef<SVGSVGElement>(null);
    const [view, setView] = useState<View>({ x: 40, y: 40, z: 1 });
    const [drag, setDrag] = useState<Drag | null>(null);
    const [size, setSize] = useState({ w: 1200, h: 800 });
    const [wire, setWire] = useState<{ from: string; output: string } | null>(null);
    const [adding, setAdding] = useState<{ from: string; output: string } | null>(null);

    const errorsByNode = new Map<string, FlowIssue[]>();
    const badPorts = new Set<string>();
    for (const i of issues) {
        if (!i.node_id) continue;
        errorsByNode.set(i.node_id, [...(errorsByNode.get(i.node_id) ?? []), i]);
        if (i.output_id && i.level === 'error') badPorts.add(`${i.node_id}:${i.output_id}`);
    }
    for (const [node, outs] of openPorts) for (const o of outs) badPorts.add(`${node}:${o}`);

    const toCanvas = (clientX: number, clientY: number) => {
        const r = viewport.current?.getBoundingClientRect();

        return r ? { x: (clientX - r.left - view.x) / view.z, y: (clientY - r.top - view.y) / view.z } : { x: 0, y: 0 };
    };

    const bounds = () => {
        const hs = heights();
        const xs = graph.nodes.map((n) => n.x);
        const ys = graph.nodes.map((n) => n.y);
        if (xs.length === 0) return { minX: 0, minY: 0, maxX: 800, maxY: 600 };

        return {
            minX: Math.min(...xs),
            minY: Math.min(...ys),
            maxX: Math.max(...graph.nodes.map((n) => n.x + CARD_WIDTH)),
            maxY: Math.max(...graph.nodes.map((n) => n.y + (hs.get(n.id) ?? 180))),
        };
    };
    const heights = () => {
        const map = new Map<string, number>();
        layer.current?.querySelectorAll<HTMLElement>('[data-node]').forEach((el) => map.set(el.dataset.node ?? '', el.offsetHeight));

        return map;
    };
    const fit = () => {
        const b = bounds();
        const w = viewport.current?.clientWidth ?? size.w;
        const h = viewport.current?.clientHeight ?? size.h;
        const bw = b.maxX - b.minX + 160;
        const bh = b.maxY - b.minY + 160;
        const z = Math.max(MIN_Z, Math.min(1, w / bw, h / bh));
        setView({ z: Number(z.toFixed(3)), x: (w - (b.maxX - b.minX) * z) / 2 - b.minX * z, y: Math.max(24, (h - (b.maxY - b.minY) * z) / 2) - b.minY * z });
    };
    const center = (id: string) => {
        const n = graph.nodes.find((x) => x.id === id);
        if (!n) return;
        const w = viewport.current?.clientWidth ?? size.w;
        const h = viewport.current?.clientHeight ?? size.h;
        setView((v) => ({ ...v, x: w / 2 - (n.x + CARD_WIDTH / 2) * v.z, y: h / 3 - n.y * v.z }));
    };

    useEffect(() => {
        apiRef.current = {
            fit,
            center,
            heights,
            middle: () => {
                const w = viewport.current?.clientWidth ?? size.w;
                const h = viewport.current?.clientHeight ?? size.h;

                return { x: (w / 2 - view.x) / view.z - CARD_WIDTH / 2, y: (h / 3 - view.y) / view.z };
            },
        };
    });

    // Size of the viewport (for the minimap and fit).
    useEffect(() => {
        const el = viewport.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
        ro.observe(el);

        return () => ro.disconnect();
    }, []);

    // Fit the whole flow when the builder opens; a big flow opens readable at its start instead (the minimap shows the rest).
    const fitOnOpen = useEffectEvent(() => {
        const b = bounds();
        const w = viewport.current?.clientWidth ?? size.w;
        const h = viewport.current?.clientHeight ?? size.h;
        const fitZ = Math.min(1, w / (b.maxX - b.minX + 160), h / (b.maxY - b.minY + 160));
        if (fitZ >= 0.6) {
            fit();

            return;
        }
        const start = graph.nodes.find((n) => n.type === 'start') ?? graph.nodes[0];
        const z = 0.8;
        setView({ z, x: 48 - (start?.x ?? 0) * z, y: 48 - Math.min(start?.y ?? 0, b.minY) * z });
    });
    useEffect(() => {
        const frame = requestAnimationFrame(() => fitOnOpen());

        return () => cancelAnimationFrame(frame);
    }, []);

    // Wheel: Ctrl/⌘ zooms around the pointer, otherwise it pans (trackpads, mouse wheels).
    const onWheel = useEffectEvent((e: WheelEvent) => {
        e.preventDefault();
        const r = viewport.current?.getBoundingClientRect();
        if (!r) return;
        if (e.ctrlKey || e.metaKey) {
            const px = e.clientX - r.left;
            const py = e.clientY - r.top;
            setView((v) => {
                const z = Math.min(MAX_Z, Math.max(MIN_Z, v.z * Math.exp(-e.deltaY * 0.0022)));

                return { z, x: px - ((px - v.x) / v.z) * z, y: py - ((py - v.y) / v.z) * z };
            });
        } else {
            setView((v) => ({ ...v, x: v.x - (e.shiftKey ? e.deltaY : e.deltaX), y: v.y - (e.shiftKey ? 0 : e.deltaY) }));
        }
    });
    useEffect(() => {
        const el = viewport.current;
        if (!el) return;
        const handler = (e: WheelEvent) => onWheel(e);
        el.addEventListener('wheel', handler, { passive: false });

        return () => el.removeEventListener('wheel', handler);
    }, []);

    // Delete key on a selected wire disconnects it.
    const onKey = useEffectEvent((e: KeyboardEvent) => {
        const t = e.target as HTMLElement | null;
        if (!wire || readOnly || (t && t.closest('input, textarea, select, [contenteditable="true"]'))) return;
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            e.stopImmediatePropagation();
            onConnect(wire.from, wire.output, null);
            setWire(null);
        }
    });
    useEffect(() => {
        const handler = (e: KeyboardEvent) => onKey(e);
        window.addEventListener('keydown', handler, true);

        return () => window.removeEventListener('keydown', handler, true);
    }, []);

    // Wires are drawn from where the connectors really are, after every render.
    useLayoutEffect(() => {
        const svg = wires.current;
        const root = layer.current;
        if (!svg || !root) return;
        const rect = root.getBoundingClientRect();
        const z = view.z;
        const at = (el: Element) => {
            const r = el.getBoundingClientRect();

            return { x: (r.left + r.width / 2 - rect.left) / z, y: (r.top + r.height / 2 - rect.top) / z };
        };
        const ins = new Map<string, Element>();
        root.querySelectorAll('[data-in]').forEach((el) => ins.set(el.getAttribute('data-in') ?? '', el));
        const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => {
            const dx = Math.max(60, Math.abs(b.x - a.x) / 2);
            if (b.x < a.x + 30) {
                // Back to an earlier block: loop out to the right and come in from the left.
                const out = 70;
                const low = Math.max(a.y, b.y) + 90;

                return `M${a.x} ${a.y} C ${a.x + out} ${a.y} ${a.x + out} ${low} ${a.x} ${low} L ${b.x} ${low} C ${b.x - out} ${low} ${b.x - out} ${b.y} ${b.x} ${b.y}`;
            }

            return `M${a.x} ${a.y} C ${a.x + dx} ${a.y} ${b.x - dx} ${b.y} ${b.x} ${b.y}`;
        };
        let html = '';
        for (const node of graph.nodes) {
            for (const out of node.outputs) {
                if (!out.to) continue;
                const port = root.querySelector(`[data-port="${CSS.escape(node.id)}:${CSS.escape(out.id)}"]`);
                const target = ins.get(out.to);
                if (!port || !target) continue;
                const a = at(port);
                const b = at(target);
                const d = curve(a, b);
                const chosen = wire?.from === node.id && wire.output === out.id;
                const hot = chosen || selection.has(node.id) || selection.has(out.to);
                const soft = ['fallback', 'timeout', 'failed', 'error', 'not_found', 'closed', 'no'].includes(out.id);
                const color = chosen ? '#e5484d' : hot ? '#689d0f' : soft ? '#d4a017' : '#a3a8b1';
                html += `<path d="${d}" fill="none" stroke="transparent" stroke-width="14" style="pointer-events:stroke;cursor:pointer" data-wire="${node.id}|${out.id}"/>`;
                html += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${hot ? 2.4 : 1.8}" ${soft ? 'stroke-dasharray="6 4"' : ''} style="pointer-events:none"/>`;
                html += `<circle cx="${b.x}" cy="${b.y}" r="3.2" fill="${color}" style="pointer-events:none"/>`;
                if (chosen && !readOnly) {
                    const mx = (a.x + b.x) / 2;
                    const my = (a.y + b.y) / 2;
                    html += `<g data-cut="${node.id}|${out.id}" style="pointer-events:all;cursor:pointer"><circle cx="${mx}" cy="${my}" r="10" fill="#fff" stroke="#e5484d" stroke-width="1.5"/><path d="M${mx - 3.5} ${my - 3.5} L${mx + 3.5} ${my + 3.5} M${mx + 3.5} ${my - 3.5} L${mx - 3.5} ${my + 3.5}" stroke="#e5484d" stroke-width="1.8"/></g>`;
                }
            }
        }
        if (drag?.kind === 'wire') {
            const port = root.querySelector(`[data-port="${CSS.escape(drag.from)}:${CSS.escape(drag.output)}"]`);
            if (port) html += `<path d="${curve(at(port), { x: drag.x, y: drag.y })}" fill="none" stroke="#689d0f" stroke-width="2.4" stroke-dasharray="6 4"/>`;
        }
        svg.innerHTML = html;
    });

    // Pointer moves and releases are followed on the whole window while dragging.
    useEffect(() => {
        if (!drag) return;
        const move = (e: PointerEvent) => {
            if (drag.kind === 'pan') {
                setView((v) => ({ ...v, x: drag.vx + e.clientX - drag.sx, y: drag.vy + e.clientY - drag.sy }));

                return;
            }
            const p = toCanvas(e.clientX, e.clientY);
            if (drag.kind === 'nodes') {
                const dx = p.x - drag.start.x;
                const dy = p.y - drag.start.y;
                if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
                onMoveMany([...drag.origin].map(([id, o]) => ({ id, x: Math.max(0, snap(o.x + dx, snapOn)), y: Math.max(0, snap(o.y + dy, snapOn)) })));
                if (!drag.moved) setDrag({ ...drag, moved: true });
            } else if (drag.kind === 'wire') {
                setDrag({ ...drag, x: p.x, y: p.y });
            } else {
                setDrag({ ...drag, x1: p.x, y1: p.y });
            }
        };
        const up = (e: PointerEvent) => {
            if (drag.kind === 'nodes' && drag.moved) onMoveEnd();
            if (drag.kind === 'wire') {
                const el = document.elementFromPoint(e.clientX, e.clientY);
                const target = el?.closest('[data-node]')?.getAttribute('data-node') ?? null;
                if (target !== drag.from) onConnect(drag.from, drag.output, target);
            }
            if (drag.kind === 'marquee') {
                const [x0, x1] = [Math.min(drag.x0, drag.x1), Math.max(drag.x0, drag.x1)];
                const [y0, y1] = [Math.min(drag.y0, drag.y1), Math.max(drag.y0, drag.y1)];
                const hs = heights();
                const inside = graph.nodes.filter((n) => n.x < x1 && n.x + CARD_WIDTH > x0 && n.y < y1 && n.y + (hs.get(n.id) ?? 160) > y0).map((n) => n.id);
                onSelect(inside, 'add');
            }
            setDrag(null);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);

        return () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
        };
    });

    const zoomBy = (f: number) =>
        setView((v) => {
            const z = Math.min(MAX_Z, Math.max(MIN_Z, v.z * f));
            const cx = size.w / 2;
            const cy = size.h / 2;

            return { z, x: cx - ((cx - v.x) / v.z) * z, y: cy - ((cy - v.y) / v.z) * z };
        });

    const onlyStart = graph.nodes.length === 1 && graph.nodes[0].type === 'start';

    return (
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
            <div
                ref={viewport}
                className={cn(
                    'absolute inset-0 touch-none overflow-hidden bg-[#f4f5f2] select-none',
                    drag?.kind === 'pan' ? 'cursor-grabbing' : 'cursor-default',
                )}
                style={{
                    backgroundImage: 'radial-gradient(circle, #cfd2cb 1px, transparent 1.2px)',
                    backgroundSize: `${20 * view.z}px ${20 * view.z}px`,
                    backgroundPosition: `${view.x}px ${view.y}px`,
                }}
                onPointerDown={(e) => {
                    const t = e.target as Element;
                    if (t.closest('[data-node]') || t.closest('[data-ui]')) return;
                    const cut = t.closest('[data-cut]')?.getAttribute('data-cut');
                    if (cut) {
                        const [from, output] = cut.split('|');
                        onConnect(from, output, null);
                        setWire(null);

                        return;
                    }
                    const w = t.getAttribute('data-wire');
                    if (w) {
                        const [from, output] = w.split('|');
                        setWire({ from, output });
                        onSelect([]);

                        return;
                    }
                    setWire(null);
                    if (e.button !== 0 && e.button !== 1) return;
                    if (e.shiftKey && !readOnly) {
                        const p = toCanvas(e.clientX, e.clientY);
                        setDrag({ kind: 'marquee', x0: p.x, y0: p.y, x1: p.x, y1: p.y });
                    } else {
                        onSelect([]);
                        setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y });
                    }
                }}
                onDragOver={(e) => {
                    if (!readOnly && e.dataTransfer.types.includes(PALETTE_MIME)) e.preventDefault();
                }}
                onDrop={(e) => {
                    const type = e.dataTransfer.getData(PALETTE_MIME) as NodeType;
                    if (!type || readOnly) return;
                    e.preventDefault();
                    const p = toCanvas(e.clientX, e.clientY);
                    onDropNode(type, Math.max(0, snap(p.x - CARD_WIDTH / 2, snapOn)), Math.max(0, snap(p.y - 24, snapOn)));
                }}
            >
                <div
                    ref={layer}
                    className="absolute top-0 left-0 origin-top-left"
                    style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}
                >
                    <svg ref={wires} className="pointer-events-none absolute top-0 left-0 z-[1] overflow-visible" width={1} height={1} aria-hidden />
                    {graph.nodes.map((node) => (
                        <NodeCard
                            key={node.id}
                            node={node}
                            selected={selection.has(node.id)}
                            focused={focusId === node.id}
                            dragging={drag?.kind === 'nodes' && drag.moved && drag.origin.has(node.id)}
                            issues={errorsByNode.get(node.id) ?? []}
                            badPorts={badPorts}
                            stats={analytics ? (analytics[node.id] ?? null) : undefined}
                            comments={comments.get(node.id) ?? 0}
                            summary={nodeSummary(node, { titles, subflows })}
                            readOnly={readOnly}
                            rtl={rtl}
                            adding={adding?.from === node.id ? adding.output : null}
                            onAdding={(output) => setAdding(output ? { from: node.id, output } : null)}
                            onQuickAdd={(output, type) => {
                                setAdding(null);
                                onQuickAdd(node.id, output, type);
                            }}
                            onPointerDown={(e) => {
                                if (e.button !== 0) return;
                                if ((e.target as Element).closest('[data-port], [data-ui], button, a')) return;
                                setWire(null);
                                const additive = e.shiftKey || e.metaKey || e.ctrlKey;
                                const ids = additive ? [node.id] : selection.has(node.id) ? [...selection] : [node.id];
                                if (additive) onSelect([node.id], 'toggle');
                                else if (!selection.has(node.id)) onSelect([node.id]);
                                if (readOnly || (additive && selection.has(node.id))) return;
                                const moving = additive ? [...selection, node.id] : ids;
                                const origin = new Map(graph.nodes.filter((n) => moving.includes(n.id)).map((n) => [n.id, { x: n.x, y: n.y }]));
                                setDrag({ kind: 'nodes', start: toCanvas(e.clientX, e.clientY), origin, moved: false });
                            }}
                            onPortDown={(e, output) => {
                                e.stopPropagation();
                                if (readOnly || e.button !== 0) return;
                                const p = toCanvas(e.clientX, e.clientY);
                                setDrag({ kind: 'wire', from: node.id, output, x: p.x, y: p.y });
                            }}
                        />
                    ))}
                    {drag?.kind === 'marquee' && (
                        <div
                            className="pointer-events-none absolute z-[6] rounded border border-brand-500 bg-brand-500/10"
                            style={{
                                left: Math.min(drag.x0, drag.x1),
                                top: Math.min(drag.y0, drag.y1),
                                width: Math.abs(drag.x1 - drag.x0),
                                height: Math.abs(drag.y1 - drag.y0),
                            }}
                        />
                    )}
                </div>
            </div>

            {onlyStart && !readOnly && (
                <div data-ui className="pointer-events-none absolute inset-x-0 top-6 z-10 flex justify-center">
                    <div className="max-w-md rounded-xl border bg-card/95 px-5 py-4 text-center shadow-sm backdrop-blur">
                        <p className="text-[14px] font-semibold">Your flow starts here</p>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                            Click <b>+</b> on the Start block to add the first message, or drag a block from the left. Every branch needs a next step — the{' '}
                            <b>+</b> on it adds and connects one in one click.
                        </p>
                    </div>
                </div>
            )}

            {/* Zoom & minimap */}
            <div data-ui className="absolute right-3 bottom-3 z-10 flex flex-col items-end gap-2">
                <Minimap
                    graph={graph}
                    view={view}
                    size={size}
                    selection={selection}
                    issues={errorsByNode}
                    onJump={(x, y) => setView((v) => ({ ...v, x: size.w / 2 - x * v.z, y: size.h / 2 - y * v.z }))}
                />
                <div className="flex items-center gap-0.5 rounded-lg border bg-card p-0.5 shadow-sm">
                    <button className="rounded-md p-1.5 hover:bg-muted" onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out" title="Zoom out">
                        <MinusIcon className="size-4" />
                    </button>
                    <button
                        className="min-w-12 rounded-md px-1.5 py-1 text-[12px] font-semibold tabular-nums hover:bg-muted"
                        onClick={() => setView((v) => ({ ...v, z: 1 }))}
                        title="Actual size"
                    >
                        {Math.round(view.z * 100)}%
                    </button>
                    <button className="rounded-md p-1.5 hover:bg-muted" onClick={() => zoomBy(1.2)} aria-label="Zoom in" title="Zoom in">
                        <PlusIcon className="size-4" />
                    </button>
                    <button className="rounded-md p-1.5 hover:bg-muted" onClick={fit} aria-label="Fit the flow on screen" title="Fit to screen (F)">
                        <MaximizeIcon className="size-4" />
                    </button>
                    {selection.size === 1 && (
                        <button
                            className="rounded-md p-1.5 hover:bg-muted"
                            onClick={() => center([...selection][0])}
                            aria-label="Center the selected block"
                            title="Center the selected block"
                        >
                            <LocateFixedIcon className="size-4" />
                        </button>
                    )}
                </div>
            </div>
            {!readOnly && !onlyStart && (
                <div
                    data-ui
                    className="pointer-events-none absolute bottom-3 left-3 z-10 hidden max-w-[calc(100%-18rem)] truncate rounded-full border bg-card/95 px-3.5 py-1.5 text-[11.5px] text-muted-foreground shadow-sm xl:block"
                >
                    Drag the background to move around · Ctrl + scroll to zoom · Shift + drag to select several · drag a connector onto a block to link it
                </div>
            )}
        </div>
    );
}

function Minimap({
    graph,
    view,
    size,
    selection,
    issues,
    onJump,
}: {
    graph: FlowGraph;
    view: View;
    size: { w: number; h: number };
    selection: Set<string>;
    issues: Map<string, FlowIssue[]>;
    onJump: (x: number, y: number) => void;
}) {
    if (graph.nodes.length < 2) return null;
    const W = 190;
    const H = 120;
    const vx = -view.x / view.z;
    const vy = -view.y / view.z;
    const vw = size.w / view.z;
    const vh = size.h / view.z;
    const minX = Math.min(vx, ...graph.nodes.map((n) => n.x)) - 40;
    const minY = Math.min(vy, ...graph.nodes.map((n) => n.y)) - 40;
    const maxX = Math.max(vx + vw, ...graph.nodes.map((n) => n.x + CARD_WIDTH)) + 40;
    const maxY = Math.max(vy + vh, ...graph.nodes.map((n) => n.y + 160)) + 40;
    const s = Math.min(W / (maxX - minX), H / (maxY - minY));

    return (
        <svg
            width={W}
            height={H}
            className="cursor-pointer rounded-lg border bg-card/95 shadow-sm"
            aria-label="Minimap: click to move there"
            onPointerDown={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                onJump(minX + (e.clientX - r.left) / s, minY + (e.clientY - r.top) / s);
            }}
        >
            {graph.nodes.map((n) => {
                const bad = (issues.get(n.id) ?? []).some((i) => i.level === 'error');

                return (
                    <rect
                        key={n.id}
                        x={(n.x - minX) * s}
                        y={(n.y - minY) * s}
                        width={CARD_WIDTH * s}
                        height={Math.max(4, 120 * s)}
                        rx={2}
                        fill={selection.has(n.id) ? '#689d0f' : bad ? '#e5484d' : n.type === 'start' ? '#a9e324' : '#c8ccd2'}
                    />
                );
            })}
            <rect
                x={(vx - minX) * s}
                y={(vy - minY) * s}
                width={vw * s}
                height={vh * s}
                fill="rgba(104,157,15,.08)"
                stroke="#689d0f"
                strokeWidth={1.2}
                rx={3}
            />
        </svg>
    );
}

function NodeCard({
    node,
    selected,
    focused,
    dragging,
    issues,
    badPorts,
    stats,
    comments,
    summary,
    readOnly,
    rtl,
    adding,
    onAdding,
    onQuickAdd,
    onPointerDown,
    onPortDown,
}: {
    node: FlowNode;
    selected: boolean;
    focused: boolean;
    dragging: boolean;
    issues: FlowIssue[];
    badPorts: Set<string>;
    stats: NodeStats | null | undefined;
    comments: number;
    summary: string;
    readOnly: boolean;
    rtl: boolean;
    adding: string | null;
    onAdding: (output: string | null) => void;
    onQuickAdd: (output: string, type: NodeType) => void;
    onPointerDown: (e: React.PointerEvent) => void;
    onPortDown: (e: React.PointerEvent, output: string) => void;
}) {
    const block = blockOf(node.type);
    const group = groupOf(node.type);
    const Icon = block.icon;
    const bubble = messageOf(node);
    const errors = issues.filter((i) => i.level === 'error');
    const warnings = issues.filter((i) => i.level === 'warning');
    const choiceOutputs = node.type === 'buttons' || node.type === 'list';
    const softOutputs = ['fallback', 'timeout', 'failed'];
    const showStats = stats !== undefined;

    return (
        <div
            data-node={node.id}
            onPointerDown={onPointerDown}
            style={{ left: node.x, top: node.y, width: CARD_WIDTH }}
            className={cn(
                'group/card absolute z-[2] rounded-2xl border bg-card shadow-[0_1px_2px_rgba(16,24,40,.06),0_4px_14px_rgba(16,24,40,.05)] transition-[box-shadow,border-color]',
                readOnly ? 'cursor-pointer' : 'cursor-grab',
                node.type === 'start' && 'border-brand-500/50 bg-gradient-to-b from-brand-50 to-card',
                errors.length > 0 && 'border-bad/70 shadow-[0_0_0_3px_rgba(229,72,77,.14)]',
                errors.length === 0 && warnings.length > 0 && 'border-warn/60',
                selected && 'border-brand-500 shadow-[0_0_0_3px_rgba(169,227,36,.5)]',
                focused && 'ring-4 ring-sky-400/50',
                dragging && 'z-[5] cursor-grabbing shadow-[0_14px_34px_rgba(16,24,40,.18)]',
            )}
        >
            {/* Input */}
            {node.type !== 'start' && (
                <span data-in={node.id} className="absolute top-[22px] -left-[7px] z-[3] size-3.5 rounded-full border-2 border-[#a3a8b1] bg-card" aria-hidden />
            )}

            <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
                <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', group.chip)}>
                    <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] leading-tight font-semibold">{node.title}</p>
                    <p className={cn('text-[10px] font-bold tracking-wider uppercase', group.tone)}>{node.type === 'start' ? 'Trigger' : block.label}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {comments > 0 && (
                        <span
                            className="flex items-center gap-0.5 rounded-full bg-sky-100 px-1.5 py-px text-[10.5px] font-bold text-sky-700"
                            title={`${comments} open comment(s)`}
                        >
                            <MessageSquareIcon className="size-3" /> {comments}
                        </span>
                    )}
                    {errors.length > 0 ? (
                        <span
                            className="flex items-center gap-0.5 rounded-full bg-bad px-1.5 py-px text-[10.5px] font-bold text-white"
                            title={errors.map((i) => i.message).join('\n')}
                        >
                            <CircleAlertIcon className="size-3" /> {errors.length}
                        </span>
                    ) : warnings.length > 0 ? (
                        <span className="flex items-center rounded-full bg-warn-bg px-1 py-px text-warn" title={warnings.map((i) => i.message).join('\n')}>
                            <TriangleAlertIcon className="size-3" />
                        </span>
                    ) : null}
                </div>
            </div>

            {showStats && (
                <div
                    className="mx-3 mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 rounded-lg bg-slate-900 px-2.5 py-1 text-[10.5px] font-semibold text-white"
                    title="Last 30 days"
                >
                    <span>▶ {stats?.entries ?? 0}</span>
                    {(stats?.abandoned ?? 0) > 0 && <span className="text-amber-300">⏏ {stats?.abandoned} left</span>}
                    {(stats?.no_match ?? 0) > 0 && <span className="text-sky-300">? {stats?.no_match}</span>}
                    {(stats?.errors ?? 0) > 0 && <span className="text-red-300">⚠ {stats?.errors}</span>}
                    {(stats?.handoffs ?? 0) > 0 && <span>👤 {stats?.handoffs}</span>}
                </div>
            )}

            <div className="px-3 pb-2">
                {bubble ? (
                    <div className="rounded-xl bg-[#efeae2] p-2">
                        <WaBubble message={{ ...bubble, buttons: [] }} compact rtl={rtl} />
                    </div>
                ) : (
                    summary && <p className="line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">{summary}</p>
                )}
                {bubble && node.type !== 'note' && summary && ['question', 'handoff', 'end', 'product'].includes(node.type) && (
                    <p className="mt-1.5 line-clamp-1 text-[11px] text-muted-foreground">{summary}</p>
                )}
                {isInput(node) && node.config.no_match === 'off' && <p className="mt-1.5 text-[10.5px] font-medium text-warn">Unknown answers: no reply</p>}
            </div>

            {node.outputs.length > 0 && (
                <div className="space-y-1 px-3 pb-3">
                    {node.outputs.map((out) => {
                        const key = `${node.id}:${out.id}`;
                        const bad = badPorts.has(key);
                        const soft = softOutputs.includes(out.id);
                        const choice = choiceOutputs && !soft;

                        return (
                            <div
                                key={out.id}
                                className={cn(
                                    'relative flex h-8 items-center rounded-lg pr-3 pl-2.5 text-[12px]',
                                    choice ? 'justify-center border bg-card font-semibold text-[#027eb5]' : 'justify-end bg-muted/60 text-ink-2',
                                    soft && 'border border-dashed border-amber-300 bg-amber-50 text-amber-800',
                                    bad && 'border-bad/60 bg-bad-bg text-bad',
                                )}
                            >
                                <span className="truncate" title={out.label}>
                                    {out.label}
                                    {showStats && stats?.clicks[out.id] ? <b className="ml-1.5 text-slate-500 tabular-nums">· {stats.clicks[out.id]}</b> : null}
                                </span>
                                <span
                                    data-port={key}
                                    onPointerDown={(e) => onPortDown(e, out.id)}
                                    role="button"
                                    aria-label={`Connect “${out.label}”`}
                                    title={out.to ? 'Drag to another block to change where this goes' : 'Drag to a block to connect, or click + to add one'}
                                    className={cn(
                                        'absolute top-1/2 -right-[19px] z-[3] size-3.5 -translate-y-1/2 rounded-full border-2 bg-card',
                                        readOnly ? 'cursor-default' : 'cursor-crosshair hover:scale-125',
                                        out.to ? 'border-brand-500 bg-brand-500' : bad ? 'border-bad bg-bad-bg' : 'border-[#a3a8b1]',
                                    )}
                                />
                                {!out.to && !readOnly && (
                                    <Popover open={adding === out.id} onOpenChange={(o) => onAdding(o ? out.id : null)}>
                                        <PopoverAnchor asChild>
                                            <button
                                                data-ui
                                                type="button"
                                                onClick={() => onAdding(out.id)}
                                                className={cn(
                                                    'absolute top-1/2 -right-[46px] z-[3] flex size-5 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-xs hover:border-brand-500 hover:bg-brand-50 hover:text-brand-600',
                                                    bad && 'border-bad/60 text-bad',
                                                )}
                                                aria-label={`Add the next block after “${out.label}”`}
                                                title="Add the next block here"
                                            >
                                                <PlusIcon className="size-3" />
                                            </button>
                                        </PopoverAnchor>
                                        <PopoverContent side="right" align="start" className="w-72 p-2.5" onPointerDown={(e) => e.stopPropagation()}>
                                            <p className="mb-2 px-1 text-[12px] font-semibold">After “{out.label}”, add…</p>
                                            <BlockList onPick={(type) => onQuickAdd(out.id, type)} autoFocus dense />
                                        </PopoverContent>
                                    </Popover>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            {node.outputs.length === 0 && node.type !== 'goto' && (
                <p className="mx-3 mb-3 rounded-lg bg-muted/60 px-2.5 py-1.5 text-center text-[11px] font-semibold text-muted-foreground">
                    {node.type === 'handoff' ? 'The bot pauses · a person continues' : node.type === 'end' ? 'The flow ends here' : ''}
                </p>
            )}
        </div>
    );
}
