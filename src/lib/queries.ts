'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, upload } from './api';
import type {
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
    BillingPreview,
    PaymentMethod,
    PaymentStep,
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

export const startSignup = (coexistence: boolean) => api<Data<SignupLaunch>>('whatsapp/signups', { method: 'POST', body: { coexistence } }).then((r) => r.data);

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
    /** Chatbot views: handled by the bot now, waiting for the customer, or how the bot ended. */
    view?: 'bot' | 'waiting' | 'abandoned' | 'completed' | 'handed_off';
    unread?: boolean;
    q?: string;
    snoozed?: boolean;
    /** Who it is waiting on: needs_reply lists ad leads first, then the longest waiting. */
    state?: 'needs_reply' | 'waiting';
    /** "Arrived after hours" (still needing a reply). */
    after_hours?: boolean;
};

export const useConversations = (filters: ConversationFilters, refetchInterval: number | false = false) =>
    useInfiniteQuery({
        queryKey: keys.conversations(filters),
        refetchInterval,
        queryFn: ({ pageParam }) =>
            api<CursorPage<Conversation>>('conversations', {
                query: {
                    ...filters,
                    unread: filters.unread ? 1 : undefined,
                    after_hours: filters.after_hours ? 1 : undefined,
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
    filter?: string;
    stage_id?: string;
};

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

export function startConversation(payload: SendPayload & { phone_number_id: string; contact_id?: string; to?: string }, idempotencyKey: string) {
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

export const importContacts = (file: File, tags: string[], optedIn: boolean) => {
    const form = new FormData();
    form.append('file', file);
    tags.forEach((t) => form.append('tags[]', t));
    if (optedIn) form.append('opted_in', '1');

    return upload<Data<ImportResult>>('contacts/import', form).then((r) => r.data);
};

// ── Campaigns ────────────────────────────────────────────────────────────────────────────

/** Polls while anything is sending or scheduled, so delivery numbers move without a refresh. */
export const useCampaigns = (enabled = true) =>
    useQuery({
        queryKey: keys.campaigns,
        queryFn: () => api<Data<Campaign[]>>('campaigns').then((r) => r.data),
        enabled,
        refetchInterval: (query) => (query.state.data?.some((c) => ['sending', 'scheduled', 'paused'].includes(c.status)) ? 5_000 : 30_000),
    });

export const saveCampaign = (id: string | null, body: CampaignForm) =>
    api<Data<Campaign>>(id ? `campaigns/${id}` : 'campaigns', { method: id ? 'PATCH' : 'POST', body }).then((r) => r.data);

export const launchCampaign = (id: string, scheduledAt?: string | null) =>
    api<Data<Campaign>>(`campaigns/${id}/launch`, { method: 'POST', body: scheduledAt ? { scheduled_at: scheduledAt } : {} }).then((r) => r.data);

export const cancelCampaign = (id: string) => api<Data<Campaign>>(`campaigns/${id}/cancel`, { method: 'POST' }).then((r) => r.data);

export const deleteCampaign = (id: string) => api(`campaigns/${id}`, { method: 'DELETE' });

export const useCampaignAudience = (
    filters: {
        segment_id: string | null;
        audience_tag: string | null;
        template_id: string | null;
        phone_number_id: string | null;
        filter?: string | null;
        include_non_opted_in?: boolean;
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

/** Sends the consent question with Subscribe / No thanks buttons into an open conversation. */
export const requestConsent = (conversationId: string) =>
    api<Data<Message>>(`conversations/${conversationId}/consent-request`, { method: 'POST' }).then((r) => r.data);

// ── Billing (Stripe) ─────────────────────────────────────────────────────────────────────

export const useBilling = (enabled = true) => useQuery({ queryKey: ['billing'], queryFn: () => api<Data<Billing>>('billing').then((r) => r.data), enabled });

export const useInvoices = (enabled = true) =>
    useQuery({ queryKey: ['billing', 'invoices'], queryFn: () => api<Data<BillingInvoice[]>>('billing/invoices').then((r) => r.data), enabled });

export const updateBillingDetails = (body: { legal_name: string | null; country: string; tax_trn: string | null; billing_email: string | null }) =>
    api<Data<Billing>>('billing/details', { method: 'PUT', body }).then((r) => r.data);

/** Buy or switch plan with a saved card (no redirect). */
export const subscribeToPlan = (plan: string, interval: 'monthly' | 'yearly', paymentMethod?: string | null) =>
    api<Data<PaymentStep>>('billing/subscribe', { method: 'POST', body: { plan, interval, payment_method: paymentMethod ?? null } }).then((r) => r.data);

/** After the in-page payment step: ask the server to read the result from Stripe now. */
export const refreshBilling = (abandon = false) =>
    api<Data<{ status: 'active' | 'pending' | 'failed' }>>('billing/refresh', { method: 'POST', body: { abandon } }).then((r) => r.data.status);

export const usePaymentMethods = (enabled = true) =>
    useQuery({ queryKey: ['billing', 'payment-methods'], queryFn: () => api<Data<PaymentMethod[]>>('billing/payment-methods').then((r) => r.data), enabled });

export const createSetupIntent = () =>
    api<Data<{ client_secret: string }>>('billing/payment-methods/setup-intent', { method: 'POST' }).then((r) => r.data.client_secret);

export const setDefaultPaymentMethod = (id: string) =>
    api<Data<PaymentMethod[]>>(`billing/payment-methods/${id}/default`, { method: 'PUT' }).then((r) => r.data);

export const removePaymentMethod = (id: string) => api<Data<PaymentMethod[]>>(`billing/payment-methods/${id}`, { method: 'DELETE' }).then((r) => r.data);

/** The billing summary for a plan the customer is about to choose: Stripe's own calculation, nothing is charged. */
export const previewPlan = (plan: string, interval: 'monthly' | 'yearly') =>
    api<Data<BillingPreview>>('billing/preview', { method: 'POST', body: { plan, interval } }).then((r) => r.data);

export const usePayments = (enabled = true) =>
    useQuery({ queryKey: ['billing', 'payments'], queryFn: () => api<Data<BillingPayments>>('billing/payments').then((r) => r.data), enabled });

export const payInvoice = (id: string) => api<Data<PaymentStep>>(`billing/invoices/${id}/pay`, { method: 'POST' }).then((r) => r.data);

export const refreshInvoice = (id: string) => api<Data<BillingInvoice[]>>(`billing/invoices/${id}/refresh`, { method: 'POST' }).then((r) => r.data);

export const cancelSubscription = () => api<Data<Billing>>('billing/cancel', { method: 'POST' }).then((r) => r.data);

export const resumeSubscription = () => api<Data<Billing>>('billing/resume', { method: 'POST' }).then((r) => r.data);

/** Paid plan: ends at the end of the paid period, then Free. Trial: Free straight away. */
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

export const useDashboardSummary = (enabled = true) =>
    useQuery({
        queryKey: ['dashboard', 'summary'],
        queryFn: () => api<Data<DashboardSummary>>('dashboard/summary').then((r) => r.data),
        enabled,
        refetchInterval: 60_000,
    });

// ── Developer: API keys, webhook endpoints, delivery log ─────────────────────────────────

export const useDeveloperOverview = () =>
    useQuery({ queryKey: ['developer', 'overview'], queryFn: () => api<Data<DeveloperOverview>>('developer').then((r) => r.data) });

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

export type SalesFilters = { match?: 'all' | SalesMatch; q?: string; days?: number; store?: string };

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

export const useSalesAnalytics = (days: number, enabled = true) =>
    useQuery({
        queryKey: ['analytics', 'sales', days],
        queryFn: () => api<Data<SalesAnalytics>>('analytics/sales', { query: { days } }).then((r) => r.data),
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

export const useLeadSummary = (enabled = true) =>
    useQuery({ queryKey: keys.leadSummary, queryFn: () => api<Data<LeadSummary>>('growth/leads/summary').then((r) => r.data), enabled });

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
