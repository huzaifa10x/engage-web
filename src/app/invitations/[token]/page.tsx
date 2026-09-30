'use client';

import { useQueryClient } from '@tanstack/react-query';
import { MailCheckIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { CenteredCard } from '@/components/app/centered-card';
import { FormError } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError, errorMessage } from '@/lib/api';
import { keys, useMe } from '@/lib/queries';
import type { Membership } from '@/lib/types';

export default function AcceptInvitationPage() {
    const { token } = useParams<{ token: string }>();
    const router = useRouter();
    const qc = useQueryClient();
    const me = useMe();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const signedOut = me.error instanceof ApiError && me.error.status === 401;
    const next = encodeURIComponent(`/invitations/${token}`);

    const accept = async () => {
        setPending(true);
        setError(null);
        try {
            const res = await api<{ data: Membership }>(`invitations/${token}/accept`, { method: 'POST' });
            qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
            await qc.invalidateQueries({ queryKey: keys.me });
            router.replace(res.data ? '/dashboard' : '/select-workspace');
        } catch (e) {
            setError(
                e instanceof ApiError && e.code === 'invitation_invalid'
                    ? 'This invitation is no longer valid. It may have expired, been revoked, or been sent to a different email address.'
                    : errorMessage(e),
            );
        } finally {
            setPending(false);
        }
    };

    return (
        <CenteredCard>
            <div className="mb-4 inline-flex size-11 items-center justify-center rounded-full bg-brand-50 text-primary">
                <MailCheckIcon className="size-5" />
            </div>
            <h1 className="text-xl font-semibold">You have been invited</h1>

            {me.isLoading ? (
                <Skeleton className="mt-4 h-20" />
            ) : signedOut ? (
                <>
                    <p className="mt-1 text-sm text-muted-foreground">Sign in with the email address the invitation was sent to, then accept it.</p>
                    <div className="mt-6 grid gap-2">
                        <Button asChild>
                            <Link href={`/login?next=${next}`}>Sign in to accept</Link>
                        </Button>
                        <Button asChild variant="outline">
                            <Link href={`/register?next=${next}`}>Create an account</Link>
                        </Button>
                    </div>
                </>
            ) : (
                <>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Signed in as <span className="font-semibold text-foreground">{me.data?.user.email}</span>. Accept to join the workspace.
                    </p>
                    <div className="mt-4">
                        <FormError message={error} />
                    </div>
                    <div className="mt-6 grid gap-2">
                        <Button onClick={accept} disabled={pending}>
                            {pending ? 'Joining…' : 'Accept invitation'}
                        </Button>
                        <Button asChild variant="ghost">
                            <Link href="/dashboard">Not now</Link>
                        </Button>
                    </div>
                </>
            )}
        </CenteredCard>
    );
}
