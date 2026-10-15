'use client';

import { useQuery } from '@tanstack/react-query';

import { api } from './api';

/** Mirrors App\Domain\Chatbots\Engine\FlowGraph on the server (the server re-derives outputs and re-checks everything). */
export type NodeType =
    | 'start'
    | 'message'
    | 'buttons'
    | 'list'
    | 'question'
    | 'product'
    | 'media'
    | 'template'
    | 'condition'
    | 'setfield'
    | 'http'
    | 'delay'
    | 'tag'
    | 'handoff'
    | 'end';

export type FlowOutput = { id: string; label: string; to: string | null };
export type NodeConfig = Record<string, any>;
export type FlowNode = { id: string; type: NodeType; title: string; x: number; y: number; config: NodeConfig; outputs: FlowOutput[] };
export type FlowGraph = { nodes: FlowNode[] };
export type FlowIssue = { level: 'error' | 'warning'; node_id: string | null; message: string };

export type FlowSettings = {
    reminder_minutes: number | null;
    reminder_text: string;
    abandon_minutes: number;
    resume_minutes: number;
    retry_limit: number;
    invalid_text: string;
    handoff_keywords: string[];
    menu_keywords: string[];
    auto_resume_minutes: number | null;
    abandoned_tag: string | null;
};

export type ChatbotFlow = {
    id: string;
    name: string;
    phone_number_id: string | null;
    phone_number: { id: string; display_phone_number: string | null; verified_name: string | null; status: string } | null;
    is_active: boolean;
    status: 'draft' | 'live' | 'paused';
    published_version: number | null;
    published_at: string | null;
    has_unpublished_changes: boolean;
    draft_updated_at: string | null;
    created_at: string | null;
    updated_at: string | null;
    stats?: { running: number; started_30d: number };
};

export type ChatbotFlowDetail = ChatbotFlow & {
    draft: FlowGraph;
    settings: FlowSettings;
    issues: FlowIssue[];
    versions: { version: number; created_at: string | null; published_by_membership_id: string | null }[];
    can: { manage: boolean };
};

export type ChatbotAllowance = { enabled: boolean; limit: number | null; used: number };

export type ChatbotOptions = {
    numbers: { id: string; display_phone_number: string | null; verified_name: string | null; status: string; waba_account_id: string }[];
    fields: { key: string; label: string; type: string }[];
    tags: string[];
    segments: { id: string; name: string }[];
    members: { id: string; name: string }[];
    templates: {
        name: string;
        language: string;
        category: string | null;
        waba_account_id: string;
        variables: { header: string[]; body: string[]; header_format: string | null };
    }[];
    secrets: string[];
};

export type TranscriptItem =
    | { kind: 'bot'; message: { type: string; body?: string | null; content?: Record<string, unknown>; template?: { name: string; language: string } } }
    | { kind: 'note'; text: string }
    | { kind: 'customer'; text: string };

export type TestTurn = {
    test_id: string;
    transcript: TranscriptItem[];
    state: {
        status: string;
        node_id: string | null;
        awaiting_input: boolean;
        vars: Record<string, unknown>;
        contact: { name: string | null; email: string | null; phone: string | null; fields: Record<string, unknown>; tags: string[] };
    };
};

export type ChatbotAnalytics = {
    days: number;
    sessions: { started: number; running: number; completed: number; handed_off: number; abandoned: number; stopped: number; completion_rate: number | null };
    nodes: Record<string, { entries: number; clicks: Record<string, number>; abandoned: number; handoffs: number; completed: number; errors: number }>;
};

type Data<T> = { data: T };

export const chatbotKeys = {
    all: ['chatbots'] as const,
    flow: (id: string) => ['chatbots', 'flow', id] as const,
    options: ['chatbots', 'options'] as const,
    secrets: ['chatbots', 'secrets'] as const,
    analytics: (id: string, days: number) => ['chatbots', 'analytics', id, days] as const,
};

export const useChatbots = (enabled = true) =>
    useQuery({
        queryKey: chatbotKeys.all,
        queryFn: () => api<{ data: ChatbotFlow[]; meta: ChatbotAllowance }>('chatbots'),
        enabled,
    });

export const useChatbot = (id: string | null) =>
    useQuery({
        queryKey: chatbotKeys.flow(id ?? 'none'),
        queryFn: () => api<Data<ChatbotFlowDetail>>(`chatbots/${id}`).then((r) => r.data),
        enabled: id !== null,
        refetchOnWindowFocus: false,
    });

