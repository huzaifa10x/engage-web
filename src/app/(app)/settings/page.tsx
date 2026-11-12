'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Field, FormError } from '@/components/app/field';
import { PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { TwoFactorCard } from '@/components/auth/two-factor';
import { EmailNotificationsCard, RememberedDevicesCard } from '@/components/settings/account-cards';
import { BusinessHoursCard, CannedResponsesCard, InboxRulesCard } from '@/components/settings/inbox-cards';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, ApiError, errorMessage } from '@/lib/api';
import { COUNTRIES } from '@/lib/countries';
import { date } from '@/lib/format';
import { P } from '@/lib/permissions';
import { keys, useTenant } from '@/lib/queries';
import type { Tenant } from '@/lib/types';

const NONE = '__none__';

const INDUSTRIES = [
    'Retail & e-commerce',
    'Real estate',
    'Healthcare',
    'Education',
    'Hospitality & travel',
    'Food & beverage',
    'Fitness & wellness',
    'Automotive',
    'Financial services',
    'Professional services',
    'Marketing & agencies',
    'Technology',
    'Logistics',
    'Non-profit',
    'Other',
];

const SIZES = ['1', '2-10', '11-50', '51-200', '201-500', '500+'];

type Form = Record<
    | 'name'
    | 'timezone'
    | 'locale'
    | 'legal_name'
    | 'industry'
    | 'company_size'
    | 'website'
    | 'phone'
    | 'country'
    | 'address_line1'
    | 'address_line2'
    | 'city'
    | 'region'
    | 'postal_code',
    string
>;

const fromTenant = (t: Tenant): Form => ({
    name: t.name,
    timezone: t.timezone,
    locale: t.locale === 'ar' ? 'ar' : 'en',
    legal_name: t.legal_name ?? '',
    industry: t.industry ?? '',
    company_size: t.company_size ?? '',
    website: t.website ?? '',
    phone: t.phone ?? '',
    country: t.country ?? '',
    address_line1: t.address_line1 ?? '',
    address_line2: t.address_line2 ?? '',
    city: t.city ?? '',
    region: t.region ?? '',
    postal_code: t.postal_code ?? '',
});

