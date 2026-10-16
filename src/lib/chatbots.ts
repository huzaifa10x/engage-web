'use client';

import { useQuery } from '@tanstack/react-query';
import {
    BracesIcon,
    CalculatorIcon,
    CalendarClockIcon,
    ClipboardListIcon,
    ClockIcon,
    CornerDownRightIcon,
    FileSpreadsheetIcon,
    FlagIcon,
    GitBranchIcon,
    GlobeIcon,
    HeadsetIcon,
    ImageIcon,
    ImagePlusIcon,
    LayoutListIcon,
    LinkIcon,
    type LucideIcon,
    MapPinIcon,
    MessageCircleQuestionIcon,
    MessageSquareTextIcon,
    PackageSearchIcon,
    PenLineIcon,
    ShoppingBagIcon,
    SplitIcon,
    SquareMousePointerIcon,
    StarIcon,
    StickyNoteIcon,
    TagIcon,
    UserXIcon,
    WorkflowIcon,
    ZapIcon,
} from 'lucide-react';

import { api } from './api';

/** Mirrors App\Domain\Chatbots\Engine\FlowGraph / NodeConfig on the server (which re-derives outputs and re-checks everything). */
export type NodeType =
    | 'start'
    | 'message'
    | 'media'
    | 'buttons'
    | 'list'
    | 'product'
    | 'template'
    | 'url'
    | 'form'
    | 'question'
    | 'ask_media'
    | 'location'
    | 'rating'
    | 'condition'
    | 'setfield'
    | 'calculate'
    | 'delay'
    | 'tag'
    | 'optout'
    | 'hours'
    | 'split'
    | 'http'
    | 'order'
    | 'sheets'
    | 'goto'
    | 'subflow'
    | 'note'
    | 'handoff'
    | 'end';

export type FlowOutput = { id: string; label: string; to: string | null };
export type NodeConfig = Record<string, any>;
export type FlowNode = { id: string; type: NodeType; title: string; auto_title?: boolean; x: number; y: number; config: NodeConfig; outputs: FlowOutput[] };
export type FlowGraph = { nodes: FlowNode[] };
export type FlowIssue = { level: 'error' | 'warning'; code?: string; node_id: string | null; output_id?: string | null; message: string; fix?: string };

export type FlowSettings = {
    reminder_minutes: number | null;
    reminder_text: string;
    abandon_minutes: number;
    resume_minutes: number;
    retry_limit: number;
    invalid_text: string;
    handoff_keywords: string[];
    menu_keywords: string[];
    back_keywords: string[];
    non_text_text: string;
    escalate_text: string;
    languages: string[];
    language_field: string | null;
    reopen_template: { name: string; language: string; body: string[] } | null;
    auto_resume_minutes: number | null;
    abandoned_tag: string | null;
};

export type ChatbotStatus = 'draft' | 'live' | 'paused' | 'archived';

export type ChatbotFlow = {
    id: string;
    name: string;
    kind: 'bot' | 'subflow';
    folder: string | null;
    phone_number_id: string | null;
    phone_number: { id: string; display_phone_number: string | null; verified_name: string | null; status: string } | null;
    is_active: boolean;
    status: ChatbotStatus;
    triggers: string[];
    role: 'default' | 'greeting' | 'specific' | null;
    published_version: number | null;
    published_at: string | null;
    has_unpublished_changes: boolean;
    draft_updated_at: string | null;
    archived_at: string | null;
    activate_at: string | null;
    deactivate_at: string | null;
    review: {
        status: 'requested' | 'approved' | 'changes_requested';
        current: boolean;
        note: string | null;
        reviewed_at: string | null;
        reviewer: string | null;
    } | null;
    created_at: string | null;
    updated_at: string | null;
    stats?: { running: number; started_30d: number; completion_rate: number | null; handoff_rate: number | null };
    /** Live flows only: what broke since publishing (a template rejected, a field deleted…). */
    attention?: string[];
};

export type ChatbotAbilities = { manage: boolean; publish: boolean; edit: boolean };

export type ChatbotFlowDetail = ChatbotFlow & {
    draft: FlowGraph;
    settings: FlowSettings;
    issues: FlowIssue[];
    editors: string[] | null;
    webhook_url: string | null;
    approvals_required: boolean;
    open_comments: number;
    versions: { version: number; created_at: string | null; published_by_membership_id: string | null }[];
    can: ChatbotAbilities;
};

export type ChatbotListMeta = { enabled: boolean; limit: number | null; used: number; folders: string[]; approvals: boolean; can: ChatbotAbilities };

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
    subflows: { id: string; name: string; published: boolean }[];
    snippets: { id: string; name: string; body: string }[];
    variables: Record<string, string>;
    variable_suggestions: Record<string, string>;
    store_connected: boolean;
    timezone: string;
};

export type TemplateField = {
    key: string;
    label: string;
    type: 'text' | 'textarea' | 'time' | 'number' | 'list' | 'products' | 'prices' | 'template';
    scope: 'business' | 'flow';
    required?: boolean;
    placeholder?: string;
    hint?: string;
    default?: unknown;
    max?: number;
};

export type FlowTemplate = {
    key: string;
    name: string;
    industry: string;
    icon: string;
    recommended?: boolean;
    description: string;
    steps: string[];
    fields: TemplateField[];
};

export type TranscriptItem =
    | {
          kind: 'bot';
          message: { type: string; body?: string | null; content?: Record<string, unknown>; template?: { name: string; language: string }; media_id?: string };
      }
    | { kind: 'note'; text: string }
    | { kind: 'internal'; author: string; text: string }
    | { kind: 'customer'; text: string };

