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

/** GET roles/catalog: every permission grouped by area, the system roles, and the team privacy option. */
export type RoleCatalog = {
    areas: { area: string; permissions: { key: string; label: string }[] }[];
    system_roles: { key: string; name: string; permissions: string[] }[];
    hide_phone_from_agents: boolean;
    /** Custom roles need a plan with full role-based access. */
    custom_roles: boolean;
};

/** Settings › Data: one CSV export made in the background. */
export type DataExport = {
    id: string;
    kind: string;
    status: 'queued' | 'running' | 'ready' | 'failed';
    rows: number | null;
    error: string | null;
    requested_by: string | null;
    created_at: string;
    finished_at: string | null;
    expires_at: string | null;
};
export type DataExportKind = { key: string; label: string };

/** A workspace deletion the Owner asked for: it happens on scheduled_for unless cancelled. */
export type WorkspaceDeletion = { requested_at: string | null; scheduled_for: string | null; requested_by: string | null; waiting_days: number };

export type Tenant = {
    id: string;
    name: string;
    slug: string;
    status: 'active' | 'suspended' | string;
    timezone: string;
    date_format: 'dmy' | 'mdy' | 'ymd';
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
    /** Growth Hub pilot switch for the active workspace (set by 10X Engage, not part of a plan). */
    /** tier: off | chip (Starter: Meta ad source chip only) | full (Growth Hub and Analytics → Marketing). */
    growth?: { enabled: boolean; tier?: 'off' | 'chip' | 'full' };
    /** The active workspace's date format and time zone (screens follow them). */
    dates?: { format: 'dmy' | 'mdy' | 'ymd'; timezone: string } | null;
    /** Two-factor sign-in; an Owner without it must set it up before using the workspace. */
    two_factor?: TwoFactorStatus;
};

export type TwoFactorStatus = {
    enabled: boolean;
    required: boolean;
    confirmed_at: string | null;
    last_used_at: string | null;
    recovery_codes_left: number;
    /** Set by a Super Admin (Meta App Review): email + password only, no authenticator or emailed code. */
    review_account?: boolean;
    /** Signed in with a recovery code a moment ago: the authenticator can be replaced without another code. */
    recovery_sign_in: boolean;
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
    /** The Marketing Messages API status of the number's account. */
    marketing_messages_status?: MarketingMessagesStatus;
    waba_account_id: string;
    phone_number_id: string;
    display_phone_number: string | null;
    e164: string | null;
    verified_name: string | null;
    name_status: string | null;
    status: 'pending' | 'connected' | 'disconnected';
    /** Meta: a new number must be registered on the Cloud API within 14 days of Embedded Signup. Null when done or not needed. */
    registration?: { deadline: string; days_left: number; overdue: boolean } | null;
    /** Why it is disconnected: the customer removed our access at Meta, took the number off the Business app, or did it here. */
    disconnect_reason?: DisconnectReason | null;
    disconnected_at?: string | null;
    quality_rating: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN' | null;
    messaging_limit_tier: string | null;
    throughput_level: string | null;
    onboarding_type: 'new_number' | 'migrated' | 'coexistence';
    coexistence_status: 'none' | 'sync_pending' | 'history_syncing' | 'synced' | 'sync_failed' | 'offboarded';
    app_sync_expires_at: string | null;
    /** Import from the WhatsApp Business app; null for numbers that are not shared with the app. */
    sync: PhoneNumberSync | null;
    max_mps: number;
    /** Meta's daily messaging limit for the business (all its numbers), as the platform enforces it. limit null = unlimited. */
    daily_limit?: DailyLimit;
    capabilities: Record<string, boolean>;
    is_official_business_account: boolean;
    last_synced_at: string | null;
};

export type DailyLimit = {
    limit: number | null;
    used: number;
    remaining: number | null;
    /** When room frees up again (only when nothing is left). */
    available_at: string | null;
    tier: string | null;
};

/** Meta's Marketing Messages API, per WhatsApp Business Account. Only Meta moves it to onboarded. */
export type MarketingMessagesStatus = 'not_started' | 'eligible' | 'request_sent' | 'onboarded' | 'not_eligible';
export type SendRoute = 'mm_api' | 'cloud_api';

export type MarketingMessagesInfo = {
    enabled: boolean;
    status: MarketingMessagesStatus;
    /** Where campaign marketing goes right now. */
    route: SendRoute;
    meta_status: string | null;
    terms_status: string | null;
    consent_source: string | null;
    requested_at: string | null;
    /** Why Meta refused our request: a portfolio admin then accepts in WhatsApp Manager. */
    request_error: string | null;
    onboarded_at: string | null;
    synced_at: string | null;
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
    disconnect_reason?: DisconnectReason | null;
    /** Meta refused this account for a missing permission (error 200): reconnect to grant it again. */
    needs_reconnect?: { reason: 'permission_missing'; since: string; meta_code: number | null } | null;
    is_subscribed_to_webhooks: boolean;
    connected_at: string | null;
    disconnected_at: string | null;
    marketing_messages?: MarketingMessagesInfo;
    /** Conversions to Meta. Null for workspaces not switched on (nothing is shown). */
    conversions?: { status: 'enabled' | 'not_enabled' | 'unknown'; checked_at: string | null; can_reconnect: boolean; coexistence: boolean } | null;
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
    /** The number is masked for this teammate (Settings › Team › Roles). */
    phone_hidden?: boolean;
    bsuid: string | null;
    email: string | null;
    attributes: Record<string, unknown>;
    tags: string[];
    source: string;
    /** The link, QR code or website button that brought the contact in (source "wa_link"). */
    source_detail?: string | null;
    /** The number this contact was synced from (WhatsApp Business app); null when it did not come from a sync. */
    synced_from?: { id: string; display_phone_number: string | null; verified_name: string | null; status: string } | null;
    consent_state: ConsentState;
    opted_out_at: string | null;
    /** The Subscribe / Unsubscribe question was sent then and is waiting for an answer. */
    consent_requested_at?: string | null;
    marketing_opted_out: boolean;
    last_inbound_at: string | null;
    created_at: string | null;
    /** 3.5 Contacts list sorted by activity: the latest message, edit or creation. */
    last_activity_at?: string | null;
    /** Growth Hub: where this lead came from. null when Growth Hub is off. Agents get status + label only. */
    acquisition?: Acquisition | null;
    /** CRM pipeline stage; null = no stage yet. */
    stage?: StageRef | null;
    stage_changed_at?: string | null;
    /** The contact record (3.5). */
    company?: string | null;
    job_title?: string | null;
    city?: string | null;
    country?: string | null;
    language?: string | null;
    owner?: { id: string; name: string } | null;
    lifecycle?: { key: LifecycleKey; label: string };
    /** null key: customers have no lead status. `automatic` false when a teammate picked it. */
    lead_status?: { key: LeadStatusKey | null; label: string | null; automatic: boolean };
    /** How the customer agreed to be contacted, when a teammate started the chat. */
    /** Open deals (enquiries in an open stage) and their value. */
    open_deals?: { count: number; value: number };
    last_human_reply_at?: string | null;
    /** The contact's latest chat. */
    chat?: { id: string; state: 'needs_reply' | 'waiting' | 'snoozed' | 'resolved'; window_expires_at: string | null } | null;
    contact_permission?: { via: PermissionVia; via_label: string; note: string | null; by: string | null; by_name: string | null; at: string } | null;
};

