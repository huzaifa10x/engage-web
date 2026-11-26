'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, upload } from './api';
import type {
    ContactFunnel,
    ConversationEvent,
    CrmSync,
    InboxHealth,
    ContactDuplicate,
    ContactFieldChange,
    LeadStatusKey,
    PermissionVia,
    Resolution,
    ResolutionReason,
    ResolutionReview,
    StartCandidate,
    EnquiryBoard,
    MissedLeadsReport,
    NextStep,
    ReplyPromiseSettings,
    WaitAlert,
    ConsentHistoryEntry,
    FollowUps,
    FollowUpSettings,
    ConversationCounts,
    ResponseTimes,
    GrowthSite,
    SiteTest,
    LeadPage,
    LeadSummary,
    MarketingCampaignRow,
    MarketingOverview,
    MarketingSourceRow,
    MarketingTrendPoint,
    MetaAd,
    UnmatchedClick,
    CrmStage,
    LeadEvidence,
    StageEvent,
    ApiKey,
    ContactOrders,
    Integration,
    SalesAnalytics,
    SalesMatch,
    SalesOrderDetails,
    SalesPage,
    IntegrationEvent,
    IntegrationRule,
    IntegrationsOverview,
    DeveloperOverview,
    WebhookDelivery,
    WebhookEndpoint,
    UnreadConversation,
    CannedResponse,
    ConversationNote,
    DashboardSummary,
    InboxSettings,
    MemberNotification,
    AutoReplySettings,
    BillingPayments,
    BillingPortalFlow,
    BillingReturn,
    PaymentMethod,
    CampaignPreview,
    Billing,
    BillingInvoice,
    ComplianceOverview,
    ComplianceSettings,
    ConsentEvent,
    AnalyticsOverview,
    Campaign,
    CampaignAudience,
    CampaignForm,
    CampaignRecipient,
    ContactField,
    ContactFieldsAllowance,
    ImportResult,
    Segment,
    SegmentCounts,
    SegmentRule,
    Tag,
    AuditEntry,
    ConsentState,
    Contact,
    Conversation,
    CursorPage,
    Message,
    MessageTemplate,
    EntitlementsDetail,
    Invitation,
    Me,
    Membership,
    NumberGrants,
    Paginated,
    PhoneNumber,
    Role,
    RoleCatalog,
    SignupAttempt,
    SignupLaunch,
    TemplateForm,
    Tenant,
    WabaAccount,
} from './types';

export const keys = {
    me: ['me'] as const,
    leadEvidence: (contactId: string) => ['growth', 'evidence', contactId] as const,
    leads: (filters: LeadFilters) => ['growth', 'leads', filters] as const,
    leadsAll: ['growth', 'leads'] as const,
    leadSummary: ['growth', 'leads-summary'] as const,
    unmatchedClicks: ['growth', 'unmatched-clicks'] as const,
    sites: ['growth', 'sites'] as const,
    siteTest: (id: string) => ['growth', 'sites', id, 'test'] as const,
    stages: ['crm', 'stages'] as const,
    stageHistory: (contactId: string) => ['crm', 'stage-history', contactId] as const,
    tenant: ['tenant'] as const,
    entitlements: ['entitlements'] as const,
    roles: ['roles'] as const,
    roleCatalog: ['roles', 'catalog'] as const,
    members: ['team', 'members'] as const,
    invitations: ['team', 'invitations'] as const,
    grants: (membershipId: string) => ['team', 'grants', membershipId] as const,
    accounts: ['whatsapp', 'accounts'] as const,
    numbers: ['whatsapp', 'numbers'] as const,
    signup: (id: string) => ['whatsapp', 'signup', id] as const,
    audit: ['audit'] as const,
    conversations: (filters: object) => ['inbox', 'conversations', filters] as const,
    conversationsAll: ['inbox', 'conversations'] as const,
    conversation: (id: string) => ['inbox', 'conversation', id] as const,
    thread: (id: string) => ['inbox', 'thread', id] as const,
    contacts: (filters: object) => ['contacts', filters] as const,
    contactsAll: ['contacts'] as const,
    templates: (filters: object) => ['templates', filters] as const,
    templatesAll: ['templates'] as const,
    tags: ['tags'] as const,
    contactFields: ['contact-fields'] as const,
    segments: ['segments'] as const,
    campaigns: ['campaigns'] as const,
    campaign: (id: string) => ['campaigns', id] as const,
    analytics: (filters: object) => ['analytics', filters] as const,
};

type Data<T> = { data: T };

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api<Data<Me>>('me').then((r) => r.data), staleTime: 60_000, retry: false });

export const useTenant = () => useQuery({ queryKey: keys.tenant, queryFn: () => api<Data<Tenant>>('tenant').then((r) => r.data) });

export const useEntitlements = () =>
    useQuery({ queryKey: keys.entitlements, queryFn: () => api<Data<EntitlementsDetail>>('tenant/entitlements').then((r) => r.data) });

export const useRoles = (enabled = true) =>
    useQuery({ queryKey: keys.roles, queryFn: () => api<Data<Role[]>>('roles').then((r) => r.data), enabled, staleTime: 300_000 });
export const useRoleCatalog = (enabled = true) =>
    useQuery({ queryKey: keys.roleCatalog, queryFn: () => api<Data<RoleCatalog>>('roles/catalog').then((r) => r.data), enabled });

/** Teammates a conversation can be assigned to, each marked with access to its WhatsApp number. */
export type Assignee = { id: string; name: string; role: string | null; can_access: boolean };
export const useAssignees = (conversationId: string | undefined, enabled = true) =>
    useQuery({
        queryKey: ['inbox', 'assignees', conversationId],
        queryFn: () => api<Data<Assignee[]>>(`conversations/${conversationId}/assignees`).then((r) => r.data),
        enabled: enabled && !!conversationId,
        staleTime: 30_000,
    });

export const useMembers = (enabled = true) =>
    useQuery({ queryKey: keys.members, queryFn: () => api<Paginated<Membership>>('team/members', { query: { per_page: 100 } }), enabled });

export const useInvitations = (enabled = true) =>
    useQuery({ queryKey: keys.invitations, queryFn: () => api<Data<Invitation[]>>('team/invitations').then((r) => r.data), enabled });

export const useGrants = (membershipId: string, enabled = true) =>
    useQuery({
        queryKey: keys.grants(membershipId),
        queryFn: () => api<Data<NumberGrants>>(`team/members/${membershipId}/numbers`).then((r) => r.data),
        enabled,
    });

export const useWabaAccounts = (enabled = true) =>
    useQuery({
        queryKey: keys.accounts,
        queryFn: () => api<Data<WabaAccount[]>>('whatsapp/accounts').then((r) => r.data),
        enabled,
        // Kept fresh by itself, so a number that is disconnected at Meta (or reconnected, or whose import
        // moves on) shows within seconds, without anyone pressing a refresh button. Also refreshed when
        // the tab regains focus.
        refetchInterval: 10_000,
        refetchOnWindowFocus: true,
    });