export const useChatbotOptions = (enabled = true) =>
    useQuery({ queryKey: chatbotKeys.options, queryFn: () => api<Data<ChatbotOptions>>('chatbots/options').then((r) => r.data), enabled, staleTime: 60_000 });

export const useChatbotSecrets = (enabled = true) =>
    useQuery({
        queryKey: chatbotKeys.secrets,
        queryFn: () => api<Data<{ name: string; hint: string | null; updated_at: string | null }[]>>('chatbots/secrets').then((r) => r.data),
        enabled,
    });

export const useChatbotAnalytics = (id: string, days: number, enabled = true) =>
    useQuery({
        queryKey: chatbotKeys.analytics(id, days),
        queryFn: () => api<Data<ChatbotAnalytics>>(`chatbots/${id}/analytics`, { query: { days } }).then((r) => r.data),
        enabled,
    });

export const createChatbot = (body: { name: string; phone_number_id: string | null; template: 'menu' | 'lead' | 'blank' }) =>
    api<Data<ChatbotFlowDetail>>('chatbots', { method: 'POST', body }).then((r) => r.data);

export const saveChatbot = (id: string, body: Partial<{ name: string; phone_number_id: string | null; draft: FlowGraph; settings: FlowSettings }>) =>
    api<Data<ChatbotFlowDetail>>(`chatbots/${id}`, { method: 'PATCH', body }).then((r) => r.data);

export const publishChatbot = (id: string) => api<Data<ChatbotFlowDetail>>(`chatbots/${id}/publish`, { method: 'POST' }).then((r) => r.data);

export const activateChatbot = (id: string, active: boolean, replace = false) =>
    api<Data<ChatbotFlowDetail>>(`chatbots/${id}/activate`, { method: 'POST', body: { active, replace } }).then((r) => r.data);

export const duplicateChatbot = (id: string) => api<Data<ChatbotFlowDetail>>(`chatbots/${id}/duplicate`, { method: 'POST' }).then((r) => r.data);

export const deleteChatbot = (id: string) => api<void>(`chatbots/${id}`, { method: 'DELETE' });

export const restoreChatbotVersion = (id: string, version: number) =>
    api<Data<ChatbotFlowDetail>>(`chatbots/${id}/versions/${version}/restore`, { method: 'POST', body: { publish: true } }).then((r) => r.data);

export const testChatbot = (id: string, body: { test_id?: string | null; contact_id?: string | null; text?: string; payload?: string }) =>
    api<Data<TestTurn>>(`chatbots/${id}/test`, { method: 'POST', body }).then((r) => r.data);

export const saveChatbotSecret = (name: string, value: string) => api<unknown>('chatbots/secrets', { method: 'PUT', body: { name, value } });

export const deleteChatbotSecret = (name: string) => api<void>(`chatbots/secrets/${encodeURIComponent(name)}`, { method: 'DELETE' });

export const takeOverConversation = (id: string) => api<unknown>(`conversations/${id}/bot/take-over`, { method: 'POST' });

export const handBackConversation = (id: string) =>
    api<{ meta?: { restarted?: boolean } }>(`conversations/${id}/bot/hand-back`, { method: 'POST', body: { restart: true } });

// ── Node catalogue ─────────────────────────────────────────────────────────────────────────

export type NodeKind = { type: NodeType; label: string; icon: string; group: 'Content' | 'Logic' | 'Exit'; blurb: string };

export const NODE_KINDS: NodeKind[] = [
    { type: 'message', label: 'Message', icon: '💬', group: 'Content', blurb: 'Send a text' },
    { type: 'buttons', label: 'Buttons', icon: '🔘', group: 'Content', blurb: 'Up to 3 reply buttons' },
    { type: 'list', label: 'List menu', icon: '☰', group: 'Content', blurb: 'Up to 10 rows' },
    { type: 'product', label: 'Products', icon: '🛍️', group: 'Content', blurb: 'List, pictures or cards' },
    { type: 'media', label: 'Media', icon: '🖼️', group: 'Content', blurb: 'Image, video, file, location' },
    { type: 'template', label: 'Template', icon: '📋', group: 'Content', blurb: 'Approved template' },
    { type: 'question', label: 'Question', icon: '✍️', group: 'Logic', blurb: 'Capture an answer' },
    { type: 'condition', label: 'Condition', icon: '🔀', group: 'Logic', blurb: 'Branch on contact data' },
    { type: 'setfield', label: 'Set field', icon: '✏️', group: 'Logic', blurb: 'Write to the contact' },
    { type: 'http', label: 'API call', icon: '🌐', group: 'Logic', blurb: 'Call another system' },
    { type: 'delay', label: 'Delay', icon: '⏱️', group: 'Logic', blurb: 'Wait, then continue' },
    { type: 'tag', label: 'Tag / assign', icon: '🏷️', group: 'Logic', blurb: 'Tag or route the chat' },
    { type: 'handoff', label: 'Handoff', icon: '👤', group: 'Exit', blurb: 'Talk to a person' },
    { type: 'end', label: 'End', icon: '🏁', group: 'Exit', blurb: 'Finish the flow' },
];