export type LifecycleKey = 'subscriber' | 'lead' | 'opportunity' | 'customer' | 'other';
export type LeadStatusKey = 'new' | 'attempted' | 'connected' | 'open_deal' | 'bad_timing' | 'unqualified';
export type PermissionVia = 'form' | 'call' | 'in_person' | 'email' | 'other';

export type ContactFieldChange = {
    id: string;
    field: string;
    label: string;
    from: string | null;
    to: string | null;
    by: { id: string | null; name: string } | null;
    source: string;
    at: string;
};

export type ContactDuplicate = { id: string; display_name: string; match: 'phone' | 'email' | 'whatsapp_id' };

/** Start conversation search (3.5): what starting a chat with this person will do. */
export type StartCandidate = {
    id: string;
    display_name: string;
    phone: string | null;
    company: string | null;
    lifecycle: { key: LifecycleKey; label: string };
    opted_out: boolean;
    owner: { id: string; name: string; is_me: boolean } | null;
    conversation: { id: string; status: 'open' | 'closed'; window_expires_at: string | null; window_open: boolean } | null;
    has_permission: boolean;
    action: 'open_chat' | 'send_template' | 'start_chat' | 'no_phone';
    last_inbound_at: string | null;
};

export type ResolutionReason = 'resolved' | 'not_lead' | 'no_action';

/** One closure of a chat (Inbox › Resolved). */
export type Resolution = {
    id: string;
    conversation_id: string;
    contact_id: string | null;
    reason: ResolutionReason;
    reason_label: string;
    resolved_by: { id: string; name: string } | null;
    resolved_at: string;
    reopened_at: string | null;
    reopen_how: 'customer' | 'agent' | 'flag' | 'message' | null;
    reopened_by: { id: string; name: string } | null;
    flag: { by: { id: string; name: string }; note: string; at: string } | null;
    contact?: { id: string; display_name: string; last_inbound_at: string | null } | null;
    later_closures?: number;
};

export type ResolutionReview = {
    days: number;
    agents: { membership_id: string; name: string; resolved: number; not_lead: number; no_action: number; flagged: number }[];
};

export type StageColor = 'grey' | 'info' | 'good' | 'warn' | 'bad' | 'brand';

/** group: Open, Won or Lost — reports count by group, whatever the stage is called (item 4). */
export type StageGroup = 'open' | 'won' | 'lost';

export type StageRef = { id: string; name: string; color: StageColor; archived: boolean; group?: StageGroup };

export type CrmStage = StageRef & { position: number; contacts?: number; enquiries?: number };

export type StageEvent = {
    id: string;
    from: StageRef | null;
    to: StageRef | null;
    changed_by: string | null;
    source: string;
    reason?: string | null;
    version?: number | null;
    enquiry_id?: string | null;
    changed_at: string;
};

export type AcquisitionStatus = 'meta' | 'ref' | 'multi' | 'web' | 'unattributed' | 'before';

export type AcquisitionTouch = {
    evidence_id?: string;
    type?: string;
    occurred_at?: string;
    source?: string;
    label: string;
    platform?: string | null;
    headline?: string | null;
    campaign?: string | null;
    landing_path?: string | null;
};

export type Acquisition = {
    status: AcquisitionStatus;
    /** Chip text, e.g. "Meta ad", "Meta ad · Instagram", "Reference matched · Google Ads". */
    label: string;
    /**
     * A returning contact (created before tracking started, or first wrote without an ad): shown with
     * the paid touch that brought it back. Never "Before tracking".
     */
    returning?: boolean;
    /** Inbox chip text for a returning contact: "Before tracking · Latest: Google Ads". */
    returning_label?: string;
    /** Source panel line (full tier, every role that sees the chat): no codes, click IDs or costs. */
    source?: {
        name: string;
        /** The original campaign: never replaced by a later touch. */
        campaign: string | null;
        landing_page: string | null;
        /** A later touch, shown apart: "Latest: winter_sale (Google Ads)". */
        latest?: { name: string; campaign: string | null; line: string; at: string | null } | null;
    };
    // Only with growth.view:
    original?: AcquisitionTouch;
    latest?: AcquisitionTouch | null;
    first_tracked_enquiry_at?: string | null;
    landing_page?: string | null;
    confidence?: 'confirmed' | null;
};

/** One piece of proof behind a lead's source (growth.view). IDs are masked. */
export type LeadEvidence = {
    id: string;
    type: 'meta_ctwa' | 'website_reference' | 'website_unregistered' | (string & {});
    source: string;
    label: string;
    confidence: string;
    conflict: boolean;
    occurred_at: string;
    message_id: string | null;
    platform: string | null;
    platform_proof: string | null;
    /** Meta ad referral only. The ad click ID itself is never sent, only whether Meta included one. */
    details: {
        headline?: string;
        body?: string;
        source_type?: string;
        source_url?: string;
        /** The ad creative: image | video (and its link). */
        media_type?: string;
        creative_url?: string;
        video_url?: string;
        ad_id?: string;
        click_id_sent?: boolean;
        /** Website taps: the site, the page with the button, the landing page, UTMs, masked reference. */
        site?: string;
        page_path?: string;
        landing_path?: string;
        campaign?: Record<string, string>;
        referrer_host?: string;
        campaign_params_origin?: string;
        reference?: string;
        /** Website taps without a registered click: why (e.g. the reference was removed before sending). */
        note?: string;
        /** Which click IDs (gclid, gbraid, wbraid, fbclid) came with the tap — never their values. */
        click_ids_sent?: string[];
    };
    conversation_id?: string | null;
};

/** Growth Hub › Leads: a CRM contact on one WhatsApp number (its conversation), with its source. */
export type Lead = {
    id: string;
    conversation_id: string;
    status: 'open' | 'closed';
    contact: Contact;
    phone_number: { id: string; display_phone_number: string | null; verified_name: string | null } | null;
    assigned: { id: string; name: string | null } | null;
    first_contact_at: string | null;
    last_activity_at: string | null;
};

