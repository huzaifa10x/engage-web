'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';

import { Field, FormError } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiError, errorMessage } from '@/lib/api';

function ResetPassword() {
    const params = useSearchParams();
    const router = useRouter();
    const token = params.get('token') ?? '';
    const email = params.get('email') ?? '';
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmation) return setErrors({ password_confirmation: ['The two passwords do not match.'] });
        setBusy(true);
        setErrors({});
        setError(null);
        try {
            await api('auth/reset-password', { method: 'POST', body: { email, token, password, password_confirmation: confirmation } });
            toast.success('Password changed. Sign in with your new password.');
            router.replace('/login');
        } catch (err) {
            if (err instanceof ApiError && Object.keys(err.fields).length) {
                setErrors(err.fields);
                setError(err.fields.email?.[0] ?? null);
            } else {
                setError(errorMessage(err));
            }
        } finally {
            setBusy(false);
        }
    };

    if (!token || !email) {
        return (
            <div className="grid gap-3">
                <h1 className="text-xl font-semibold">This link is incomplete</h1>
                <p className="text-sm text-muted-foreground">Open the link from the email again, or ask for a new one.</p>
                <Link href="/forgot-password" className="text-sm font-semibold hover:underline">
                    Send a new reset link
                </Link>
            </div>
        );
    }

    return (
        <form onSubmit={submit} className="grid gap-4" noValidate>
            <div>
                <h1 className="text-xl font-semibold">Choose a new password</h1>
                <p className="mt-1 text-sm text-muted-foreground">For {email}</p>
            </div>
            <FormError message={error} />
            <Field
                label="New password"
                htmlFor="rp-password"
                error={errors.password?.[0]}
                hint="At least 10 characters, with upper and lower case letters and a number."
            >
                <Input id="rp-password" type="password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="Repeat new password" htmlFor="rp-confirm" error={errors.password_confirmation?.[0]}>
                <Input id="rp-confirm" type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
            </Field>
            <Button type="submit" disabled={busy || !password || !confirmation}>
                {busy ? 'Saving…' : 'Change password'}
            </Button>
            {error && (
                <Link href="/forgot-password" className="text-sm font-semibold hover:underline">
                    Send a new reset link
                </Link>
            )}
        </form>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense>
            <ResetPassword />
        </Suspense>
    );
}
