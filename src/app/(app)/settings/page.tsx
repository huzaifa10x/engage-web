'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Field, FormError } from '@/components/app/field';
import { Forbidden, PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { BusinessHoursCard, CannedResponsesCard } from '@/components/settings/inbox-cards';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api, ApiError, errorMessage } from '@/lib/api';
import { COUNTRIES } from '@/lib/countries';
import { date } from '@/lib/format';
import { P } from '@/lib/permissions';
import { keys, updateAutoReply, useAutoReply, useTenant } from '@/lib/queries';
import type { AutoReplySettings, Tenant } from '@/lib/types';

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
function WorkspaceForm({ tenant, canManage }: { tenant: Tenant; canManage: boolean }) {
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
                        <CardDescription>The country decides whether VAT is added to your subscription (UAE businesses are charged 5%).</CardDescription>
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

/** The automatic reply customers get when they write in. Can be switched off for a single conversation in the inbox. */
function AutoReplyCard({ canManage }: { canManage: boolean }) {
    const qc = useQueryClient();
    const query = useAutoReply();
    const [draft, setDraft] = useState<AutoReplySettings | null>(null);
    const [saving, setSaving] = useState(false);
    const value = draft ?? query.data ?? null;

    if (!value) return <Skeleton className="h-40" />;

    const save = async () => {
        setSaving(true);
        try {
            qc.setQueryData(['auto-reply'], await updateAutoReply(value));
            setDraft(null);
            toast.success(value.enabled ? 'Auto reply is on' : 'Auto reply is off');
        } catch (e) {
            toast.error(e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? e.message) : errorMessage(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <div>
                    <CardTitle>Auto reply</CardTitle>
                    <CardDescription>
                        Send an automatic reply when a customer messages you. It is sent once per conversation in the chosen period, never in answer to STOP,
                        and can be switched off for a single conversation from the inbox.
                    </CardDescription>
                </div>
                <Switch checked={value.enabled} disabled={!canManage} aria-label="Auto reply" onCheckedChange={(enabled) => setDraft({ ...value, enabled })} />
            </CardHeader>
            <CardContent className="grid gap-4">
                <Field label="Message" htmlFor="ar-message">
                    <textarea
                        id="ar-message"
                        className="field-sizing-content min-h-20 w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm leading-5 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:opacity-60"
                        maxLength={1000}
                        disabled={!canManage || !value.enabled}
                        value={value.message}
                        onChange={(e) => setDraft({ ...value, message: e.target.value })}
                    />
                </Field>
                <Field label="When" htmlFor="ar-when" className="sm:max-w-xs" hint="“Outside business hours” uses the hours set above.">
                    <Select
                        value={value.when}
                        onValueChange={(v) => setDraft({ ...value, when: v as AutoReplySettings['when'] })}
                        disabled={!canManage || !value.enabled}
                    >
                        <SelectTrigger id="ar-when">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="always">Always</SelectItem>
                            <SelectItem value="outside_hours">Only outside business hours</SelectItem>
                        </SelectContent>
                    </Select>
                </Field>
                <Field label="Send at most once every" htmlFor="ar-cooldown" className="sm:max-w-xs">
                    <Select
                        value={String(value.cooldown_hours)}
                        onValueChange={(v) => setDraft({ ...value, cooldown_hours: Number(v) })}
                        disabled={!canManage || !value.enabled}
                    >
                        <SelectTrigger id="ar-cooldown">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {[1, 4, 12, 24, 48, 168].map((h) => (
                                <SelectItem key={h} value={String(h)}>
                                    {h < 24 ? `${h} hour${h === 1 ? '' : 's'}` : h === 168 ? '7 days' : `${h / 24} day${h === 24 ? '' : 's'}`} per conversation
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
                {canManage && (
                    <div className="flex justify-end">
                        <Button onClick={save} disabled={saving || draft === null || (value.enabled && !value.message.trim())}>
                            {saving ? 'Saving…' : 'Save auto reply'}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default function SettingsPage() {
    const { can, feature } = useSession();
    const tenant = useTenant();

    if (!can(P.SettingsView)) return <Forbidden />;

    return (
        <>
            <PageHeader
                title="Workspace settings"
                description="Your workspace, company details and address. Plans, cards and invoices are on the Billing page."
            />
            {tenant.data ? (
                <div className="grid gap-4">
                    <WorkspaceForm key={tenant.data.id} tenant={tenant.data} canManage={can(P.SettingsManage)} />
                    <BusinessHoursCard canManage={can(P.SettingsManage)} />
                    <AutoReplyCard canManage={can(P.SettingsManage)} />
                    <CannedResponsesCard canManage={can(P.InboxReply)} limit={feature('canned_responses').limit} />
                </div>
            ) : (
                <Skeleton className="h-96" />
            )}
        </>
    );
}