export type LeadPage = CursorPage<Lead> & { meta: { counts: { all: number; new: number; returning: number }; sees_all: boolean } };

export type LeadSummary = {
    /** Ad leads with a paid touch in the last 30 days (= the All leads tab). */
    leads: number;
    new_customers: number;
    returning: number;
    meta_instagram: number;
    /** Of the Meta leads, those from boosted posts. */
    meta_posts: number;
    /** null until a website is tracked. */
    website_lost: number | null;
    /** null for people who only see their own leads, and until a website is tracked. */
    unmatched_clicks: { total: number; pending: number } | null;
    /** Websites in Tracking Setup: the website cards and the Unmatched clicks tab show only when > 0. */
    websites: number;
    sees_all: boolean;
};

/** Tracking Setup › Meta ads: a Click-to-WhatsApp ad leads came from (ad ID masked). */
export type MetaAd = {
    id: string;
    ad_id: string;
    source_type: string | null;
    headline: string | null;
    source_url: string | null;
    /** Set when the ad runs on one platform only: the proof for "Meta ad · Instagram / Facebook". */
    platform: 'instagram' | 'facebook' | null;
    leads: number;
    messages: number;
    /** The receiving numbers this ad's chats came in on. */
    numbers: { id: string; display_phone_number: string | null; verified_name: string | null; chats: number }[];
    /** New leads by the furthest CRM stage reached within 30 days (leads never moved are not listed). */
    outcomes: { stage: StageRef; leads: number }[];
    first_seen_at: string;
    last_seen_at: string;
};

/** Analytics → Marketing. null = can't be calculated ("—"), 0 = a measured zero. */
export type MarketingMetric = { value: number | null; previous: number | null; change_pct?: number | null };

export type MarketingOverview = {
    period: { from: string; to: string; timezone: string };
    previous_period: { from: string; to: string } | null;
    provisional: boolean;
    stage_mapping_ready: boolean;
    new_leads: MarketingMetric;
    qualified_leads: MarketingMetric;
    qualification_rate: MarketingMetric;
    confirmed_coverage: MarketingMetric & { confirmed: number };
    returning_contacts: number;
    updated_at: string | null;
};

export type MarketingSourceRow = {
    bucket: string;
    label: string;
    new_leads: number;
    qualified: number | null;
    rate: number | null;
    previous: { new_leads: number; qualified: number | null };
    change_pct: number | null;
};

export type MarketingCampaignRow = {
    campaign_key: string;
    label: string;
    bucket: string | null;
    source: string;
    new_leads: number;
    qualified: number | null;
    rate: number | null;
    previous_new_leads: number;
    change_pct: number | null;
    is_new: boolean;
};

export type MarketingTrendPoint = { date: string; new_leads: number; qualified: number | null; prev_date: string | null; prev_new_leads: number | null };

export type UnmatchedClick = {
    id: string;
    received_at: string;
    site: string | null;
    page: string | null;
    source: string;
    campaign: string | null;
    status: 'pending' | 'unattributed';
    note: string;
};

/** Tracking Setup › Websites: a client website with the tracker. */
export type GrowthSite = {
    id: string;
    domain: string;
    display_name: string | null;
    enabled: boolean;
    verified_at: string | null;
    consent_mode: 'click_only' | 'consent';
    session_landing_mode: boolean;
    site_key: string;
    snippet: string;
    gtm_snippet: string;
    privacy_line: string;
    /** The message visitors send; the reference "(Ref: XG-…)" is always added after it. */
    greeting: string;
    greeting_ar: string | null;
    default_greeting: string;
    greeting_max: number;
    /** Live chatbot flows on the site's numbers that start on keywords (warning when the greeting changes). */
    keyword_flows: { name: string; keywords: string[] }[];
    numbers: {
        mapping_id: string;
        phone_number_id: string;
        public_number: string;
        display_phone_number: string | null;
        verified_name: string | null;
        status: string;
    }[];
    health: SiteHealth;
    created_at: string | null;
};

export type SiteHealth = {
    tracking_status: 'not_installed' | 'awaiting_verification' | 'active' | 'not_seen' | 'paused';
    sdk_last_seen_at: string | null;
    last_click_at: string | null;
    last_match_at: string | null;
    accepted_clicks_24h: number;
    matched_24h: number;
    filtered_24h: number;
    errors_24h: number;
    /** Junk refused before it counted towards the site's limit, today: wrong domain or not the tracker's format. */
    refused_today?: Partial<Record<'origin_not_allowed' | 'invalid_payload', number>>;
    refused_today_total?: number;
    last_error_code: string | null;
    last_error_at: string | null;
    config_version: number;
};

export type SiteTest = {
    started_at: string | null;
    tracker_seen: boolean;
    tap_received: boolean;
    message_received: boolean;
    matched: boolean;
    /** The exact message that arrived, and its reference (null = the visitor deleted it). */
    message?: { text: string; reference: string | null } | null;
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
    /** The inbox team it was given to (a chatbot handover or a teammate). */
    assigned_team_id?: string | null;
    /** Who answers now: "bot" (a chatbot is running), "human" (a person took over), or null. */
    handler?: 'bot' | 'human' | null;
    /** A chatbot is live on this conversation's number, so it can be handed (back) to the bot. */
    bot_available?: boolean;
    /** While a person handles it: the bot takes over again at the customer's next message from this time (flow auto-resume); null = only hand-back or closing. */
    bot_resumes_at?: string | null;
    /** The conversation's latest chatbot run; `node_title` is where the customer is (or left, when abandoned). */
    bot?: {
        state: 'running' | 'handed_off' | 'completed' | 'abandoned' | 'stopped' | null;
        flow_id: string;
        flow_name: string | null;
        /** The bot's name (the flow's name), shown wherever the bot speaks or hands over. */
        bot_name?: string;
        /** What the customer answered the bot, for the person who takes over. */
        answers?: { key: string; value: string }[];
        node_id: string | null;
        node_title: string | null;
        ended_reason: string | null;
        ended_at: string | null;
        started_at: string | null;
    } | null;
    unread_count: number;
    last_message_at: string | null;
    last_message_preview: string | null;
    last_message_direction: 'inbound' | 'outbound' | null;
    /** `replies_allowed`: a normal message can be sent now (window open; for an opted-out contact, opened by a message sent after opting out). */
    window: { open: boolean; expires_at: string | null; replies_allowed?: boolean; closing_soon?: boolean };
    /** Who the chat is waiting on, set by the system: needs_reply (on us) | waiting (on the customer) | snoozed | closed. */
    state?: 'needs_reply' | 'waiting' | 'snoozed' | 'closed';
    /** Needs reply: since when the customer has been waiting. */
    needs_reply_since?: string | null;
    /** The wait started outside business hours. */
    after_hours?: boolean;
    /** The wait started from a paid ad (top of the Needs reply queue). */
    ad_lead?: boolean;
    /** The assignee's name, for the wait clock ("Waiting 0:42 · Ahmed"). */
    assigned_name?: string | null;
    /** The reply promise (3.3): business time waited and left on the limit; paused outside business hours. Null unless it needs a reply. */
    promise?: ReplyPromiseClock | null;
    /** The closure the chat is in now (closed chats only). */
    resolution?: Resolution | null;
    /** Who wrote the last message: the card's "You:", "Auto:", "Sara:" prefix. */
    last_message_by?: { kind: 'customer' | 'you' | 'agent' | 'auto'; name: string | null } | null;
    /** The contact's earliest open next step, and how many are open and overdue. */
    next_step?: {
        id: string;
        type: string;
        type_label: string;
        title: string;
        due_at: string;
        enquiry_id: string | null;
        open: number;
        overdue: number;
    } | null;
    contact?: Contact;
    /** `status` is "disconnected" once the number was offboarded: the chat stays readable, nothing can be sent. */
    phone_number?: {
        id: string;
        display_phone_number: string | null;
        verified_name: string | null;
        status?: 'pending' | 'connected' | 'disconnected' | (string & {});
    };
    created_at: string | null;
};

