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

export type EntitlementSnapshot = {
    plan_key: string;
    plan_name: string;
    plan_version_id: string;
    plan_version: number;
    subscription_status: string | null;
    trial_ends_at: string | null;
    entitlements: Record<string, EntitlementValue>;
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
    source: string;
    consent_state: ConsentState;
    opted_out_at: string | null;
    marketing_opted_out: boolean;
    last_inbound_at: string | null;
    created_at: string | null;
};

export type Conversation = {
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
