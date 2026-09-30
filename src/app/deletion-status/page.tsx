'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { CenteredCard } from '@/components/app/centered-card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';

type Status = { confirmation_code: string; status: string; requested_at: string; completed_at: string | null };

/** Public status page for Meta data-deletion requests (linked from the Facebook callback response). */
function DeletionStatus() {
    const code = (useSearchParams().get('code') ?? '').toUpperCase();
    const valid = /^[A-Z0-9]{12}$/.test(code);
    const q = useQuery({
        queryKey: ['deletion-status', code],
        queryFn: () => api<{ data: Status }>(`/api/meta/data-deletion/${code}`).then((r) => r.data),
        enabled: valid,
        retry: false,
    });

    return (
        <CenteredCard>
            <h1 className="text-xl font-semibold">Data deletion request</h1>
            {!valid ? (
                <p className="mt-2 text-sm text-muted-foreground">Missing or invalid confirmation code. Use the link Facebook provided.</p>
            ) : q.isLoading ? (
                <Skeleton className="mt-4 h-24" />
            ) : q.data ? (
                <>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {q.data.status === 'completed'
                            ? '10X Engage no longer holds the Facebook account data linked to this request.'
                            : 'We received your request and are processing it. This usually finishes within minutes.'}
                    </p>
                    <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                        <dt className="text-muted-foreground">Confirmation code</dt>
                        <dd className="font-mono">{q.data.confirmation_code}</dd>
                        <dt className="text-muted-foreground">Status</dt>
                        <dd>
                            <Badge tone={q.data.status === 'completed' ? 'good' : q.data.status === 'failed' ? 'bad' : 'info'}>{q.data.status}</Badge>
                        </dd>
                        <dt className="text-muted-foreground">Requested</dt>
                        <dd>{dateTime(q.data.requested_at)}</dd>
                        {q.data.completed_at && (
                            <>
                                <dt className="text-muted-foreground">Completed</dt>
                                <dd>{dateTime(q.data.completed_at)}</dd>
                            </>
                        )}
                    </dl>
                </>
            ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                    We could not find a request with code <span className="font-mono">{code}</span>. Contact support@10xdigital.ae.
                </p>
            )}
        </CenteredCard>
    );
}

export default function DeletionStatusPage() {
    return (
        <Suspense>
            <DeletionStatus />
        </Suspense>
    );
}
