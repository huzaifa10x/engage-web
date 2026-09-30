'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api';

const PUBLIC_PATHS = ['/login', '/register', '/impersonate', '/invitations', '/deletion-status', '/select-workspace'];

/**
 * Cross-cutting API outcomes handled once, not per page:
 *   401 unauthenticated          → /login?next=…
 *   tenant_selection_required    → /select-workspace
 */
function handleGlobalError(error: unknown) {
    if (!(error instanceof ApiError) || typeof window === 'undefined') return;

    const path = window.location.pathname;
    const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

    // Outside React (query cache callback), and a hard navigation is intended: it discards every
    // cached query that belonged to the previous session / workspace.
    if (error.status === 401 && !isPublic) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`/login?next=${encodeURIComponent(path + window.location.search)}`);
    } else if ((error.code === 'tenant_selection_required' || error.code === 'tenant_required') && path !== '/select-workspace') {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign('/select-workspace');
    }
}

export function Providers({ children }: { children: React.ReactNode }) {
    const [client] = useState(
        () =>
            new QueryClient({
                queryCache: new QueryCache({ onError: handleGlobalError }),
                mutationCache: new MutationCache({ onError: handleGlobalError }),
                defaultOptions: {
                    queries: {
                        refetchOnWindowFocus: false,
                        retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
                    },
                    mutations: { retry: false },
                },
            }),
    );

    return (
        <QueryClientProvider client={client}>
            <TooltipProvider>
                {children}
                <Toaster />
            </TooltipProvider>
        </QueryClientProvider>
    );
}
