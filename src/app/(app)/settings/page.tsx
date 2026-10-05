'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { CheckIcon, MinusIcon } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Field, FormError } from '@/components/app/field';
import { Forbidden, PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { BillingPanel } from '@/components/billing/billing-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { applyServerErrors } from '@/lib/form';
import { date, daysUntil, humanize, number } from '@/lib/format';
import { P } from '@/lib/permissions';
import { keys, useEntitlements, useTenant } from '@/lib/queries';
import type { FeatureUsage, Tenant } from '@/lib/types';

const schema = z.object({
    name: z.string().trim().min(1, 'Enter a workspace name.').max(120),
    timezone: z.string().min(1),
    locale: z.enum(['en', 'ar']),
    country: z
        .string()
        .trim()
        .toUpperCase()
        .refine((v) => v === '' || /^[A-Z]{2}$/.test(v), 'Use a 2-letter country code, e.g. AE.'),
    billing_email: z.union([z.literal(''), z.string().trim().email('Enter a valid email address.')]),
});
type Values = z.infer<typeof schema>;
const FIELDS = ['name', 'timezone', 'locale', 'country', 'billing_email'] as const;

function GeneralForm({ tenant, canManage }: { tenant: Tenant; canManage: boolean }) {
    const qc = useQueryClient();
    const [formError, setFormError] = useState<string | null>(null);
    const timezones = useMemo(() => (typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [tenant.timezone]), [tenant.timezone]);
    const { register, control, handleSubmit, setError, reset, formState } = useForm<Values>({
        resolver: zodResolver(schema),
        values: {
            name: tenant.name,
            timezone: tenant.timezone,
            locale: tenant.locale === 'ar' ? 'ar' : 'en',
            country: tenant.country ?? '',
            billing_email: tenant.billing_email ?? '',
        },
    });
    const e = formState.errors;

    const onSubmit = handleSubmit(async (values) => {
        setFormError(null);
        try {
            const res = await api<{ data: Tenant }>('tenant', {
                method: 'PATCH',
                body: { ...values, country: values.country || null, billing_email: values.billing_email || null },
            });
            qc.setQueryData(keys.tenant, res.data);
            void qc.invalidateQueries({ queryKey: keys.me });
            reset(values);
            toast.success('Workspace settings saved');
        } catch (err) {
            setFormError(applyServerErrors(err, setError, FIELDS));
        }
    });

    return (
        <Card>
            <CardHeader>
                <div>
                    <CardTitle>Workspace</CardTitle>
                    <CardDescription>Shown to your team. Timezone drives reports and scheduled campaigns.</CardDescription>
                </div>
            </CardHeader>
            <form onSubmit={onSubmit} noValidate>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                        <FormError message={formError} />
                    </div>
                    <Field label="Workspace name" htmlFor="name" error={e.name?.message} className="sm:col-span-2">
                        <Input id="name" disabled={!canManage} aria-invalid={!!e.name} {...register('name')} />
                    </Field>
                    <Field label="Timezone" htmlFor="timezone" error={e.timezone?.message}>
                        <Controller
                            control={control}
                            name="timezone"
                            render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange} disabled={!canManage}>
                                    <SelectTrigger id="timezone">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-72">
                                        {timezones.map((tz) => (
                                            <SelectItem key={tz} value={tz}>
                                                {tz.replace(/_/g, ' ')}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        />
                    </Field>
                    <Field label="Language" htmlFor="locale" error={e.locale?.message}>
                        <Controller
                            control={control}
                            name="locale"
                            render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange} disabled={!canManage}>
                                    <SelectTrigger id="locale">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="en">English</SelectItem>
                                        <SelectItem value="ar">العربية (Arabic)</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                        />
                    </Field>
                    <Field label="Country" htmlFor="country" error={e.country?.message} hint="2-letter code, e.g. AE">
                        <Input id="country" maxLength={2} className="uppercase" disabled={!canManage} aria-invalid={!!e.country} {...register('country')} />
                    </Field>
                    <Field label="Billing email" htmlFor="billing_email" error={e.billing_email?.message}>
                        <Input id="billing_email" type="email" disabled={!canManage} aria-invalid={!!e.billing_email} {...register('billing_email')} />
                    </Field>
                </CardContent>
                {canManage && (
                    <CardFooter className="justify-end">
                        <Button type="submit" disabled={formState.isSubmitting || !formState.isDirty}>
                            {formState.isSubmitting ? 'Saving…' : 'Save changes'}
                        </Button>
                    </CardFooter>
                )}
            </form>
        </Card>
    );
}

function configSummary(f: FeatureUsage): string | null {
    const c = f.config ?? {};
    const parts = Object.entries(c)
        .filter(([, v]) => typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number')
        .map(([k, v]) => (typeof v === 'boolean' ? `${humanize(k)}: ${v ? 'yes' : 'no'}` : `${humanize(String(v))}`));

    return parts.length ? parts.join(' · ') : null;
}

function PlanUsage() {
    const q = useEntitlements();
    if (q.isLoading) return <Skeleton className="h-64" />;
    if (!q.data) return null;

    const { plan, subscription, features } = q.data;
    const entries = Object.entries(features);
    const limits = entries.filter(([, f]) => f.type === 'limit' || f.type === 'metered');
    const toggles = entries.filter(([, f]) => f.type !== 'limit' && f.type !== 'metered');
    const trialDays = subscription.status === 'trialing' ? daysUntil(subscription.trial_ends_at) : null;

    return (
        <div className="grid gap-4">
            <Card>
                <CardHeader>
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            {plan.name} plan
                            <Badge tone={subscription.status === 'active' ? 'good' : subscription.status === 'trialing' ? 'brand' : 'warn'}>
                                {humanize(subscription.status ?? 'free')}
                            </Badge>
                        </CardTitle>
                        <CardDescription>
                            {trialDays !== null
                                ? `Trial ends ${date(subscription.trial_ends_at)} (${trialDays} day${trialDays === 1 ? '' : 's'} left). You move to the Free plan unless you subscribe.`
                                : 'Messaging fees are billed by Meta directly to your business.'}
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="grid gap-5 sm:grid-cols-2">
                    {limits.map(([key, f]) => {
                        const pct = f.unlimited || !f.limit ? 0 : Math.min(100, Math.round(((f.used ?? 0) / f.limit) * 100));

                        return (
                            <div key={key}>
                                <div className="flex items-baseline justify-between gap-2 text-sm">
                                    <span className="font-medium">{f.label}</span>
                                    <span className="text-muted-foreground tabular-nums">
                                        {!f.enabled
                                            ? 'Not included'
                                            : f.used === null
                                              ? f.unlimited
                                                  ? 'Unlimited'
                                                  : `${number(f.limit)} ${f.unit ?? ''}`
                                              : `${number(f.used)} / ${f.unlimited ? '∞' : number(f.limit)}`}
                                    </span>
                                </div>
                                {f.enabled && f.used !== null && !f.unlimited && (
                                    <Progress value={pct} className="mt-2" indicatorClassName={pct >= 90 ? 'bg-bad' : pct >= 75 ? 'bg-warn' : undefined} />
                                )}
                            </div>
                        );
                    })}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Features</CardTitle>
                </CardHeader>
                <ul className="grid divide-y divide-line-2 sm:grid-cols-2 sm:divide-y-0">
                    {toggles.map(([key, f]) => (
                        <li key={key} className="flex items-start gap-3 px-5 py-3">
                            {f.enabled ? <CheckIcon className="mt-0.5 size-4 text-good" /> : <MinusIcon className="mt-0.5 size-4 text-faint" />}
                            <span className={f.enabled ? undefined : 'text-muted-foreground'}>
                                <span className="block text-sm">{f.label}</span>
                                {f.enabled && configSummary(f) && <span className="block text-[12px] text-muted-foreground">{configSummary(f)}</span>}
                            </span>
                        </li>
                    ))}
                </ul>
            </Card>
        </div>
    );
}

function Settings() {
    const { can } = useSession();
    const router = useRouter();
    const params = useSearchParams();
    const tenant = useTenant();
    const tab = params.get('tab') === 'plan' ? 'plan' : 'general';

    if (!can(P.SettingsView) && !can(P.BillingView)) return <Forbidden />;

    return (
        <>
            <PageHeader title="Settings" description="Workspace details, plan and usage." />
            <Tabs value={tab} onValueChange={(v) => router.replace(v === 'plan' ? '/settings?tab=plan' : '/settings')}>
                <TabsList>
                    {can(P.SettingsView) && <TabsTrigger value="general">General</TabsTrigger>}
                    <TabsTrigger value="plan">Plan & usage</TabsTrigger>
                </TabsList>
                <TabsContent value="general">
                    {tenant.data ? <GeneralForm tenant={tenant.data} canManage={can(P.SettingsManage)} /> : <Skeleton className="h-72" />}
                </TabsContent>
                <TabsContent value="plan" className="grid gap-4">
                    {can(P.BillingView) && <BillingPanel canManage={can(P.BillingManage)} />}
                    <PlanUsage />
                </TabsContent>
            </Tabs>
        </>
    );
}

export default function SettingsPage() {
    return (
        <Suspense>
            <Settings />
        </Suspense>
    );
}
