import {
    BanknoteIcon,
    BellRingIcon,
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
    /** Part of the Pro (Growth) offer: shows a "Pro" badge. */
    pro?: boolean;
};
export type NavSection = { title: string; items: NavItem[] };

export const isReleased = (item: NavItem): boolean => !!item.href && !item.preview;

/** Whether this build shows the item at all (permissions are checked separately). */
export const isVisible = (item: NavItem): boolean => SHOW_UNRELEASED || isReleased(item) || !!item.heading;

/**
 * Menu as frozen by Change Notice CN-02 (before the pilot). Old URLs redirect to these pages
 * (next.config.ts), so bookmarks and email links keep working.
 */
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
            // Auto reply (after-hours flow per number) and follow-up rules, moved out of Settings.
            { label: 'Follow-ups & Alerts', icon: BellRingIcon, href: '/follow-ups', permission: P.SettingsView },
            { label: 'Automations', icon: ZapIcon },
        ],
    },
    {
        title: 'Grow',
        items: [
            { label: 'Campaigns', icon: MegaphoneIcon, href: '/campaigns', permission: P.CampaignsView },
            { label: 'Templates', icon: FileTextIcon, href: '/templates', permission: P.TemplatesView },
            { label: 'Growth Hub', icon: TrendingUpIcon, heading: true, growth: true, permission: P.InboxView },
            { label: 'Leads', icon: TargetIcon, href: '/growth/leads', permission: P.InboxView, growth: true, sub: true },
            { label: 'Tracking Setup', icon: GlobeIcon, href: '/growth/setup', permission: P.GrowthView, growth: true, sub: true },
            // Orders: the order list and the evidence for each match (revenue lives in Insights › Sales & Revenue).
            { label: 'Orders', icon: ShoppingCartIcon, href: '/growth/orders', permission: P.GrowthView, growth: true, sub: true, pro: true },
        ],
    },
    {
        title: 'Insights',
        items: [
            { label: 'Messages & Team', icon: BarChart3Icon, href: '/insights', permission: P.AnalyticsView },
            // Marketing (CN-01): Owner, Admin and Marketing; Starter gets an upgrade prompt.
            { label: 'Marketing', icon: PieChartIcon, href: '/insights/marketing', permission: P.GrowthView, growthAny: true },
            { label: 'Sales & Revenue', icon: BanknoteIcon, href: '/insights/sales', permission: P.AnalyticsView, pro: true },
        ],
    },
    {
        title: 'Account',
        items: [
            { label: 'Channels', icon: PhoneIcon, href: '/channels', permission: P.ChannelsView },
            { label: 'Team & Roles', icon: UsersIcon, href: '/team', permission: P.TeamView },
            { label: 'Consent & Privacy', icon: ShieldCheckIcon, href: '/consent', permission: P.ComplianceView },
            { label: 'Integrations', icon: PlugIcon, href: '/integrations', permission: P.IntegrationsView },
            { label: 'Developer', icon: CodeIcon, href: '/developer', permission: P.DeveloperView },
            { label: 'Billing', icon: CreditCardIcon, href: '/billing', permission: P.BillingView },
            { label: 'Settings', icon: SettingsIcon, href: '/settings', permission: P.SettingsView },
            { label: 'Audit log', icon: ListChecksIcon, href: '/audit-log', permission: P.AuditView },
        ],
    },
];

/**
 * What each system role sees in the menu (CN-02 §7). Owner, Admin and custom roles: everything
 * their permissions allow. Agent: the daily work only. Marketing: that plus Growth Hub,
 * Campaigns, Templates and Insights › Marketing. Pages stay protected by permissions on the API.
 */
const AGENT_MENU = ['/dashboard', '/inbox', '/contacts'];
const MARKETING_MENU = [...AGENT_MENU, '/campaigns', '/templates', '/growth/leads', '/growth/setup', '/growth/orders', '/insights/marketing'];

export function roleAllows(item: NavItem, roleKey: string | null | undefined, sub: NavItem[] = []): boolean {
    const menu = roleKey === 'agent' ? AGENT_MENU : roleKey === 'marketing' ? MARKETING_MENU : null;
    if (menu === null) return true;
    if (item.heading) return sub.some((s) => s.href && menu.includes(s.href));

    return !!item.href && menu.includes(item.href.split('?')[0]!);
}

/**
 * The top-bar number selector per page (CN-02 §6): it switches the inbox, filters these pages,
 * and is hidden everywhere else (Templates are grouped by WhatsApp account instead).
 */
export type NumberScope = 'switch' | 'filter' | null;

export function numberScope(pathname: string): NumberScope {
    const under = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
    if (under('/inbox')) return 'switch';
    if (['/dashboard', '/campaigns', '/growth/leads', '/growth/orders', '/insights'].some(under)) return 'filter';

    return null;
}

/** Routes of modules that are not released yet; production treats them as not found. */
export const UNRELEASED_ROUTES: string[] = NAV.flatMap((s) => s.items)
    .filter((i) => i.href && i.preview)
    .map((i) => i.href!.split('?')[0]!);