export const usePhoneNumbers = () =>
    useQuery({
        queryKey: keys.numbers,
        queryFn: () => api<Data<PhoneNumber[]>>('phone-numbers').then((r) => r.data),
        staleTime: 30_000,
        // Every page uses this (number switcher, disconnected banner): a change of status at Meta, or an
        // import's progress, appears by itself within about 20 seconds.
        refetchInterval: 20_000,
        refetchOnWindowFocus: true,
    });

export const useSignupAttempt = (id: string | null, poll: boolean) =>
    useQuery({
        queryKey: keys.signup(id ?? 'none'),
        queryFn: () => api<Data<SignupAttempt>>(`whatsapp/signups/${id}`).then((r) => r.data),
        enabled: id !== null,
        refetchInterval: poll ? 2000 : false,
    });

export const startSignup = (coexistence: boolean, conversions = false) =>
    api<Data<SignupLaunch>>('whatsapp/signups', { method: 'POST', body: conversions ? { coexistence, conversions } : { coexistence } }).then((r) => r.data);

/** Invalidate everything tenant-scoped (after switching workspace). */
export function useResetTenantData() {
    const qc = useQueryClient();

    return () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
}

export function useSwitchTenant() {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: (tenantId: string) => api('me/active-tenant', { method: 'PUT', body: { tenant_id: tenantId } }),
        onSuccess: async () => {
            qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
            await qc.invalidateQueries({ queryKey: keys.me });
        },
    });
}

export async function fetchAuditPage(cursor: string | null) {
    return api<Paginated<AuditEntry>>('audit-logs', { query: { cursor } });
}

// ── Messaging ────────────────────────────────────────────────────────────────────────────

export type ConversationFilters = {
    phone_number_id?: string | null;
    status?: 'open' | 'closed';
    assigned?: 'me' | 'unassigned' | 'others' | 'any';
    /** Only conversations given to this inbox team. */
    team?: string;
    /** One teammate's chats (Agents › a person). */
    assignee?: string;
    /** Chatbot views: handled by the bot now, waiting for the customer, or how the bot ended. */
    view?: 'bot' | 'waiting' | 'abandoned' | 'completed' | 'handed_off';
    unread?: boolean;
    q?: string;
    snoozed?: boolean;
    /** Who it is waiting on: needs_reply lists ad leads first, then the longest waiting. */
    state?: 'needs_reply' | 'waiting';
    /** "Arrived after hours" (still needing a reply). */
    after_hours?: boolean;
    /** 3.5: All lists snoozed chats too. */
    include_snoozed?: boolean;
    window?: 'open' | 'closed';
    followup?: boolean;
    tag?: string;
    sort?: 'priority' | 'newest' | 'waiting';
};

/** Inbox teams: named groups of teammates a conversation or a chatbot handover can go to. */
export type InboxTeam = { id: string; name: string; member_ids: string[]; open_conversations: number };

export const useInboxTeams = (enabled = true) =>
    useQuery({ queryKey: ['inbox', 'teams'], queryFn: () => api<{ data: InboxTeam[] }>('inbox/teams').then((r) => r.data), enabled, staleTime: 60_000 });

export const saveInboxTeam = (team: { id?: string; name: string; member_ids: string[] }) =>
    api<{ data: InboxTeam[] }>(team.id ? `inbox/teams/${team.id}` : 'inbox/teams', {
        method: team.id ? 'PUT' : 'POST',
        body: { name: team.name, member_ids: team.member_ids },
    }).then((r) => r.data);

export const deleteInboxTeam = (id: string) => api<void>(`inbox/teams/${id}`, { method: 'DELETE' });

export const useConversations = (filters: ConversationFilters, refetchInterval: number | false = false, enabled = true) =>
    useInfiniteQuery({
        queryKey: keys.conversations(filters),
        refetchInterval,
        enabled,
        queryFn: ({ pageParam }) =>
            api<CursorPage<Conversation>>('conversations', {
                query: {
                    ...filters,
                    unread: filters.unread ? 1 : undefined,
                    after_hours: filters.after_hours ? 1 : undefined,
                    include_snoozed: filters.include_snoozed ? 1 : undefined,
                    followup: filters.followup ? 1 : undefined,
                    cursor: pageParam,
                    per_page: 30,
                },
            }),
        initialPageParam: null as string | null,
        getNextPageParam: (last) => last.meta.next_cursor ?? null,
    });

/** Counts for the inbox tabs (Needs reply, after hours, unassigned), same visibility as the list. */
export const useConversationCounts = (phoneNumberId: string | null, refetchInterval: number | false = false) =>
    useQuery({
        queryKey: [...keys.conversationsAll, 'counts', phoneNumberId] as const,
        queryFn: () => api<Data<ConversationCounts>>('conversations/counts', { query: { phone_number_id: phoneNumberId ?? undefined } }).then((r) => r.data),
        refetchInterval,
    });

export const useConversation = (id: string | null, refetchInterval: number | false = false) =>
    useQuery({
        queryKey: keys.conversation(id ?? 'none'),
        refetchInterval,
        queryFn: () => api<{ data: Conversation }>(`conversations/${id}`).then((r) => r.data),
        enabled: id !== null,
    });

/** Newest-first pages from the API; the thread view reverses them for display. */
export const useThread = (id: string | null, refetchInterval: number | false = false) =>
    useInfiniteQuery({
        queryKey: keys.thread(id ?? 'none'),
        refetchInterval,
        queryFn: ({ pageParam }) => api<CursorPage<Message>>(`conversations/${id}/messages`, { query: { cursor: pageParam, per_page: 40 } }),
        initialPageParam: null as string | null,
        getNextPageParam: (last) => last.meta.next_cursor ?? null,
        enabled: id !== null,
    });

/** `filter`: JSON {match, rules} of conditions on custom fields (see FieldFilter). */
export type ContactFilters = {
    q?: string;
    consent?: ConsentState;
    tag?: string;
    segment_id?: string;
    synced_from?: string;
    /** How the contact was added: manual, import, inbound, api … */
    source?: string;
    filter?: string;
    stage_id?: string;
    lifecycle?: 'subscriber' | 'lead' | 'opportunity' | 'customer' | 'other';
    owner?: string;
    duplicates?: 1;
    /** 3.5: newest activity first (page numbers as the cursor). */
    sort?: 'activity' | 'name';
};

export type ContactCounts = { matching: number; total: number; sources: { value: string; count: number }[] };

