'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CalendarClockIcon, CheckIcon, CreditCardIcon, DownloadIcon, ExternalLinkIcon } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Field, FormError } from '@/components/app/field';
import { Badge, type Tone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiError, errorMessage } from '@/lib/api';
import { COUNTRIES, VAT_COUNTRY } from '@/lib/countries';
import { date } from '@/lib/format';
import {
    invoicePdfUrl,
    keys,
    openBillingPortal,
    startCheckout,
    switchToFree,
    updateBillingDetails,
    useBilling,
    useInvoices,
    usePaymentMethod,
    usePayments,
} from '@/lib/queries';
import type { Billing, BillingPlan, BillingPortalFlow } from '@/lib/types';

import { PlanUsage } from './plan-usage';
import { confirmAction } from '@/components/ui/confirm';

const money = (minor: number, currency: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);

const period = (interval: 'monthly' | 'yearly' | null | undefined) => (interval === 'yearly' ? 'Annual' : 'Monthly');

const INVOICE: Record<string, { label: string; tone: Tone }> = {
    paid: { label: 'Paid', tone: 'good' },
    open: { label: 'Payment due', tone: 'warn' },
    void: { label: 'Void', tone: 'grey' },
    uncollectible: { label: 'Unpaid', tone: 'bad' },
    refunded: { label: 'Refunded', tone: 'info' },
    partially_refunded: { label: 'Partly refunded', tone: 'info' },
};

const PAYMENT: Record<string, { label: string; tone: Tone }> = {
    succeeded: { label: 'Paid', tone: 'good' },
    pending: { label: 'Processing', tone: 'warn' },
    failed: { label: 'Failed', tone: 'bad' },
    refunded: { label: 'Refunded', tone: 'info' },
    partially_refunded: { label: 'Partly refunded', tone: 'info' },
};

const STATUS: Record<string, { label: string; tone: Tone }> = {
    active: { label: 'Active', tone: 'good' },
    trialing: { label: 'Trial', tone: 'brand' },
    past_due: { label: 'Payment failed', tone: 'bad' },
};

