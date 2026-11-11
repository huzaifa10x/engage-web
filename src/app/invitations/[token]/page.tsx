'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MailCheckIcon, MailXIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { CenteredCard } from '@/components/app/centered-card';
import { InviteSignupForm } from '@/components/auth/invite-signup-form';
import { FormError } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError, errorMessage } from '@/lib/api';
import { keys, useMe } from '@/lib/queries';
import type { Membership } from '@/lib/types';

type InvitationPreview = {
    status: 'pending' | 'accepted' | 'revoked' | 'expired';
    workspace: string;
    role: string | null;
    invited_by: string | null;
    /** Masked, e.g. "wa•••@example.com". */
    invited_email: string;
    expires_at: string;
    /** Signed in: whether this account is the invited one. null when signed out. */
    for_you: boolean | null;
    /** Signed out: whether the invited address already has an account (sign in) or not (short sign-up). */
    has_account?: boolean | null;
};

const CLOSED: Record<Exclude<InvitationPreview['status'], 'pending'>, string> = {
    accepted: 'This invitation has already been used. If it was you, open the workspace from your account.',
    revoked: 'This invitation was cancelled by the workspace. Ask them to send a new one.',
    expired: 'This invitation has expired. Ask the workspace to send a new one.',
};

/**
 * The link in the invitation email. Shows which workspace and which (masked) address the invitation
 * is for before anything else, so a person signed in with another account is told so — with a way
 * to switch — instead of a generic "no longer valid".
 */
export default function AcceptInvitationPage() {
    const { token } = useParams<{ token: string }>();
    const router = useRouter();
    const qc = useQueryClient();
    const me = useMe();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const signedOut = me.error instanceof ApiError && me.error.status === 401;
    const invitation = useQuery({
        queryKey: ['invitation', token, me.data?.user.id ?? null],
        queryFn: () => api<{ data: InvitationPreview }>(`invitations/${token}`).then((r) => r.data),
        enabled: !me.isLoading,
        retry: false,
    });
    const next = encodeURIComponent(`/invitations/${token}`);
    const inv = invitation.data;

    const accept = async () => {
        setPending(true);
        setError(null);
        try {
            const res = await api<{ data: Membership }>(`invitations/${token}/accept`, { method: 'POST' });
            qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
            await qc.invalidateQueries({ queryKey: keys.me });
            router.replace(res.data ? '/dashboard' : '/select-workspace');
        } catch (e) {
            // The server says exactly which check failed (expired, revoked, used, other email).
            setError(errorMessage(e));
            void invitation.refetch();
        } finally {
            setPending(false);
        }
    };

    const switchAccount = async () => {
        await api('auth/logout', { method: 'POST' }).catch(() => undefined);
        qc.clear();
        router.replace(`/login?next=${next}`);
    };

    if (me.isLoading || invitation.isLoading) {
        return (
            <CenteredCard>
                <Skeleton className="h-32" />
            </CenteredCard>
        );
    }

    if (invitation.isError || !inv || inv.status !== 'pending') {
        const message = inv && inv.status !== 'pending' ? CLOSED[inv.status] : errorMessage(invitation.error);

        return (
            <CenteredCard>
                <div className="mb-4 inline-flex size-11 items-center justify-center rounded-full bg-bad-bg text-bad">
                    <MailXIcon className="size-5" />
                </div>
                <h1 className="text-xl font-semibold">This invitation can’t be used</h1>
                <p className="mt-1 text-sm text-muted-foreground">{message}</p>
                <div className="mt-6 grid gap-2">
                    <Button asChild variant="outline">
                        <Link href={signedOut ? '/login' : '/dashboard'}>{signedOut ? 'Sign in' : 'Go to my workspace'}</Link>
                    </Button>
                </div>
            </CenteredCard>
        );
    }

    return (
        <CenteredCard>
            <div className="mb-4 inline-flex size-11 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <MailCheckIcon className="size-5" />
            </div>
            <h1 className="text-xl font-semibold">Join {inv.workspace}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
                {inv.invited_by ?? 'The workspace'} invited <span className="font-semibold text-foreground">{inv.invited_email}</span> to join as{' '}
                {inv.role ?? 'a member'}.
            </p>

            {signedOut && inv.has_account === false ? (
                <>
                    {/* No account yet: name, password and the terms — no workspace to create, no separate email check. */}
                    <p className="mt-3 text-sm text-muted-foreground">Create your account to join. You’ll sign in with the invited email address.</p>
                    <InviteSignupForm token={token} workspace={inv.workspace} onAccountExists={() => void invitation.refetch()} />
                    <p className="mt-6 text-sm text-muted-foreground">
                        Already have an account?{' '}
                        <Link href={`/login?next=${next}`} className="font-semibold text-brand-600 hover:underline">
                            Sign in
                        </Link>
                    </p>
                </>
            ) : signedOut ? (
                <>
                    <p className="mt-3 text-sm text-muted-foreground">
                        You already have an account with this email address. Sign in, then accept the invitation.
                    </p>
                    <div className="mt-6 grid gap-2">
                        <Button asChild>
                            <Link href={`/login?next=${next}`}>Sign in to accept</Link>
                        </Button>
                    </div>
                </>
            ) : inv.for_you === false ? (
                <>
                    <p className="mt-3 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">
                        You’re signed in as <span className="font-semibold">{me.data?.user.email}</span>, but this invitation was sent to{' '}
                        <span className="font-semibold">{inv.invited_email}</span>. Sign in with that address to accept it.
                    </p>
                    <div className="mt-6 grid gap-2">
                        <Button onClick={switchAccount}>Sign out and switch account</Button>
                        <Button asChild variant="ghost">
                            <Link href="/dashboard">Not now</Link>
                        </Button>
                    </div>
                </>
            ) : (
                <>
                    <p className="mt-3 text-sm text-muted-foreground">
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