/** Workspace and company details. Billing (plan, cards, invoices, VAT number) lives on the Billing page. */
function WorkspaceForm({ tenant, canManage, section }: { tenant: Tenant; canManage: boolean; section: 'workspace' | 'company' }) {
    const qc = useQueryClient();
    const [form, setForm] = useState<Form>(() => fromTenant(tenant));
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const timezones = useMemo(() => (typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [tenant.timezone]), [tenant.timezone]);
    const dirty = JSON.stringify(form) !== JSON.stringify(fromTenant(tenant));
    const set = (key: keyof Form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
    const text = (key: keyof Form, props: React.ComponentProps<typeof Input> = {}) => (
        <Input
            id={`ws-${key}`}
            value={form[key]}
            disabled={!canManage}
            aria-invalid={Boolean(errors[key])}
            onChange={(e) => set(key)(e.target.value)}
            {...props}
        />
    );

    const save = async () => {
        if (!form.name.trim()) return setErrors({ name: ['Enter a workspace name.'] });
        setSaving(true);
        setErrors({});
        setFormError(null);
        try {
            const website = form.website.trim() && !/^https?:\/\//i.test(form.website.trim()) ? `https://${form.website.trim()}` : form.website.trim();
            const body = Object.fromEntries(
                Object.entries({ ...form, website }).map(([k, v]) => [k, v.trim() === '' && !['name', 'timezone', 'locale'].includes(k) ? null : v.trim()]),
            );
            const res = await api<{ data: Tenant }>('tenant', { method: 'PATCH', body });
            qc.setQueryData(keys.tenant, res.data);
            setForm(fromTenant(res.data));
            void qc.invalidateQueries({ queryKey: keys.me });
            void qc.invalidateQueries({ queryKey: ['billing'] });
            toast.success('Workspace settings saved');
        } catch (e) {
            if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
            else setFormError(errorMessage(e));
        } finally {
            setSaving(false);
        }
    };

    const err = (key: keyof Form) => errors[key]?.[0];

    return (
        <div className="grid gap-4">
            <FormError message={formError} />
            {section === 'workspace' && (
                <Card>
                    <CardHeader>
                        <div>
                            <CardTitle>Workspace</CardTitle>
                            <CardDescription>Shown to your team. The time zone drives reports, quiet hours and scheduled campaigns.</CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                        <Field label="Workspace name" htmlFor="ws-name" error={err('name')} className="sm:col-span-2">
                            {text('name', { maxLength: 120 })}
                        </Field>
                        <Field label="Time zone" htmlFor="ws-timezone" error={err('timezone')}>
                            <Select value={form.timezone} onValueChange={set('timezone')} disabled={!canManage}>
                                <SelectTrigger id="ws-timezone">
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
                        </Field>
                        <Field label="Language" htmlFor="ws-locale" error={err('locale')}>
                            <Select value={form.locale} onValueChange={set('locale')} disabled={!canManage}>
                                <SelectTrigger id="ws-locale">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="en">English</SelectItem>
                                    <SelectItem value="ar">العربية (Arabic)</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                        <p className="text-[12.5px] text-muted-foreground sm:col-span-2">
                            Workspace ID <span className="font-mono">{tenant.slug}</span> · created {date(tenant.created_at)}
                        </p>
                    </CardContent>
                </Card>
            )}
            {section === 'company' && (
                <>
                    <Card>
                        <CardHeader>
                            <div>
                                <CardTitle>Company</CardTitle>
                                <CardDescription>Your business details. The legal name and address are printed on your invoices.</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                            <Field label="Legal company name" htmlFor="ws-legal_name" error={err('legal_name')} hint="Leave empty to use the workspace name">
                                {text('legal_name', { maxLength: 190 })}
                            </Field>
                            <Field label="Industry" htmlFor="ws-industry" error={err('industry')}>
                                <Select value={form.industry || NONE} onValueChange={(v) => set('industry')(v === NONE ? '' : v)} disabled={!canManage}>
                                    <SelectTrigger id="ws-industry">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-72">
                                        <SelectItem value={NONE}>Not set</SelectItem>
                                        {form.industry && !INDUSTRIES.includes(form.industry) && <SelectItem value={form.industry}>{form.industry}</SelectItem>}
                                        {INDUSTRIES.map((i) => (
                                            <SelectItem key={i} value={i}>
                                                {i}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field label="Company size" htmlFor="ws-company_size" error={err('company_size')}>
                                <Select value={form.company_size || NONE} onValueChange={(v) => set('company_size')(v === NONE ? '' : v)} disabled={!canManage}>
                                    <SelectTrigger id="ws-company_size">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE}>Not set</SelectItem>
                                        {SIZES.map((size) => (
                                            <SelectItem key={size} value={size}>
                                                {size === '1' ? 'Just me' : `${size} people`}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field label="Website" htmlFor="ws-website" error={err('website')}>
                                {text('website', { placeholder: 'https://example.com', inputMode: 'url', maxLength: 190 })}
                            </Field>
                            <Field label="Phone" htmlFor="ws-phone" error={err('phone')}>
                                {text('phone', { placeholder: '+971 4 123 4567', inputMode: 'tel', maxLength: 32 })}
                            </Field>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <div>
                                <CardTitle>Address</CardTitle>
                                <CardDescription>
                                    The country decides whether VAT is added to your subscription (UAE businesses are charged 5%).
                                </CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                            <Field label="Country" htmlFor="ws-country" error={err('country')}>
                                <Select value={form.country || NONE} onValueChange={(v) => set('country')(v === NONE ? '' : v)} disabled={!canManage}>
                                    <SelectTrigger id="ws-country">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-72">
                                        <SelectItem value={NONE}>Not set</SelectItem>
                                        {COUNTRIES.map((c) => (
                                            <SelectItem key={c.code} value={c.code}>
                                                {c.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field label="City" htmlFor="ws-city" error={err('city')}>
                                {text('city', { maxLength: 100 })}
                            </Field>
                            <Field label="Address line 1" htmlFor="ws-address_line1" error={err('address_line1')} className="sm:col-span-2">
                                {text('address_line1', { maxLength: 190 })}
                            </Field>
                            <Field label="Address line 2" htmlFor="ws-address_line2" error={err('address_line2')} className="sm:col-span-2">
                                {text('address_line2', { maxLength: 190 })}
                            </Field>
                            <Field label="State / emirate / region" htmlFor="ws-region" error={err('region')}>
                                {text('region', { maxLength: 100 })}
                            </Field>
                            <Field label="Postal code / P.O. box" htmlFor="ws-postal_code" error={err('postal_code')}>
                                {text('postal_code', { maxLength: 20 })}
                            </Field>
                        </CardContent>
                    </Card>
                </>
            )}

            {canManage && (
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setForm(fromTenant(tenant))} disabled={!dirty || saving}>
                        Discard changes
                    </Button>
                    <Button onClick={save} disabled={!dirty || saving}>
                        {saving ? 'Saving…' : 'Save changes'}
                    </Button>
                </div>
            )}
        </div>
    );
}

type Tab = 'workspace' | 'company' | 'hours' | 'inbox' | 'notifications' | 'security';

const TABS: [Tab, string][] = [
    ['workspace', 'Workspace'],
    ['company', 'Company'],
    ['hours', 'Business hours'],
    ['inbox', 'Inbox'],
    ['notifications', 'Email notifications'],
    ['security', 'Security'],
];

/** Tabs about the person rather than the workspace: open to everyone. */
const PERSONAL: Tab[] = ['notifications', 'security'];

/**
 * Settings in tabs (CN-02): Workspace, Company, Business hours, Inbox (assignment, timers, canned
 * responses), Email notifications (the person's own) and Security (two-factor sign-in, remembered devices). Auto reply and follow-up rules are in Automate ›
 * Follow-ups & Alerts. The tab is in the address (?tab=hours), so links can open it directly.
 */
export default function SettingsPage() {
    const { can, feature, me } = useSession();
    const tenant = useTenant();
    const router = useRouter();
    const params = useSearchParams();
    const full = can(P.SettingsView);
    // Everyone may choose their own emails and protect their own sign-in, even without access to the workspace settings.
    const tabs = full ? TABS : TABS.filter(([t]) => PERSONAL.includes(t));
    const asked = params.get('tab') as Tab | null;
    const tab: Tab = asked && tabs.some(([t]) => t === asked) ? asked : (tabs[0]?.[0] ?? 'security');
    const open = (t: Tab) => {
        const q = new URLSearchParams(params.toString());
        q.set('tab', t);
        q.delete('security');
        router.replace(`/settings?${q.toString()}`, { scroll: false });
    };

    return (
        <>
            <PageHeader
                title="Settings"
                description="Your workspace, company, opening hours, inbox, email notifications and sign-in. Plans, cards and invoices are on the Billing page."
            />
            <Tabs value={tab} onValueChange={(v) => open(v as Tab)}>
                <TabsList className="mb-4 flex-wrap">
                    {tabs.map(([t, label]) => (
                        <TabsTrigger key={t} value={t}>
                            {label}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>
            {tab === 'security' ? (
                <div className="grid gap-4">
                    {me.two_factor ? <TwoFactorCard status={me.two_factor} /> : null}
                    <RememberedDevicesCard />
                </div>
            ) : tab === 'notifications' ? (
                <EmailNotificationsCard />
            ) : !tenant.data ? (
                <Skeleton className="h-96" />
            ) : tab === 'workspace' || tab === 'company' ? (
                <WorkspaceForm key={`${tenant.data.id}-${tab}`} tenant={tenant.data} canManage={can(P.SettingsManage)} section={tab} />
            ) : tab === 'hours' ? (
                <div className="grid gap-4">
                    <BusinessHoursCard canManage={can(P.SettingsManage)} />
                    <p className="text-[13px] text-muted-foreground">
                        The after-hours auto reply for each number is in{' '}
                        <Link href="/follow-ups" className="font-medium text-foreground underline-offset-2 hover:underline">
                            Follow-ups &amp; Alerts
                        </Link>
                        .
                    </p>
                </div>
            ) : (
                <div className="grid gap-4">
                    <InboxRulesCard canManage={can(P.SettingsManage)} />
                    <CannedResponsesCard canManage={can(P.InboxReply)} limit={feature('canned_responses').limit} />
                </div>
            )}
        </>
    );
}