export const START_KIND: NodeKind = { type: 'start', label: 'Start', icon: '⚡', group: 'Logic', blurb: 'What starts the flow' };

export const kindOf = (type: NodeType): NodeKind => NODE_KINDS.find((k) => k.type === type) ?? START_KIND;

export const INPUT_TYPES: NodeType[] = ['buttons', 'list', 'question', 'product'];
export const TERMINAL_TYPES: NodeType[] = ['handoff', 'end'];

let seq = 0;
export const newNodeId = (type: string) => `${type.slice(0, 4)}_${Date.now().toString(36).slice(-5)}${(seq++).toString(36)}`;
export const newChoiceId = () => `o${Math.random().toString(36).slice(2, 8)}`;

export function defaultConfig(type: NodeType): NodeConfig {
    switch (type) {
        case 'start':
            return { any_message: true, keywords: [], ad_referral: true };
        case 'message':
            return { text: '' };
        case 'buttons':
            return {
                header: null,
                text: '',
                footer: null,
                buttons: [
                    { id: newChoiceId(), title: 'Option 1' },
                    { id: newChoiceId(), title: 'Option 2' },
                ],
            };
        case 'list':
            return {
                header: null,
                text: '',
                footer: null,
                button_label: 'Choose',
                section_title: null,
                rows: [{ id: newChoiceId(), title: 'Row 1', description: null }],
            };
        case 'question':
            return { text: '', save_to: 'var:answer', validate: 'any', error_text: null };
        case 'product':
            return { text: 'Here are our top picks 👇', mode: 'list', button_label: 'View products', order_label: 'Order', items: [], save_to: 'product' };
        case 'media':
            return { kind: 'image', link: '', caption: null, filename: null, latitude: null, longitude: null, name: null, address: null };
        case 'template':
            return { name: null, language: null, header: [], body: [] };
        case 'condition':
            return { match: 'all', rules: [{ field: 'name', op: 'is_set', value: null }] };
        case 'setfield':
            return { target: null, value: '' };
        case 'http':
            return { method: 'GET', url: 'https://', headers: [], body: null, timeout: 5, retries: 1, save: [] };
        case 'delay':
            return { minutes: 10 };
        case 'tag':
            return { add: [], remove: [], assign: 'none', member_id: null };
        case 'handoff':
            return { text: 'Connecting you with our team. Someone will reply shortly.', offline_text: null, assign: 'none', member_id: null };
        case 'end':
            return { text: null, action: 'none', assign: 'none', member_id: null };
    }
}

/** Same rule as the server: the outputs follow from the config (one per button / row, plus "No match"). */
export function outputsFor(type: NodeType, config: NodeConfig): { id: string; label: string }[] {
    const choices = (key: string) => ((config[key] ?? []) as { id: string; title: string }[]).map((c) => ({ id: c.id, label: c.title || '—' }));
    switch (type) {
        case 'start':
            return [{ id: 'next', label: 'Start' }];
        case 'message':
        case 'media':
            return [{ id: 'next', label: 'Next' }];
        case 'template':
            return [{ id: 'next', label: 'Sent' }];
        case 'setfield':
        case 'tag':
            return [{ id: 'next', label: 'Done' }];
        case 'delay':
            return [{ id: 'next', label: 'After wait' }];
        case 'buttons':
            return [...choices('buttons'), { id: 'fallback', label: 'No match' }];
        case 'list':
            return [...choices('rows'), { id: 'fallback', label: 'No match' }];
        case 'question':
            return [
                { id: 'next', label: 'Answered' },
                { id: 'fallback', label: 'Invalid' },
            ];
        case 'product':
            return [
                { id: 'next', label: 'Product selected' },
                { id: 'fallback', label: 'No match' },
            ];
        case 'condition':
            return [
                { id: 'yes', label: 'Yes' },
                { id: 'no', label: 'No / else' },
            ];
        case 'http':
            return [
                { id: 'success', label: 'Success' },
                { id: 'error', label: 'Error' },
            ];
        default:
            return [];
    }
}

