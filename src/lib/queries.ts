'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './api';
import type {
    AuditEntry,
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
    useQuery({ queryKey: keys.accounts, queryFn: () => api<Data<WabaAccount[]>>('whatsapp/accounts').then((r) => r.data), enabled });

export const usePhoneNumbers = () =>
    useQuery({ queryKey: keys.numbers, queryFn: () => api<Data<PhoneNumber[]>>('phone-numbers').then((r) => r.data), staleTime: 30_000 });

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