export type ReplyPromiseClock = {
    limit_minutes: number;
    waited_seconds: number;
    left_seconds: number;
    due_at: string;
    over: boolean;
    paused: boolean;
    /** The reply-alert steps in business minutes (Fast: 5 / 15 / 30): amber from the first, red from the second. */
    alert_minutes?: number[];
};

export type ReplyPromiseSettings = {
    enabled: boolean;
    /** True while business hours are off: the promise counts open time only, so it can't be on. */
    needs_business_hours?: boolean;
    limit_minutes: number;
    ladder: { minutes: number; to: 'agent' | 'manager' | 'owner' }[];
    owner_whatsapp: { phone: string | null; template: { name: string; language: string } | null; ready: boolean };
    avg_booking_value: number | null;
    baseline: MissedLeadsBaseline | null;
};

export type MissedLeadsBaseline = {
    enquiries?: number | null;
    in_time?: number | null;
    over?: number | null;
    median_reply_minutes?: number | null;
    note?: string | null;
    entered_at?: string;
    entered_by?: string | null;
};

export type WaitAlert = {
    id: string;
    level: number;
    minutes: number;
    role: 'agent' | 'manager' | 'owner';
    recipients: { id: string; name: string | null }[];
    channels: ('app' | 'email' | 'whatsapp')[];
    whatsapp_error: string | null;
    episode: string;
    created_at: string;
};

export type MissedLeadsReport = {
    week: { from: string; to: string; weeks_ago: number; complete: boolean };
    limit_minutes: number;
    enquiries: number;
    in_time: number;
    over: number;
    pending: number;
    waited_over: {
        enquiry_id: string;
        enquiry_number: number;
        title: string | null;
        contact_id: string;
        customer: string;
        conversation_id: string | null;
        started_at: string;
        waited_seconds: number;
        answered: boolean;
        owner: string | null;
    }[];
    staff: { membership_id: string; name: string; replies: number; median_seconds: number; within_limit: number }[];
    by_confidence: { key: 'verified' | 'partial' | 'unknown'; label: string; enquiries: number }[];
    by_ad: { label: string; enquiries: number; verified: number; partial: number; unknown: number }[];
    avg_booking_value: number | null;
    aed_at_stake: number | null;
    aed_protected: number;
    verified_payments: number;
    booked_without_payment: number;
    baseline: MissedLeadsBaseline | null;
};

export type NextStep = {
    id: string;
    contact_id: string;
    enquiry_id: string | null;
    type: 'call' | 'message' | 'meeting' | 'quote' | 'other';
    type_label: string;
    title: string;
    due_at: string;
    overdue: boolean;
    assigned: { id: string; name: string } | null;
    status: 'open' | 'done' | 'cancelled';
    done_at: string | null;
    cancel_reason: string | null;
    created_at: string | null;
};

/** One buying conversation of a contact (its card, stage, value and money). */
export type Enquiry = {
    id: string;
    contact_id: string;
    number: number;
    current?: boolean;
    title: string | null;
    value: number | null;
    value_period: 'once' | 'month' | 'year' | null;
    expected_close_on: string | null;
    details_version: number;
    started_at: string;
    started_by: string;
    start_reason: string;
    imported: boolean;
    source: string;
    source_label: string;
    source_confidence: 'verified' | 'partial' | 'unknown';
    confidence_label: string;
    owner: { id: string; name: string } | null;
    stage: { id: string; name: string; group: StageGroup; color?: StageColor } | null;
    group: StageGroup;
    open: boolean;
    stage_version: number;
    lost_reason: string | null;
    verified_paid: boolean;
    paid_total: number;
    won: { reference: string | null; verified: boolean; by: string | null; at: string } | null;
    next_step: NextStep | null;
    last_activity_at: string | null;
    updated_at: string | null;
    updated_by: string | null;
    messages: number;
    bookings: unknown[];
    payments: {
        type: string;
        id: string;
        number: string;
        status: string;
        total: number;
        currency: string;
        paid: boolean;
        paid_at?: string | null;
        by?: string | null;
    }[];
    contact?: { id: string; name: string; deleted: boolean; chat_id?: string | null } | null;
};

export type EnquiryBoard = {
    stages: (CrmStage & { enquiries: Enquiry[]; count: number; value: number })[];
    stats: { open_value: number; open_count: number; open_valued: number; won_marked_30d: number; paid_verified_30d: number; open_without_next_step: number };
    truncated: boolean;
};

export type MessageStatus = 'queued' | 'accepted' | 'sent' | 'delivered' | 'read' | 'failed' | 'received' | 'deleted';

