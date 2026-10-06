'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Field, FormError } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { COUNTRIES, guessCountry } from '@/lib/countries';
import { applyServerErrors } from '@/lib/form';
import { safeNext } from '@/lib/navigation';
import { keys } from '@/lib/queries';
import type { Me } from '@/lib/types';

// Mirrors RegisterRequest: min 10, mixed case, numbers.
const schema = z
    .object({
        name: z.string().trim().min(1, 'Enter your name.').max(120),
        company_name: z.string().trim().min(1, 'Enter your company name.').max(120),
        country: z.string().length(2, 'Choose your country.'),
        email: z.string().trim().email('Enter a valid email address.').max(190),
        password: z
            .string()
            .min(10, 'Use at least 10 characters.')
            .regex(/[a-z]/, 'Add a lowercase letter.')
            .regex(/[A-Z]/, 'Add an uppercase letter.')
            .regex(/\d/, 'Add a number.'),
        password_confirmation: z.string(),
    })
    .refine((v) => v.password === v.password_confirmation, { path: ['password_confirmation'], message: 'Passwords do not match.' });
type Values = z.infer<typeof schema>;
const FIELDS = ['name', 'company_name', 'country', 'email', 'password', 'password_confirmation'] as const;

function RegisterForm() {
    const router = useRouter();
    const params = useSearchParams();
    const qc = useQueryClient();
    const [formError, setFormError] = useState<string | null>(null);
    const { register, handleSubmit, setError, formState } = useForm<Values>({
        resolver: zodResolver(schema),
        defaultValues: { name: '', company_name: '', country: guessCountry(), email: '', password: '', password_confirmation: '' },
    });
    const e = formState.errors;

    const onSubmit = handleSubmit(async (values) => {
        setFormError(null);
        try {
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const res = await api<{ data: Me }>('auth/register', { method: 'POST', body: { ...values, timezone } });
            qc.setQueryData(keys.me, res.data);
            // The account exists; it becomes usable once the emailed code is entered on the next screen.
            router.replace('/verify-email');
        } catch (err) {
            setFormError(applyServerErrors(err, setError, FIELDS));
        }
    });

    return (
        <>
            <h1 className="text-2xl font-semibold tracking-tight">Create your workspace</h1>
            <p className="mt-1 text-sm text-muted-foreground">Start a 14-day Pro trial. No card required.</p>

            <form onSubmit={onSubmit} className="mt-8 grid gap-4" noValidate>
                <FormError message={formError} />
                <Field label="Your name" htmlFor="name" error={e.name?.message}>
                    <Input id="name" autoComplete="name" autoFocus aria-invalid={!!e.name} {...register('name')} />
                </Field>
                <Field label="Company name" htmlFor="company_name" error={e.company_name?.message}>
                    <Input id="company_name" autoComplete="organization" aria-invalid={!!e.company_name} {...register('company_name')} />
                </Field>
                <Field label="Country" htmlFor="country" error={e.country?.message} hint="Used for billing. UAE businesses are charged 5% VAT on paid plans.">
                    <select
                        id="country"
                        autoComplete="country"
                        aria-invalid={!!e.country}
                        className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
                        {...register('country')}
                    >
                        <option value="">Choose your country</option>
                        {COUNTRIES.map((c) => (
                            <option key={c.code} value={c.code}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="Work email" htmlFor="email" error={e.email?.message}>
                    <Input id="email" type="email" autoComplete="email" aria-invalid={!!e.email} {...register('email')} />
                </Field>
                <Field
                    label="Password"
                    htmlFor="password"
                    error={e.password?.message}
                    hint="At least 10 characters with upper and lower case letters and a number."
                >
                    <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!e.password} {...register('password')} />
                </Field>
                <Field label="Confirm password" htmlFor="password_confirmation" error={e.password_confirmation?.message}>
                    <Input
                        id="password_confirmation"
                        type="password"
                        autoComplete="new-password"
                        aria-invalid={!!e.password_confirmation}
                        {...register('password_confirmation')}
                    />
                </Field>
                <Button type="submit" disabled={formState.isSubmitting} className="mt-2">
                    {formState.isSubmitting ? 'Creating workspace…' : 'Create workspace'}
                </Button>
                <p className="text-[12px] text-muted-foreground">By continuing you agree to the Terms of Service and Privacy Policy.</p>
            </form>

            <p className="mt-6 text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link
                    href={`/login${params.get('next') ? `?next=${encodeURIComponent(safeNext(params.get('next')))}` : ''}`}
                    className="font-semibold text-primary hover:underline"
                >
                    Sign in
                </Link>
            </p>
        </>
    );
}

export default function RegisterPage() {
    return (
        <Suspense>
            <RegisterForm />
        </Suspense>
    );
}
