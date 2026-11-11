'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Field, FormError } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { applyServerErrors } from '@/lib/form';
import { keys } from '@/lib/queries';
import { PRIVACY_PATH, TERMS_PATH, websiteUrl } from '@/lib/site';
import type { Me } from '@/lib/types';

// Same rules as the server (InvitationController::register).
const schema = z.object({
    name: z
        .string()
        .trim()
        .min(1, 'Enter your full name.')
        .max(120)
        .regex(/^\p{L}[\p{L}\p{M}]*(?:[ .'’-]+[\p{L}\p{M}]+)*\.?$/u, 'Use letters only for your name (spaces, dots, apostrophes and hyphens are fine).'),
    password: z
        .string()
        .min(10, 'Use at least 10 characters.')
        .regex(/[a-z]/, 'Add a lowercase letter.')
        .regex(/[A-Z]/, 'Add an uppercase letter.')
        .regex(/\d/, 'Add a number.'),
    accept_terms: z.boolean().refine((v) => v, 'Accept the Terms of Service and Privacy Policy to continue.'),
});
type Values = z.infer<typeof schema>;
const FIELDS = ['name', 'password', 'accept_terms'] as const;

/**
 * The short sign-up for someone invited to a workspace who has no account yet: full name, password
 * and the terms. The email is the invited address; no workspace is created — they join the one that
 * invited them and land on its dashboard.
 */
export function InviteSignupForm({ token, workspace, onAccountExists }: { token: string; workspace: string; onAccountExists: () => void }) {
    const router = useRouter();
    const qc = useQueryClient();
    const [formError, setFormError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const { register, control, handleSubmit, setError, formState } = useForm<Values>({
        resolver: zodResolver(schema),
        defaultValues: { name: '', password: '', accept_terms: false },
    });
    const e = formState.errors;

    const onSubmit = handleSubmit(async (values) => {
        setFormError(null);
        try {
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const res = await api<{ data: Me }>(`invitations/${token}/register`, { method: 'POST', body: { ...values, timezone } });
            qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
            qc.setQueryData(keys.me, res.data);
            router.replace('/dashboard');
        } catch (err) {
            if (err instanceof ApiError && err.details?.reason === 'account_exists') onAccountExists();
            setFormError(applyServerErrors(err, setError, FIELDS));
        }
    });

    return (
        <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate>
            <FormError message={formError} />
            <Field label="Full name" htmlFor="invite-name" error={e.name?.message}>
                <Input id="invite-name" autoComplete="name" autoFocus aria-invalid={!!e.name} {...register('name')} />
            </Field>
            <Field
                label="Password"
                htmlFor="invite-password"
                error={e.password?.message}
                hint="At least 10 characters with upper and lower case letters and a number."
            >
                <div className="relative">
                    <Input
                        id="invite-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        aria-invalid={!!e.password}
                        className="pr-10"
                        {...register('password')}
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                        {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                    </button>
                </div>
            </Field>
            <div className="grid gap-1">
                <div className="flex items-start gap-2.5">
                    <Controller
                        control={control}
                        name="accept_terms"
                        render={({ field }) => (
                            <Checkbox
                                id="invite-terms"
                                className="mt-0.5"
                                checked={field.value}
                                onCheckedChange={(v) => field.onChange(v === true)}
                                aria-invalid={!!e.accept_terms}
                            />
                        )}
                    />
                    <label htmlFor="invite-terms" className="text-[13px] leading-snug text-muted-foreground">
                        I agree to the{' '}
                        <a
                            href={websiteUrl(TERMS_PATH)}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-foreground underline-offset-2 hover:underline"
                        >
                            Terms of Service
                        </a>{' '}
                        and{' '}
                        <a
                            href={websiteUrl(PRIVACY_PATH)}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-foreground underline-offset-2 hover:underline"
                        >
                            Privacy Policy
                        </a>
                        .
                    </label>
                </div>
                {e.accept_terms?.message && <p className="text-[12.5px] text-destructive">{e.accept_terms.message}</p>}
            </div>
            <Button type="submit" disabled={formState.isSubmitting}>
                {formState.isSubmitting ? 'Joining…' : `Join ${workspace}`}
            </Button>
        </form>
    );
}
