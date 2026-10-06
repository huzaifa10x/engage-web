/** Shapes of the Laravel /api/v1 resources (see app/Http/Resources/Api/V1). */

export type User = {
    id: string;
    name: string;
    email: string;
    email_verified: boolean;
    locale: string | null;
    timezone: string | null;
};

export type Role = {
    id: string;
    key: string;
    name: string;
    is_system: boolean;
    permissions: string[];
};

export type Tenant = {
    id: string;
    name: string;
    slug: string;
    status: 'active' | 'suspended' | string;
    timezone: string;
    locale: string;
    currency: string;
    country: string | null;
    billing_email: string | null;
    legal_name: string | null;
    website: string | null;
    phone: string | null;
    industry: string | null;
    company_size: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    region: string | null;
    postal_code: string | null;
    created_at: string;
};

export type Membership = {
    id: string;
    status: 'active' | 'suspended' | string;
    joined_at: string | null;
    role?: Role;
    user?: User;
    tenant?: Tenant;
};

export type EntitlementValue = {
    key: string;
    type: 'boolean' | 'limit' | 'metered' | 'config' | string;
    enabled: boolean;
    limit: number | null;
    config: Record<string, unknown> | unknown[];
};

/** The plan summary inside /me — the same shape the API sends (`plan`, `subscription`, `features`). */
export type EntitlementSnapshot = {
    plan: { key: string; name: string; version: number | null };
    subscription: { status: string | null; trial_ends_at: string | null };
    features: Record<string, EntitlementValue>;
};

export type Me = {
    user: User;
    memberships: Membership[];
    active_tenant_id: string | null;
    permissions: string[];
    impersonation: { admin_name: string | null; reason: string | null; expires_at: string } | null;
    entitlements: EntitlementSnapshot | null;
};

export type FeatureUsage = {
    label: string;
    type: string;
    enabled: boolean;
    limit: number | null;
    unlimited: boolean;
    used: number | null;
    unit: string | null;
    config: Record<string, unknown>;
};

export type EntitlementsDetail = {
    plan: { key: string; name: string; version: number };
    subscription: { status: string | null; trial_ends_at: string | null };
    features: Record<string, FeatureUsage>;
};

export type Invitation = {
    id: string;
    email: string;
    role?: Role;
    expires_at: string;
    created_at: string;
};

export type AuditEntry = {
    id: string;
    action: string;
    actor: { type: 'user' | 'admin' | 'system' | 'api'; id: string | null };
    entity: { type: string | null; id: string | null };
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    meta: Record<string, unknown> | null;
    ip: string | null;
    request_id: string | null;
    created_at: string;
};

export type PhoneNumber = {
    id: string;
    waba_account_id: string;
    phone_number_id: string;
    display_phone_number: string | null;
    e164: string | null;
    verified_name: string | null;
    name_status: string | null;
    status: 'pending' | 'connected' | 'disconnected';
    quality_rating: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN' | null;
    messaging_limit_tier: string | null;
    throughput_level: string | null;
    onboarding_type: 'new_number' | 'migrated' | 'coexistence';
    coexistence_status: 'none' | 'sync_pending' | 'history_syncing' | 'synced' | 'sync_failed' | 'offboarded';
    app_sync_expires_at: string | null;
    max_mps: number;
    capabilities: Record<string, boolean>;
    is_official_business_account: boolean;
    last_synced_at: string | null;
};

export type WabaAccount = {
    id: string;
    waba_id: string;
    name: string | null;
    business_name: string | null;
    meta_business_id: string | null;
    currency: string | null;
    account_review_status: string | null;
    ban_state: string | null;
    status: 'connected' | 'disconnected';
    is_subscribed_to_webhooks: boolean;
    connected_at: string | null;
    disconnected_at: string | null;
    phone_numbers?: PhoneNumber[];
};

export type SignupStatus = 'started' | 'signup_captured' | 'exchanging' | 'provisioning' | 'completed' | 'failed' | 'cancelled';

