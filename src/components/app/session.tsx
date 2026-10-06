'use client';

import { createContext, useContext } from 'react';

import { can as canDo, type PermissionKey } from '@/lib/permissions';
import type { Me, Membership } from '@/lib/types';

type Session = {
    me: Me;
    membership: Membership;
    can: (permission: PermissionKey) => boolean;
    feature: (key: string) => { enabled: boolean; limit: number | null };
};

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ me, children }: { me: Me; children: React.ReactNode }) {
    const membership = me.memberships.find((m) => m.tenant?.id === me.active_tenant_id) ?? me.memberships[0];
    const value: Session = {
        me,
        membership,
        can: (p) => canDo(me.permissions, p),
        feature: (key) => {
            // Never throw from here: a missing feature simply reads as "not included".
            const e = me.entitlements?.features?.[key];

            return { enabled: e?.enabled ?? false, limit: e?.limit ?? null };
        },
    };

    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Only usable inside the authenticated (app) layout, where a tenant is always active. */
export function useSession(): Session {
    const ctx = useContext(SessionContext);
    if (!ctx) throw new Error('useSession must be used inside the app layout.');

    return ctx;
}