/** How many contacts match the filters, how many there are in all, and the sources they came from. */
export const useContactCounts = (filters: ContactFilters) =>
    useQuery({
        queryKey: [...keys.contacts(filters), 'count'] as const,
        queryFn: () => api<Data<ContactCounts>>('contacts/count', { query: { ...filters } }).then((r) => r.data),
    });

export const useContacts = (filters: ContactFilters) =>
    useInfiniteQuery({
        queryKey: keys.contacts(filters),
        queryFn: ({ pageParam }) => api<CursorPage<Contact>>('contacts', { query: { ...filters, cursor: pageParam, per_page: 50 } }),
        initialPageParam: null as string | null,
        getNextPageParam: (last) => last.meta.next_cursor ?? null,
    });

export type SendPayload = {
    type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'template' | 'reaction';
    body?: string | null;
    media_id?: string | null;
    reply_to?: string | null;
    content?: Record<string, unknown>;
    template?: {
        name: string;
        language: string;
        components?: unknown[];
        /** Values for the template's placeholders; the server builds Meta's components from them. */
        variables?: { header?: string[]; body?: string[]; buttons?: Record<string, string> };
    };
};

/** Idempotency-Key makes double clicks / retries safe: the server stores the message once. */
export function sendToConversation(conversationId: string, payload: SendPayload, idempotencyKey: string) {
    return api<{ data: Message }>(`conversations/${conversationId}/messages`, {
        method: 'POST',
        body: payload,
        headers: { 'Idempotency-Key': idempotencyKey },
    }).then((r) => r.data);
}

export function startConversation(payload: StartPayload, idempotencyKey: string) {
    return api<{ data: Message }>('messages', { method: 'POST', body: payload, headers: { 'Idempotency-Key': idempotencyKey } }).then((r) => r.data);
}

// ── Message templates ────────────────────────────────────────────────────────────────────

export type TemplateFilters = { waba_account_id?: string | null; status?: string; q?: string };

/** Stored templates; the server refreshes a stale account from Meta in the background. */
export const useTemplates = (filters: TemplateFilters = {}, enabled = true, refetchInterval: number | false = false) =>
    useQuery({
        queryKey: keys.templates(filters),
        refetchInterval,
        queryFn: () => api<{ data: MessageTemplate[]; meta: { last_synced_at: Record<string, string | null> } }>('templates', { query: filters }),
        enabled,
        staleTime: 15_000,
    });

export const createTemplate = (form: TemplateForm) => api<Data<MessageTemplate>>('templates', { method: 'POST', body: form }).then((r) => r.data);

export const deleteTemplate = (id: string) => api(`templates/${id}`, { method: 'DELETE' });

/** Reads everything from Meta right now (statuses, edits, deletions). */
export const syncTemplates = (wabaAccountId?: string | null) =>
    api<Data<{ synced: number; removed: number; accounts: number }>>('templates/sync', {
        method: 'POST',
        body: wabaAccountId ? { waba_account_id: wabaAccountId } : {},
    }).then((r) => r.data);

// ── Contacts & CRM ───────────────────────────────────────────────────────────────────────

export const useTags = (enabled = true) => useQuery({ queryKey: keys.tags, queryFn: () => api<Data<Tag[]>>('tags').then((r) => r.data), enabled });

export const deleteTag = (id: string) => api(`tags/${id}`, { method: 'DELETE' });

export const useContactFields = (enabled = true) =>
    useQuery({ queryKey: keys.contactFields, queryFn: () => api<Data<ContactField[]>>('contact-fields').then((r) => r.data), enabled, staleTime: 60_000 });

/** The fields together with what the plan allows (used / limit, available types). */
export const useContactFieldsInfo = (enabled = true) =>
    useQuery({
        queryKey: [...keys.contactFields, 'info'],
        queryFn: () => api<{ data: ContactField[]; meta: ContactFieldsAllowance }>('contact-fields'),
        enabled,
    });

export type ContactFieldInput = { label: string; type?: ContactField['type']; options?: string[] | null; rules?: ContactField['rules'] | null };

export const createContactField = (body: ContactFieldInput) => api<Data<ContactField>>('contact-fields', { method: 'POST', body }).then((r) => r.data);

/** Label, choices and rules can change; the key and type cannot (values already stored keep their meaning). */
export const updateContactField = (id: string, body: Omit<ContactFieldInput, 'type'>) =>
    api<Data<ContactField>>(`contact-fields/${id}`, { method: 'PATCH', body }).then((r) => r.data);

export const deleteContactField = (id: string) => api(`contact-fields/${id}`, { method: 'DELETE' });

export const useSegments = (enabled = true) =>
    useQuery({ queryKey: keys.segments, queryFn: () => api<Data<Segment[]>>('segments').then((r) => r.data), enabled });

export const saveSegment = (id: string | null, body: { name: string; match: 'all' | 'any'; rules: SegmentRule[] }) =>
    api<Data<Segment>>(id ? `segments/${id}` : 'segments', { method: id ? 'PATCH' : 'POST', body }).then((r) => r.data);

export const deleteSegment = (id: string) => api(`segments/${id}`, { method: 'DELETE' });

export const previewSegment = (body: { match: 'all' | 'any'; rules: SegmentRule[] }) =>
    api<Data<SegmentCounts>>('segments/preview', { method: 'POST', body }).then((r) => r.data);

export const importContacts = (file: File, tags: string[], optedIn: boolean, consentSource: string | null = null) => {
    const form = new FormData();
    form.append('file', file);
    tags.forEach((t) => form.append('tags[]', t));
    if (optedIn) form.append('opted_in', '1');
    if (consentSource) form.append('consent_source', consentSource);

    return upload<Data<ImportResult>>('contacts/import', form).then((r) => r.data);
};

// ── Campaigns ────────────────────────────────────────────────────────────────────────────

/** Polls while anything is sending or scheduled, so delivery numbers move without a refresh. */
/** Campaigns, for one WhatsApp number when the top-bar number selector has one chosen (CN-02). */
export const useCampaigns = (enabled = true, phoneNumberId: string | null = null) =>
    useQuery({
        queryKey: [...keys.campaigns, phoneNumberId],
        queryFn: () => api<Data<Campaign[]>>('campaigns', { query: phoneNumberId ? { phone_number_id: phoneNumberId } : {} }).then((r) => r.data),
        enabled,
        refetchInterval: (query) => (query.state.data?.some((c) => ['sending', 'scheduled', 'paused'].includes(c.status)) ? 5_000 : 30_000),
    });

export const saveCampaign = (id: string | null, body: CampaignForm) =>
    api<Data<Campaign>>(id ? `campaigns/${id}` : 'campaigns', { method: id ? 'PATCH' : 'POST', body }).then((r) => r.data);