export type Message = {
    id: string;
    conversation_id: string;
    direction: 'inbound' | 'outbound';
    origin: 'customer' | 'agent' | 'api' | 'campaign' | 'automation' | 'app_echo' | 'history';
    /** What sent an automatic message: 'consent' = the opt-in / opt-out confirmation (not the chatbot). */
    automation?: 'consent' | null;
    type: string;
    status: MessageStatus;
    /** Inbound messages are shown without a Growth Hub website code. */
    body: string | null;
    /** The message as received, when it carried a website code: Owners and Admins only (audit). */
    raw_body?: string | null;
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
    /**
     * `plain` a short reason for the inbox, `known` whether we know the code (unknown: show the details),
     * `action` what to offer: retry (temporary errors only) or template (131047).
     */
    error: {
        code: string;
        title: string | null;
        detail?: string | null;
        hint?: string | null;
        plain?: string | null;
        known?: boolean;
        action?: 'retry' | 'template' | null;
    } | null;
    sent_by_membership_id: string | null;
    timestamp: string | null;
    sent_at: string | null;
    delivered_at: string | null;
    read_at: string | null;
    /** Voice notes: when the customer first played it. */
    played_at?: string | null;
    edited_at: string | null;
    revoked_at: string | null;
    /** Content removed by the workspace's retention policy; the delivery record remains. */
    redacted?: boolean;
};

export type UploadedMedia = {
    id: string;
    type: 'image' | 'video' | 'audio' | 'document' | 'sticker';
    mime_type: string;
    filename: string;
    file_size: number;
    /** A recording converted to a WhatsApp voice note (OGG / Opus). */
    voice?: boolean;
    /** Voice notes up to 512 KB show a play button on the customer's phone; bigger ones a download arrow. */
    playable?: boolean;
};

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
    category_change?: CategoryChange | null;
    /** Template page only: Meta's price per message for this category in every market. */
    pricing?: { label: string; currency: 'USD'; rates_effective_from: string | null; markets: { market: string; rate: number; countries: string[] }[] };
};

export type TemplateForm = {
    waba_account_id: string;
    name: string;
    language: string;
    category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
    /** Authentication only: Meta writes the text itself; these are its options. */
    add_security_recommendation?: boolean;
    code_expiration_minutes?: number | null;
    otp_button_text?: string | null;
    /** TEXT (default) uses `text`; IMAGE / VIDEO / DOCUMENT use `media_id` of an uploaded sample file. */
    header?: { format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'; text?: string; example?: string; media_id?: string } | null;
    body: string;
    body_examples?: string[];
    footer?: string | null;
    buttons?: { type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url?: string; example?: string; phone_number?: string }[];
};

// ── Contacts & CRM ───────────────────────────────────────────────────────────────────────

export type Tag = { id: string; name: string; contacts: number };

export type ContactFieldType = 'text' | 'number' | 'date' | 'email' | 'url' | 'phone' | 'boolean' | 'select' | 'multi_select';

/** Validation rules (Enterprise). Which apply depends on the type: number → min/max, text → lengths and pattern. */
export type ContactFieldRules = { required?: boolean; min?: number; max?: number; min_length?: number; max_length?: number; pattern?: string };

export type ContactField = { id: string; key: string; label: string; type: ContactFieldType; options?: string[] | null; rules?: ContactFieldRules };

/** What the plan allows: `limit` null = unlimited (`fair_use` is then the ceiling, if any); `advanced` = extra types and rules. */
export type ContactFieldsAllowance = { limit: number | null; fair_use: number | null; advanced: boolean; types: ContactFieldType[]; used: number };

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
    /** Not delivered because of Meta's per-person marketing limit (131049): not a failure, not retried. */
    marketing_limit?: number;
    /** Marketing: delivery, blocks and replies by the contact's consent when the campaign was prepared. */
    by_consent?: Record<'opted_in' | 'unknown' | 'opted_out', { sent: number; delivered: number; blocked: number; replied: number }> | null;
    replied: number;
    /** Which API delivered the campaign's messages. */
    routes?: { mm_api: number; cloud_api: number };
    /** A/B test on 20%: the rest of the list, waiting for the winner. */
    held?: number;
    /** A/B test results (test recipients only) and the verdict. */
    ab?: AbResults | null;
};

export type AbKind = 'template' | 'button' | 'send_time';
export type AbGoal = 'reply' | 'click' | 'lead' | 'purchase';

export type AbVariantResult = {
    variant: 'A' | 'B';
    recipients: number;
    waiting: number;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    clicked: number;
    leads: number;
    purchases: number;
    /** Goal count ÷ sent, or null before anything was sent. */
    rate: number | null;
};

export type AbResults = {
    goal: AbGoal;
    metric: 'replied' | 'clicked' | 'leads' | 'purchases';
    min_sample: number;
    variants: AbVariantResult[];
    /** B minus A, in percentage points of the goal rate. */
    difference: number | null;
    state: 'not_enough_data' | 'winner';
    winner: 'A' | 'B' | null;
    message: string;
};

export type AbTestSettings = {
    kind: AbKind;
    goal: AbGoal;
    min_sample: number;
    test_percent: 20 | 100;
    auto_send_winner: boolean;
    b: {
        message_template_id: string;
        template_name: string;
        template_language: string;
        template_category: string | null;
        variables: { header: string[]; body: string[]; buttons: Record<string, string> };
        media_id: string | null;
    } | null;
    b_delay_hours: number | null;
    rest: { variant: 'A' | 'B' | null; at: string; recipients?: number; winner?: 'A' | 'B' | null; auto?: boolean; stopped?: boolean } | null;
};

export type AbTestForm = {
    enabled: boolean;
    kind: AbKind;
    goal: AbGoal;
    min_sample: number;
    test_percent: 20 | 100;
    auto_send_winner: boolean;
    template_id?: string | null;
    media_id?: string | null;
    variables?: { header: string[]; body: string[]; buttons: Record<string, string> };
    b_delay_hours?: number | null;
};

export type Campaign = {
    id: string;
    name: string;
    status: CampaignStatus;
    phone_number: { id: string; display: string | null } | null;
    template: { id: string | null; name: string; language: string; category: string | null };
    /** How its marketing messages go out right now (never blocks sending). */
    send_route?: SendRoute;
    variables: { header: string[]; body: string[]; buttons: Record<string, string> };
    media_id: string | null;
    segment_id: string | null;
    audience_tag: string | null;
    /** The campaign's own conditions on custom fields (on top of the segment and tag). */
    audience_filter?: { match: 'all' | 'any'; rules: SegmentRule[] } | null;
    notes: string | null;
    objective: CampaignObjective | null;
    batch_per_hour: number | null;
    next_batch_at: string | null;
    /** Why a sending campaign is waiting until next_batch_at. */
    wait_reason?: 'quiet_hours' | 'drip' | 'daily_limit' | 'send_time' | null;
    paused_at: string | null;
    pause_reason: string | null;
    failure_reasons?: CampaignFailureReason[];
    /** The estimate shown at launch, with the date of Meta's rates it used. */
    cost_estimate?: CostEstimate | null;
    /** Marketing goes only to contacts with a recorded opt-in. */
    opted_in_only?: boolean;
    consent_confirmation?: { membership_id: string | null; at: string; unknown: number } | null;
    ab_test?: AbTestSettings | null;
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
    filter?: { match: 'all' | 'any'; rules: SegmentRule[] } | null;
    notes: string | null;
    objective: CampaignObjective | null;
    variables: { header: string[]; body: string[]; buttons: Record<string, string> };
    opted_in_only?: boolean;
    ab_test?: AbTestForm | null;
};