/** Another provider's Meta app that a WhatsApp Business Account is still subscribed to. */
export type SubscribedApp = { id: string; name: string | null; link: string | null };

/** Why a signup was refused: `sameApp` = connected by another 10X Engage environment (same Meta app). */
export type SignupConflict = { apps: SubscribedApp[]; sameApp: boolean };

export type SignupAttempt = {
    id: string;
    flow: 'standard' | 'coexistence';
    status: SignupStatus;
    event: string | null;
    waba_id: string | null;
    phone_number_id: string | null;
    waba_account_id: string | null;
    steps: Record<string, { state: 'done' | 'failed'; at: string; error?: string }>;
    error: { code: string | null; message: string; apps?: SubscribedApp[]; same_app?: boolean } | null;
    created_at: string | null;
    finished_at: string | null;
};

export type SignupLaunch = {
    attempt: SignupAttempt;
    numbers: { used: number; limit: number | null };
    launch: {
        app_id: string;
        config_id: string;
        graph_version: string;
        login_options: Record<string, unknown>;
    };
};

export type NumberGrants = { all_numbers: boolean; phone_number_ids: string[] };

export type Paginated<T> = {
    data: T[];
    links: { first: string | null; last: string | null; prev: string | null; next: string | null };
    meta: { current_page?: number; last_page?: number; total?: number; per_page: number; next_cursor?: string | null; prev_cursor?: string | null };
};

// ── Messaging (Phase 3) ──────────────────────────────────────────────────────────────────

export type ConsentState = 'unknown' | 'opted_in' | 'opted_out';

export type Contact = {
    id: string;
    display_name: string;
    name: string | null;
    profile_name: string | null;
    username: string | null;
    phone: string | null;
    wa_id: string | null;
    bsuid: string | null;
    email: string | null;
    attributes: Record<string, unknown>;
    tags: string[];
    source: string;
    consent_state: ConsentState;
    opted_out_at: string | null;
    marketing_opted_out: boolean;
    last_inbound_at: string | null;
    created_at: string | null;
};

export type Conversation = {
    /** Set while the conversation is snoozed (hidden from the inbox until then). */
    snoozed_until: string | null;
    /** false = automatic replies are switched off for this conversation. */
    auto_reply_enabled: boolean;
    id: string;
    phone_number_id: string;
    status: 'open' | 'closed';
    assigned_membership_id: string | null;
    unread_count: number;
    last_message_at: string | null;
    last_message_preview: string | null;
    last_message_direction: 'inbound' | 'outbound' | null;
    window: { open: boolean; expires_at: string | null };
    contact?: Contact;
    phone_number?: { id: string; display_phone_number: string | null; verified_name: string | null };
    created_at: string | null;
};

export type MessageStatus = 'queued' | 'accepted' | 'sent' | 'delivered' | 'read' | 'failed' | 'received' | 'deleted';

export type Message = {
    id: string;
    conversation_id: string;
    direction: 'inbound' | 'outbound';
    origin: 'customer' | 'agent' | 'api' | 'campaign' | 'automation' | 'app_echo' | 'history';
    type: string;
    status: MessageStatus;
    body: string | null;
    content: Record<string, unknown>;
    template: {
        name?: string;
        language?: string;
        components?: unknown[];
        rendered?: { header?: string; body?: string; footer?: string; buttons?: string[] };
    } | null;
    media: {
        id: string;
        status: 'pending' | 'ready' | 'failed';
        mime_type: string | null;
        filename: string | null;
        file_size: number | null;
        url: string | null;
    } | null;
    wamid: string | null;
    reply_to_wamid: string | null;
    /** `hint` is a plain-language explanation of Meta's error code, `detail` Meta's own longer text. */
    error: { code: string; title: string | null; detail?: string | null; hint?: string | null } | null;
    sent_by_membership_id: string | null;
    timestamp: string | null;
    sent_at: string | null;
    delivered_at: string | null;
    read_at: string | null;
    edited_at: string | null;
    revoked_at: string | null;
    /** Content removed by the workspace's retention policy; the delivery record remains. */
    redacted?: boolean;
};

