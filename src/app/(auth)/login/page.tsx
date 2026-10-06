'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Field, FormError } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OtpForm } from '@/components/app/otp-form';
import { api, ApiError, errorMessage } from '@/lib/api';
import { applyServerErrors } from '@/lib/form';
import { safeNext } from '@/lib/navigation';
import { keys } from '@/lib/queries';
import type { Me } from '@/lib/types';

const schema = z.object({
    email: z.string().trim().email('Enter a valid email address.'),
    password: z.string().min(1, 'Enter your password.'),
    remember: z.boolean(),
});
type Values = z.infer<typeof schema>;

type CodeStep = { otp_required: true; email: string; retry_in: number; expires_in: number };

function LoginForm() {
    const router = useRouter();
    const params = useSearchParams();
    const qc = useQueryClient();
    const [formError, setFormError] = useState<string | null>(null);
    const next = safeNext(params.get('next'));

    const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '', remember: true } });
    const { register, control, handleSubmit, setError, formState } = form;

    const [codeStep, setCodeStep] = useState<CodeStep | null>(null);

    const enter = (me: Me) => {
        qc.setQueryData(keys.me, me);
        if (!me.user.email_verified && !next.startsWith('/invitations')) router.replace('/verify-email');
        else router.replace(me.active_tenant_id || next.startsWith('/invitations') ? next : '/select-workspace');
    };

    const onSubmit = handleSubmit(async (values) => {
        setFormError(null);
        try {
            const res = await api<{ data: Me | CodeStep }>('auth/login', { method: 'POST', body: values });
            // Password accepted. Unless this browser was verified in the last 24 hours, a code was emailed.
            if ('otp_required' in res.data) setCodeStep(res.data);
            else enter(res.data);
        } catch (e) {
            setFormError(applyServerErrors(e, setError, ['email', 'password']));
        }
    });

    if (codeStep) {
        return (
            <>
                <h1 className="text-2xl font-semibold tracking-tight">Enter your sign-in code</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    We emailed a 6-digit code to <span className="font-medium text-foreground">{codeStep.email}</span>. It expires in 10 minutes.
                </p>
                <div className="mt-8">
                    <OtpForm
                        submitLabel="Verify and sign in"
                        initialWait={codeStep.retry_in}
                        onSubmit={async (code) => {
                            try {
                                enter((await api<{ data: Me }>('auth/login/verify', { method: 'POST', body: { code } })).data);

                                return null;
                            } catch (e) {
                                return e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? e.message) : errorMessage(e);
                            }
                        }}
                        onResend={async () => {
                            try {
                                return { wait: (await api<{ data: CodeStep }>('auth/login/resend', { method: 'POST' })).data.retry_in };
                            } catch (e) {
                                return { error: e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? e.message) : errorMessage(e) };
                            }
                        }}
                    />
                </div>
                <p className="mt-6 text-sm text-muted-foreground">
                    <button type="button" onClick={() => setCodeStep(null)} className="font-semibold text-foreground hover:underline">
                        Use a different account
                    </button>
                </p>
                <p className="mt-2 text-[12.5px] text-muted-foreground">
                    After you verify, this browser stays signed in for 24 hours without asking for another code.
                </p>
            </>
        );
    }

    return (
        <>
            <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">Welcome back. Sign in to your workspace.</p>

            <form onSubmit={onSubmit} className="mt-8 grid gap-4" noValidate>
                <FormError message={formError} />
                <Field label="Email" htmlFor="email" error={formState.errors.email?.message}>
                    <Input id="email" type="email" autoComplete="email" autoFocus aria-invalid={!!formState.errors.email} {...register('email')} />
                </Field>
                <Field label="Password" htmlFor="password" error={formState.errors.password?.message}>
                    <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!formState.errors.password} {...register('password')} />
                </Field>
                <div className="flex items-center gap-2">
                    <Controller
                        control={control}
                        name="remember"
                        render={({ field }) => <Checkbox id="remember" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />}
                    />
                    <Label htmlFor="remember" className="font-normal text-muted-foreground">
                        Keep me signed in
                    </Label>
                    <Link href="/forgot-password" className="ml-auto text-sm font-semibold text-brand-600 hover:underline">
                        Forgot password?
                    </Link>
                </div>
                <Button type="submit" disabled={formState.isSubmitting} className="mt-2">
                    {formState.isSubmitting ? 'Signing in…' : 'Sign in'}
                </Button>
            </form>

            <p className="mt-6 text-sm text-muted-foreground">
                New to 10X Engage?{' '}
                <Link
                    href={`/register${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`}
                    className="font-semibold text-brand-600 hover:underline"
                >
                    Create a workspace
                </Link>
            </p>
        </>
    );
}

export default function LoginPage() {
    return (
        <Suspense>
            <LoginForm />
        </Suspense>
    );
}
