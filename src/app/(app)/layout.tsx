'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { AppShell } from '@/components/app/app-shell';
import { CenteredCard } from '@/components/app/centered-card';
import { SessionProvider } from '@/components/app/session';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, errorMessage } from '@/lib/api';
import { useMe } from '@/lib/queries';

/**
 * Auth + tenant gate for every workspace page. Laravel is the source of truth: /me says who
 * the user is, which workspace is active, and what they may do there.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
    const me = useMe();
    const router = useRouter();
    const pathname = usePathname();

    const unauthenticated = me.error instanceof ApiError && me.error.status === 401;
    const unverified = me.data ? !me.data.user.email_verified : false;
    const needsWorkspace = me.data && !me.data.active_tenant_id;

    useEffect(() => {
        if (unauthenticated) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        // The API refuses every workspace request until the email is verified; send them to the notice.
        else if (unverified) router.replace('/verify-email');
        else if (needsWorkspace) router.replace('/select-workspace');
    }, [unauthenticated, unverified, needsWorkspace, router, pathname]);

    if (me.data && me.data.active_tenant_id && !unverified) {
        return (
            <SessionProvider me={me.data}>
                <AppShell>{children}</AppShell>
            </SessionProvider>
        );
    }

    if (me.error && !unauthenticated) {
        return (
            <CenteredCard>
                <h1 className="text-lg font-semibold">We could not load your workspace</h1>
                <p className="mt-1 text-sm text-muted-foreground">{errorMessage(me.error)}</p>
                <Button className="mt-4" onClick={() => me.refetch()}>
                    Try again
                </Button>
            </CenteredCard>
        );
    }

    return (
        <div className="flex min-h-dvh">
            <div className="hidden w-64 bg-sidebar lg:block" />
            <div className="flex-1 p-8">
                <Skeleton className="h-8 w-56" />
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                    <Skeleton className="h-28" />
                    <Skeleton className="h-28" />
                    <Skeleton className="h-28" />
                </div>
            </div>
        </div>
    );
}
