'use client';

import { AlertTriangleIcon, MaximizeIcon, MinusIcon, PlusIcon } from 'lucide-react';
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';

import { type ChatbotAnalytics, type FlowGraph, type FlowNode, kindOf, type NodeType, nodePreview } from '@/lib/chatbots';
import { cn } from '@/lib/utils';

const NODE_WIDTH = 224;
const PORT_SPACING = 66;
export const PALETTE_MIME = 'application/x-engage-node';

const widthOf = (n: FlowNode) => Math.max(NODE_WIDTH, n.outputs.length * PORT_SPACING + 16);

type Drag = { kind: 'node'; id: string; dx: number; dy: number; moved: boolean } | { kind: 'wire'; from: string; output: string; x: number; y: number };

/**
 * The canvas: cards you drag around, one port per branch at the bottom of each card, and wires
 * from each branch to the block it leads to. Drag a port onto a block to connect (or re-point)
 * that branch; drop it on empty space to disconnect it. Blocks are added by dragging them from the
 * palette (or clicking them there).
 */
export function FlowCanvas({
    graph,
    selectedId,
    onSelect,
    onMove,
    onMoveEnd,
    onConnect,
    onDropNode,
    problems,
    analytics,
    readOnly,
}: {
    graph: FlowGraph;
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    onMove: (id: string, x: number, y: number) => void;
    onMoveEnd: () => void;
    onConnect: (from: string, output: string, to: string | null) => void;
    onDropNode: (type: NodeType, x: number, y: number) => void;
    problems: Map<string, 'error' | 'warning'>;
    analytics: ChatbotAnalytics | null;
    readOnly: boolean;
}) {
    const wrap = useRef<HTMLDivElement>(null);
    const inner = useRef<HTMLDivElement>(null);
    const wires = useRef<SVGSVGElement>(null);
    const [zoom, setZoom] = useState(1);
    const [drag, setDrag] = useState<Drag | null>(null);

    const width = Math.max(1400, ...graph.nodes.map((n) => n.x + widthOf(n) + 400));
    const height = Math.max(1000, ...graph.nodes.map((n) => n.y + 420));

    /** Client (screen) coordinates → canvas coordinates, whatever the zoom and scroll. */
    const toCanvas = useCallback(
        (clientX: number, clientY: number) => {
            const rect = inner.current?.getBoundingClientRect();

            return rect ? { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom } : { x: 0, y: 0 };
        },
        [zoom],
    );

    // Wires are drawn from where the ports really are on screen, after every render.
    useLayoutEffect(() => {
        const svg = wires.current;
        const root = inner.current;
        if (!svg || !root) return;
        const rect = root.getBoundingClientRect();
        const at = (el: Element) => {
            const r = el.getBoundingClientRect();

            return { x: (r.left + r.width / 2 - rect.left) / zoom, y: (r.top + r.height / 2 - rect.top) / zoom };
        };
        const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
        let paths = '';
        for (const node of graph.nodes) {
            node.outputs.forEach((out) => {
                const target = out.to ? nodes.get(out.to) : undefined;
                const port = root.querySelector(`[data-port="${CSS.escape(node.id)}:${CSS.escape(out.id)}"]`);
                if (!target || !port) return;
                const a = at(port);
                const b = { x: target.x + widthOf(target) / 2, y: target.y };
                const hot = selectedId !== null && (node.id === selectedId || target.id === selectedId);
                const bend = Math.max(40, Math.abs(b.y - a.y) / 2);
                const d =
                    b.y > a.y + 20
                        ? `M${a.x} ${a.y} C ${a.x} ${a.y + bend} ${b.x} ${b.y - bend} ${b.x} ${b.y}`
                        : `M${a.x} ${a.y} C ${a.x} ${a.y + 120} ${b.x} ${b.y - 120} ${b.x} ${b.y}`;
                paths += `<path d="${d}" fill="none" stroke="${hot ? '#689d0f' : '#b9b9b2'}" stroke-width="${hot ? 2.5 : 2}"/>`;
                paths += `<path d="M${b.x} ${b.y} l -4.5 -8 l 9 0 z" fill="${hot ? '#689d0f' : '#b9b9b2'}"/>`;
            });
        }
        if (drag?.kind === 'wire') {
            const port = root.querySelector(`[data-port="${CSS.escape(drag.from)}:${CSS.escape(drag.output)}"]`);
            if (port) {
                const a = at(port);
                const my = (a.y + drag.y) / 2;
                paths += `<path d="M${a.x} ${a.y} C ${a.x} ${my} ${drag.x} ${my} ${drag.x} ${drag.y}" fill="none" stroke="#689d0f" stroke-width="2.5" stroke-dasharray="5 4"/>`;
            }
        }
        svg.innerHTML = paths;
    });

    // Pointer moves and releases are followed on the whole window while dragging.
    useEffect(() => {
        if (!drag) return;
        const move = (e: PointerEvent) => {
            const p = toCanvas(e.clientX, e.clientY);
            if (drag.kind === 'node') {
                onMove(drag.id, Math.max(0, Math.round(p.x - drag.dx)), Math.max(0, Math.round(p.y - drag.dy)));
                if (!drag.moved) setDrag({ ...drag, moved: true });
            } else {
                setDrag({ ...drag, x: p.x, y: p.y });
            }
        };
        const up = (e: PointerEvent) => {
            if (drag.kind === 'node') {
                if (drag.moved) onMoveEnd();
            } else {
                const el = document.elementFromPoint(e.clientX, e.clientY);
                const target = el?.closest('[data-node]')?.getAttribute('data-node') ?? null;
                if (target !== drag.from) onConnect(drag.from, drag.output, target);
            }
            setDrag(null);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);

        return () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
        };
    }, [drag, toCanvas, onMove, onMoveEnd, onConnect]);

    const fit = (min = 0.35) => {
        const el = wrap.current;
        if (!el || graph.nodes.length === 0) return;
        const maxX = Math.max(...graph.nodes.map((n) => n.x + widthOf(n))) + 60;
        const maxY = Math.max(...graph.nodes.map((n) => n.y + 200)) + 60;
        const z = Math.max(min, Math.min(1, el.clientWidth / maxX, el.clientHeight / maxY));
        setZoom(Number(z.toFixed(2)));
        el.scrollTo({ left: 0, top: 0 });
    };

    // On opening, zoom out (a little) so the whole flow is in view.
    const fitOnOpen = useEffectEvent(() => fit(0.6));
    useEffect(() => {
        const frame = requestAnimationFrame(() => fitOnOpen());

        return () => cancelAnimationFrame(frame);
    }, []);

    return (
        <div className="relative min-h-0 min-w-0 flex-1">
            <div
                ref={wrap}
                className="absolute inset-0 overflow-auto bg-[#ecece8] [background-image:radial-gradient(circle,#d4d4ce_1px,transparent_1px)] [background-size:22px_22px]"
                onWheel={(e) => {
                    if (!e.ctrlKey && !e.metaKey) return;
                    e.preventDefault();
                    setZoom((z) => Math.min(1.5, Math.max(0.35, Number((z - e.deltaY * 0.002).toFixed(2)))));
                }}
                onPointerDown={(e) => {
                    if (e.target === e.currentTarget || (e.target as Element).getAttribute?.('data-canvas') !== null) onSelect(null);
                }}
                onDragOver={(e) => {
                    if (!readOnly && e.dataTransfer.types.includes(PALETTE_MIME)) e.preventDefault();
                }}
                onDrop={(e) => {
                    const type = e.dataTransfer.getData(PALETTE_MIME) as NodeType;
                    if (!type || readOnly) return;
                    e.preventDefault();
                    const p = toCanvas(e.clientX, e.clientY);
                    onDropNode(type, Math.max(0, Math.round(p.x - NODE_WIDTH / 2)), Math.max(0, Math.round(p.y - 30)));
                }}
            >
                <div style={{ width: width * zoom, height: height * zoom }}>
                    <div ref={inner} data-canvas="" className="relative origin-top-left" style={{ width, height, transform: `scale(${zoom})` }}>
                        <svg ref={wires} className="pointer-events-none absolute inset-0 z-[1]" width={width} height={height} aria-hidden />
                        {graph.nodes.map((node) => (
                            <NodeCard
                                key={node.id}
                                node={node}
                                selected={node.id === selectedId}
                                dragging={drag?.kind === 'node' && drag.id === node.id}
                                problem={problems.get(node.id) ?? null}
                                stats={analytics?.nodes[node.id] ?? null}
                                showStats={analytics !== null}
                                readOnly={readOnly}
                                onPointerDown={(e) => {
                                    if (e.button !== 0) return;
                                    onSelect(node.id);
                                    if (readOnly) return;
                                    const p = toCanvas(e.clientX, e.clientY);
                                    setDrag({ kind: 'node', id: node.id, dx: p.x - node.x, dy: p.y - node.y, moved: false });
                                }}
                                onPortDown={(e, output) => {
                                    e.stopPropagation();
                                    if (readOnly || e.button !== 0) return;
                                    const p = toCanvas(e.clientX, e.clientY);
                                    setDrag({ kind: 'wire', from: node.id, output, x: p.x, y: p.y });
                                }}
                            />
                        ))}
                    </div>
                </div>
            </div>

            <div className="absolute right-3 bottom-3 z-10 flex items-center gap-0.5 rounded-lg border bg-card p-0.5 shadow-sm">
                <button
                    className="rounded-md p-1.5 hover:bg-muted"
                    onClick={() => setZoom((z) => Math.max(0.35, Number((z - 0.1).toFixed(2))))}
                    aria-label="Zoom out"
                >
                    <MinusIcon className="size-4" />
                </button>
                <button
                    className="min-w-12 rounded-md px-1.5 py-1 text-[12px] font-semibold tabular-nums hover:bg-muted"
                    onClick={() => setZoom(1)}
                    title="Actual size"
                >
                    {Math.round(zoom * 100)}%
                </button>
                <button
                    className="rounded-md p-1.5 hover:bg-muted"
                    onClick={() => setZoom((z) => Math.min(1.5, Number((z + 0.1).toFixed(2))))}
                    aria-label="Zoom in"
                >
                    <PlusIcon className="size-4" />
                </button>
                <button className="rounded-md p-1.5 hover:bg-muted" onClick={() => fit()} aria-label="Fit the flow on screen" title="Fit to screen">
                    <MaximizeIcon className="size-4" />
                </button>
            </div>
            {!readOnly && (
                <div className="pointer-events-none absolute bottom-3 left-3 z-10 hidden max-w-[calc(100%-14rem)] truncate rounded-full border bg-card/95 px-3.5 py-1.5 text-[11.5px] text-muted-foreground shadow-sm lg:block">
                    Drag a block to move it · drag a ● port onto a block to connect · drag blocks in from the left · Ctrl + scroll to zoom
                </div>
            )}
        </div>
    );
}

