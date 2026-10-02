import {
    BarChart3Icon,
    BotIcon,
    CodeIcon,
    CreditCardIcon,
    FileTextIcon,
    InboxIcon,
    LayoutDashboardIcon,
    ListChecksIcon,
    type LucideIcon,
    MegaphoneIcon,
    MessageCircleIcon,
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

export type NavItem = {
    label: string;
    icon: LucideIcon;
    href?: string; // undefined = module not released yet
    permission?: PermissionKey;
};
export type NavSection = { title: string; items: NavItem[] };

/** Same information architecture as the prototype; modules ship phase by phase. */
export const NAV: NavSection[] = [
    {
        title: 'Workspace',
        items: [
            { label: 'Dashboard', icon: LayoutDashboardIcon, href: '/dashboard' },
            { label: 'Team Inbox', icon: InboxIcon, href: '/inbox', permission: P.InboxView },
            { label: 'Contacts & CRM', icon: ContactIcon, href: '/contacts', permission: P.ContactsView },
        ],
    },
    {
        title: 'Automate',
        items: [
            { label: 'Web Chatbot', icon: MessageCircleIcon },
            { label: 'Chatbots & Flows', icon: BotIcon },
            { label: 'Automations', icon: ZapIcon },
        ],
    },
    {
        title: 'Grow',
        items: [
            { label: 'Campaigns', icon: MegaphoneIcon, permission: P.CampaignsView },
            { label: 'Templates', icon: FileTextIcon, href: '/templates', permission: P.TemplatesView },
            { label: 'Commerce', icon: ShoppingCartIcon },
            { label: 'Analytics', icon: BarChart3Icon, permission: P.AnalyticsView },
        ],
    },
    {
        title: 'Account',
        items: [
            { label: 'Channels', icon: PhoneIcon, href: '/channels', permission: P.ChannelsView },
            { label: 'Team & Roles', icon: UsersIcon, href: '/team', permission: P.TeamView },
            { label: 'Compliance', icon: ShieldCheckIcon },
            { label: 'Integrations', icon: PlugIcon },
            { label: 'Developer', icon: CodeIcon },
            { label: 'Billing', icon: CreditCardIcon, href: '/settings?tab=plan', permission: P.BillingView },
            { label: 'Settings', icon: SettingsIcon, href: '/settings', permission: P.SettingsView },
            { label: 'Audit log', icon: ListChecksIcon, href: '/audit-log', permission: P.AuditView },
        ],
    },
];
