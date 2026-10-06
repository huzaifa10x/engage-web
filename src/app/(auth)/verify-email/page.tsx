'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2Icon, MailIcon } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { FormError } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { api, ApiError, errorMessage } from '@/lib/api';
import { keys, useMe } from '@/lib/queries';

/**
 * Two jobs: (1) opened from the link in the email → confirms the address; (2) shown after
 * registration or sign-in while the address is still unconfirmed → "check your inbox" + resend.
 */
function VerifyEmail() {
    const params = useSearchParams();
    const router = useRouter();
    const qc = useQueryClient();
    const me = useMe();
    const id = params.get('id');
    const expires = params.get('expires');
    const token = params.get('token');
    const fromLink = Boolean(id && expires && token);

    const [state, setState] = useState<'idle' | 'verifying' | 'done' | 'failed'>(fromLink ? 'verifying' : 'idle');
    const [error, setError] = useState<string | null>(null);
    const [sending, setSending] = useState(false);
    const started = useRef(false);

    useEffect(() => {
        if (!fromLink || started.current) return;
        started.current = true;
        api('auth/email/verify', { method: 'POST', body: { id, expires: Number(expires), token } })
            .then(() => {
                setState('done');
                void qc.invalidateQueries({ queryKey: keys.me });
            })
            .catch((e: unknown) => {
                setState('failed');
                setError(e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? e.message) : errorMessage(e));
            });
    }, [fromLink, id, expires, token, qc]);

    // Already verified (for example in another tab): nothing to do here.
    const verified = me.data?.user.email_verified === true;
    useEffect(() => {
        if (!fromLink && verified) router.replace('/dashboard');
    }, [fromLink, verified, router]);

    const resend = async () => {
        setSending(true);
        setError(null);
        try {
            await api('auth/email/resend', { method: 'POST' });
            toast.success('Verification email sent');
        } catch (e) {
            setError(e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? e.message) : errorMessage(e));
        } finally {
            setSending(false);
        }
    };

    const signOut = async () => {
        await api('auth/logout', { method: 'POST' }).catch(() => undefined);
        qc.clear();
        router.replace('/login');
    };

    if (state === 'verifying') {
        return <p className="text-sm text-muted-foreground">Confirming your email address…</p>;
    }

    if (state === 'done') {
        return (
            <div className="grid gap-4 text-center">
                <CheckCircle2Icon className="mx-auto size-10 text-good" />
                <div>
                    <h1 className="text-xl font-semibold">Email verified</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Your account is active. You can start using 10X Engage.</p>
                </div>
                <Button onClick={() => router.replace(me.data ? '/dashboard' : '/login')}>{me.data ? 'Go to my workspace' : 'Sign in'}</Button>
            </div>
        );
    }

    const signedIn = Boolean(me.data);

    return (
        <div className="grid gap-4">
            <MailIcon className="size-9 text-primary" />
            <div>
                <h1 className="text-xl font-semibold">{state === 'failed' ? 'This link did not work' : 'Verify your email'}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    {state === 'failed'
                        ? 'The verification link is not valid or has expired.'
                        : signedIn
                          ? `We sent a verification link to ${me.data?.user.email}. Open it to activate your account. You cannot use the app until your email is verified.`
                          : 'Sign in to get a new verification link.'}
                </p>
            </div>
            <FormError message={error} />
            {signedIn ? (
                <>
                    <Button onClick={resend} disabled={sending}>
                        {sending ? 'Sending…' : 'Send the email again'}
                    </Button>
                    <p className="text-[13px] text-muted-foreground">
                        Check your spam folder too. Wrong address?{' '}
                        <button onClick={signOut} className="font-semibold text-foreground underline-offset-2 hover:underline">
                            Sign out
                        </button>{' '}
                        and register again.
                    </p>
                </>
            ) : (
                <Button onClick={() => router.replace('/login?next=/verify-email')}>Sign in</Button>
            )}
        </div>
    );
}

export default function VerifyEmailPage() {
    return (
        <Suspense>
            <VerifyEmail />
        </Suspense>
    );
}