/** Meta's cost for a send, estimated before sending (USD, paid by the client directly to Meta). */
export type CostEstimate = {
    label: string;
    currency: 'USD';
    rates_effective_from: string | null;
    category: string;
    recipients: number;
    free_in_window: number;
    excluded_invalid: number;
    total: number;
    by_country: { country: string | null; market: string; recipients: number; rate: number; cost: number }[];
    computed_at: string;
};

/** Meta re-categorised a template in the last 30 days. */
export type CategoryChange = { from: string | null; to: string | null; at: string };

export type CampaignAudience = {
    matched: number;
    eligible: number;
    /**
     * Why the others won't receive it (each counted once, under the first reason). Marketing: opted out,
     * stopped marketing in WhatsApp, weekly cap; every category: no WhatsApp number. Unknown consent receives marketing.
     */
    excluded: { no_number: number; opted_out: number; stopped_marketing: number; frequency_cap: number; no_consent_record?: number };
    category: string | null;
    reach_limit: number | null;
    reach_used: number;
    /** Meta's daily messaging limit: people the business may start a conversation with per moving 24 hours, across all its numbers (null = unlimited). */
    messaging_limit: number | null;
    messaging_limit_tier?: string | null;
    messaging_used?: number;
    messaging_remaining?: number | null;
    messaging_available_at?: string | null;
    quality_rating: string | null;
    max_mps: number | null;
    /** Campaign sending speed of the workspace's plan (messages per hour); not selectable. */
    send_rate_per_hour: number;
    frequency_cap: number;
    quiet_until: string | null;
    quiet_hours: { start: string; end: string; timezone: string } | null;
    cost_estimate: CostEstimate | null;
    category_change: CategoryChange | null;
    /** Marketing: consent of everyone with a number (opted out are always excluded). */
    consent: { opted_in: number; unknown: number; opted_out: number } | null;
};

export type ConsentHistoryEntry = {
    id: string;
    action: string;
    source: string;
    source_label: string;
    channel: string;
    detail: string | null;
    wording: string | null;
    created_at: string;
};

export type CampaignPreview = {
    contact: { id: string; display_name: string; phone: string | null };
    header: string | null;
    body: string;
    footer: string | null;
    skipped: boolean;
};

export type CampaignFailureReason = { reason: string; code: string | null; count: number; stage: 'skipped' | 'not_sent' | 'failed' | 'marketing_limit' };

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
    /** One campaign may use at most this share (%) of the daily messaging limit per hour. */
    campaign_hourly_share: number;
};

export type ConsentEvent = {
    id: string;
    action: 'opted_in' | 'opted_out' | 'marketing_opted_in' | 'marketing_opted_out' | 'consent_declined' | (string & {});
    source: string;
    detail: string | null;
    /** The exact words the customer was shown, when known. */
    wording?: string | null;
    channel?: string;
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
    /** The plan a workspace falls back to; offered as "Switch to Free". */
    free?: boolean;
};

export type Billing = {
    stripe_configured: boolean;
    plan: { key: string; name: string };
    subscription: {
        status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
        provider: 'manual' | 'stripe';
        interval: 'monthly' | 'yearly' | null;
        trial_ends_at: string | null;
        current_period_end: string | null;
        cancel_at: string | null;
        /** Paid by card through Stripe: changed in the Stripe Customer Portal. Otherwise set up by 10X Digital. */
        self_serve: boolean;
        /** No grace period: a failed renewal pauses paid features until it is paid. */
        paused: boolean;
        /** A downgrade or Annual → Monthly switch scheduled for the end of the period. */
        scheduled_change: { plan: { key: string; name: string }; interval: 'monthly' | 'yearly' | null; at: string | null } | null;
    } | null;
    details: { legal_name: string | null; country: string | null; tax_trn: string | null; billing_email: string | null };
    /** automatic: Stripe Tax works VAT out at Checkout; otherwise the billing country must be set before upgrading. */
    vat: { applies: boolean; percent: number; country: string; automatic: boolean };
    has_payment_history: boolean;
    plans: BillingPlan[];
    /** A trial may switch itself to Free straight away. */
    can_switch_to_free?: boolean;
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
    /** The PDF is fetched fresh from Stripe (billing/invoices/{id}/pdf). */
    has_pdf: boolean;
};

/** The card renewals are charged to, as Stripe reports it. */
export type PaymentMethod = { brand: string; last4: string; exp_month: number; exp_year: number };

/** What a Stripe Customer Portal session is opened for. */
export type BillingPortalFlow = 'update' | 'card' | 'cancel' | 'manage';