function NodeCard({
    node,
    selected,
    dragging,
    problem,
    stats,
    showStats,
    readOnly,
    onPointerDown,
    onPortDown,
}: {
    node: FlowNode;
    selected: boolean;
    dragging: boolean;
    problem: 'error' | 'warning' | null;
    stats: ChatbotAnalytics['nodes'][string] | null;
    showStats: boolean;
    readOnly: boolean;
    onPointerDown: (e: React.PointerEvent) => void;
    onPortDown: (e: React.PointerEvent, output: string) => void;
}) {
    const kind = kindOf(node.type);
    const exit = node.type === 'handoff' || node.type === 'end';

    return (
        <div
            data-node={node.id}
            onPointerDown={onPointerDown}
            style={{ left: node.x, top: node.y, width: widthOf(node), touchAction: 'none' }}
            className={cn(
                'absolute z-[2] rounded-xl border bg-card shadow-[0_2px_6px_rgba(0,0,0,.06)] transition-shadow select-none',
                readOnly ? 'cursor-pointer' : 'cursor-grab',
                node.type === 'start' && 'border-dashed bg-brand-50',
                problem === 'error' && 'border-bad/60',
                problem === 'warning' && 'border-warn/60',
                selected && 'border-brand-500 shadow-[0_0_0_3px_rgba(169,227,36,.45)]',
                dragging && 'z-[5] cursor-grabbing shadow-[0_10px_26px_rgba(0,0,0,.18)]',
            )}
        >
            <div className="flex items-center gap-2 border-b border-line-2 px-2.5 py-2">
                <span className="flex size-6 items-center justify-center rounded-md bg-muted text-[13px]" aria-hidden>
                    {kind.icon}
                </span>
                <span className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">{node.type === 'start' ? 'Trigger' : kind.label}</span>
                {problem && (
                    <AlertTriangleIcon
                        className={cn('size-3.5', problem === 'error' ? 'text-bad' : 'text-warn')}
                        aria-label={problem === 'error' ? 'Needs attention' : 'Warning'}
                    />
                )}
                {exit && (
                    <span className="ml-auto rounded-full bg-brand-100 px-1.5 py-px text-[9.5px] font-bold text-brand-600">
                        {node.type === 'end' ? 'End' : 'Exit'}
                    </span>
                )}
            </div>
            <p className="truncate px-2.5 pt-2 text-[13px] font-semibold">{node.title}</p>
            <p className="line-clamp-2 px-2.5 pt-0.5 pb-2 text-[11.5px] leading-snug text-muted-foreground">{nodePreview(node)}</p>
            {showStats && (
                <div className="mx-2.5 mb-2 flex flex-wrap gap-x-2 rounded-md bg-muted px-2 py-1 text-[10.5px] text-ink-2" title="Last 30 days">
                    <span>▶ {stats?.entries ?? 0} reached</span>
                    {(stats?.abandoned ?? 0) > 0 && <span className="text-warn">⏏ {stats?.abandoned} left here</span>}
                    {(stats?.errors ?? 0) > 0 && <span className="text-bad">⚠ {stats?.errors}</span>}
                </div>
            )}
            {node.outputs.length > 0 && (
                <div className="flex justify-around gap-1 px-2 pb-2.5">
                    {node.outputs.map((out) => (
                        <div key={out.id} className="flex min-w-0 flex-col items-center gap-1" style={{ width: PORT_SPACING - 6 }}>
                            <span className="max-w-full truncate text-[9.5px] text-muted-foreground" title={out.label}>
                                {out.label}
                                {showStats && stats?.clicks[out.id] ? ` · ${stats.clicks[out.id]}` : ''}
                            </span>
                            <span
                                data-port={`${node.id}:${out.id}`}
                                onPointerDown={(e) => onPortDown(e, out.id)}
                                role="button"
                                aria-label={`Connect “${out.label}”`}
                                className={cn(
                                    'size-3.5 rounded-full border-2 bg-card',
                                    readOnly ? 'cursor-default' : 'cursor-crosshair hover:border-brand-500 hover:bg-brand-50',
                                    out.to ? 'border-brand-500 bg-primary' : 'border-[#b9b9b2]',
                                )}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
