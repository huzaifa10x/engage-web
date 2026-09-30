'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ShieldAlertIcon } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

import { CenteredCard } from '@/components/app/centered-card';
import { api, errorMessage } from '@/lib/api';
import { keys } from '@/lib/queries';
import type { Me } from '@/lib/types';

/** Landing page for Super Admin "Log in as" — exchanges the one-time token for a support session. */
function Impersonate() {
    const router = useRouter();
    const params = useSearchParams();
    const qc = useQueryClient();
    const [requestError, setRequestError] = useState<string | null>(null);
    const started = useRef(false);
    const token = params.get('token') ?? '';
    const error = token.length !== 64 ? 'This support link is invalid.' : requestError;

    useEffect(() => {
        if (started.current || token.length !== 64) return;
        started.current = true;

        api<{ data: Me }>('auth/impersonation', { method: 'POST', body: { token } })
            .then((res) => {
                qc.clear();
                qc.setQueryData(keys.me, res.data);
                router.replace('/dashboard');
            })
            .catch((e) => setRequestError(errorMessage(e, 'This support link has expired or was already used.')));
    }, [token, qc, router]);

    return (
        <CenteredCard>
            <div className="mb-4 inline-flex size-11 items-center justify-center rounded-full bg-warn-bg text-warn">
                <ShieldAlertIcon className="size-5" />
            </div>
            <h1 className="text-xl font-semibold">{error ? 'Could not start support session' : 'Starting support session…'}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
                {error ?? 'Signing you in to the customer workspace. Every action is recorded in their audit log.'}
            </p>
        </CenteredCard>
    );
}

export default function ImpersonatePage() {
    return (
        <Suspense>
            <Impersonate />
        </Suspense>
    );
}