export const launchCampaign = (id: string, scheduledAt?: string | null, consentConfirmed = false) =>
    api<Data<Campaign>>(`campaigns/${id}/launch`, {
        method: 'POST',
        body: { ...(scheduledAt ? { scheduled_at: scheduledAt } : {}), ...(consentConfirmed ? { consent_confirmed: true } : {}) },
    }).then((r) => r.data);

/** A contact's consent history, newest first. */
export const useConsentHistory = (contactId: string | null) =>
    useQuery({
        queryKey: ['contacts', contactId, 'consent-history'],
        queryFn: () => api<Data<ConsentHistoryEntry[]>>(`contacts/${contactId}/consent-history`).then((r) => r.data),
        enabled: contactId !== null,
    });

export const cancelCampaign = (id: string) => api<Data<Campaign>>(`campaigns/${id}/cancel`, { method: 'POST' }).then((r) => r.data);

export const deleteCampaign = (id: string) => api(`campaigns/${id}`, { method: 'DELETE' });

export const useCampaignAudience = (
    filters: {
        segment_id: string | null;
        audience_tag: string | null;
        template_id: string | null;
        phone_number_id: string | null;
        filter?: string | null;
        opted_in_only?: number | null;
    },
    enabled = true,
) =>
    useQuery({
        queryKey: ['campaign-audience', filters],
        queryFn: () => api<Data<CampaignAudience>>('campaigns/audience', { query: filters }).then((r) => r.data),
        enabled,
    });

export const useCampaign = (id: string | null) =>
    useQuery({
        queryKey: keys.campaign(id ?? ''),
        queryFn: () => api<Data<Campaign>>(`campaigns/${id}`).then((r) => r.data),
        enabled: id !== null,
        refetchInterval: 10_000,
    });

export const previewCampaign = (body: {
    template_id: string;
    segment_id: string | null;
    audience_tag: string | null;
    filter?: { match: 'all' | 'any'; rules: SegmentRule[] } | null;
    variables: { header: string[]; body: string[] };
}) => api<Data<CampaignPreview[]>>('campaigns/preview', { method: 'POST', body }).then((r) => r.data);

export const pauseCampaign = (id: string) => api<Data<Campaign>>(`campaigns/${id}/pause`, { method: 'POST' }).then((r) => r.data);

export const resumeCampaign = (id: string) => api<Data<Campaign>>(`campaigns/${id}/resume`, { method: 'POST' }).then((r) => r.data);

/** A/B test on 20%: send variant A or B to the rest of the list. */
export const sendCampaignRest = (id: string, variant: 'A' | 'B') =>
    api<Data<Campaign>>(`campaigns/${id}/send-rest`, { method: 'POST', body: { variant } }).then((r) => r.data);

export const duplicateCampaign = (id: string) => api<Data<Campaign>>(`campaigns/${id}/duplicate`, { method: 'POST' }).then((r) => r.data);

export const useCampaignRecipients = (id: string | null, status?: string) =>
    useQuery({
        queryKey: ['campaign-recipients', id, status ?? 'all'],
        queryFn: () => api<{ data: CampaignRecipient[] }>(`campaigns/${id}/recipients`, { query: { status, per_page: 100 } }).then((r) => r.data),
        enabled: id !== null,
        refetchInterval: 10_000,
    });

// ── Analytics ────────────────────────────────────────────────────────────────────────────

export const useAnalytics = (filters: { days: number; phone_number_id?: string | null }, enabled = true) =>
    useQuery({
        queryKey: keys.analytics(filters),
        queryFn: () => api<Data<AnalyticsOverview>>('analytics/overview', { query: filters }).then((r) => r.data),
        enabled,
        refetchInterval: 60_000,
    });

// ── Compliance ───────────────────────────────────────────────────────────────────────────

export const useComplianceOverview = (enabled = true) =>
    useQuery({ queryKey: ['compliance', 'overview'], queryFn: () => api<Data<ComplianceOverview>>('compliance/overview').then((r) => r.data), enabled });

export const useComplianceSettings = (enabled = true) =>
    useQuery({ queryKey: ['compliance', 'settings'], queryFn: () => api<Data<ComplianceSettings>>('compliance/settings').then((r) => r.data), enabled });

export const updateComplianceSettings = (body: Partial<ComplianceSettings>) =>
    api<Data<ComplianceSettings>>('compliance/settings', { method: 'PUT', body }).then((r) => r.data);

export const useConsentEvents = (filters: { action?: string; q?: string }, enabled = true) =>
    useInfiniteQuery({
        queryKey: ['compliance', 'events', filters],
        queryFn: ({ pageParam }) => api<CursorPage<ConsentEvent>>('compliance/consent-events', { query: { ...filters, cursor: pageParam, per_page: 50 } }),
        initialPageParam: null as string | null,
        getNextPageParam: (last) => last.meta.next_cursor ?? null,
        enabled,
    });

/** Sends the consent question with Subscribe / Unsubscribe buttons into an open conversation (double opt-in). */
export const requestConsent = (conversationId: string) =>
    api<Data<Message>>(`conversations/${conversationId}/consent-request`, { method: 'POST' }).then((r) => r.data);

// ── Billing (Stripe) ─────────────────────────────────────────────────────────────────────

export const useBilling = (enabled = true) => useQuery({ queryKey: ['billing'], queryFn: () => api<Data<Billing>>('billing').then((r) => r.data), enabled });

/** The billing summary; the return page polls it while Stripe's webhook confirms a change. */
export const fetchBillingSummary = () => api<Data<Billing>>('billing/summary').then((r) => r.data);

export const useInvoices = (enabled = true) =>
    useQuery({ queryKey: ['billing', 'invoices'], queryFn: () => api<Data<BillingInvoice[]>>('billing/invoices').then((r) => r.data), enabled });

export const updateBillingDetails = (body: { legal_name: string | null; country: string; tax_trn: string | null; billing_email: string | null }) =>
    api<Data<Billing>>('billing/details', { method: 'PUT', body }).then((r) => r.data);

/** The card renewals are charged to, read from Stripe (brand, last 4, expiry). Cards are never stored by engageX. */
export const usePaymentMethod = (enabled = true) =>
    useQuery({
        queryKey: ['billing', 'payment-method'],
        queryFn: () => api<Data<PaymentMethod | null>>('billing/payment-method').then((r) => r.data),
        enabled,
    });

export const usePayments = (enabled = true) =>
    useQuery({ queryKey: ['billing', 'payments'], queryFn: () => api<Data<BillingPayments>>('billing/payments').then((r) => r.data), enabled });

/** Upgrade from Free (or a trial): the URL of a Stripe Checkout page. */
export const startCheckout = (plan: string, interval: 'monthly' | 'yearly') =>
    api<Data<{ url: string }>>('billing/checkout', { method: 'POST', body: { plan, interval } }).then((r) => r.data.url);

/**
 * The URL of a Stripe Customer Portal page for one task: switch plan or period (update), add a card and
 * pay an open invoice (card), cancel at the end of the period (cancel), or undo a scheduled change (manage).
 */