export type TestTurn = {
    test_id: string;
    transcript: TranscriptItem[];
    state: {
        status: string;
        node_id: string | null;
        awaiting_input: boolean;
        has_timeout: boolean;
        language: string | null;
        vars: Record<string, unknown>;
        contact: { name: string | null; email: string | null; phone: string | null; fields: Record<string, unknown>; tags: string[] };
    };
};

export type NodeStats = {
    entries: number;
    clicks: Record<string, number>;
    abandoned: number;
    handoffs: number;
    completed: number;
    errors: number;
    no_match: number;
};

export type ChatbotAnalytics = {
    days: number;
    sessions: {
        started: number;
        running: number;
        completed: number;
        handed_off: number;
        abandoned: number;
        stopped: number;
        completion_rate: number | null;
        handoff_rate: number | null;
        avg_seconds: number | null;
    };
    daily: { day: string; started: number; finished: number }[];
    dropoff: { node_id: string; title: string; abandoned: number; entries: number }[];
    ab: {
        node_id: string;
        title: string;
        percent_a: number;
        goal: { node_id: string; title: string } | null;
        a: { sessions: number; goals: number; rate: number | null };
        b: { sessions: number; goals: number; rate: number | null };
    }[];
    nodes: Record<string, NodeStats>;
};

export type NodeComment = {
    id: string;
    node_id: string;
    body: string;
    author: string;
    mine: boolean;
    resolved_at: string | null;
    resolved_by: string | null;
    created_at: string | null;
};

export type HistoryEntry = { action: string; actor: string; meta: Record<string, unknown> | null; created_at: string };

export type ChatbotWorkspace = { variables: Record<string, string>; suggestions: Record<string, string>; approvals: boolean };

type Data<T> = { data: T };

export const chatbotKeys = {
    all: ['chatbots'] as const,
    list: (filters: Record<string, string>) => ['chatbots', 'list', filters] as const,
    flow: (id: string) => ['chatbots', 'flow', id] as const,
    options: ['chatbots', 'options'] as const,
    templates: ['chatbots', 'templates'] as const,
    secrets: ['chatbots', 'secrets'] as const,
    workspace: ['chatbots', 'workspace'] as const,
    snippets: ['chatbots', 'snippets'] as const,
    comments: (id: string) => ['chatbots', 'comments', id] as const,
    history: (id: string) => ['chatbots', 'history', id] as const,
    analytics: (id: string, days: number) => ['chatbots', 'analytics', id, days] as const,
};

