import {
    BanknoteIcon,
    BarChart3Icon,
    BotIcon,
    CodeIcon,
    CreditCardIcon,
    FileTextIcon,
    GlobeIcon,
    TargetIcon,
    TrendingUpIcon,
    InboxIcon,
    LayoutDashboardIcon,
    ListChecksIcon,
    type LucideIcon,
    MegaphoneIcon,
    MessageCircleIcon,
    PieChartIcon,
    PhoneIcon,
    PlugIcon,
    SettingsIcon,
    ShieldCheckIcon,
    ShoppingCartIcon,
    UsersIcon,
    ContactIcon,
    ZapIcon,
} from 'lucide-react';

import { P, type PermissionKey } from '@/lib/permissions';
import { SHOW_UNRELEASED } from '@/lib/release';

/**
 * A module's place in the release cycle:
 *  - no `href`        → upcoming: a "Soon" placeholder on staging and locally, hidden in production;
 *  - `preview: true`  → built and under review: a working link on staging and locally, hidden in production;
 *  - otherwise        → released: shown everywhere.
 * To release a module, give it its `href` and remove `preview`; the next production deploy shows it.
 */
export type NavItem = {
    label: string;
    icon: LucideIcon;
    href?: string;
    permission?: PermissionKey;
    preview?: boolean;
    /** Shown only when the workspace has Growth Hub (feature flag on, full tier — CN-01). */
    growth?: boolean;
    /** Shown when Growth Hub is on at any tier (Starter sees an upgrade prompt on the page). */
    growthAny?: boolean;
    /** A group label (no link), e.g. "Growth Hub"; `sub` items under it are indented. */
    heading?: boolean;
    sub?: boolean;
};
export type NavSection = { title: string; items: NavItem[] };

export const isReleased = (item: NavItem): boolean => !!item.href && !item.preview;

/** Whether this build shows the item at all (permissions are checked separately). */
export const isVisible = (item: NavItem): boolean => SHOW_UNRELEASED || isReleased(item) || !!item.heading;

/** Same information architecture as the prototype; modules ship phase by phase. */
export const NAV: NavSection[] = [
    {
        title: 'Workspace',
        items: [
            { label: 'Dashboard', icon: LayoutDashboardIcon, href: '/dashboard' },
            { label: 'Conversations', icon: InboxIcon, href: '/inbox', permission: P.InboxView },
            { label: 'Contacts & CRM', icon: ContactIcon, href: '/contacts', permission: P.ContactsView },
        ],
    },
    {
        title: 'Automate',
        items: [
            { label: 'Web Chatbot', icon: MessageCircleIcon },
            { label: 'Chatbots & Flows', icon: BotIcon, href: '/chatbots', permission: P.ChatbotsView },
            { label: 'Automations', icon: ZapIcon },
        ],
    },
    {
        title: 'Grow',
        items: [
            { label: 'Campaigns', icon: MegaphoneIcon, href: '/campaigns', permission: P.CampaignsView },
            { label: 'Templates', icon: FileTextIcon, href: '/templates', permission: P.TemplatesView },
            // Growth Hub (R1): new parent below Templates with Leads and Tracking Setup (Developer Handover §I.3).
            { label: 'Growth Hub', icon: TrendingUpIcon, heading: true, growth: true, permission: P.InboxView },
            { label: 'Leads', icon: TargetIcon, href: '/growth/leads', permission: P.InboxView, growth: true, sub: true },
            { label: 'Tracking Setup', icon: GlobeIcon, href: '/growth/setup', permission: P.GrowthView, growth: true, sub: true },
            // Growth Hub › Sales (Engagement Plan step D): store orders matched to chats.
            { label: 'Sales', icon: ShoppingCartIcon, href: '/growth/sales', permission: P.GrowthView, growth: true, sub: true },
            { label: 'Analytics', icon: BarChart3Icon, href: '/analytics', permission: P.AnalyticsView },
            // Analytics › Marketing (CN-01): Owner and Admin; Starter gets an upgrade prompt.
            { label: 'Marketing', icon: PieChartIcon, href: '/analytics/marketing', permission: P.GrowthView, growthAny: true, sub: true },
            { label: 'Sales & Revenue', icon: BanknoteIcon, href: '/analytics/sales', permission: P.AnalyticsView, sub: true },
        ],
    },
    {
        title: 'Account',
        items: [
            { label: 'Channels', icon: PhoneIcon, href: '/channels', permission: P.ChannelsView },
            { label: 'Team & Roles', icon: UsersIcon, href: '/team', permission: P.TeamView },
            { label: 'Compliance', icon: ShieldCheckIcon, href: '/compliance', permission: P.ComplianceView },
            { label: 'Integrations', icon: PlugIcon, href: '/integrations', permission: P.IntegrationsView },
            { label: 'Developer', icon: CodeIcon, href: '/developer', permission: P.DeveloperView },
            { label: 'Billing', icon: CreditCardIcon, href: '/billing', permission: P.BillingView },
            { label: 'Settings', icon: SettingsIcon, href: '/settings', permission: P.SettingsView },
            { label: 'Audit log', icon: ListChecksIcon, href: '/audit-log', permission: P.AuditView },
        ],
    },
];

/** Routes of modules that are not released yet; production treats them as not found. */
export const UNRELEASED_ROUTES: string[] = NAV.flatMap((s) => s.items)
    .filter((i) => i.href && i.preview)
    .map((i) => i.href!.split('?')[0]!);
