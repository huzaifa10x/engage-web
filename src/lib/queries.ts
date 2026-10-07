'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, upload } from './api';
import type {
    ApiKey,
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
        // While an import from the WhatsApp Business app is running, keep its progress fresh.
        refetchInterval: (query) =>
            (query.state.data ?? []).some((a) => (a.phone_numbers ?? []).some((n) => n.sync && ['waiting', 'importing'].includes(n.sync.state)))
                ? 30_000
                : false,
    });

export const usePhoneNumbers = () =>
    useQuery({
        queryKey: keys.numbers,
        queryFn: () => api<Data<PhoneNumber[]>>('phone-numbers').then((r) => r.data),
        staleTime: 30_000,
        // While an import from the WhatsApp Business app is running, keep its progress fresh.
        refetchInterval: (query) => ((query.state.data ?? []).some((n) => n.sync && ['waiting', 'importing'].includes(n.sync.state)) ? 30_000 : false),
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
    assigned?: 'me' | 'unassigned' | 'any';
    unread?: boolean;
    q?: string;
    snoozed?: boolean;
};

export const useConversations = (filters: ConversationFilters, refetchInterval: number | false = false) =>
    useInfiniteQuery({
        queryKey: keys.conversations(filters),
        refetchInterval,
        queryFn: ({ pageParam }) =>
            api<CursorPage<Conversation>>('conversations', {
                query: { ...filters, unread: filters.unread ? 1 : undefined, cursor: pageParam, per_page: 30 },
            }),
        initialPageParam: null as string | null,
        getNextPageParam: (last) => last.meta.next_cursor ?? null,
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

export type ContactFilters = { q?: string; consent?: ConsentState; tag?: string; segment_id?: string };

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

export const createContactField = (label: string, type: ContactField['type']) =>
    api<Data<ContactField>>('contact-fields', { method: 'POST', body: { label, type } }).then((r) => r.data);

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
    filters: { segment_id: string | null; audience_tag: string | null; template_id: string | null; phone_number_id: string | null },
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

// ── Auto reply ───────────────────────────────────────────────────────────────────────────

export const useAutoReply = (enabled = true) =>
    useQuery({ queryKey: ['auto-reply'], queryFn: () => api<Data<AutoReplySettings>>('tenant/auto-reply').then((r) => r.data), enabled });

export const updateAutoReply = (body: AutoReplySettings) => api<Data<AutoReplySettings>>('tenant/auto-reply', { method: 'PUT', body }).then((r) => r.data);

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

export const useInboxSettings = (enabled = true) =>
    useQuery({ queryKey: ['inbox-settings'], queryFn: () => api<Data<InboxSettings>>('tenant/inbox-settings').then((r) => r.data), enabled });

export const updateInboxSettings = (body: Pick<InboxSettings, 'business_hours' | 'routing'>) =>
    api<Data<InboxSettings>>('tenant/inbox-settings', { method: 'PUT', body }).then((r) => r.data);

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