export const openBillingPortal = (flow: BillingPortalFlow, plan?: string, interval?: 'monthly' | 'yearly') =>
    api<Data<{ url: string }>>('billing/portal', { method: 'POST', body: { flow, plan: plan ?? null, interval: interval ?? null } }).then((r) => r.data.url);

/** Back from Stripe: check the Checkout session (grants nothing), or pay an open invoice with the new card. */
export const confirmBillingReturn = (body: { session_id?: string; flow?: BillingPortalFlow }) =>
    api<Data<BillingReturn>>('billing/return', { method: 'POST', body }).then((r) => r.data);

/** A fresh link to Stripe's PDF of an invoice. */
export const invoicePdfUrl = (id: string) => api<Data<{ url: string }>>(`billing/invoices/${id}/pdf`).then((r) => r.data.url);

/** A trial moves to Free straight away. (A paid plan is cancelled in the Stripe portal instead.) */
export const switchToFree = () => api<Data<Billing>>('billing/switch-to-free', { method: 'POST' }).then((r) => r.data);

// ── Auto reply ───────────────────────────────────────────────────────────────────────────

export const useAutoReply = (enabled = true) =>
    useQuery({ queryKey: ['auto-reply'], queryFn: () => api<Data<AutoReplySettings>>('tenant/auto-reply').then((r) => r.data), enabled });

export const updateAutoReply = (body: Omit<AutoReplySettings, 'flow_options'>) =>
    api<Data<AutoReplySettings>>('tenant/auto-reply', { method: 'PUT', body }).then((r) => r.data);

export const useFollowUps = (enabled = true) =>
    useQuery({ queryKey: ['followups'], queryFn: () => api<Data<FollowUps>>('tenant/followups').then((r) => r.data), enabled });

export const updateFollowUps = (body: Partial<FollowUpSettings>) => api<Data<FollowUps>>('tenant/followups', { method: 'PUT', body }).then((r) => r.data);

/** Switch automatic replies on or off for one conversation. */
export const setConversationAutoReply = (id: string, enabled: boolean) =>
    api<Data<Conversation>>(`conversations/${id}`, { method: 'PATCH', body: { auto_reply_enabled: enabled } }).then((r) => r.data);

// ── Inbox tools: canned responses, notes, snooze, business hours, notifications ──────────

export const useCannedResponses = (enabled = true) =>
    useQuery({
        queryKey: ['canned-responses'],
        queryFn: () => api<Data<CannedResponse[]>>('canned-responses').then((r) => r.data),
        enabled,
        staleTime: 60_000,
    });

export const saveCannedResponse = (id: string | null, body: { shortcut: string; body: string }) =>
    api<Data<CannedResponse>>(id ? `canned-responses/${id}` : 'canned-responses', { method: id ? 'PUT' : 'POST', body }).then((r) => r.data);

export const deleteCannedResponse = (id: string) => api(`canned-responses/${id}`, { method: 'DELETE' });

export const useConversationNotes = (id: string | null, enabled = true) =>
    useQuery({
        queryKey: ['inbox', 'notes', id],
        queryFn: () => api<Data<ConversationNote[]>>(`conversations/${id}/notes`).then((r) => r.data),
        enabled: enabled && id !== null,
    });

export const addConversationNote = (id: string, body: string, mentions: string[]) =>
    api(`conversations/${id}/notes`, { method: 'POST', body: { body, mentions } });

export const snoozeConversation = (id: string, until: string | null) =>
    api<Data<Conversation>>(`conversations/${id}/snooze`, until ? { method: 'POST', body: { until } } : { method: 'DELETE' }).then((r) => r.data);

export const useResponseTimes = (days: number, phoneNumberId?: string, enabled = true) =>
    useQuery({
        queryKey: ['analytics', 'response-times', days, phoneNumberId ?? null] as const,
        queryFn: () => api<Data<ResponseTimes>>('analytics/response-times', { query: { days, phone_number_id: phoneNumberId } }).then((r) => r.data),
        enabled,
    });

export const useInboxSettings = (enabled = true) =>
    useQuery({ queryKey: ['inbox-settings'], queryFn: () => api<Data<InboxSettings>>('tenant/inbox-settings').then((r) => r.data), enabled });

export const updateInboxSettings = (
    body: Partial<
        Pick<
            InboxSettings,
            'business_hours' | 'routing' | 'number_hours' | 'holidays' | 'reply_target_minutes' | 'reply_warn_minutes' | 'window_warning_minutes'
        >
    >,
) => api<Data<InboxSettings>>('tenant/inbox-settings', { method: 'PUT', body }).then((r) => r.data);

type NotificationFeed = { unread: number; items: MemberNotification[]; unread_conversations: number; messages: UnreadConversation[] };

export const useNotifications = (enabled = true) =>
    useQuery({
        queryKey: ['notifications'],
        queryFn: () => api<Data<NotificationFeed>>('notifications').then((r) => r.data),
        enabled,
        // The bell drives its own background-safe ticker; this slower interval is only the fallback.
        refetchInterval: 60_000,
        refetchIntervalInBackground: true,
    });

export const readNotifications = (id?: string) =>
    api<Data<NotificationFeed>>('notifications/read', { method: 'POST', body: { id: id ?? null } }).then((r) => r.data);

export const useDashboardSummary = (enabled = true, phoneNumberId: string | null = null) =>
    useQuery({
        queryKey: ['dashboard', 'summary', phoneNumberId],
        queryFn: () => api<Data<DashboardSummary>>('dashboard/summary', { query: phoneNumberId ? { phone_number_id: phoneNumberId } : {} }).then((r) => r.data),
        enabled,
        refetchInterval: 60_000,
    });

// ── Developer: API keys, webhook endpoints, delivery log ─────────────────────────────────

export const useDeveloperOverview = () =>
    useQuery({ queryKey: ['developer', 'overview'], queryFn: () => api<Data<DeveloperOverview>>('developer').then((r) => r.data), refetchInterval: 30_000 });

export const useApiKeys = (enabled = true) =>
    useQuery({ queryKey: ['developer', 'keys'], queryFn: () => api<Data<ApiKey[]>>('developer/api-keys').then((r) => r.data), enabled });

export const createApiKey = (body: { name: string; scopes: string[]; expires_in_days: number | null }) =>
    api<Data<ApiKey>>('developer/api-keys', { method: 'POST', body }).then((r) => r.data);

export const revokeApiKey = (id: string) => api(`developer/api-keys/${id}`, { method: 'DELETE' });

export const useWebhookEndpoints = (enabled = true) =>
    useQuery({ queryKey: ['developer', 'webhooks'], queryFn: () => api<Data<WebhookEndpoint[]>>('developer/webhooks').then((r) => r.data), enabled });

