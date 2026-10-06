'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Field, FormError } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await api('auth/forgot-password', { method: 'POST', body: { email: email.trim() } });
            setSent(true);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="grid gap-5">
            <div>
                <h1 className="text-xl font-semibold">Reset your password</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    {sent
                        ? `If ${email.trim()} has an account, a reset link is on its way. It works for 5 minutes, so use it straight away.`
                        : 'Enter your email and we will send you a link to choose a new password.'}
                </p>
            </div>
            {!sent && (
                <form onSubmit={submit} className="grid gap-4" noValidate>
                    <FormError message={error} />
                    <Field label="Email" htmlFor="fp-email">
                        <Input id="fp-email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </Field>
                    <Button type="submit" disabled={busy || !email.trim()}>
                        {busy ? 'Sending…' : 'Send reset link'}
                    </Button>
                </form>
            )}
            <p className="text-sm text-muted-foreground">
                <Link href="/login" className="font-semibold text-foreground hover:underline">
                    Back to sign in
                </Link>
            </p>
        </div>
    );
}
