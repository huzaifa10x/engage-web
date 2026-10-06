'use client';

import { useQueryClient } from '@tanstack/react-query';
import { MailIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { FormError } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { api, ApiError, errorMessage } from '@/lib/api';
import { keys, useMe } from '@/lib/queries';

const LENGTH = 6;

const firstError = (e: unknown) => (e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? e.message) : errorMessage(e));

/**
 * Shown right after registration (and after signing in with an unverified account): enter the
 * 6-digit code we emailed. A correct code verifies the account and goes straight into the app,
 * because the session is already signed in.
 */
export default function VerifyEmailPage() {
    const router = useRouter();
    const qc = useQueryClient();
    const me = useMe();
    const [digits, setDigits] = useState<string[]>(() => Array<string>(LENGTH).fill(''));
    const [error, setError] = useState<string | null>(null);
    const [verifying, setVerifying] = useState(false);
    const [sending, setSending] = useState(false);
    const [wait, setWait] = useState(60); // seconds until another code may be requested
    const inputs = useRef<(HTMLInputElement | null)[]>([]);

    const unauthenticated = me.error instanceof ApiError && me.error.status === 401;
    const verified = me.data?.user.email_verified === true;

    useEffect(() => {
        if (unauthenticated) router.replace('/login?next=/verify-email');
        else if (verified) router.replace(me.data?.active_tenant_id ? '/dashboard' : '/select-workspace');
    }, [unauthenticated, verified, me.data?.active_tenant_id, router]);

    useEffect(() => {
        if (wait <= 0) return;
        const timer = setTimeout(() => setWait((w) => w - 1), 1000);

        return () => clearTimeout(timer);
    }, [wait]);

    const submit = async (code: string) => {
        setVerifying(true);
        setError(null);
        try {
            await api('auth/email/verify', { method: 'POST', body: { code } });
            toast.success('Email verified. Welcome to 10X Engage!');
            await qc.invalidateQueries({ queryKey: keys.me }); // the redirect above takes over once /me says "verified"
        } catch (e) {
            setError(firstError(e));
            setDigits(Array<string>(LENGTH).fill(''));
            inputs.current[0]?.focus();
        } finally {
            setVerifying(false);
        }
    };

    /** Accepts typing, and a whole code pasted into any box. */
    const change = (index: number, raw: string) => {
        const clean = raw.replace(/\D/g, '');
        if (clean === '' && raw !== '') return;
        const next = [...digits];
        if (clean.length <= 1) {
            next[index] = clean;
        } else {
            clean
                .slice(0, LENGTH - index)
                .split('')
                .forEach((d, i) => (next[index + i] = d));
        }
        setDigits(next);
        setError(null);

        const filled = next.findIndex((d) => d === '');
        inputs.current[filled === -1 ? LENGTH - 1 : filled]?.focus();
        if (filled === -1) void submit(next.join(''));
    };

    const resend = async () => {
        setSending(true);
        setError(null);
        try {
            const res = await api<{ data: { retry_in: number } }>('auth/email/resend', { method: 'POST' });
            setWait(res.data.retry_in || 60);
            setDigits(Array<string>(LENGTH).fill(''));
            inputs.current[0]?.focus();
            toast.success('A new code is on its way');
        } catch (e) {
            setError(firstError(e));
        } finally {
            setSending(false);
        }
    };

    const signOut = async () => {
        await api('auth/logout', { method: 'POST' }).catch(() => undefined);
        qc.clear();
        router.replace('/register');
    };

    if (!me.data || verified) {
        return <p className="text-sm text-muted-foreground">One moment…</p>;
    }

    return (
        <div className="grid gap-5">
            <MailIcon className="size-9 text-primary" />
            <div>
                <h1 className="text-xl font-semibold">Enter your verification code</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    We sent a 6-digit code to <span className="font-medium text-foreground">{me.data.user.email}</span>. It expires in 10 minutes.
                </p>
            </div>
            <FormError message={error} />
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    if (digits.every(Boolean)) void submit(digits.join(''));
                }}
                className="grid gap-4"
            >
                <div className="flex justify-between gap-2" role="group" aria-label="Verification code">
                    {digits.map((digit, i) => (
                        <input
                            key={i}
                            ref={(el) => {
                                inputs.current[i] = el;
                            }}
                            value={digit}
                            onChange={(e) => change(i, e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Backspace' && !digit && i > 0) inputs.current[i - 1]?.focus();
                            }}
                            onFocus={(e) => e.target.select()}
                            inputMode="numeric"
                            autoComplete={i === 0 ? 'one-time-code' : 'off'}
                            autoFocus={i === 0}
                            maxLength={LENGTH}
                            disabled={verifying}
                            aria-label={`Digit ${i + 1}`}
                            className="h-12 w-full min-w-0 rounded-md border border-input bg-card text-center font-mono text-xl outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:opacity-60"
                        />
                    ))}
                </div>
                <Button type="submit" disabled={verifying || !digits.every(Boolean)}>
                    {verifying ? 'Verifying…' : 'Verify and continue'}
                </Button>
            </form>
            <div className="grid gap-1 text-[13px] text-muted-foreground">
                <p>
                    Didn’t get it? Check your spam folder, or{' '}
                    <button
                        type="button"
                        onClick={resend}
                        disabled={wait > 0 || sending}
                        className="font-semibold text-foreground underline-offset-2 hover:underline disabled:font-normal disabled:text-muted-foreground disabled:no-underline"
                    >
                        {sending ? 'sending…' : wait > 0 ? `send a new code in ${wait}s` : 'send a new code'}
                    </button>
                    .
                </p>
                <p>
                    Wrong email address?{' '}
                    <button type="button" onClick={signOut} className="font-semibold text-foreground underline-offset-2 hover:underline">
                        Start again
                    </button>
                    .
                </p>
            </div>
        </div>
    );
}