export const saveWebhookEndpoint = (
    id: string | null,
    body: Partial<Pick<WebhookEndpoint, 'url' | 'description' | 'events'>> & { status?: 'active' | 'paused' },
) => api<Data<WebhookEndpoint>>(id ? `developer/webhooks/${id}` : 'developer/webhooks', { method: id ? 'PATCH' : 'POST', body }).then((r) => r.data);

export const deleteWebhookEndpoint = (id: string) => api(`developer/webhooks/${id}`, { method: 'DELETE' });

export const rotateWebhookSecret = (id: string) => api<Data<WebhookEndpoint>>(`developer/webhooks/${id}/rotate-secret`, { method: 'POST' }).then((r) => r.data);

export const testWebhookEndpoint = (id: string) => api<Data<WebhookDelivery>>(`developer/webhooks/${id}/test`, { method: 'POST' }).then((r) => r.data);

export const useWebhookDeliveries = (filters: { endpoint_id?: string; status?: string }, enabled = true) =>
    useQuery({
        queryKey: ['developer', 'deliveries', filters],
        queryFn: () => api<{ data: WebhookDelivery[]; meta: { total: number } }>('developer/deliveries', { query: filters }),
        enabled,
        refetchInterval: 15_000,
    });

export const resendWebhookDelivery = (id: string) => api<Data<WebhookDelivery>>(`developer/deliveries/${id}/resend`, { method: 'POST' }).then((r) => r.data);

// ── Integrations: stores (Shopify, WooCommerce) and the messages their events send ───────

export const useIntegrations = (enabled = true) =>
    useQuery({ queryKey: ['integrations', 'overview'], queryFn: () => api<Data<IntegrationsOverview>>('integrations').then((r) => r.data), enabled });

export const useIntegration = (id: string | null) =>
    useQuery({ queryKey: ['integrations', 'one', id], queryFn: () => api<Data<Integration>>(`integrations/${id}`).then((r) => r.data), enabled: id !== null });

export const useIntegrationEvents = (id: string | null, status?: string) =>
    useQuery({
        queryKey: ['integrations', 'events', id, status ?? ''],
        queryFn: () => api<{ data: IntegrationEvent[]; meta: { total: number } }>(`integrations/${id}/events`, { query: { status } }),
        enabled: id !== null,
        refetchInterval: 15_000,
    });

/** Returns Shopify's approval page for this store; the browser is sent there. */
export const startShopifyInstall = (shop: string) =>
    api<Data<{ url: string }>>('integrations/shopify/install', { method: 'POST', body: { shop } }).then((r) => r.data.url);

export const connectWooCommerce = (body: { store_url: string; consumer_key: string; consumer_secret: string; default_country_code?: string | null }) =>
    api<Data<Integration>>('integrations/woocommerce', { method: 'POST', body }).then((r) => r.data);

export const updateIntegration = (
    id: string,
    body: Partial<{
        status: 'active' | 'paused';
        default_country_code: string | null;
        tag: string | null;
        trust_store_consent: boolean;
        link_days: number;
        paid_stage_id: string | null;
        tracker_auto: boolean;
    }>,
) => api<Data<Integration>>(`integrations/${id}`, { method: 'PATCH', body }).then((r) => r.data);

/** A workspace key for the "10X Engage for WooCommerce" plugin (shown once). With an id: upgrades that store to the plugin. */
export const createPluginKey = (integrationId?: string) =>
    api<Data<{ key: string; expires_in_days: number; integration: Integration }>>('integrations/woocommerce/plugin-key', {
        method: 'POST',
        body: integrationId ? { integration_id: integrationId } : {},
    }).then((r) => r.data);

/** Where the plugin zip downloads from (same origin as the API). */
export const PLUGIN_ZIP_URL = '/api/integrations/woocommerce/plugin.zip';

// ── Sales (Engagement Plan step D): store orders matched to chats ────────────────────────

export type SalesFilters = { match?: 'all' | SalesMatch; q?: string; days?: number; store?: string; phone_number_id?: string };

export const useSales = (filters: SalesFilters, enabled = true) =>
    useInfiniteQuery({
        queryKey: ['growth', 'sales', filters],
        queryFn: ({ pageParam }) => api<SalesPage>('growth/sales', { query: { ...filters, cursor: pageParam, per_page: 50 } }),
        initialPageParam: null as string | null,
        getNextPageParam: (last) => last.meta.next_cursor ?? null,
        enabled,
    });

export const useSale = (id: string | null) =>
    useQuery({ queryKey: ['growth', 'sale', id], queryFn: () => api<Data<SalesOrderDetails>>(`growth/sales/${id}`).then((r) => r.data), enabled: id !== null });

export const reviewSale = (id: string, action: 'attach' | 'keep_apart') =>
    api<Data<SalesOrderDetails>>(`growth/sales/${id}/review`, { method: 'POST', body: { action } }).then((r) => r.data);

export const useSalesAnalytics = (days: number, enabled = true, phoneNumberId: string | null = null) =>
    useQuery({
        queryKey: ['analytics', 'sales', days, phoneNumberId],
        queryFn: () =>
            api<Data<SalesAnalytics>>('analytics/sales', { query: phoneNumberId ? { days, phone_number_id: phoneNumberId } : { days } }).then((r) => r.data),
        enabled,
    });

export const useContactOrders = (contactId: string | undefined, enabled = true) =>
    useQuery({
        queryKey: ['contacts', 'orders', contactId],
        queryFn: () => api<Data<ContactOrders>>(`contacts/${contactId}/orders`).then((r) => r.data),
        enabled: enabled && !!contactId,
        staleTime: 30_000,
    });

export const disconnectIntegration = (id: string) => api(`integrations/${id}`, { method: 'DELETE' });

export const saveIntegrationRule = (id: string, event: string, body: Omit<IntegrationRule, 'event'>) =>
    api<Data<Integration>>(`integrations/${id}/rules/${event}`, { method: 'PUT', body }).then((r) => r.data);

export const testIntegrationRule = (id: string, event: string, phone: string) =>
    api(`integrations/${id}/rules/${event}/test`, { method: 'POST', body: { phone } });

/** Growth Hub: the proof behind one lead's source (Owner, Admin; IDs masked by the server). */
export type LeadFilters = {
    tab?: 'all' | 'new' | 'returning';
    q?: string;
    source?: string;
    status?: string;
    phone_number_id?: string;
    assigned?: string;
    stage_id?: string;
    days?: number;
    /** A custom period instead of days: local dates (YYYY-MM-DD), both included. */
    since?: string;
    until?: string;
    /** A Meta ad (Tracking Setup id): leads whose original source is that ad. */
    ad?: string;
    /** Drill-down from Analytics → Marketing: the period's new-lead cohort (local dates). */
    from?: string;
    to?: string;
    bucket?: string;
    campaign?: string;
    step?: 'contacted' | 'qualified';
};

