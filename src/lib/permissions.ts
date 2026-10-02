/** Mirrors App\Domain\Access\Permission. '*' = every permission (Owner). */
export const P = {
    InboxView: 'inbox.view',
    InboxReply: 'inbox.reply',
    InboxAssign: 'inbox.assign',
    ContactsView: 'contacts.view',
    ContactsCreate: 'contacts.create',
    ContactsUpdate: 'contacts.update',
    ContactsDelete: 'contacts.delete',
    CampaignsView: 'campaigns.view',
    TemplatesView: 'templates.view',
    TemplatesCreate: 'templates.create',
    TemplatesSubmit: 'templates.submit',
    ChannelsView: 'channels.view',
    ChannelsManage: 'channels.manage',
    AnalyticsView: 'analytics.view',
    TeamView: 'team.view',
    TeamManage: 'team.manage',
    BillingView: 'billing.view',
    SettingsView: 'settings.view',
    SettingsManage: 'settings.manage',
    AuditView: 'audit.view',
} as const;

export type PermissionKey = (typeof P)[keyof typeof P];

export function can(permissions: string[] | undefined, permission: PermissionKey): boolean {
    if (!permissions) return false;

    return permissions.includes('*') || permissions.includes(permission);
}
