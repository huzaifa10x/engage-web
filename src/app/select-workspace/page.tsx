'use client';

import { ArrowRightIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { CenteredCard } from '@/components/app/centered-card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, errorMessage } from '@/lib/api';
import { useMe, useSwitchTenant } from '@/lib/queries';

export default function SelectWorkspacePage() {
    const router = useRouter();
    const me = useMe();
    const { refetch } = me;
    const switchTenant = useSwitchTenant();

    useEffect(() => {
        if (me.error instanceof ApiError && me.error.status === 401) router.replace('/login?next=/select-workspace');
    }, [me.error, router]);

    const memberships = (me.data?.memberships ?? []).filter((m) => m.status === 'active' && m.tenant?.status !== 'suspended');
    // Anything but "not signed in" (which redirects above): a server error, an overloaded server, a rate limit.
    const failed = me.isError && !(me.error instanceof ApiError && me.error.status === 401);

    // Come back by itself once the server answers again.
    useEffect(() => {
        if (!failed) return;
        const timer = setInterval(() => void refetch(), 8000);

        return () => clearInterval(timer);
    }, [failed, refetch]);

    // Only one workspace to choose from: open it instead of asking.
    const only = !failed && memberships.length === 1 ? (memberships[0].tenant?.id ?? null) : null;
    const opened = useRef(false);
    useEffect(() => {
        if (only !== null && !opened.current && me.data?.active_tenant_id !== only) {
            opened.current = true;
            switchTenant.mutate(only, { onSuccess: () => router.replace('/dashboard') });
        } else if (only !== null && me.data?.active_tenant_id === only && !opened.current) {
            opened.current = true;
            router.replace('/dashboard');
        }
    }, [only, me.data?.active_tenant_id, router, switchTenant]);

    const choose = (tenantId: string) =>
        switchTenant.mutate(tenantId, {
            onSuccess: () => router.replace('/dashboard'),
            onError: (e) => toast.error(errorMessage(e)),
        });

    return (
        <CenteredCard>
            <h1 className="text-xl font-semibold">Choose a workspace</h1>
            <p className="mt-1 text-sm text-muted-foreground">
                {failed
                    ? 'We could not load your workspaces.'
                    : memberships.length > 1
                      ? 'You belong to more than one workspace. Pick the one to open.'
                      : 'Pick the workspace to open.'}
            </p>

            <div className="mt-6 grid gap-2">
                {me.isLoading && [0, 1].map((i) => <Skeleton key={i} className="h-14" />)}
                {memberships.map((m) => (
                    <button
                        key={m.id}
                        onClick={() => m.tenant && choose(m.tenant.id)}
                        disabled={switchTenant.isPending}
                        className="flex items-center gap-3 rounded-lg border p-3 text-left transition hover:border-primary hover:bg-brand-50 disabled:opacity-60"
                    >
                        <Avatar name={m.tenant?.name ?? '?'} className="rounded-lg" />
                        <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">{m.tenant?.name}</span>
                            <span className="text-[12.5px] text-muted-foreground">{m.role?.name}</span>
                        </span>
                        {me.data?.active_tenant_id === m.tenant?.id && <Badge tone="brand">Current</Badge>}
                        <ArrowRightIcon className="size-4 text-muted-foreground" />
                    </button>
                ))}
                {failed && (
                    <div role="alert" className="rounded-lg border border-bad/30 bg-bad-bg p-4 text-sm">
                        <p className="font-semibold text-bad">Your workspaces could not be loaded</p>
                        <p className="mt-1 text-ink-2">
                            {me.error instanceof ApiError && me.error.status === 429
                                ? 'Too many requests were made in the last minute. Please wait a moment and try again.'
                                : 'The server did not answer properly. This is usually temporary.'}
                        </p>
                        <Button size="sm" className="mt-3" onClick={() => me.refetch()} disabled={me.isFetching}>
                            {me.isFetching ? 'Trying…' : 'Try again'}
                        </Button>
                    </div>
                )}
                {me.data && memberships.length === 0 && (
                    <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                        You are not an active member of any workspace. Ask an admin to invite you, or create your own workspace.
                    </p>
                )}
            </div>

            <Button variant="ghost" className="mt-4 w-full" onClick={() => router.push('/register')}>
                Create a new workspace
            </Button>
        </CenteredCard>
    );
}