export type MarketingFilters = { from: string; to: string; compare?: 'previous' | 'none'; number_id?: string };

const useMarketingQuery = <T>(path: string, f: MarketingFilters, enabled: boolean) =>
    useQuery({
        queryKey: ['analytics', 'marketing', path, f],
        queryFn: () => api<Data<T>>(`analytics/marketing/${path}`, { query: f }).then((r) => r.data),
        enabled,
        retry: false,
    });

export const useMarketingOverview = (f: MarketingFilters, enabled = true) => useMarketingQuery<MarketingOverview>('overview', f, enabled);
export const useMarketingSources = (f: MarketingFilters, enabled = true) => useMarketingQuery<{ rows: MarketingSourceRow[] }>('sources', f, enabled);
export const useMarketingCampaigns = (f: MarketingFilters, enabled = true) => useMarketingQuery<{ rows: MarketingCampaignRow[] }>('campaigns', f, enabled);
export const useMarketingFunnel = (f: MarketingFilters, enabled = true) =>
    useMarketingQuery<{ steps: { step: 'new' | 'contacted' | 'qualified'; count: number | null }[] }>('funnel', f, enabled);
export const useMarketingTrend = (f: MarketingFilters, enabled = true) => useMarketingQuery<{ points: MarketingTrendPoint[] }>('trend', f, enabled);
export const useStageMapping = (enabled = true) =>
    useQuery({
        queryKey: ['analytics', 'marketing', 'stage-mapping'],
        queryFn: () => api<Data<{ contacted: string[]; qualified: string[]; ready: boolean }>>('analytics/marketing/stage-mapping').then((r) => r.data),
        enabled,
    });

/** Growth Hub › Leads: the CRM's WhatsApp leads with their source (own leads only for agents). */
export const useLeads = (filters: LeadFilters, enabled = true) =>
    useInfiniteQuery({
        queryKey: keys.leads(filters),
        queryFn: ({ pageParam }) => api<LeadPage>('growth/leads', { query: { ...filters, cursor: pageParam, per_page: 50 } }),
        initialPageParam: null as string | null,
        getNextPageParam: (last) => last.meta.next_cursor ?? null,
        enabled,
    });

export const useLeadSummary = (enabled = true, phoneNumberId: string | null = null) =>
    useQuery({
        queryKey: [...keys.leadSummary, phoneNumberId],
        queryFn: () => api<Data<LeadSummary>>('growth/leads/summary', { query: phoneNumberId ? { phone_number_id: phoneNumberId } : {} }).then((r) => r.data),
        enabled,
    });

export const useMetaAds = (enabled = true) =>
    useQuery({ queryKey: ['growth', 'meta-ads'], queryFn: () => api<Data<MetaAd[]>>('growth/meta-ads').then((r) => r.data), enabled });

/** Tracking Setup › Websites, with each site's health (refreshed every 30 s while open). */
export const useSites = (enabled = true) =>
    useQuery({ queryKey: keys.sites, queryFn: () => api<Data<GrowthSite[]>>('growth/sites').then((r) => r.data), enabled, refetchInterval: 30_000 });

/** The live test after "Test tracking": polled every 3 s while it runs. */
export const useSiteTest = (id: string | undefined, enabled = true) =>
    useQuery({
        queryKey: keys.siteTest(id ?? ''),
        queryFn: () => api<Data<SiteTest>>(`growth/sites/${id}/test`).then((r) => r.data),
        enabled: enabled && !!id,
        refetchInterval: 3_000,
    });

export const useUnmatchedClicks = (enabled = true) =>
    useQuery({ queryKey: keys.unmatchedClicks, queryFn: () => api<Data<UnmatchedClick[]>>('growth/leads/unmatched-clicks').then((r) => r.data), enabled });

export const useLeadEvidence = (contactId: string | undefined, enabled = true) =>
    useQuery({
        queryKey: keys.leadEvidence(contactId ?? ''),
        queryFn: () => api<Data<LeadEvidence[]>>(`growth/leads/${contactId}/evidence`).then((r) => r.data),
        enabled: enabled && !!contactId,
    });

/** The workspace's CRM pipeline stages, in order (archived ones only when asked). */
export const useStages = (enabled = true) =>
    useQuery({ queryKey: keys.stages, queryFn: () => api<Data<CrmStage[]>>('crm/stages').then((r) => r.data), enabled, staleTime: 60_000 });

export const useStageHistory = (contactId: string | undefined, enabled = true) =>
    useQuery({
        queryKey: keys.stageHistory(contactId ?? ''),
        queryFn: () => api<Data<StageEvent[]>>(`contacts/${contactId}/stage-history`).then((r) => r.data),
        enabled: enabled && !!contactId,
    });

// ── Inbox & CRM 3.3: reply promise, enquiries board, next steps ──────────────────────────

export const useContact = (id: string | null) =>
    useQuery({ queryKey: ['contacts', id, 'record'], queryFn: () => api<Data<Contact>>(`contacts/${id}`).then((r) => r.data), enabled: !!id });

export const useReplyPromise = (enabled = true) =>
    useQuery({ queryKey: ['reply-promise'], queryFn: () => api<Data<ReplyPromiseSettings>>('tenant/reply-promise').then((r) => r.data), enabled });

export const useWaitAlerts = (conversationId: string | null, enabled = true) =>
    useQuery({
        queryKey: ['inbox', 'wait-alerts', conversationId],
        queryFn: () => api<Data<WaitAlert[]>>(`conversations/${conversationId}/wait-alerts`).then((r) => r.data),
        enabled: enabled && !!conversationId,
    });

export const useMissedLeads = (weeksAgo: number, enabled = true) =>
    useQuery({
        queryKey: ['reports', 'missed-leads', weeksAgo],
        queryFn: () => api<Data<MissedLeadsReport>>('reports/missed-leads', { query: { weeks_ago: weeksAgo } }).then((r) => r.data),
        enabled,
    });

export type BoardFilters = { owner?: string | null; filter?: 'no_next_step' | 'overdue' | null; search?: string | null };
export const useEnquiryBoard = (f: BoardFilters, enabled = true) =>
    useQuery({
        queryKey: ['enquiries', 'board', f],
        queryFn: () =>
            api<Data<EnquiryBoard>>('enquiries/board', { query: { owner: f.owner ?? null, filter: f.filter ?? null, search: f.search ?? null } }).then(
                (r) => r.data,
            ),
        enabled,
    });

export const useNextSteps = (contactId: string | null, all = false) =>
    useQuery({
        queryKey: ['contacts', contactId, 'next-steps', all],
        queryFn: () => api<Data<NextStep[]>>(`contacts/${contactId}/next-steps`, { query: { all: all ? 1 : null } }).then((r) => r.data),
        enabled: !!contactId,
    });

