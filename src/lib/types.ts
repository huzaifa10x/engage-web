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

export type SignupStatus = 'started' | 'exchanging' | 'provisioning' | 'completed' | 'failed' | 'cancelled';

export type SignupAttempt = {
    id: string;
    flow: 'standard' | 'coexistence';
    status: SignupStatus;
    event: string | null;
    waba_id: string | null;
    phone_number_id: string | null;
    waba_account_id: string | null;
    steps: Record<string, { state: 'done' | 'failed'; at: string; error?: string }>;
    error: { code: string | null; message: string } | null;
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
