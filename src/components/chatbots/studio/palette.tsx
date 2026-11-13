'use client';

import { useState } from 'react';

import { matches, PALETTE_MIME } from '@/components/chatbots/block-picker';
import type { NodeType } from '@/lib/chatbots';

import { blocksOfKind, KIND_LABEL, KINDS } from './kinds';

/** “Add a step” (left column): plain-word search, grouped Send · Ask · Decide · Do. Click adds after the selected step; drag onto the map. */
export function StepPalette({ hint, onPick, readOnly }: { hint: string; onPick: (type: NodeType) => void; readOnly: boolean }) {
    const [q, setQ] = useState('');
    const groups = KINDS.map((k) => [k, blocksOfKind(k).filter((b) => matches(b, q))] as const).filter(([, list]) => list.length > 0);

    return (
        <aside className="cb-bleft" aria-label="Add a step">
            <div className="cb-scroll">
                <h3 style={{ fontSize: 14.5 }}>Add a step</h3>
                <input
                    className="cb-in"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search: “ask for date”, “send image”"
                    aria-label="Search steps"
                    disabled={readOnly}
                    onKeyDown={(e) => {
                        const first = groups[0]?.[1][0];
                        if (e.key === 'Enter' && first) {
                            e.preventDefault();
                            onPick(first.type);
                        }
                    }}
                />
                <p className="cb-small cb-muted">{readOnly ? 'You can view this flow; editing is limited to the people chosen for it.' : hint}</p>
                {groups.length === 0 && <p className="cb-small cb-muted">No step matches “{q}”.</p>}
                {groups.map(([k, list]) => (
                    <div key={k} className="cb-col" style={{ gap: 2 }}>
                        <span className={`cb-chip cb-kind ${k}`} style={{ alignSelf: 'flex-start' }}>
                            {KIND_LABEL[k]}
                        </span>
                        {list.map((b) => (
                            <button
                                key={b.type}
                                type="button"
                                className={`cb-palitem ${k}`}
                                disabled={readOnly}
                                draggable={!readOnly}
                                onDragStart={(e) => {
                                    e.dataTransfer.setData(PALETTE_MIME, b.type);
                                    e.dataTransfer.effectAllowed = 'copy';
                                }}
                                onClick={() => onPick(b.type)}
                                aria-label={`Add ${b.label}`}
                            >
                                <span className="cb-ic">
                                    <b.icon className="size-4" />
                                </span>
                                <span className="cb-col" style={{ gap: 0 }}>
                                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>{b.label}</span>
                                    <span className="cb-small cb-muted">{b.blurb}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                ))}
            </div>
        </aside>
    );
}
