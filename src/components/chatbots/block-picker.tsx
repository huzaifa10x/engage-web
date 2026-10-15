'use client';

import { SearchIcon } from 'lucide-react';
import { useState } from 'react';

import { Input } from '@/components/ui/input';
import { BLOCKS, type BlockKind, GROUPS, type NodeType } from '@/lib/chatbots';
import { cn } from '@/lib/utils';

export const PALETTE_MIME = 'application/x-engage-node';

export function matches(block: BlockKind, q: string): boolean {
    const t = q.trim().toLowerCase();

    return t === '' || `${block.label} ${block.blurb} ${block.keywords ?? ''} ${block.type}`.toLowerCase().includes(t);
}

/** The block library: grouped, searchable; click (or drag) a block to add it. */
export function BlockList({
    onPick,
    draggable = false,
    autoFocus = false,
    dense = false,
}: {
    onPick: (type: NodeType) => void;
    draggable?: boolean;
    autoFocus?: boolean;
    dense?: boolean;
}) {
    const [q, setQ] = useState('');
    const found = BLOCKS.filter((b) => matches(b, q));

    return (
        <div className={cn('flex min-h-0 flex-col', !dense && 'flex-1')}>
            <div className="relative mb-2">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search blocks…"
                    className="h-8 pl-8 text-[12.5px]"
                    autoFocus={autoFocus}
                    aria-label="Search blocks"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && found[0]) {
                            e.preventDefault();
                            onPick(found[0].type);
                        }
                    }}
                />
            </div>
            <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', dense ? 'max-h-80 pr-1' : 'pr-1')}>
                {found.length === 0 && <p className="px-1 py-3 text-[12px] text-muted-foreground">No block matches “{q}”.</p>}
                {GROUPS.map((g) => {
                    const blocks = found.filter((b) => b.group === g.key);
                    if (blocks.length === 0) return null;

                    return (
                        <div key={g.key} className="mb-3">
                            <p className={cn('mb-1 px-1 text-[10.5px] font-bold tracking-wider uppercase', g.tone)}>{g.label}</p>
                            <div className={cn('grid gap-1', dense ? 'grid-cols-1' : 'grid-cols-1')}>
                                {blocks.map((b) => (
                                    <button
                                        key={b.type}
                                        type="button"
                                        draggable={draggable}
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData(PALETTE_MIME, b.type);
                                            e.dataTransfer.effectAllowed = 'copy';
                                        }}
                                        onClick={() => onPick(b.type)}
                                        title={`${b.blurb}${draggable ? ' — click to add after the selected block, or drag onto the canvas' : ''}`}
                                        className={cn(
                                            'group flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-card hover:shadow-xs',
                                            draggable && 'cursor-grab active:cursor-grabbing',
                                        )}
                                    >
                                        <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', g.chip)}>
                                            <b.icon className="size-4" />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-[12.5px] leading-tight font-semibold">{b.label}</span>
                                            <span className="block truncate text-[11px] leading-tight text-muted-foreground">{b.blurb}</span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