export const useChatbots = (filters: Record<string, string> = {}, enabled = true) =>
    useQuery({
        queryKey: chatbotKeys.list(filters),
        queryFn: () => api<{ data: ChatbotFlow[]; meta: ChatbotListMeta }>('chatbots', { query: filters }),
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

export const useChatbotTemplates = (enabled = true) =>
    useQuery({
        queryKey: chatbotKeys.templates,
        queryFn: () => api<{ data: FlowTemplate[]; meta: { variables: Record<string, string> } }>('chatbots/templates'),
        enabled,
        staleTime: 300_000,
    });

export const useChatbotSecrets = (enabled = true) =>
    useQuery({
        queryKey: chatbotKeys.secrets,
        queryFn: () => api<Data<{ name: string; hint: string | null; updated_at: string | null }[]>>('chatbots/secrets').then((r) => r.data),
        enabled,
    });

export const useChatbotWorkspace = (enabled = true) =>
    useQuery({ queryKey: chatbotKeys.workspace, queryFn: () => api<Data<ChatbotWorkspace>>('chatbots/workspace').then((r) => r.data), enabled });

export const useChatbotSnippets = (enabled = true) =>
    useQuery({
        queryKey: chatbotKeys.snippets,
        queryFn: () => api<Data<{ id: string; name: string; body: string }[]>>('chatbots/snippets').then((r) => r.data),
        enabled,
    });

export const useChatbotComments = (id: string, enabled = true) =>
    useQuery({ queryKey: chatbotKeys.comments(id), queryFn: () => api<Data<NodeComment[]>>(`chatbots/${id}/comments`).then((r) => r.data), enabled });

export const useChatbotHistory = (id: string, enabled = true) =>
    useQuery({ queryKey: chatbotKeys.history(id), queryFn: () => api<Data<HistoryEntry[]>>(`chatbots/${id}/history`).then((r) => r.data), enabled });

export const useChatbotAnalytics = (id: string, days: number, enabled = true) =>
    useQuery({
        queryKey: chatbotKeys.analytics(id, days),
        queryFn: () => api<Data<ChatbotAnalytics>>(`chatbots/${id}/analytics`, { query: { days } }).then((r) => r.data),
        enabled,
    });

export const createChatbot = (body: {
    name: string;
    phone_number_id?: string | null;
    template?: string;
    config?: Record<string, unknown>;
    kind?: 'bot' | 'subflow';
    folder?: string | null;
}) => api<Data<ChatbotFlowDetail>>('chatbots', { method: 'POST', body }).then((r) => r.data);

export const saveChatbot = (
    id: string,
    body: Partial<{
        name: string;
        phone_number_id: string | null;
        draft: FlowGraph;
        settings: FlowSettings;
        folder: string | null;
        editors: string[] | null;
        activate_at: string | null;
        deactivate_at: string | null;
    }>,
) => api<Data<ChatbotFlowDetail>>(`chatbots/${id}`, { method: 'PATCH', body }).then((r) => r.data);

export const publishChatbot = (id: string) => api<Data<ChatbotFlowDetail>>(`chatbots/${id}/publish`, { method: 'POST' }).then((r) => r.data);

export const activateChatbot = (id: string, active: boolean, replace = false) =>
    api<Data<ChatbotFlowDetail>>(`chatbots/${id}/activate`, { method: 'POST', body: { active, replace } }).then((r) => r.data);

export const archiveChatbot = (id: string, archived: boolean) =>
    api<Data<ChatbotFlowDetail>>(`chatbots/${id}/archive`, { method: 'POST', body: { archived } }).then((r) => r.data);

export const reviewChatbot = (id: string, action: 'request' | 'approve' | 'changes' | 'cancel', note?: string) =>
    api<Data<ChatbotFlowDetail>>(`chatbots/${id}/review`, { method: 'POST', body: { action, note } }).then((r) => r.data);

export const duplicateChatbot = (id: string) => api<Data<ChatbotFlowDetail>>(`chatbots/${id}/duplicate`, { method: 'POST' }).then((r) => r.data);

export const deleteChatbot = (id: string) => api<void>(`chatbots/${id}`, { method: 'DELETE' });

export const exportChatbot = (id: string) => api<Record<string, unknown>>(`chatbots/${id}/export`);

export const importChatbot = (file: Record<string, unknown>, phoneNumberId: string | null) =>
    api<Data<ChatbotFlowDetail>>('chatbots/import', { method: 'POST', body: { ...file, phone_number_id: phoneNumberId } }).then((r) => r.data);

export const restoreChatbotVersion = (id: string, version: number) =>
    api<Data<ChatbotFlowDetail>>(`chatbots/${id}/versions/${version}/restore`, { method: 'POST', body: { publish: true } }).then((r) => r.data);

export const setChatbotWebhook = (id: string, enabled: boolean) =>
    api<Data<ChatbotFlowDetail>>(`chatbots/${id}/webhook`, { method: 'POST', body: { enabled } }).then((r) => r.data);

export const testChatbot = (
    id: string,
    body: { test_id?: string | null; contact_id?: string | null; text?: string; payload?: string; type?: string; action?: 'timeout'; language?: string | null },
) => api<Data<TestTurn>>(`chatbots/${id}/test`, { method: 'POST', body }).then((r) => r.data);

export const addChatbotComment = (id: string, nodeId: string, body: string) =>
    api<Data<NodeComment[]>>(`chatbots/${id}/comments`, { method: 'POST', body: { node_id: nodeId, body } }).then((r) => r.data);

export const resolveChatbotComment = (id: string, commentId: string, resolved: boolean) =>
    api<Data<NodeComment[]>>(`chatbots/${id}/comments/${commentId}`, { method: 'PATCH', body: { resolved } }).then((r) => r.data);

export const deleteChatbotComment = (id: string, commentId: string) =>
    api<Data<NodeComment[]>>(`chatbots/${id}/comments/${commentId}`, { method: 'DELETE' }).then((r) => r.data);

export const saveChatbotWorkspace = (body: Partial<{ variables: Record<string, string>; approvals: boolean }>) =>
    api<Data<ChatbotWorkspace>>('chatbots/workspace', { method: 'PUT', body }).then((r) => r.data);

export const saveChatbotSnippet = (body: { id?: string; name: string; body: string }) =>
    api<Data<{ id: string; name: string; body: string }[]>>('chatbots/snippets', { method: 'PUT', body }).then((r) => r.data);

export const deleteChatbotSnippet = (id: string) => api<unknown>(`chatbots/snippets/${id}`, { method: 'DELETE' });

export const saveChatbotSecret = (name: string, value: string) => api<unknown>('chatbots/secrets', { method: 'PUT', body: { name, value } });

export const deleteChatbotSecret = (name: string) => api<void>(`chatbots/secrets/${encodeURIComponent(name)}`, { method: 'DELETE' });

export const takeOverConversation = (id: string) => api<unknown>(`conversations/${id}/bot/take-over`, { method: 'POST' });

export const handBackConversation = (id: string) =>
    api<{ meta?: { restarted?: boolean; outcome?: 'started' | 'waiting' | 'window_closed' | 'opted_out' } }>(`conversations/${id}/bot/hand-back`, {
        method: 'POST',
        body: { restart: true },
    });

// ── Block library ──────────────────────────────────────────────────────────────────────────

export type BlockGroup = 'send' | 'capture' | 'logic' | 'connect' | 'control';

export const GROUPS: { key: BlockGroup; label: string; tone: string; chip: string; ring: string }[] = [
    { key: 'send', label: 'Send & show', tone: 'text-sky-700', chip: 'bg-sky-100 text-sky-700', ring: 'bg-sky-500' },
    { key: 'capture', label: 'Ask & capture', tone: 'text-violet-700', chip: 'bg-violet-100 text-violet-700', ring: 'bg-violet-500' },
    { key: 'logic', label: 'Logic', tone: 'text-amber-700', chip: 'bg-amber-100 text-amber-700', ring: 'bg-amber-500' },
    { key: 'connect', label: 'Connect', tone: 'text-teal-700', chip: 'bg-teal-100 text-teal-700', ring: 'bg-teal-500' },
    { key: 'control', label: 'Control & exit', tone: 'text-rose-700', chip: 'bg-rose-100 text-rose-700', ring: 'bg-rose-500' },
];

export type BlockKind = { type: NodeType; label: string; group: BlockGroup; icon: LucideIcon; blurb: string; keywords?: string };

export const BLOCKS: BlockKind[] = [
    { type: 'message', label: 'Message', group: 'send', icon: MessageSquareTextIcon, blurb: 'Send a text message', keywords: 'text say reply' },
    { type: 'media', label: 'Media', group: 'send', icon: ImageIcon, blurb: 'Image, video, document or audio', keywords: 'file pdf photo picture voice' },
    { type: 'buttons', label: 'Buttons', group: 'send', icon: SquareMousePointerIcon, blurb: 'Up to 3 reply buttons', keywords: 'menu quick reply options' },
    { type: 'list', label: 'List menu', group: 'send', icon: LayoutListIcon, blurb: 'Up to 10 rows in sections', keywords: 'menu options rows' },
    { type: 'product', label: 'Products', group: 'send', icon: ShoppingBagIcon, blurb: 'Product cards with links', keywords: 'catalog shop store cards' },
    { type: 'template', label: 'Template', group: 'send', icon: ClipboardListIcon, blurb: 'Approved template (works after 24h)', keywords: 'hsm approved' },
    { type: 'url', label: 'Link button', group: 'send', icon: LinkIcon, blurb: 'A button that opens a website', keywords: 'url cta website pay' },
    { type: 'form', label: 'WhatsApp form', group: 'send', icon: PenLineIcon, blurb: 'A native WhatsApp Flow form', keywords: 'flow form survey' },
    {
        type: 'question',
        label: 'Question',
        group: 'capture',
        icon: MessageCircleQuestionIcon,
        blurb: 'Ask and save the answer',
        keywords: 'input ask email phone date',
    },
    { type: 'ask_media', label: 'Ask for a file', group: 'capture', icon: ImagePlusIcon, blurb: 'Photo or document upload', keywords: 'photo image upload' },
    { type: 'location', label: 'Ask for location', group: 'capture', icon: MapPinIcon, blurb: 'Location pin or typed area', keywords: 'address pin map' },
    { type: 'rating', label: 'Rating', group: 'capture', icon: StarIcon, blurb: '1 to 5 stars', keywords: 'feedback csat stars' },
    { type: 'condition', label: 'Condition', group: 'logic', icon: GitBranchIcon, blurb: 'Branch on data: yes / no', keywords: 'if branch rule' },
    { type: 'setfield', label: 'Set field', group: 'logic', icon: BracesIcon, blurb: 'Save a value', keywords: 'variable field save' },
    { type: 'calculate', label: 'Calculate', group: 'logic', icon: CalculatorIcon, blurb: 'Price, days, totals', keywords: 'math formula price' },
    { type: 'delay', label: 'Wait', group: 'logic', icon: ClockIcon, blurb: 'Wait a while or until a date', keywords: 'delay timer reminder' },
    { type: 'tag', label: 'Tag / assign', group: 'logic', icon: TagIcon, blurb: 'Tag the contact, assign the chat', keywords: 'label route agent team' },
    { type: 'optout', label: 'Opt-out', group: 'logic', icon: UserXIcon, blurb: 'Stop marketing messages', keywords: 'unsubscribe consent stop' },
    { type: 'hours', label: 'Business hours', group: 'logic', icon: CalendarClockIcon, blurb: 'Open or closed now?', keywords: 'time office open closed' },
    { type: 'split', label: 'A/B split', group: 'logic', icon: SplitIcon, blurb: 'Test two versions', keywords: 'experiment ab test' },
    { type: 'http', label: 'API call', group: 'connect', icon: GlobeIcon, blurb: 'Call another system', keywords: 'webhook http rest integration' },
    {
        type: 'order',
        label: 'Order lookup',
        group: 'connect',
        icon: PackageSearchIcon,
        blurb: 'Order status from your store',
        keywords: 'shopify woocommerce tracking',
    },
    {
        type: 'sheets',
        label: 'Google Sheets row',
        group: 'connect',
        icon: FileSpreadsheetIcon,
        blurb: 'Add a row to a sheet',
        keywords: 'spreadsheet google excel',
    },
    { type: 'goto', label: 'Go to', group: 'control', icon: CornerDownRightIcon, blurb: 'Jump to another block', keywords: 'jump loop' },
    { type: 'subflow', label: 'Subflow', group: 'control', icon: WorkflowIcon, blurb: 'Run a shared flow, then return', keywords: 'reuse shared module' },
    { type: 'note', label: 'Internal note', group: 'control', icon: StickyNoteIcon, blurb: 'A note for your team', keywords: 'comment team' },
    { type: 'handoff', label: 'Talk to a person', group: 'control', icon: HeadsetIcon, blurb: 'Hand over to your team', keywords: 'agent human handoff' },
    { type: 'end', label: 'End', group: 'control', icon: FlagIcon, blurb: 'Finish the flow', keywords: 'stop close finish' },
];

export const START_BLOCK: BlockKind = { type: 'start', label: 'Start', group: 'control', icon: ZapIcon, blurb: 'What starts the flow' };

export const blockOf = (type: NodeType): BlockKind => BLOCKS.find((k) => k.type === type) ?? START_BLOCK;
export const groupOf = (type: NodeType) => GROUPS.find((g) => g.key === blockOf(type).group) ?? GROUPS[4];

export const INPUT_TYPES: NodeType[] = ['buttons', 'list', 'question', 'product', 'form', 'ask_media', 'location', 'rating'];
export const EXIT_TYPES: NodeType[] = ['handoff', 'end', 'goto'];
export const isInput = (n: { type: NodeType; config: NodeConfig }) =>
    INPUT_TYPES.includes(n.type) && !(n.type === 'product' && (n.config.mode ?? 'cards') === 'cards');

/** WhatsApp's limits, enforced while typing. */
export const LIMITS = { header: 60, body: 1024, text: 4096, footer: 60, button: 20, row_title: 24, row_description: 72, buttons: 3, rows: 10 } as const;

export const LANGUAGES: Record<string, string> = {
    en: 'English',
    ar: 'العربية (Arabic)',
    hi: 'हिन्दी (Hindi)',
    ur: 'اردو (Urdu)',
    fr: 'Français',
    ru: 'Русский',
    es: 'Español',
    de: 'Deutsch',
    tl: 'Filipino',
    ml: 'മലയാളം (Malayalam)',
    bn: 'বাংলা (Bengali)',
    zh: '中文',
};
export const RTL = ['ar', 'ur', 'fa', 'he'];

let seq = 0;
export const newNodeId = (type: string) => `${type.slice(0, 4)}_${Date.now().toString(36).slice(-5)}${(seq++).toString(36)}`;
export const newChoiceId = () => `o${Math.random().toString(36).slice(2, 8)}`;

export function defaultConfig(type: NodeType): NodeConfig {
    const input = { no_match: 'handoff', retries: null, timeout_minutes: null };
    switch (type) {
        case 'start':
            return {
                any_message: true,
                greeting: false,
                keywords: [],
                keyword_match: 'starts',
                regex: null,
                ad_referral: true,
                qr_code: null,
                campaign_buttons: [],
                tags_added: [],
                fields_changed: [],
                webhook: false,
                reentry: 'always',
                cooldown_hours: 24,
            };
        case 'message':
            return { text: '' };
        case 'media':
            return { kind: 'image', media_id: null, media_name: null, link: null, caption: null, filename: null };
        case 'buttons':
            return {
                header: null,
                text: '',
                footer: null,
                buttons: [
                    { id: newChoiceId(), title: 'Option 1' },
                    { id: newChoiceId(), title: 'Option 2' },
                ],
                ...input,
            };
        case 'list':
            return {
                header: null,
                text: '',
                footer: null,
                button_label: 'Choose',
                sections: [{ title: null, rows: [{ id: newChoiceId(), title: 'Row 1', description: null }] }],
                ...input,
            };
        case 'product':
            return {
                source: 'manual',
                text: 'Here are our top picks 👇',
                mode: 'cards',
                button_label: 'View products',
                order_label: 'View & order',
                items: [],
                all_label: null,
                all_url: null,
                save_to: 'product',
                ...input,
            };
        case 'template':
            return { name: null, language: null, header: [], body: [], on_failure: false };
        case 'url':
            return { header: null, text: '', footer: null, cta: 'Open', url: 'https://' };
        case 'form':
            return { header: null, text: '', footer: null, flow_id: null, cta: 'Open form', screen: null, draft: false, fields: [], ...input };
        case 'question':
            return { text: '', save_to: 'var:answer', validate: 'any', pattern: null, error_text: null, ...input };
        case 'ask_media':
            return { text: 'Please send a photo 📷', accept: 'image', optional: false, skip_label: 'Skip', save_to: 'var:photo', error_text: null, ...input };
        case 'location':
            return { text: 'Please share your location 📍 or type your area.', save_to: 'location', error_text: null, ...input };
        case 'rating':
            return { text: 'How would you rate us?', button_label: 'Rate us', save_to: 'var:rating', ...input };
        case 'condition':
            return { match: 'all', rules: [{ field: 'name', op: 'is_set', value: null }] };
        case 'setfield':
            return { target: null, value: '' };
        case 'calculate':
            return { expression: '', target: 'var:result', decimals: 2 };
        case 'delay':
            return { mode: 'duration', minutes: 10, until: null, offset_minutes: 0 };
        case 'tag':
            return { add: [], remove: [], assign: 'none', member_id: null };
        case 'optout':
            return { scope: 'marketing', text: 'Done — you will not receive promotional messages from us anymore. Reply START to subscribe again.' };
        case 'hours':
            return { mode: 'business', days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '09:00', to: '18:00', closed_dates: [] };
        case 'split':
            return { percent_a: 50, goal: null };
        case 'http':
            return { method: 'GET', url: 'https://', headers: [], body: null, timeout: 5, retries: 1, save: [] };
        case 'order':
            return { order_number: '{{last_input}}', save_to: 'order' };
        case 'sheets':
            return {
                webapp_url: null,
                sheet: null,
                columns: [
                    { name: 'Name', value: '{{contact.name}}' },
                    { name: 'Phone', value: '{{contact.phone}}' },
                ],
            };
        case 'goto':
            return { target: null };
        case 'subflow':
            return { flow_id: null };
        case 'note':
            return { text: '' };
        case 'handoff':
            return { text: 'Connecting you with our team. Someone will reply shortly.', offline_text: null, note: true, assign: 'none', member_id: null };
        case 'end':
            return { text: null, action: 'none', assign: 'none', member_id: null };
    }
}

/** Same rule as the server: the outputs follow from the config. */
export function outputsFor(type: NodeType, config: NodeConfig): { id: string; label: string }[] {
    const choices = (items: { id: string; title: string }[]) => items.map((c) => ({ id: c.id, label: c.title || '—' }));
    const extra: { id: string; label: string }[] = [];
    if (INPUT_TYPES.includes(type) && !(type === 'product' && (config.mode ?? 'cards') === 'cards')) {
        if ((config.no_match ?? 'handoff') === 'branch') extra.push({ id: 'fallback', label: 'No match' });
        if (config.timeout_minutes) extra.push({ id: 'timeout', label: 'No reply' });
    }
    switch (type) {
        case 'start':
            return [{ id: 'next', label: 'Start' }];
        case 'message':
        case 'media':
        case 'url':
        case 'note':
            return [{ id: 'next', label: 'Next' }];
        case 'template':
            return [{ id: 'next', label: 'Sent' }, ...(config.on_failure ? [{ id: 'failed', label: 'Not delivered' }] : [])];
        case 'setfield':
        case 'tag':
        case 'calculate':
        case 'optout':
        case 'sheets':
            return [{ id: 'next', label: 'Done' }];
        case 'delay':
            return [{ id: 'next', label: 'After wait' }];
        case 'subflow':
            return [{ id: 'next', label: 'After subflow' }];
        case 'buttons':
            return [...choices(config.buttons ?? []), ...extra];
        case 'list':
            return [...choices(((config.sections ?? []) as { rows: { id: string; title: string }[] }[]).flatMap((s) => s.rows ?? [])), ...extra];
        case 'question':
        case 'ask_media':
        case 'location':
        case 'rating':
            return [{ id: 'next', label: 'Answered' }, ...extra];
        case 'form':
            return [{ id: 'next', label: 'Submitted' }, ...extra];
        case 'product':
            return (config.mode ?? 'cards') === 'cards' ? [{ id: 'next', label: 'Next' }] : [{ id: 'next', label: 'Product chosen' }, ...extra];
        case 'condition':
            return [
                { id: 'yes', label: 'Yes' },
                { id: 'no', label: 'No / else' },
            ];
        case 'hours':
            return [
                { id: 'open', label: 'Open' },
                { id: 'closed', label: 'Closed' },
            ];
        case 'split':
            return [
                { id: 'a', label: `A (${config.percent_a ?? 50}%)` },
                { id: 'b', label: `B (${100 - Number(config.percent_a ?? 50)}%)` },
            ];
        case 'http':
            return [
                { id: 'success', label: 'Success' },
                { id: 'error', label: 'Error' },
            ];
        case 'order':
            return [
                { id: 'found', label: 'Found' },
                { id: 'not_found', label: 'Not found' },
            ];
        default:
            return [];
    }
}

/** Re-derives a node's outputs (and its automatic title) after its config changed, keeping existing connections. */
export function withOutputs(node: FlowNode): FlowNode {
    const targets = new Map(node.outputs.map((o) => [o.id, o.to]));
    const next = { ...node, outputs: outputsFor(node.type, node.config).map((o) => ({ ...o, to: targets.get(o.id) ?? null })) };

    return node.auto_title ? { ...next, title: autoTitle(next) } : next;
}

export function newNode(type: NodeType, x: number, y: number): FlowNode {
    const node: FlowNode = { id: newNodeId(type), type, title: blockOf(type).label, auto_title: true, x, y, config: defaultConfig(type), outputs: [] };

    return withOutputs(node);
}

const clip = (s: unknown, n = 70) => {
    const t = String(s ?? '')
        .replace(/\s+/g, ' ')
        .trim();

    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** Blocks name themselves from their content until the author renames them. */
export function autoTitle(node: FlowNode): string {
    const c = node.config;
    const words = (s: unknown, n = 4) =>
        clip(
            String(s ?? '')
                .replace(/\{\{[^}]+\}\}/g, '')
                .replace(/[*_~]/g, '')
                .split(/[.!?\n]/)[0]
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, n)
                .join(' '),
            40,
        );
    const label = blockOf(node.type).label;
    const named = (prefix: string, rest: string) => (rest ? `${prefix}: ${rest}` : label);
    switch (node.type) {
        case 'start':
            return 'Conversation starts';
        case 'message':
            return named('Say', words(c.text));
        case 'buttons':
            return named(
                'Menu',
                ((c.buttons ?? []) as { title: string }[])
                    .map((b) => b.title)
                    .join(' / ')
                    .slice(0, 40),
            );
        case 'list':
            return named('List', words(c.text, 3));
        case 'question':
            return named(
                'Ask',
                String(c.save_to ?? '')
                    .replace(/^(var|field):/, '')
                    .replace(/_/g, ' ') || words(c.text, 3),
            );
        case 'ask_media':
            return c.accept === 'document' ? 'Ask for a document' : 'Ask for a photo';
        case 'location':
            return 'Ask for location';
        case 'rating':
            return 'Ask for a rating';
        case 'product':
            return named('Products', `${(c.items ?? []).length} item${(c.items ?? []).length === 1 ? '' : 's'}`);
        case 'media':
            return named(
                String(c.kind ?? 'Media').replace(/^\w/, (m: string) => m.toUpperCase()),
                clip(c.media_name ?? c.filename ?? '', 30),
            );
        case 'template':
            return named('Template', c.name ?? '');
        case 'url':
            return named('Link', c.cta ?? '');
        case 'form':
            return named('Form', c.cta ?? '');
        case 'condition': {
            const r = (c.rules ?? [])[0] as { field: string } | undefined;

            return named('If', r ? r.field.replace(/^(var|field|business):/, '').replace(/_/g, ' ') : '');
        }
        case 'setfield':
            return named('Set', String(c.target ?? '').replace(/^(var|field):/, ''));
        case 'calculate':
            return named('Calculate', String(c.target ?? '').replace(/^(var|field):/, ''));
        case 'delay':
            return c.mode === 'until' ? 'Wait until a date' : `Wait ${formatMinutes(Number(c.minutes ?? 10))}`;
        case 'tag':
            return (c.add ?? []).length ? `Tag: ${(c.add as string[]).join(', ').slice(0, 30)}` : c.assign !== 'none' ? 'Assign the chat' : label;
        case 'optout':
            return c.scope === 'all' ? 'Unsubscribe' : 'Stop marketing';
        case 'hours':
            return 'Open now?';
        case 'split':
            return `A/B ${c.percent_a ?? 50}/${100 - Number(c.percent_a ?? 50)}`;
        case 'http':
            return named(
                'API',
                clip(
                    String(c.url ?? '')
                        .replace(/^https:\/\//, '')
                        .split('/')[0],
                    30,
                ),
            );
        case 'order':
            return 'Look up the order';
        case 'sheets':
            return named('Sheet', c.sheet ?? 'add a row');
        case 'goto':
            return 'Go to…';
        case 'subflow':
            return 'Run a subflow';
        case 'note':
            return named('Note', words(c.text, 3));
        case 'handoff':
            return 'Talk to a person';
        case 'end':
            return c.action === 'close' ? 'End & close' : 'End';
    }
}

/** One-line summary on the card for blocks without a message bubble. */
export function nodeSummary(node: FlowNode, ctx?: { titles?: Map<string, string>; subflows?: { id: string; name: string }[] }): string {
    const c = node.config;
    switch (node.type) {
        case 'start': {
            const parts = [
                c.any_message ? 'Any message' : null,
                c.greeting ? 'First message' : null,
                (c.keywords ?? []).length ? `“${(c.keywords as string[]).slice(0, 3).join('”, “')}”` : null,
                c.regex ? 'pattern' : null,
                c.qr_code ? `QR “${c.qr_code}”` : null,
                (c.campaign_buttons ?? []).length ? 'campaign reply' : null,
                c.ad_referral && !c.any_message ? 'ad clicks' : null,
                (c.tags_added ?? []).length ? `tag ${(c.tags_added as string[]).join(', ')}` : null,
                (c.fields_changed ?? []).length ? 'field change' : null,
                c.webhook ? 'webhook' : null,
            ].filter(Boolean);

            return parts.length ? parts.join(' · ') : 'Nothing starts this flow yet';
        }
        case 'template':
            return c.name ? `${c.name} (${c.language})` : 'Choose a template';
        case 'condition':
            return `${(c.rules ?? []).length} rule${(c.rules ?? []).length === 1 ? '' : 's'} · ${c.match === 'any' ? 'any' : 'all'} must match`;
        case 'setfield':
            return c.target ? `${c.target} = ${clip(c.value, 40)}` : 'Choose where to save';
        case 'calculate':
            return c.expression ? `${clip(c.expression, 46)}` : 'Write the formula';
        case 'http':
            return `${c.method} ${clip(String(c.url ?? '').replace(/^https:\/\//, ''), 44)}`;
        case 'delay':
            return c.mode === 'until'
                ? `Until ${c.until || '…'}${c.offset_minutes ? ` (${c.offset_minutes > 0 ? '+' : ''}${formatMinutes(Math.abs(c.offset_minutes))}${c.offset_minutes < 0 ? ' before' : ''})` : ''}`
                : `Wait ${formatMinutes(Number(c.minutes ?? 0))}`;
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
        case 'optout':
            return c.scope === 'all' ? 'Opt out of all messages' : 'Opt out of marketing';
        case 'hours':
            return c.mode === 'business' ? 'Inbox business hours' : `${(c.days ?? []).length} days · ${c.from}–${c.to}`;
        case 'split':
            return c.goal ? `Goal: ${ctx?.titles?.get(c.goal) ?? c.goal}` : 'Goal: finished the flow';
        case 'order':
            return `Order no. ${clip(c.order_number, 30)} → {{var.${c.save_to}}}`;
        case 'sheets':
            return `${(c.columns ?? []).length} column(s)${c.sheet ? ` · ${c.sheet}` : ''}`;
        case 'goto':
            return c.target ? `→ ${ctx?.titles?.get(c.target) ?? c.target}` : 'Choose a block';
        case 'subflow':
            return c.flow_id ? `→ ${ctx?.subflows?.find((f) => f.id === c.flow_id)?.name ?? 'subflow'}` : 'Choose a subflow';
        case 'handoff':
            return c.assign === 'member' ? 'To a chosen teammate' : c.assign === 'auto' ? 'To the least busy teammate' : 'To your team (inbox routing)';
        case 'end':
            return c.action === 'close' ? 'Finish and close the chat' : c.action === 'assign' ? 'Finish and assign the chat' : 'Finish the flow';
        case 'question': {
            const v =
                (
                    {
                        any: 'any answer',
                        text: 'text',
                        number: 'a number',
                        email: 'an email',
                        phone: 'a phone number',
                        date: 'a date',
                        future_date: 'a future date',
                        workday: 'a working day',
                        regex: 'a pattern',
                    } as Record<string, string>
                )[c.validate] ?? 'any answer';

            return `Expects ${v} → ${
                String(c.save_to ?? '')
                    .replace(/^var:/, '{{var.')
                    .replace(/^field:/, 'field ') + (String(c.save_to ?? '').startsWith('var:') ? '}}' : '')
            }`;
        }
        default:
            return clip(c.text) || '';
    }
}

/** Blocks that show a message bubble on the card. */
export const BUBBLE_TYPES: NodeType[] = [
    'message',
    'buttons',
    'list',
    'question',
    'product',
    'media',
    'url',
    'form',
    'ask_media',
    'location',
    'rating',
    'note',
    'handoff',
    'end',
    'optout',
];

export function formatMinutes(m: number): string {
    if (m >= 1440 && m % 1440 === 0) return `${m / 1440} day${m === 1440 ? '' : 's'}`;
    if (m >= 60 && m % 60 === 0) return `${m / 60} hour${m === 60 ? '' : 's'}`;

    return `${m} min`;
}

export function formatDuration(seconds: number | null): string {
    if (seconds === null) return '—';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} min`;

    return `${(seconds / 3600).toFixed(1)} h`;
}

// ── Checks while editing (the server's full check comes back with every save) ──────────────

export function openPorts(graph: FlowGraph): Map<string, Set<string>> {
    const ids = new Set(graph.nodes.map((n) => n.id));
    const out = new Map<string, Set<string>>();
    for (const n of graph.nodes) {
        for (const o of n.outputs) {
            if (!o.to || !ids.has(o.to)) {
                if (!out.has(n.id)) out.set(n.id, new Set());
                out.get(n.id)?.add(o.id);
            }
        }
    }

    return out;
}

// ── Variables for the {{ }} picker ─────────────────────────────────────────────────────────

export type Variable = { key: string; label: string; group: 'Contact' | 'Answers' | 'Business' | 'Other' };

export function variablesFor(graph: FlowGraph, options: ChatbotOptions | undefined): Variable[] {
    const out: Variable[] = [
        { key: 'contact.first_name', label: 'First name', group: 'Contact' },
        { key: 'contact.name', label: 'Full name', group: 'Contact' },
        { key: 'contact.phone', label: 'Phone', group: 'Contact' },
        { key: 'contact.email', label: 'Email', group: 'Contact' },
        { key: 'contact.language', label: 'Language', group: 'Contact' },
        ...(options?.fields ?? []).map((f) => ({ key: `contact.${f.key}`, label: f.label, group: 'Contact' as const })),
        { key: 'last_input', label: 'Last answer', group: 'Other' },
        { key: 'bot.name', label: 'This bot’s name', group: 'Other' },
    ];
    const business = { ...(options?.variable_suggestions ?? {}) };
    for (const k of Object.keys(options?.variables ?? {})) business[k] ??= k.replace(/_/g, ' ');
    for (const [k, label] of Object.entries(business)) out.push({ key: `business.${k}`, label: String(label), group: 'Business' });

    const seen = new Set(out.map((v) => v.key));
    const add = (key: string, label: string) => {
        if (!seen.has(key)) {
            seen.add(key);
            out.push({ key, label, group: 'Answers' });
        }
    };
    const fromTarget = (t: unknown, label: string) =>
        typeof t === 'string' && t.startsWith('var:') && add(`var.${t.slice(4)}`, `${label}: ${t.slice(4).replace(/_/g, ' ')}`);
    for (const n of graph.nodes) {
        const c = n.config;
        if (['question', 'ask_media', 'rating'].includes(n.type)) fromTarget(c.save_to, 'Answer');
        if (n.type === 'setfield') fromTarget(c.target, 'Value');
        if (n.type === 'calculate') fromTarget(c.target, 'Result');
        if (n.type === 'location') {
            add(`var.${c.save_to ?? 'location'}.address`, 'Location address');
            add(`var.${c.save_to ?? 'location'}.map`, 'Location map link');
        }
        if (n.type === 'product') {
            add(`var.${c.save_to ?? 'product'}.name`, 'Chosen product');
            add(`var.${c.save_to ?? 'product'}.price`, 'Chosen product price');
            add(`var.${c.save_to ?? 'product'}.link`, 'Chosen product link');
        }
        if (n.type === 'order') {
            add(`var.${c.save_to ?? 'order'}.status`, 'Order status');
            add(`var.${c.save_to ?? 'order'}.tracking_url`, 'Order tracking link');
        }
        if (n.type === 'http') {
            for (const m of (c.save ?? []) as { to: string }[]) fromTarget(m.to, 'API');
            add('var.http_status', 'API status code');
        }
        if (n.type === 'form') for (const m of (c.fields ?? []) as { to: string }[]) fromTarget(m.to, 'Form');
        if (n.type === 'buttons' || n.type === 'list') add(`var.${n.id}`, `Choice in “${n.title}”`);
    }

    return out;
}

// ── Auto-tidy ──────────────────────────────────────────────────────────────────────────────

export const CARD_WIDTH = 300;
export const COLUMN_GAP = 110;
export const GRID = 20;

/** Left-to-right layout: each block one column right of the first block that leads to it. */
export function tidy(graph: FlowGraph, heights: Map<string, number>): FlowGraph {
    const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
    const start = graph.nodes.find((n) => n.type === 'start') ?? graph.nodes[0];
    if (!start) return graph;
    const depth = new Map<string, number>([[start.id, 0]]);
    const order = [start.id];
    const queue = [start.id];
    while (queue.length) {
        const id = queue.shift() as string;
        const node = nodes.get(id);
        if (!node || node.type === 'goto') continue;
        for (const o of node.outputs) {
            if (o.to && nodes.has(o.to) && !depth.has(o.to)) {
                depth.set(o.to, (depth.get(id) ?? 0) + 1);
                order.push(o.to);
                queue.push(o.to);
            }
        }
    }
    const maxDepth = Math.max(0, ...depth.values());
    for (const n of graph.nodes) {
        if (!depth.has(n.id)) {
            depth.set(n.id, maxDepth + 1);
            order.push(n.id);
        }
    }
    const tops = new Map<number, number>();
    const placed = new Map<string, { x: number; y: number }>();
    for (const id of order) {
        const col = depth.get(id) ?? 0;
        const top = tops.get(col) ?? 60;
        placed.set(id, { x: 60 + col * (CARD_WIDTH + COLUMN_GAP), y: top });
        tops.set(col, top + (heights.get(id) ?? 180) + 40);
    }

    return { nodes: graph.nodes.map((n) => ({ ...n, ...(placed.get(n.id) ?? {}) })) };
}

export const snap = (v: number, on: boolean) => (on ? Math.round(v / GRID) * GRID : Math.round(v));