export type UploadedMedia = { id: string; type: 'image' | 'video' | 'audio' | 'document' | 'sticker'; mime_type: string; filename: string; file_size: number };

export type CursorPage<T> = { data: T[]; meta: { next_cursor?: string | null; prev_cursor?: string | null; per_page: number } };

// ── Message templates (Phase 4) ──────────────────────────────────────────────────────────

/** Exactly as Meta reports it; unknown future values are shown as-is. */
export type TemplateStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'DISABLED' | 'IN_APPEAL' | 'PENDING_DELETION' | 'DELETED' | (string & {});

export type TemplateButton = { type: string; text?: string; url?: string; phone_number?: string };

export type TemplateComponent = {
    type: string;
    format?: string;
    text?: string;
    buttons?: TemplateButton[];
    /** Media headers: Meta returns a preview URL of the approved sample in `header_handle`. */
    example?: { header_handle?: string[]; header_text?: string[]; body_text?: string[][] };
};

export type MessageTemplate = {
    id: string;
    waba_account_id: string;
    meta_template_id: string | null;
    name: string;
    language: string;
    category: string | null;
    status: TemplateStatus;
    sendable: boolean;
    quality_score: string | null;
    rejected_reason: string | null;
    parameter_format: string;
    components: TemplateComponent[];
    /** What the sender must fill in. `header_format`: TEXT | IMAGE | VIDEO | DOCUMENT | LOCATION | null. */
    variables: {
        header: string[];
        header_format: string | null;
        body: string[];
        buttons: { index: number; type: string; text: string; variable: boolean }[];
    };
    last_synced_at: string | null;
    created_at: string | null;
    updated_at: string | null;
};

