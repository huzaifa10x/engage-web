import type { FlowGraph, FlowNode, FlowSettings } from '@/lib/chatbots';

/**
 * Three-way merge of a flow draft, used when a save is refused because a teammate saved first.
 *
 * base   — the draft this editor last loaded or saved
 * mine   — this editor's draft now
 * theirs — the draft stored on the server now
 *
 * A step changed on one side only takes that side. A step changed differently on both sides is a
 * conflict: it is listed, and `prefer` decides which side wins. Steps added on either side are
 * kept; a step deleted on one side and untouched on the other is deleted. Settings and the name
 * merge the same way, as single items.
 */
export type MergeConflict = { id: string; title: string; kind: 'step' | 'settings' | 'name' };

export type MergeResult = {
    graph: FlowGraph;
    settings: FlowSettings;
    name: string;
    conflicts: MergeConflict[];
    /** Steps that came from the teammate's save (added or changed there). */
    fromTheirs: number;
};

type Side = { graph: FlowGraph; settings: FlowSettings; name: string };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function pick<T>(
    base: T | undefined,
    mine: T | undefined,
    theirs: T | undefined,
    prefer: 'mine' | 'theirs',
): { value: T | undefined; conflict: boolean; theirs: boolean } {
    if (same(mine, theirs)) return { value: mine, conflict: false, theirs: false };
    if (same(mine, base)) return { value: theirs, conflict: false, theirs: true };
    if (same(theirs, base)) return { value: mine, conflict: false, theirs: false };

    return { value: prefer === 'mine' ? mine : theirs, conflict: true, theirs: prefer === 'theirs' };
}

export function mergeDrafts(base: Side, mine: Side, theirs: Side, prefer: 'mine' | 'theirs' = 'mine'): MergeResult {
    const byId = (g: FlowGraph) => new Map(g.nodes.map((n) => [n.id, n]));
    const b = byId(base.graph);
    const m = byId(mine.graph);
    const t = byId(theirs.graph);
    // Order: mine first (what the editor is looking at), then steps only the teammate has.
    const ids = [...m.keys(), ...[...t.keys()].filter((id) => !m.has(id)), ...[...b.keys()].filter((id) => !m.has(id) && !t.has(id))];
    const nodes: FlowNode[] = [];
    const conflicts: MergeConflict[] = [];
    let fromTheirs = 0;
    for (const id of ids) {
        const r = pick(b.get(id), m.get(id), t.get(id), prefer);
        if (r.conflict) conflicts.push({ id, title: (m.get(id) ?? t.get(id) ?? b.get(id))?.title ?? id, kind: 'step' });
        if (r.theirs) fromTheirs++;
        if (r.value) nodes.push(r.value);
    }
    // A path pointing at a step that no longer exists goes nowhere.
    const kept = new Set(nodes.map((n) => n.id));
    const graph = { nodes: nodes.map((n) => ({ ...n, outputs: n.outputs.map((o) => (o.to && !kept.has(o.to) ? { ...o, to: null } : o)) })) };

    const s = pick(base.settings, mine.settings, theirs.settings, prefer);
    if (s.conflict) conflicts.push({ id: 'settings', title: 'Bot settings', kind: 'settings' });
    const nm = pick(base.name, mine.name, theirs.name, prefer);
    if (nm.conflict) conflicts.push({ id: 'name', title: 'Flow name', kind: 'name' });

    return { graph, settings: (s.value ?? mine.settings) as FlowSettings, name: nm.value ?? mine.name, conflicts, fromTheirs };
}