/** Back from Stripe. Checkout: paid / processing / incomplete / rejected. Card screen: paid / nothing_due / failed. */
export type BillingReturn = {
    status: 'paid' | 'processing' | 'incomplete' | 'rejected' | 'nothing_due' | 'failed' | 'synced';
    message: string | null;
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

export type BillingPayments = {
    payments: BillingPayment[];
    /** The next renewal charge, as Stripe will invoice it. */
    upcoming: { amount_due_minor: number; total_minor: number; currency: string; date: string | null } | null;
};

export type AutoReplySettings = {
    enabled: boolean;
    message: string;
    cooldown_hours: number;
    when: 'always' | 'outside_hours';
    /** Reply with the fixed message, or with a chatbot flow chosen per WhatsApp number. */
    reply_with: 'message' | 'chatbot';
    /** phone number id → chatbot flow id */
    flows: Record<string, string>;
    /** The flows each number can use (live = published and switched on). Read only. */
    flow_options?: {
        phone_number_id: string;
        display: string | null;
        display_phone_number: string | null;
        flows: { id: string; name: string; live: boolean }[];
    }[];
};

/** Settings › Follow-up rules (Engagement Plan §IV). */
export type FollowUpSettings = {
    reply_alert: { enabled: boolean; minutes: number };
    escalation: { enabled: boolean; minutes: number; action: 'notify' | 'reassign'; notify_ids: string[] };
    window_alert: { enabled: boolean; minutes_before: number };
    unassigned: { enabled: boolean; minutes: number };
    nudge: { enabled: boolean; hours: number; message: string };
    second_nudge: { enabled: boolean; hours: number; template: { name: string; language: string; body: string[] } | null };
    weekly_cap: number;
    free_service_messages: number;
};

export type FollowUps = {
    settings: FollowUpSettings;
    allowed: { team: boolean; escalation: boolean; nudges: boolean; round_robin: boolean };
    /** Last 30 days per rule kind. */
    stats: Record<string, { fired: number; replied: number; skipped: number }>;
    estimate: {
        nudges_per_month: number;
        nudge_hours: number;
        free_service_messages: number;
        within_free: number;
        beyond_free: number;
        numbers: { id: string; display: string | null; service_messages_this_month: number; free_left: number }[];
    };
};

// ── Inbox tools ──────────────────────────────────────────────────────────────────────────

export type CannedResponse = { id: string; shortcut: string; body: string };

export type ConversationNote = { id: string; body: string; author: string; by_bot?: boolean; mine: boolean; mentions: string[]; created_at: string | null };

export type DayHours = { open: boolean; from: string; to: string };

export type WeekHours = Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', DayHours>;

export type InboxSettings = {
    business_hours: { enabled: boolean; days: WeekHours };
    /** Different hours for some WhatsApp numbers (phone number id → week). */
    number_hours: Record<string, WeekHours>;
    /** Closed dates (Eid, National Day…). */
    holidays: { date: string; name: string }[];
    routing: 'manual' | 'round_robin';
    timezone: string;
    /** First-response target (business hours) for "answered within target". */
    reply_target_minutes: number;
    /** The Needs reply timer is grey until this, amber until the target, red after it. */
    reply_warn_minutes: number;
    /** "Reply before window closes" shows this long before the 24 h window ends. */
    window_warning_minutes: number;
    open_now: boolean;
    /** When the team is next open ("tomorrow at 9:00"), what {{business.next_open}} says now. */
    next_open: string | null;
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

/** Dashboard › Today's work uses the Inbox's own counts (Needs reply is the Needs reply tab). */
export type DashboardSummary = {
    needs_reply: number;
    needs_reply_unassigned: number;
    needs_reply_mine: number;
    after_hours: number;
    /** Open chats whose last message is the customer's but that are not in Needs reply (imported history, older chats). */
    older_no_reply: number;
    conversations_today: number;
    open: number;
    unassigned: number;
    waiting_for_reply: number;
    mine: number;
    messages_sent_today: number;
    messages_received_today: number;
    campaign_messages_today: number;
    campaign_messages_this_month: number;
};

/** A conversation with unread customer messages that is this member's to answer (bell + desktop alerts). */
export type UnreadConversation = { conversation_id: string; contact: string; preview: string; unread_count: number; at: string | null; url: string };

// ── Developer: API keys and webhooks ─────────────────────────────────────────────────────

export type DeveloperOverview = {
    base_url: string;
    can: { api: boolean; webhooks: boolean };
    rate_limit_per_minute: number | null;
    /** Public API requests of this workspace (the portal is counted apart and never held to the plan limit). */
    api_usage?: { this_minute: number; today: number };
    scopes: { key: string; label: string }[];
    /** Ready-made sets of permissions for a new key ("Read only", "Read and write"). */
    presets?: { key: string; label: string; scopes: string[] }[];
    events: { key: string; label: string }[];
};

export type ApiKey = {
    id: string;
    name: string;
    prefix: string;
    scopes: string[];
    status: 'active' | 'revoked' | 'expired';
    expires_at: string | null;
    last_used_at: string | null;
    last_used_ip: string | null;
    created_at: string | null;
    /** Present only in the response that creates the key. */
    key?: string;
};

export type WebhookEndpoint = {
    id: string;
    url: string;
    description: string | null;
    events: string[];
    status: 'active' | 'paused' | 'disabled';
    consecutive_failures: number;
    last_success_at: string | null;
    last_failure_at: string | null;
    created_at: string | null;
    /** Present only when the endpoint is created or its secret is rotated. */
    secret?: string;
    /** 'api' = created by Zapier, Make or the customer's own code through the public API. */
    source?: 'portal' | 'api';
};

export type WebhookDelivery = {
    id: string;
    endpoint_id: string;
    event: string;
    status: 'pending' | 'delivered' | 'failed';
    attempts: number;
    response_status: number | null;
    response_excerpt: string | null;
    duration_ms: number | null;
    next_attempt_at: string | null;
    delivered_at: string | null;
    created_at: string | null;
    payload: Record<string, unknown>;
    /** Every attempt, oldest first (times in UTC). */
    attempt_log?: { at: string; status: number | null; ms: number; error: string | null }[];
};

/** Progress of the one-off import of contacts and chat history from the WhatsApp Business app. */
export type PhoneNumberSync = {
    /** paused: everything that arrived is imported and WhatsApp has sent nothing for 30 minutes. */
    state: 'waiting' | 'importing' | 'paused' | 'complete' | 'failed';
    history_declined: boolean;
    /** Closed after Meta's 24-hour window with less than all of the history (see shared_percent). */
    partial?: boolean;
    /** How much of the history WhatsApp actually sent (also after the import was closed). */
    shared_percent?: number;
    /** When WhatsApp last sent a chunk, and when Meta's sync window ends. */
    last_received_at?: string | null;
    window_ends_at?: string | null;
    /** How much of the history WhatsApp has sent us so far (0–100). */
    whatsapp_percent: number;
    whatsapp_finished: boolean;
    /** Records that have arrived, how many of them are imported, and how many still wait. */
    received: number;
    imported: number;
    waiting: number;
    /** Imported as a share of what has arrived. */
    percent: number;
    contacts: { received: number; imported: number };
    messages: { received: number; imported: number };
    started_at: string | null;
    last_imported_at: string | null;
};

export type DisconnectReason = 'manual' | 'partner_removed' | 'offboarded' | 'access_revoked' | (string & {});

// ── Integrations ─────────────────────────────────────────────────────────────────────────

export type IntegrationProvider = 'shopify' | 'woocommerce';

export type IntegrationRule = {
    event: string;
    enabled: boolean;
    phone_number_id: string | null;
    template_name: string | null;
    template_language: string | null;
    /** Each value is text that may contain {{field}} placeholders, e.g. "{{customer_first_name}}". */
    variables: { header?: string[]; body?: string[]; buttons?: Record<string, string> } | null;
    delay_minutes: number;
};

export type Integration = {
    id: string;
    provider: IntegrationProvider;
    name: string;
    store: string;
    status: 'active' | 'paused';
    default_country_code: string | null;
    tag: string | null;
    trust_store_consent: boolean;
    events: string[];
    active_rules: number;
    last_event_at: string | null;
    created_at: string | null;
    rules?: IntegrationRule[];
    // WooCommerce only (Engagement Plan step D):
    /** plugin = "10X Engage for WooCommerce" connected · waiting = key issued, plugin not connected yet · rest = REST keys only */
    via?: 'plugin' | 'waiting' | 'rest';
    pending?: boolean;
    link_days?: number;
    paid_stage_id?: string | null;
    tracker_auto?: boolean;
    orders_30d?: number;
    health?: StoreHealth;
};

export type StoreHealth = {
    state: 'waiting' | 'connected' | 'warning';
    last_event_at: string | null;
    heartbeat_at: string | null;
    latest_order_at: string | null;
    reconciled_at: string | null;
    plugin_version: string | null;
    wc_version: string | null;
    hpos: boolean | null;
    block_checkout: boolean | null;
    key_expires_at: string | null;
    warnings: { code: string; message: string }[];
};

export type SalesMatch = 'link' | 'review' | 'phone' | 'unavailable' | 'none';

export type SalesSource = { label: string; campaign: string | null; source: string | null };

/** Growth Hub › Sales: one store order and how it is connected to WhatsApp. Money in the order's currency. */
export type SalesOrder = {
    id: string;
    store: string;
    number: string;
    status: string;
    currency: string;
    total: string;
    refunded: string;
    net: string;
    paid: boolean;
    items_count: number;
    match: SalesMatch;
    match_label: string;
    counts_as_chat_revenue: boolean;
    customer: { id: string | null; display_name: string; phone: string | null };
    conversation_id: string | null;
    original_source: SalesSource | null;
    conversation_source: SalesSource | null;
    placed_at: string;
    paid_at: string | null;
};

export type SalesOrderDetails = SalesOrder & {
    explain: string | null;
    match_note: string | null;
    match_reviewed: boolean;
    billing_phone: string | null;
    store_source: Record<string, string> | null;
    first_chat_at: string | null;
    hours_to_order: number | null;
    completed_at: string | null;
    cancelled_at: string | null;
    refunded_at: string | null;
    link: { sent_at: string | null; sent_by: string; url: string; expires_at: string; conversation_id: string } | null;
    items: { name: string; sku: string | null; quantity: number; total: string }[];
    events: { event: string; status: string | null; total: string | null; refunded: string | null; via: string; at: string }[];
};

export type SalesPage = {
    data: SalesOrder[];
    meta: { next_cursor: string | null; counts: Record<'all' | SalesMatch, number>; stores: { id: string; name: string }[] };
};

export type SalesColumn = { orders: number; paid_orders: number; revenue: string; aov: string; refunded: string };

/** Analytics › Sales & Revenue. */
export type SalesAnalytics =
    | { locked: true }
    | {
          locked: false;
          stores: number;
          /** Filtered by the top-bar number: only orders matched to chats on it. */
          number_filtered?: boolean;
          range: { days: number; from: string; timezone: string };
          currency: string;
          other_currencies: string[];
          chat_link: SalesColumn;
          phone: SalesColumn;
          review: SalesColumn;
          unavailable: SalesColumn;
          website: SalesColumn;
          total: { orders: number; paid_orders: number; net: string; refunded: string; aov: string };
          by_original_source: { label: string; source: string; orders: number; revenue: string }[];
          by_conversation_source: { label: string; source: string; orders: number; revenue: string }[];
          products: { name: string; source: string; match: SalesMatch; quantity: number; revenue: string }[];
          time_to_order: { median_hours: number | null; average_hours: number | null };
          daily: { day: string; link: string; phone: string; other: string }[];
      };

/** Conversation sidebar: the contact's orders and total spend (never ad cost). */
export type ContactOrders = {
    orders: {
        id: string;
        number: string;
        store: string;
        status: string;
        currency: string;
        total: string;
        net: string;
        match: SalesMatch;
        match_label: string;
        placed_at: string;
        items_count: number;
    }[];
    total_spend: { currency: string; net: string }[];
    count: number;
};

export type IntegrationsOverview = {
    can: { stores: boolean; api: boolean; webhooks: boolean; sales?: boolean };
    providers: Record<IntegrationProvider, { available: boolean }>;
    api_base_url: string;
    events: { key: string; label: string; hint: string; providers: IntegrationProvider[] }[];
    fields: { key: string; label: string; sample: string }[];
    integrations: Integration[];
};

export type IntegrationEvent = {
    id: string;
    event: string;
    status: 'pending' | 'sent' | 'skipped' | 'failed' | 'cancelled';
    detail: string | null;
    reference: string | null;
    customer: string | null;
    phone: string | null;
    contact_id: string | null;
    message_id: string | null;
    due_at: string | null;
    created_at: string | null;
};

/** Analytics › Conversations & Team: response times in business hours. */
export type ResponseStat = {
    total: number;
    median_seconds: number | null;
    average_seconds: number | null;
    within_target: number;
    within_target_pct: number | null;
    after_hours: number;
};

export type ResponseTimes = {
    range: { days: number; from: string; timezone: string };
    business_hours: boolean;
    target_seconds: number;
    now: { needs_reply: number; over_target: number; after_hours: number };
    first_response: ResponseStat;
    resolution: ResponseStat;
    agents: (ResponseStat & { membership_id: string; name: string; resolution_average_seconds: number | null })[];
    numbers: (ResponseStat & { id: string; display: string | null })[];
};

export type ConversationCounts = { needs_reply: number; needs_reply_mine: number; needs_reply_unassigned?: number; after_hours: number; unassigned: number };

export type ConversationEvent = {
    id: string;
    type: string;
    at: string;
    actor: 'customer' | 'agent' | 'system';
    actor_name: string | null;
    data: Record<string, unknown>;
};

export type InboxHealth = {
    days: number;
    expired: number;
    in_time: number;
    pending: number;
    decided: number;
    rate: number | null;
    human_first_response: { median_seconds: number | null; count: number };
    automation_first_response: { median_seconds: number | null; count: number };
    sales: { open: number; open_with_next_step: number; open_value: number; open_valued: number };
};

export type ContactFunnel = { all: number; subscriber: number; lead: number; opportunity: number; customer: number; other: number; duplicates: number };

export type CrmSync = {
    provider: 'none' | 'hubspot';
    providers_available: string[];
    stage_map: { stage: StageRef & { group: StageGroup }; hubspot: string }[];
    hubspot_stages: string[];
};