export type TemplateForm = {
    waba_account_id: string;
    name: string;
    language: string;
    category: 'MARKETING' | 'UTILITY';
    /** TEXT (default) uses `text`; IMAGE / VIDEO / DOCUMENT use `media_id` of an uploaded sample file. */
    header?: { format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'; text?: string; example?: string; media_id?: string } | null;
    body: string;
    body_examples?: string[];
    footer?: string | null;
    buttons?: { type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url?: string; example?: string; phone_number?: string }[];
};

// ── Contacts & CRM ───────────────────────────────────────────────────────────────────────

export type Tag = { id: string; name: string; contacts: number };

export type ContactField = { id: string; key: string; label: string; type: 'text' | 'number' | 'date' };

/** One condition of a segment. `field` is a built-in name or `attr:<custom field key>`. */
export type SegmentRule = { field: string; op: string; value?: string | number };

export type SegmentCounts = { matched: number; eligible_marketing: number; eligible_utility: number };

/** A saved rule, not a stored list: who matches is worked out whenever it is used. */
export type Segment = { id: string; name: string; match: 'all' | 'any'; rules: SegmentRule[]; updated_at: string | null; counts?: SegmentCounts };

export type ImportResult = { created: number; updated: number; skipped: number; total: number; errors: { row: number; message: string }[] };

// ── Campaigns ────────────────────────────────────────────────────────────────────────────

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'paused' | 'completed' | 'cancelled' | 'failed';

export type CampaignObjective = 'promo' | 'announcement' | 're_engagement' | 'reminder' | 'update' | 'other';

export type CampaignStats = {
    matched: number;
    eligible: number;
    pending: number;
    skipped: number;
    queued: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    replied: number;
};

export type Campaign = {
    id: string;
    name: string;
    status: CampaignStatus;
    phone_number: { id: string; display: string | null } | null;
    template: { id: string | null; name: string; language: string; category: string | null };
    variables: { header: string[]; body: string[]; buttons: Record<string, string> };
    media_id: string | null;
    segment_id: string | null;
    audience_tag: string | null;
    notes: string | null;
    objective: CampaignObjective | null;
    batch_per_hour: number | null;
    next_batch_at: string | null;
    paused_at: string | null;
    pause_reason: string | null;
    failure_reasons?: CampaignFailureReason[];
    audience_name: string | null;
    scheduled_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    failure_reason: string | null;
    stats: CampaignStats;
    created_at: string | null;
};

export type CampaignForm = {
    name: string;
    phone_number_id: string;
    template_id: string;
    segment_id: string | null;
    media_id: string | null;
    audience_tag: string | null;
    notes: string | null;
    objective: CampaignObjective | null;
    variables: { header: string[]; body: string[]; buttons: Record<string, string> };
};

export type CampaignAudience = {
    matched: number;
    eligible: number;
    category: string | null;
    reach_limit: number | null;
    reach_used: number;
    /** Meta's limit of business-initiated conversations for this number per rolling 24 hours (null = unlimited / unknown). */
    messaging_limit: number | null;
    quality_rating: string | null;
    max_mps: number | null;
    /** Campaign sending speed of the workspace's plan (messages per hour); not selectable. */
    send_rate_per_hour: number;
    frequency_cap: number;
    quiet_until: string | null;
    quiet_hours: { start: string; end: string; timezone: string } | null;
};

export type CampaignPreview = {
    contact: { id: string; display_name: string; phone: string | null };
    header: string | null;
    body: string;
    footer: string | null;
    skipped: boolean;
};

export type CampaignFailureReason = { reason: string; code: string | null; count: number; stage: 'skipped' | 'not_sent' | 'failed' };

export type CampaignRecipient = {
    id: string;
    contact: { id: string; display_name: string; phone: string | null } | null;
    status: string;
    reason: string | null;
};

// ── Analytics ────────────────────────────────────────────────────────────────────────────

export type Funnel = { sent: number; delivered: number; read: number; failed: number };

export type AnalyticsOverview = {
    range: { days: number; from: string; timezone: string };
    totals: Funnel & { outbound: number; inbound: number; open_conversations: number; contacts: number; new_contacts: number };
    by_origin: { agent: number; campaign: number; api: number; automation: number };
    daily: { date: string; inbound: number; outbound: number }[];
    numbers: (Funnel & { id: string; display: string | null; quality_rating: string | null; inbound: number; outbound: number })[];
    top_templates: (Funnel & { name: string; total: number })[];
};

// ── Compliance ───────────────────────────────────────────────────────────────────────────

export type ComplianceCheck = { key: string; status: 'ok' | 'info' | 'warn' | 'bad'; title: string; detail: string };

export type ComplianceOverview = {
    contacts: { total: number; opted_in: number; unknown: number; opted_out: number; marketing_stopped_in_whatsapp: number };
    last_30_days: { opt_ins: number; opt_outs: number };
    checks: ComplianceCheck[];
};

export type ComplianceSettings = {
    opt_out_keywords: string[];
    opt_in_keywords: string[];
    locked_opt_out_keywords: string[];
    locked_opt_in_keywords: string[];
    confirm_opt_out: boolean;
    opt_out_reply: string;
    confirm_opt_in: boolean;
    opt_in_reply: string;
    consent_request_text: string;
    retention_enabled: boolean;
    message_retention_days: number;
    media_retention_days: number;
    min_message_retention_days: number;
    min_media_retention_days: number;
    /** Max marketing campaign messages per contact per 7 days (0 = no cap). */
    marketing_frequency_cap: number;
    quiet_hours_enabled: boolean;
    quiet_hours_start: string;
    quiet_hours_end: string;
};

export type ConsentEvent = {
    id: string;
    action: 'opted_in' | 'opted_out' | 'marketing_opted_in' | 'marketing_opted_out' | (string & {});
    source: string;
    detail: string | null;
    created_at: string | null;
    contact: { id: string; display_name: string; phone: string | null } | null;
};

// ── Billing (Stripe) ─────────────────────────────────────────────────────────────────────

export type BillingPlan = {
    key: string;
    name: string;
    description: string | null;
    currency: string;
    price_monthly_minor: number | null;
    price_yearly_minor: number | null;
    current: boolean;
    purchasable: boolean;
};

export type Billing = {
    stripe_configured: boolean;
    /** Stripe publishable key for the in-page card form (safe to expose). */
    stripe_publishable_key: string | null;
    plan: { key: string; name: string };
    subscription: {
        status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
        provider: 'manual' | 'stripe';
        interval: 'monthly' | 'yearly' | null;
        trial_ends_at: string | null;
        current_period_end: string | null;
        cancel_at: string | null;
    } | null;
    details: { legal_name: string | null; country: string | null; tax_trn: string | null; billing_email: string | null };
    vat: { applies: boolean; percent: number; country: string };
    has_payment_history: boolean;
    plans: BillingPlan[];
};

export type BillingInvoice = {
    id: string;
    number: string | null;
    status: 'paid' | 'open' | 'void' | 'uncollectible' | 'refunded' | 'partially_refunded' | (string & {});
    currency: string;
    subtotal_minor: number;
    tax_minor: number;
    total_minor: number;
    amount_refunded_minor: number;
    description: string | null;
    issued_at: string | null;
    paid_at: string | null;
    hosted_invoice_url: string | null;
    invoice_pdf: string | null;
};

export type PaymentMethod = { id: string; brand: string; last4: string; exp_month: number; exp_year: number; is_default: boolean };

/** Result of starting a payment: `requires_confirmation` means the browser must confirm it with Stripe (card check / 3-D Secure). */
export type PaymentStep = {
    status: 'active' | 'paid' | 'requires_confirmation';
    updated?: boolean;
    client_secret: string | null;
    payment_method: string | null;
};

/** What Stripe will invoice if the customer confirms this plan or interval change. */
export type BillingPreview = {
    plan: { key: string; name: string };
    interval: 'monthly' | 'yearly';
    price_minor: number;
    currency: string;
    change: boolean;
    from: { plan: string | null; interval: string | null } | null;
    lines: { description: string; amount_minor: number; proration: boolean }[];
    unused_credit_minor: number;
    subtotal_minor: number;
    tax_minor: number;
    tax_percent: number;
    total_minor: number;
    balance_applied_minor: number;
    amount_due_minor: number;
    credit_kept_minor: number;
    renews_at: string;
    has_payment_method: boolean;
};

export type BillingPayment = {
    id: string;
    amount_minor: number;
    amount_refunded_minor: number;
    currency: string;
    status: 'succeeded' | 'failed' | 'pending' | 'refunded' | 'partially_refunded' | (string & {});
    failure_message: string | null;
    card_brand: string | null;
    card_last4: string | null;
    description: string | null;
    receipt_url: string | null;
    created_at: string | null;
};

export type BillingPayments = { payments: BillingPayment[]; upcoming: { amount_due_minor: number; currency: string; date: string | null } | null };

export type AutoReplySettings = { enabled: boolean; message: string; cooldown_hours: number; when: 'always' | 'outside_hours' };

// ── Inbox tools ──────────────────────────────────────────────────────────────────────────

export type CannedResponse = { id: string; shortcut: string; body: string };

export type ConversationNote = { id: string; body: string; author: string; mine: boolean; mentions: string[]; created_at: string | null };

export type DayHours = { open: boolean; from: string; to: string };

export type InboxSettings = {
    business_hours: { enabled: boolean; days: Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', DayHours> };
    routing: 'manual' | 'round_robin';
    timezone: string;
    open_now: boolean;
    can: { business_hours: boolean; auto_routing: boolean };
};

export type MemberNotification = {
    id: string;
    type: 'assigned' | 'mention' | 'snooze_ended' | (string & {});
    title: string;
    body: string | null;
    url: string | null;
    read: boolean;
    created_at: string | null;
};

export type DashboardSummary = {
    conversations_today: number;
    open: number;
    unassigned: number;
    waiting_for_reply: number;
    mine: number;
    messages_sent_today: number;
    messages_received_today: number;
    campaign_messages_this_month: number;
};

/** A conversation with unread customer messages that is this member's to answer (bell + desktop alerts). */
export type UnreadConversation = { conversation_id: string; contact: string; preview: string; unread_count: number; at: string | null; url: string };