/** Company name, country and VAT TRN exactly as they should be printed on invoices. */
function DetailsForm({ billing, canManage }: { billing: Billing; canManage: boolean }) {
    const qc = useQueryClient();
    const [legalName, setLegalName] = useState(billing.details.legal_name ?? '');
    const [country, setCountry] = useState(billing.details.country ?? '');
    const [trn, setTrn] = useState(billing.details.tax_trn ?? '');
    const [email, setEmail] = useState(billing.details.billing_email ?? '');
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const uae = country === VAT_COUNTRY;

    const save = async () => {
        if (!country) return setError('Choose your billing country.');
        setSaving(true);
        setError(null);
        try {
            qc.setQueryData(
                ['billing'],
                await updateBillingDetails({
                    legal_name: legalName.trim() || null,
                    country,
                    tax_trn: uae ? trn.trim() || null : null,
                    billing_email: email.trim() || null,
                }),
            );
            void qc.invalidateQueries({ queryKey: ['tenant'] });
            toast.success('Billing details saved');
        } catch (e) {
            const first = e instanceof ApiError ? Object.values(e.fields)[0]?.[0] : undefined;
            setError(first ?? errorMessage(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <div>
                    <CardTitle>Billing details</CardTitle>
                    <CardDescription>
                        These appear on your invoices. Stripe also asks for them at checkout and in the billing portal; changes made there show here.
                    </CardDescription>
                </div>
            </CardHeader>
            <CardContent className="grid gap-4">
                <FormError message={error} />
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Company name on invoices" htmlFor="bd-name" hint="Leave empty to use your workspace name">
                        <Input id="bd-name" value={legalName} maxLength={190} disabled={!canManage} onChange={(e) => setLegalName(e.target.value)} />
                    </Field>
                    <Field label="Billing email" htmlFor="bd-email" hint="Invoices and payment receipts are sent here">
                        <Input id="bd-email" type="email" value={email} disabled={!canManage} onChange={(e) => setEmail(e.target.value)} />
                    </Field>
                    <Field
                        label="Country"
                        htmlFor="bd-country"
                        hint={
                            uae
                                ? `UAE customers are charged ${billing.vat.percent}% VAT on top of the plan price.`
                                : country
                                  ? 'No VAT is charged for this country.'
                                  : undefined
                        }
                    >
                        <Select value={country || undefined} onValueChange={setCountry} disabled={!canManage}>
                            <SelectTrigger id="bd-country">
                                <SelectValue placeholder="Choose a country" />
                            </SelectTrigger>
                            <SelectContent>
                                {COUNTRIES.map((c) => (
                                    <SelectItem key={c.code} value={c.code}>
                                        {c.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    {uae && (
                        <Field label="VAT TRN (optional)" htmlFor="bd-trn" hint="15 digits. Printed on your invoices with your company name.">
                            <Input
                                id="bd-trn"
                                inputMode="numeric"
                                value={trn}
                                maxLength={20}
                                placeholder="100200300400003"
                                disabled={!canManage}
                                onChange={(e) => setTrn(e.target.value)}
                            />
                        </Field>
                    )}
                </div>
                {canManage && (
                    <div className="flex justify-end">
                        <Button onClick={save} disabled={saving}>
                            {saving ? 'Saving…' : 'Save billing details'}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

/** One plan. Its button opens Stripe: Checkout for a first paid plan, the portal to switch. */
function PlanCard({
    plan,
    yearly,
    billing,
    canManage,
    busy,
    onChoose,
    onSwitchFree,
    onCancel,
}: {
    plan: BillingPlan;
    yearly: boolean;
    billing: Billing;
    canManage: boolean;
    busy: boolean;
    onChoose: () => void;
    onSwitchFree: () => void;
    onCancel: () => void;
}) {
    const sub = billing.subscription;
    const minor = yearly ? plan.price_yearly_minor : plan.price_monthly_minor;
    const custom = plan.price_monthly_minor === null;
    const selfServe = Boolean(sub?.self_serve);
    const sameInterval = sub?.interval === (yearly ? 'yearly' : 'monthly');
    // A plan set up by 10X Digital (manual billing, not a trial, not Free): changed by them. A Stripe
    // subscription the current Stripe keys do not know (self_serve false) is not managed: Checkout replaces it.
    const managed = sub?.provider === 'manual' && sub.status !== 'trialing' && !billing.plans.find((p) => p.current)?.free;
    const scheduledHere = sub?.scheduled_change?.plan.key === plan.key && sub.scheduled_change.interval === (yearly ? 'yearly' : 'monthly');
    const enabled = canManage && !busy && billing.stripe_configured;

    let action: React.ReactNode;
    if (custom) {
        action = (
            <Button asChild variant="outline" className="w-full">
                <a href="mailto:sales@10xdigital.ae?subject=10X%20Engage%20Enterprise">Talk to sales</a>
            </Button>
        );
    } else if (plan.free && !plan.current) {
        action = sub?.cancel_at ? (
            <Button variant="outline" className="w-full" disabled>
                Moves here on {date(sub.cancel_at)}
            </Button>
        ) : selfServe ? (
            <Button variant="outline" className="w-full" disabled={!enabled} onClick={onCancel}>
                {busy ? 'Opening Stripe…' : 'Move to Free'}
            </Button>
        ) : billing.can_switch_to_free ? (
            <Button variant="outline" className="w-full" disabled={!canManage || busy} onClick={onSwitchFree}>
                {busy ? 'One moment…' : 'Switch to Free'}
            </Button>
        ) : (
            <Button variant="outline" className="w-full" disabled title="Your plan is managed by 10X Digital">
                Contact us to switch
            </Button>
        );
    } else if (!plan.purchasable || (plan.current && (!selfServe || sameInterval))) {
        action = (
            <Button variant="outline" className="w-full" disabled>
                {plan.current ? (
                    <>
                        <CheckIcon /> {sub?.status === 'trialing' ? 'On trial' : 'Your plan'}
                    </>
                ) : (
                    'Included'
                )}
            </Button>
        );
    } else if (managed) {
        action = (
            <Button variant="outline" className="w-full" disabled title="Your plan is managed by 10X Digital">
                Contact us to switch
            </Button>
        );
    } else if (scheduledHere) {
        action = (
            <Button variant="outline" className="w-full" disabled>
                Starts {date(sub?.scheduled_change?.at)}
            </Button>
        );
    } else {
        action = (
            <Button className="w-full" disabled={!enabled} onClick={onChoose}>
                {busy
                    ? 'Opening Stripe…'
                    : plan.current
                      ? `Switch to ${yearly ? 'annual' : 'monthly'}`
                      : selfServe
                        ? `Switch to ${plan.name}`
                        : `Upgrade to ${plan.name}`}
            </Button>
        );
    }

    return (
        <div className={`flex flex-col rounded-lg border p-4 ${plan.current ? 'border-brand-500 ring-1 ring-brand-500' : ''}`}>
            <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{plan.name}</p>
                {plan.current && <Badge tone="brand">{sub?.status === 'trialing' ? 'Trial' : 'Current'}</Badge>}
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
                {custom ? 'Custom' : minor ? money(yearly ? Math.round(minor / 12) : minor, plan.currency) : 'Free'}
                {!custom && Boolean(minor) && <span className="text-[13px] font-normal text-muted-foreground"> / month</span>}
            </p>
            <p className="min-h-9 text-[12.5px] text-muted-foreground">
                {custom
                    ? 'For large teams and agencies.'
                    : minor
                      ? `${yearly ? `${money(minor, plan.currency)} billed yearly` : 'Billed monthly'} + ${billing.vat.percent}% VAT in the UAE`
                      : 'Send and receive messages, 1 team member. No card needed.'}
            </p>
            <div className="mt-3">{action}</div>
        </div>
    );
}

/**
 * The Billing page (Batch 6): Overview · Plans · Invoices · Payments · Billing details.
 * Every money action opens a Stripe-hosted page (Checkout or the Customer Portal) and comes back to
 * /billing/return; the plan changes when Stripe's webhook confirms it. No card is entered here.
 */
export function BillingPanel({ canManage }: { canManage: boolean }) {
    const qc = useQueryClient();
    const router = useRouter();
    const params = useSearchParams();
    const billing = useBilling();
    const invoices = useInvoices();
    const configured = billing.data?.stripe_configured ?? false;
    const card = usePaymentMethod(configured && Boolean(billing.data?.subscription?.self_serve));
    const payments = usePayments(configured);
    const [tab, setTab] = useState(params.get('tab') ?? 'overview');
    const [yearly, setYearly] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const b = billing.data;

    // Back from Stripe Checkout without paying.
    const canceled = params.get('canceled') === '1';
    useEffect(() => {
        if (!canceled) return;
        toast('Nothing was changed', { description: 'You left Stripe before paying. Your plan is as it was.' });
        router.replace('/billing');
    }, [canceled, router]);

    if (billing.isLoading) return <Skeleton className="h-72" />;
    if (!b) return <p className="text-sm text-bad">{errorMessage(billing.error)}</p>;

    const sub = b.subscription;
    const selfServe = Boolean(sub?.self_serve);
    const upcoming = payments.data?.upcoming ?? null;
    const openInvoices = (invoices.data ?? []).filter((i) => i.status === 'open');
    const interval = yearly ? 'yearly' : 'monthly';

    /** Asks the server for a Stripe page and goes there. */
    const toStripe = (id: string, url: () => Promise<string>) => {
        setBusy(id);
        url().then(
            (to) => window.location.assign(to),
            (e) => {
                const first = e instanceof ApiError ? Object.values(e.fields)[0]?.[0] : undefined;
                toast.error(first ?? errorMessage(e));
                setBusy(null);
            },
        );
    };
    const portal = (flow: BillingPortalFlow, plan?: string) =>
        toStripe(`portal-${flow}-${plan ?? ''}`, () => openBillingPortal(flow, plan, plan ? interval : undefined));
    const choose = (plan: BillingPlan) => {
        if (selfServe) return portal('update', plan.key);
        if (!b.vat.automatic && !b.details.country) {
            // VAT is chosen from the billing country, so it is needed before Checkout opens.
            toast.error('Choose your billing country first, so the correct VAT is charged.');
            setTab('details');

            return;
        }
        toStripe(`checkout-${plan.key}`, () => startCheckout(plan.key, interval));
    };

    const switchFree = async () => {
        if (!(await confirmAction({ title: `Switch to Free now? ${b.plan.name} trial features stop straight away.`, destructive: true }))) return;
        setBusy('free');
        switchToFree().then(
            (data) => {
                qc.setQueryData(['billing'], data);
                void qc.invalidateQueries({ queryKey: keys.entitlements });
                void qc.invalidateQueries({ queryKey: keys.me });
                toast.success('Your workspace is on the Free plan');
                setBusy(null);
            },
            (e) => {
                toast.error(errorMessage(e));
                setBusy(null);
            },
        );
    };

    const downloadPdf = (id: string) => {
        // Opened synchronously so the browser does not block it as a pop-up, then pointed at Stripe's fresh link.
        const tab = window.open('about:blank', '_blank');
        invoicePdfUrl(id).then(
            (url) => (tab ? (tab.location.href = url) : window.location.assign(url)),
            (e) => {
                tab?.close();
                toast.error(errorMessage(e));
            },
        );
    };

    const invoiceTable = (
        <Card className="overflow-hidden p-0">
            <Table>
                <TableHeader>
                    <TableRow className="hover:bg-transparent">
                        <TableHead>Invoice</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">VAT</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-28" />
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {(invoices.data ?? []).map((i) => (
                        <TableRow key={i.id}>
                            <TableCell>
                                <p className="font-medium">{i.number ?? '—'}</p>
                                <p className="max-w-64 truncate text-[12.5px] text-muted-foreground">{i.description}</p>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-muted-foreground">{date(i.issued_at)}</TableCell>
                            <TableCell className="text-right tabular-nums">{money(i.subtotal_minor, i.currency)}</TableCell>
                            <TableCell className="text-right tabular-nums">{i.tax_minor ? money(i.tax_minor, i.currency) : '—'}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">{money(i.total_minor, i.currency)}</TableCell>
                            <TableCell>
                                <Badge tone={INVOICE[i.status]?.tone ?? 'grey'}>{INVOICE[i.status]?.label ?? i.status}</Badge>
                                {i.amount_refunded_minor > 0 && (
                                    <p className="mt-0.5 text-[12px] text-muted-foreground">{money(i.amount_refunded_minor, i.currency)} refunded</p>
                                )}
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center justify-end gap-1">
                                    {canManage && i.status === 'open' && selfServe && (
                                        <Button size="sm" disabled={busy !== null} onClick={() => portal('card')}>
                                            {busy === 'portal-card-' ? 'Opening Stripe…' : 'Pay now'}
                                        </Button>
                                    )}
                                    {i.has_pdf && (
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label={`Download invoice ${i.number ?? ''}`}
                                            onClick={() => downloadPdf(i.id)}
                                        >
                                            <DownloadIcon />
                                        </Button>
                                    )}
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                    {(invoices.data ?? []).length === 0 && (
                        <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                                {invoices.isLoading ? 'Loading…' : 'No invoices yet. They appear here after your first payment.'}
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </Card>
    );

    return (
        <div className="grid gap-4">
            {sub?.paused && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-bad/20 bg-bad-bg px-4 py-3 text-sm text-bad" role="alert">
                    <span>
                        <span className="font-semibold">Your last payment failed.</span> Chatbots, automations, reply alerts, campaigns and extra team seats are
                        paused until it is paid. Sending and receiving messages keep working.
                    </span>
                    {canManage && selfServe && (
                        <Button size="sm" className="ml-auto" disabled={busy !== null} onClick={() => portal('card')}>
                            {busy === 'portal-card-' ? 'Opening Stripe…' : 'Update card and pay'}
                        </Button>
                    )}
                </div>
            )}
            {!b.stripe_configured && (
                <div className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">
                    Online payments are not switched on yet. Contact support to change your plan.
                </div>
            )}

            <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="plans">Plans</TabsTrigger>
                    <TabsTrigger value="invoices">Invoices</TabsTrigger>
                    <TabsTrigger value="payments">Payments</TabsTrigger>
                    <TabsTrigger value="details">Billing details</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="grid gap-4">
                    <div className="grid gap-3 lg:grid-cols-3">
                        <Card className="gap-2 p-5">
                            <p className="text-[12.5px] text-muted-foreground">Current plan</p>
                            <p className="flex flex-wrap items-center gap-2 text-xl font-semibold">
                                {b.plan.name}
                                {selfServe && <span className="text-[13px] font-normal text-muted-foreground">· {period(sub?.interval)}</span>}
                                {sub && STATUS[sub.status] && <Badge tone={STATUS[sub.status].tone}>{STATUS[sub.status].label}</Badge>}
                            </p>
                            <p className="text-[13px] text-muted-foreground">
                                {sub?.status === 'trialing' && sub.trial_ends_at
                                    ? `Free trial until ${date(sub.trial_ends_at)}. Upgrade to keep these features; otherwise you move to Free.`
                                    : selfServe && sub?.cancel_at
                                      ? `Cancelled. You keep ${b.plan.name} until ${date(sub.cancel_at)}, then move to the Free plan. Your chats, contacts and settings stay.`
                                      : selfServe
                                        ? `Billed ${sub?.interval === 'yearly' ? 'yearly' : 'monthly'}. Renews automatically on ${date(sub?.current_period_end)}.`
                                        : b.plans.find((p) => p.current)?.free
                                          ? 'Send and receive messages for free. Upgrade for chatbots, automations, reply alerts, campaigns and more seats.'
                                          : sub?.provider === 'stripe'
                                            ? 'Stripe has no record of this subscription with the current payment settings. Upgrade to start a new one; it replaces this plan.'
                                            : 'Set up by 10X Digital. Contact us to change it.'}
                            </p>
                            {sub?.scheduled_change && (
                                <p className="flex items-center gap-1.5 text-[13px] font-medium">
                                    <CalendarClockIcon className="size-4 text-muted-foreground" />
                                    Moves to {sub.scheduled_change.plan.name} · {period(sub.scheduled_change.interval)} on {date(sub.scheduled_change.at)}
                                </p>
                            )}
                            <div className="mt-1 flex flex-wrap gap-2">
                                <Button size="sm" onClick={() => setTab('plans')}>
                                    {selfServe ? 'Change plan' : 'Upgrade'}
                                </Button>
                            </div>
                        </Card>
                        <Card className="gap-2 p-5">
                            <p className="text-[12.5px] text-muted-foreground">Next payment</p>
                            <p className="text-xl font-semibold tabular-nums">{upcoming ? money(upcoming.amount_due_minor, upcoming.currency) : '—'}</p>
                            <p className="text-[13px] text-muted-foreground">
                                {upcoming?.date
                                    ? `On ${date(upcoming.date)}${b.vat.applies ? `, including ${b.vat.percent}% VAT` : ''}.`
                                    : selfServe && sub?.cancel_at
                                      ? 'Nothing more will be charged.'
                                      : 'Nothing scheduled.'}
                            </p>
                        </Card>
                        <Card className="gap-2 p-5">
                            <p className="text-[12.5px] text-muted-foreground">Payment method</p>
                            <p className="flex items-center gap-2 text-xl font-semibold">
                                {card.data ? (
                                    <>
                                        <CreditCardIcon className="size-5 text-muted-foreground" />
                                        <span className="capitalize">{card.data.brand}</span> •••• {card.data.last4}
                                    </>
                                ) : selfServe && card.isLoading ? (
                                    <Skeleton className="h-7 w-40" />
                                ) : (
                                    'No card'
                                )}
                            </p>
                            <p className="text-[13px] text-muted-foreground">
                                {card.data
                                    ? `Expires ${String(card.data.exp_month).padStart(2, '0')}/${card.data.exp_year}. Kept by Stripe, not by 10X Engage.`
                                    : selfServe
                                      ? "Stripe has no card for renewals. Add one on Stripe's secure page."
                                      : "No card needed on Free. You add one on Stripe's secure page when you upgrade."}
                            </p>
                            {canManage && selfServe && (
                                <div className="mt-1">
                                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => portal('card')}>
                                        {busy === 'portal-card-' ? 'Opening Stripe…' : 'Update card'} <ExternalLinkIcon />
                                    </Button>
                                </div>
                            )}
                        </Card>
                    </div>
                    {openInvoices.length > 0 && (
                        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warn/30 bg-warn-bg px-4 py-3 text-sm">
                            {openInvoices.length === 1 ? 'One invoice is' : `${openInvoices.length} invoices are`} waiting for payment.
                            <Button size="sm" variant="outline" className="ml-auto" onClick={() => setTab('invoices')}>
                                View invoices
                            </Button>
                        </div>
                    )}
                    <PlanUsage />
                </TabsContent>

                <TabsContent value="plans" className="grid gap-4">
                    <Card>
                        <CardHeader>
                            <div>
                                <CardTitle>Plans</CardTitle>
                                <CardDescription>
                                    Prices are in USD and exclude {b.vat.percent}% UAE VAT. Annual is 10 × monthly (2 months free). You pay on Stripe&apos;s
                                    secure page. Upgrades are charged now for the rest of the period; downgrades and Annual → Monthly start at the end of the
                                    period you have paid for.
                                </CardDescription>
                            </div>
                            <div className="flex rounded-md border p-0.5 text-[13px]" role="group" aria-label="Billing period">
                                {[false, true].map((y) => (
                                    <button
                                        key={String(y)}
                                        onClick={() => setYearly(y)}
                                        aria-pressed={yearly === y}
                                        className={`rounded px-3 py-1 ${yearly === y ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                                    >
                                        {y ? 'Annual' : 'Monthly'}
                                    </button>
                                ))}
                            </div>
                        </CardHeader>
                        <CardContent className="grid gap-4">
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                                {b.plans.map((plan) => (
                                    <PlanCard
                                        key={plan.key}
                                        plan={plan}
                                        yearly={yearly}
                                        billing={b}
                                        canManage={canManage}
                                        busy={
                                            plan.free
                                                ? busy === 'free' || busy === 'portal-cancel-'
                                                : busy === `checkout-${plan.key}` || busy === `portal-update-${plan.key}`
                                        }
                                        onChoose={() => choose(plan)}
                                        onSwitchFree={switchFree}
                                        onCancel={() => portal('cancel')}
                                    />
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                    {selfServe && (
                        <Card className="flex-row flex-wrap items-center gap-3 p-5">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold">{sub?.cancel_at ? 'Your plan is cancelled' : 'Cancel plan'}</p>
                                <p className="text-[13px] text-muted-foreground">
                                    {sub?.cancel_at
                                        ? `You keep ${b.plan.name} until ${date(sub.cancel_at)}. After that the workspace moves to the Free plan.`
                                        : `Your plan renews on ${date(sub?.current_period_end)}. If you cancel, you keep ${b.plan.name} until then and move to Free afterwards. Your chats, contacts and settings stay.`}
                                </p>
                            </div>
                            {canManage &&
                                (sub?.cancel_at ? (
                                    <Button variant="outline" disabled={busy !== null} onClick={() => portal('manage')}>
                                        Keep my plan
                                    </Button>
                                ) : (
                                    <Button variant="outline" className="text-bad" disabled={busy !== null} onClick={() => portal('cancel')}>
                                        {busy === 'portal-cancel-' ? 'Opening Stripe…' : 'Cancel plan'}
                                    </Button>
                                ))}
                        </Card>
                    )}
                </TabsContent>

                <TabsContent value="invoices">{invoiceTable}</TabsContent>

                <TabsContent value="payments">
                    <Card className="overflow-hidden p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead>Date</TableHead>
                                    <TableHead>Card</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="w-24" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(payments.data?.payments ?? []).map((pmt) => (
                                    <TableRow key={pmt.id}>
                                        <TableCell className="whitespace-nowrap">
                                            {pmt.created_at
                                                ? new Date(pmt.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                                                : '—'}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground capitalize">
                                            {pmt.card_last4 ? `${pmt.card_brand ?? 'card'} •••• ${pmt.card_last4}` : '—'}
                                        </TableCell>
                                        <TableCell className="text-right font-medium tabular-nums">{money(pmt.amount_minor, pmt.currency)}</TableCell>
                                        <TableCell>
                                            <Badge tone={PAYMENT[pmt.status]?.tone ?? 'grey'}>{PAYMENT[pmt.status]?.label ?? pmt.status}</Badge>
                                            {pmt.amount_refunded_minor > 0 && (
                                                <p className="mt-0.5 text-[12px] text-muted-foreground">
                                                    {money(pmt.amount_refunded_minor, pmt.currency)} refunded
                                                </p>
                                            )}
                                            {pmt.status === 'failed' && pmt.failure_message && (
                                                <p className="mt-0.5 max-w-64 text-[12px] text-bad">{pmt.failure_message}</p>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {pmt.receipt_url && (
                                                <a
                                                    href={pmt.receipt_url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-[13px] font-medium text-info underline-offset-2 hover:underline"
                                                >
                                                    Receipt
                                                </a>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {(payments.data?.payments ?? []).length === 0 && (
                                    <TableRow className="hover:bg-transparent">
                                        <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                                            {payments.isLoading ? 'Loading…' : 'No payments yet.'}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Card>
                </TabsContent>

                <TabsContent value="details">
                    <DetailsForm key={JSON.stringify(b.details)} billing={b} canManage={canManage} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