/** Re-derives a node's outputs after its config changed, keeping the connections of outputs that still exist. */
export function withOutputs(node: FlowNode): FlowNode {
    const targets = new Map(node.outputs.map((o) => [o.id, o.to]));

    return { ...node, outputs: outputsFor(node.type, node.config).map((o) => ({ ...o, to: targets.get(o.id) ?? null })) };
}

export function newNode(type: NodeType, x: number, y: number): FlowNode {
    const config = defaultConfig(type);

    return withOutputs({
        id: newNodeId(type),
        type,
        title: kindOf(type).label === 'Handoff' ? 'Talk to a person' : kindOf(type).label,
        x,
        y,
        config,
        outputs: [],
    });
}

/** One-line description shown on the card. */
export function nodePreview(node: FlowNode): string {
    const c = node.config;
    const clip = (s: unknown, n = 70) => {
        const t = String(s ?? '')
            .replace(/\s+/g, ' ')
            .trim();

        return t.length > n ? `${t.slice(0, n - 1)}…` : t;
    };
    switch (node.type) {
        case 'start': {
            const parts = [
                c.any_message ? 'Any message' : null,
                (c.keywords ?? []).length ? `“${(c.keywords as string[]).join('”, “')}”` : null,
                c.ad_referral ? 'ad clicks' : null,
            ].filter(Boolean);

            return parts.length ? parts.join(' · ') : 'No trigger yet';
        }
        case 'message':
        case 'buttons':
        case 'list':
        case 'question':
            return clip(c.text) || 'Write the message…';
        case 'product':
            return `${({ list: 'List', images: 'Pictures + №', cards: 'Cards' } as Record<string, string>)[c.mode] ?? 'List'} · ${(c.items ?? []).length} product(s)`;
        case 'media':
            return c.kind === 'location' ? `📍 ${clip(c.name ?? c.address ?? 'Location', 50)}` : `${c.kind} · ${clip(c.link, 40) || 'add a link'}`;
        case 'template':
            return c.name ? `${c.name} (${c.language})` : 'Choose a template';
        case 'condition':
            return `${(c.rules ?? []).length} rule(s) · match ${c.match === 'any' ? 'any' : 'all'}`;
        case 'setfield':
            return c.target ? `${c.target} = ${clip(c.value, 40)}` : 'Choose a field';
        case 'http':
            return `${c.method} ${clip(String(c.url ?? '').replace(/^https:\/\//, ''), 50)}`;
        case 'delay':
            return `Wait ${formatMinutes(Number(c.minutes ?? 0))}`;
        case 'tag':
            return (
                [
                    (c.add ?? []).length ? `+ ${(c.add as string[]).join(', ')}` : null,
                    (c.remove ?? []).length ? `− ${(c.remove as string[]).join(', ')}` : null,
                    c.assign !== 'none' ? 'assign' : null,
                ]
                    .filter(Boolean)
                    .join(' · ') || 'Nothing set'
            );
        case 'handoff':
            return 'Pause the bot · a person replies';
        case 'end':
            return c.action === 'close' ? 'Finish · close the chat' : c.action === 'assign' ? 'Finish · assign the chat' : 'Finish the flow';
    }
}

export function formatMinutes(m: number): string {
    if (m % 1440 === 0) return `${m / 1440} day${m === 1440 ? '' : 's'}`;
    if (m % 60 === 0) return `${m / 60} hour${m === 60 ? '' : 's'}`;

    return `${m} min`;
}

/** Instant warnings while editing (the server's full check comes back with every save). */
export function openBranches(graph: FlowGraph): Set<string> {
    const ids = new Set(graph.nodes.map((n) => n.id));

    return new Set(graph.nodes.filter((n) => n.outputs.some((o) => !o.to || !ids.has(o.to))).map((n) => n.id));
}

export const VARIABLES: { key: string; label: string }[] = [
    { key: 'contact.first_name', label: 'First name' },
    { key: 'contact.name', label: 'Full name' },
    { key: 'contact.phone', label: 'Phone' },
    { key: 'contact.email', label: 'Email' },
    { key: 'last_input', label: 'Last answer' },
];