// ── Inbox & CRM 3.5: resolutions, the contact record, start conversation ────────────────

export type ResolutionFilters = {
    agent?: string | null;
    reason?: ResolutionReason | null;
    days?: number;
    phone_number_id?: string | null;
    conversation_id?: string | null;
};

export const useResolutions = (f: ResolutionFilters, refetchInterval: number | false = false) =>
    useQuery({
        queryKey: ['inbox', 'resolutions', f],
        refetchInterval,
        queryFn: () =>
            api<Data<Resolution[]>>('resolutions', {
                query: {
                    agent: f.agent ?? null,
                    reason: f.reason ?? null,
                    days: f.days ?? 7,
                    phone_number_id: f.phone_number_id ?? null,
                    conversation_id: f.conversation_id ?? null,
                },
            }).then((r) => r.data),
    });

export const useResolutionReview = (days = 7, enabled = true) =>
    useQuery({
        queryKey: ['inbox', 'resolutions', 'review', days],
        queryFn: () => api<Data<ResolutionReview>>('resolutions/review', { query: { days } }).then((r) => r.data),
        enabled,
    });

export const resolveConversation = (id: string, reason: ResolutionReason) =>
    api<Data<Conversation>>(`conversations/${id}`, { method: 'PATCH', body: { status: 'closed', reason } }).then((r) => r.data);

export const undoResolve = (id: string) =>
    api<Data<Conversation>>(`conversations/${id}`, { method: 'PATCH', body: { status: 'open', undo: true } }).then((r) => r.data);

export const flagResolution = (id: string, note: string) =>
    api<Data<Resolution>>(`resolutions/${id}/flag`, { method: 'POST', body: { note } }).then((r) => r.data);

export const useContactChanges = (contactId: string | null) =>
    useQuery({
        queryKey: ['contacts', contactId, 'changes'],
        queryFn: () => api<Data<ContactFieldChange[]>>(`contacts/${contactId}/changes`).then((r) => r.data),
        enabled: !!contactId,
    });

export const useContactDuplicates = (contactId: string | null) =>
    useQuery({
        queryKey: ['contacts', contactId, 'duplicates'],
        queryFn: () => api<Data<ContactDuplicate[]>>(`contacts/${contactId}/duplicates`).then((r) => r.data),
        enabled: !!contactId,
        staleTime: 60_000,
    });

export type ContactRecordPatch = Partial<{
    name: string | null;
    email: string | null;
    company: string | null;
    job_title: string | null;
    city: string | null;
    country: string | null;
    language: string | null;
    lead_status: LeadStatusKey | null;
    owner_membership_id: string | null;
    tags: string[];
    phone: string | null;
    source_detail: string | null;
}>;

export const updateContactRecord = (id: string, body: ContactRecordPatch) =>
    api<Data<Contact>>(`contacts/${id}`, { method: 'PATCH', body }).then((r) => r.data);

export const useStartSearch = (q: string, phoneNumberId: string | null, enabled = true) =>
    useQuery({
        queryKey: ['contacts', 'start-search', q, phoneNumberId],
        queryFn: () => api<Data<StartCandidate[]>>('contacts/search', { query: { q: q || null, phone_number_id: phoneNumberId } }).then((r) => r.data),
        enabled,
        staleTime: 5_000,
        placeholderData: (prev) => prev,
    });

export type StartPayload = SendPayload & {
    phone_number_id: string;
    contact_id?: string;
    to?: string;
    new_contact?: { name: string; email?: string | null; company?: string | null; source?: string | null; tags?: string[] };
    permission?: { via: PermissionVia; note?: string | null };
    topic?: string | null;
    create_enquiry?: boolean;
};

export type ContactChat = {
    id: string;
    phone_number_id: string;
    status: 'open' | 'closed';
    window_expires_at: string | null;
    window_open: boolean;
    assigned_membership_id: string | null;
    last_message_at: string | null;
};

export const useContactConversations = (contactId: string | null) =>
    useQuery({
        queryKey: ['contacts', contactId, 'conversations'],
        queryFn: () => api<Data<ContactChat[]>>(`contacts/${contactId}/conversations`).then((r) => r.data),
        enabled: !!contactId,
    });

// ── Inbox & CRM 3.5 (prototype) ─────────────────────────────────────────────────────────

export const useConversationEvents = (id: string | null, refetchInterval: number | false = false) =>
    useQuery({
        queryKey: ['inbox', 'events', id],
        queryFn: () => api<Data<ConversationEvent[]>>(`conversations/${id}/events`).then((r) => r.data),
        enabled: !!id,
        refetchInterval,
    });

export const markUnread = (id: string) => api<Data<Conversation>>(`conversations/${id}/unread`, { method: 'POST' }).then((r) => r.data);

export const sendTyping = (id: string, typing: boolean) => api(`conversations/${id}/typing`, { method: 'POST', body: { typing } });

export const useInboxHealth = (phoneNumberId: string | null, enabled = true) =>
    useQuery({
        queryKey: ['inbox', 'health', phoneNumberId],
        queryFn: () => api<Data<InboxHealth>>('inbox/health', { query: { phone_number_id: phoneNumberId } }).then((r) => r.data),
        enabled,
        refetchInterval: enabled ? 60_000 : false,
    });

export const useContactFunnel = () =>
    useQuery({ queryKey: ['contacts', 'funnel'], queryFn: () => api<Data<ContactFunnel>>('contacts/funnel').then((r) => r.data) });

export const useCrmSync = () => useQuery({ queryKey: ['crm', 'sync'], queryFn: () => api<Data<CrmSync>>('crm/sync').then((r) => r.data) });

export const saveCrmStageMap = (stage_map: Record<string, { hubspot: string }>) =>
    api<Data<CrmSync>>('crm/sync', { method: 'PUT', body: { stage_map } }).then((r) => r.data);

export const setCurrentEnquiry = (contactId: string, enquiryId: string) =>
    api(`contacts/${contactId}/current-enquiry`, { method: 'POST', body: { enquiry_id: enquiryId } });

/**
 * Shared inbox: `expected` is who the person saw as the assignee. If a teammate changed it meanwhile
 * the server refuses (409) rather than silently taking the chat from them.
 */
export const assignConversation = (id: string, membershipId: string | null, expected?: string | null) =>
    api<Data<Conversation>>(`conversations/${id}`, {
        method: 'PATCH',
        body: { assigned_membership_id: membershipId, ...(expected !== undefined ? { expected_assigned_membership_id: expected } : {}) },
    }).then((r) => r.data);

export const reopenConversation = (id: string) =>
    api<Data<Conversation>>(`conversations/${id}`, { method: 'PATCH', body: { status: 'open' } }).then((r) => r.data);
