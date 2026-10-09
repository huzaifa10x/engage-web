'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CheckIcon, CreditCardIcon, DownloadIcon, PlusIcon, Trash2Icon, WalletIcon } from 'lucide-react';
import { useState } from 'react';
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
    cancelSubscription,
    keys,
    payInvoice,
    refreshBilling,
    refreshInvoice,
    removePaymentMethod,
    resumeSubscription,
    setDefaultPaymentMethod,
    subscribeToPlan,
    updateBillingDetails,
    useBilling,
    useInvoices,
    usePaymentMethods,
    usePayments,
} from '@/lib/queries';
import { getStripe } from '@/lib/stripe';
import type { Billing, BillingPlan } from '@/lib/types';

import { AddCardDialog } from './add-card-dialog';
import { PlanChangeDialog } from './plan-change-dialog';
import { PlanUsage } from './plan-usage';

const money = (minor: number, currency: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);

const INVOICE: Record<string, { label: string; tone: Tone }> = {
    paid: { label: 'Paid', tone: 'good' },
    open: { label: 'Payment due', tone: 'warn' },
    void: { label: 'Void', tone: 'grey' },
    uncollectible: { label: 'Unpaid', tone: 'bad' },
    refunded: { label: 'Refunded', tone: 'info' },
    partially_refunded: { label: 'Partly refunded', tone: 'info' },
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
                    <CardDescription>These appear on your invoices. Your country decides whether VAT is charged.</CardDescription>
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

function PlanCard({
    plan,
    yearly,
    billing,
    canManage,
    busy,
    onChoose,
}: {
    plan: BillingPlan;
    yearly: boolean;
    billing: Billing;
    canManage: boolean;
    busy: boolean;
    onChoose: () => void;
}) {
    const minor = yearly ? plan.price_yearly_minor : plan.price_monthly_minor;
    const custom = plan.price_monthly_minor === null;
    const paidCurrent = plan.current && billing.subscription?.provider === 'stripe' && billing.subscription.status !== 'trialing';
    const sameInterval = billing.subscription?.interval === (yearly ? 'yearly' : 'monthly');

    return (
        <div className={`flex flex-col rounded-lg border p-4 ${plan.current ? 'border-brand-500 ring-1 ring-brand-500' : ''}`}>
            <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{plan.name}</p>
                {plan.current && <Badge tone="brand">{billing.subscription?.status === 'trialing' ? 'Trial' : 'Current'}</Badge>}
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
                {custom ? 'Custom' : minor ? money(yearly ? Math.round(minor / 12) : minor, plan.currency) : 'Free'}
                {!custom && Boolean(minor) && <span className="text-[13px] font-normal text-muted-foreground"> / month</span>}
            </p>
            <p className="min-h-9 text-[12.5px] text-muted-foreground">
                {custom
                    ? 'For large teams and agencies.'
                    : minor
                      ? `${yearly ? `${money(minor, plan.currency)} billed yearly` : 'Billed monthly'}${billing.vat.applies ? ` + ${billing.vat.percent}% VAT` : ''}`
                      : 'Shared inbox, always free.'}
            </p>
            <div className="mt-3">
                {custom ? (
                    <Button asChild variant="outline" className="w-full">
                        <a href="mailto:sales@10xdigital.ae?subject=10X%20Engage%20Enterprise">Talk to sales</a>
                    </Button>
                ) : !plan.purchasable ? (
                    <Button variant="outline" className="w-full" disabled>
                        {plan.current ? 'Your plan' : 'Included'}
                    </Button>
                ) : paidCurrent && sameInterval ? (
                    <Button variant="outline" className="w-full" disabled>
                        <CheckIcon /> Your plan
                    </Button>
                ) : (
                    <Button className="w-full" disabled={!canManage || busy || !billing.stripe_configured} onClick={onChoose}>
                        {busy
                            ? 'One moment…'
                            : paidCurrent
                              ? `Switch to ${yearly ? 'yearly' : 'monthly'}`
                              : billing.subscription?.provider === 'stripe'
                                ? `Switch to ${plan.name}`
                                : `Choose ${plan.name}`}
                    </Button>
                )}
            </div>
        </div>
    );
}

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

/**
 * The Billing page: Overview · Plans · Payment methods · Invoices · Payments · Billing details.
 * Everything happens inside the platform; Stripe processes the money behind it.
 */
export function BillingPanel({ canManage }: { canManage: boolean }) {
    const qc = useQueryClient();
    const billing = useBilling();
    const invoices = useInvoices();
    const cards = usePaymentMethods(billing.data?.stripe_configured ?? false);
    const payments = usePayments(billing.data?.stripe_configured ?? false);
    const [tab, setTab] = useState('overview');
    const [yearly, setYearly] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [addingCard, setAddingCard] = useState(false);
    const [choosing, setChoosing] = useState<BillingPlan | null>(null); // plan waiting in the confirmation dialog
    const b = billing.data;

    if (billing.isLoading) return <Skeleton className="h-72" />;
    if (!b) return <p className="text-sm text-bad">{errorMessage(billing.error)}</p>;

    const sub = b.subscription;
    const stripeSub = sub?.provider === 'stripe';
    const methods = cards.data ?? [];
    const defaultCard = methods.find((m) => m.is_default) ?? methods[0] ?? null;
    const key = b.stripe_publishable_key;
    const upcoming = payments.data?.upcoming ?? null;
    const wallet = payments.data?.wallet ?? null;
    const openInvoices = (invoices.data ?? []).filter((i) => i.status === 'open');

    const refreshAll = () => {
        void qc.invalidateQueries({ queryKey: ['billing'] });
        void qc.invalidateQueries({ queryKey: keys.entitlements });
    };

    const run = async (id: string, action: () => Promise<unknown>) => {
        setBusy(id);
        try {
            await action();
        } catch (e) {
            const first = e instanceof ApiError ? Object.values(e.fields)[0]?.[0] : undefined;
            toast.error(first ?? errorMessage(e));
        } finally {
            setBusy(null);
        }
    };

    /** Confirms a payment with Stripe inside the page (the bank's 3-D Secure step appears here when needed). */
    const confirmInPage = async (clientSecret: string, paymentMethod: string | null): Promise<string | null> => {
        if (!key) return 'Online payments are not switched on.';
        const stripe = await getStripe(key);
        const result = await stripe.confirmCardPayment(clientSecret, paymentMethod ? { payment_method: paymentMethod } : undefined);

        return result.error ? (result.error.message ?? 'The payment did not go through.') : null;
    };

    /** Runs after the customer pressed Confirm in the billing summary. Returns an error message or null. */
    const confirmPlan = async (plan: BillingPlan): Promise<string | null> => {
        try {
            const step = await subscribeToPlan(plan.key, yearly ? 'yearly' : 'monthly', defaultCard?.id);
            if (step.status === 'requires_confirmation' && step.client_secret) {
                const problem = await confirmInPage(step.client_secret, step.payment_method);
                if (problem) {
                    await refreshBilling(true); // withdraw the unpaid attempt
                    refreshAll();

                    return `${problem} Your plan was not changed.`;
                }
                const status = await refreshBilling();
                toast.success(status === 'active' ? `You are now on the ${plan.name} plan` : 'Payment received. Your plan will update in a moment.');
            } else {
                toast.success(`You are now on the ${plan.name} plan (${yearly ? 'yearly' : 'monthly'})`);
            }
            refreshAll();

            return null;
        } catch (e) {
            const first = e instanceof ApiError ? Object.values(e.fields)[0]?.[0] : undefined;

            return first ?? errorMessage(e);
        }
    };

    const choose = (plan: BillingPlan) => {
        if (!b.details.country) {
            toast.error('Choose your billing country first (Billing details), so the correct tax is applied.');
            setTab('details');

            return;
        }
        setChoosing(plan);
    };

    const pay = (invoiceId: string) =>
        run(`pay-${invoiceId}`, async () => {
            const step = await payInvoice(invoiceId);
            if (step.status === 'requires_confirmation' && step.client_secret) {
                const problem = await confirmInPage(step.client_secret, step.payment_method);
                if (problem) {
                    toast.error(problem);

                    return;
                }
                await refreshInvoice(invoiceId);
            }
            toast.success('Invoice paid');
            refreshAll();
        });

    const cancel = () =>
        window.confirm(
            `Cancel your plan? You keep ${b.plan.name} until ${date(sub?.current_period_end)}. After that the workspace moves to the Free plan and nothing more is charged.`,
        ) && run('cancel', async () => qc.setQueryData(['billing'], await cancelSubscription()));

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
                                    {canManage && i.status === 'open' && (
                                        <Button
                                            size="sm"
                                            disabled={busy === `pay-${i.id}`}
                                            onClick={() => (methods.length === 0 ? setAddingCard(true) : pay(i.id))}
                                        >
                                            {busy === `pay-${i.id}` ? 'Paying…' : 'Pay now'}
                                        </Button>
                                    )}
                                    {i.invoice_pdf && (
                                        <Button asChild variant="ghost" size="icon-sm">
                                            <a href={i.invoice_pdf} target="_blank" rel="noreferrer" aria-label={`Download invoice ${i.number ?? ''}`}>
                                                <DownloadIcon />
                                            </a>
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
            {sub?.status === 'past_due' && (
                <div className="rounded-lg border border-bad/20 bg-bad-bg px-4 py-3 text-sm text-bad" role="alert">
                    Your last payment failed. Update your card or pay the open invoice to keep your plan; otherwise the workspace moves to the Free plan.
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
                    <TabsTrigger value="methods">Payment methods</TabsTrigger>
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
                                {sub && STATUS[sub.status] && <Badge tone={STATUS[sub.status].tone}>{STATUS[sub.status].label}</Badge>}
                            </p>
                            <p className="text-[13px] text-muted-foreground">
                                {sub?.status === 'trialing' && sub.trial_ends_at
                                    ? `Free trial until ${date(sub.trial_ends_at)}. Choose a plan to keep these features; otherwise you move to Free.`
                                    : stripeSub && sub.cancel_at
                                      ? `Cancelled. You keep ${b.plan.name} until ${date(sub.cancel_at)}, then move to the Free plan.`
                                      : stripeSub
                                        ? `Billed ${sub.interval === 'yearly' ? 'yearly' : 'monthly'}. Renews automatically.`
                                        : 'No paid subscription.'}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-2">
                                <Button size="sm" onClick={() => setTab('plans')}>
                                    {stripeSub ? 'Change plan' : 'Choose a plan'}
                                </Button>
                                {canManage && stripeSub && sub.cancel_at && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={busy === 'resume'}
                                        onClick={() => run('resume', async () => qc.setQueryData(['billing'], await resumeSubscription()))}
                                    >
                                        Keep my plan
                                    </Button>
                                )}
                            </div>
                        </Card>
                        <Card className="gap-2 p-5">
                            <p className="text-[12.5px] text-muted-foreground">Next payment</p>
                            <p className="text-xl font-semibold tabular-nums">{upcoming ? money(upcoming.amount_due_minor, upcoming.currency) : '—'}</p>
                            <p className="text-[13px] text-muted-foreground">
                                {upcoming?.date
                                    ? `On ${date(upcoming.date)}${b.vat.applies ? `, including ${b.vat.percent}% VAT` : ''}.${
                                          upcoming.credit_applied_minor > 0
                                              ? ` ${money(upcoming.total_minor, upcoming.currency)} less ${money(upcoming.credit_applied_minor, upcoming.currency)} wallet credit.`
                                              : ''
                                      }`
                                    : stripeSub && sub.cancel_at
                                      ? 'Nothing more will be charged.'
                                      : 'Nothing scheduled.'}
                            </p>
                        </Card>
                        <Card className="gap-2 p-5">
                            <p className="text-[12.5px] text-muted-foreground">Payment method</p>
                            <p className="text-xl font-semibold capitalize">{defaultCard ? `${defaultCard.brand} •••• ${defaultCard.last4}` : 'No card'}</p>
                            <p className="text-[13px] text-muted-foreground">
                                {defaultCard
                                    ? `Expires ${String(defaultCard.exp_month).padStart(2, '0')}/${defaultCard.exp_year}.`
                                    : 'Add a card to subscribe to a paid plan.'}
                            </p>
                            <div className="mt-1">
                                <Button size="sm" variant="outline" onClick={() => setTab('methods')}>
                                    Manage cards
                                </Button>
                            </div>
                        </Card>
                    </div>
                    {wallet && (wallet.balance_minor > 0 || wallet.entries.length > 0) && (
                        <Card className="gap-3 p-5">
                            <div className="flex flex-wrap items-start gap-3">
                                <div className="inline-flex size-10 items-center justify-center rounded-lg bg-good-bg text-good">
                                    <WalletIcon className="size-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[12.5px] text-muted-foreground">Wallet credit</p>
                                    <p className="text-xl font-semibold tabular-nums">{money(wallet.balance_minor, wallet.currency)}</p>
                                    <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
                                        {wallet.balance_minor > 0
                                            ? 'This is the remaining balance from a plan you changed. It is applied automatically to your next renewal payments, or if you upgrade.'
                                            : 'Your wallet credit has been used up on your payments.'}
                                        {wallet.balance_minor > 0 && upcoming && upcoming.credit_applied_minor > 0 && upcoming.date
                                            ? ` ${money(upcoming.credit_applied_minor, upcoming.currency)} of it will be used on ${date(upcoming.date)}.`
                                            : ''}
                                    </p>
                                </div>
                            </div>
                            {wallet.entries.length > 0 && (
                                <div className="grid gap-1.5 border-t pt-3 text-[13px]">
                                    {wallet.entries.slice(0, 5).map((e) => (
                                        <div key={e.id} className="flex items-baseline justify-between gap-3">
                                            <span className="text-muted-foreground">
                                                {e.created_at ? date(e.created_at) : ''} ·{' '}
                                                {e.kind === 'added' ? 'Added from a plan change' : 'Used on a payment'}
                                            </span>
                                            <span className={`tabular-nums ${e.kind === 'added' ? 'text-good' : ''}`}>
                                                {e.kind === 'added' ? '+ ' : '− '}
                                                {money(Math.abs(e.amount_minor), e.currency)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    )}
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
                                    Prices are in USD.{' '}
                                    {b.vat.applies
                                        ? `${b.vat.percent}% UAE VAT is added to each payment.`
                                        : b.details.country
                                          ? 'No VAT applies to your country.'
                                          : 'Tax depends on your billing country.'}{' '}
                                    When you change plan, the unused part of your current period is credited and you see the exact amount before confirming.
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
                                        {y ? 'Yearly' : 'Monthly'}
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
                                        busy={false}
                                        onChoose={() => choose(plan)}
                                    />
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                    {stripeSub && (
                        <Card className="flex-row flex-wrap items-center gap-3 p-5">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold">{sub.cancel_at ? 'Your plan is cancelled' : 'Cancel plan'}</p>
                                <p className="text-[13px] text-muted-foreground">
                                    {sub.cancel_at
                                        ? `You keep ${b.plan.name} until ${date(sub.cancel_at)}. After that the workspace moves to the Free plan.`
                                        : `Your subscription renews automatically on ${date(sub.current_period_end)}. If you cancel, you keep ${b.plan.name} until then and move to the Free plan afterwards.`}
                                </p>
                            </div>
                            {canManage &&
                                (sub.cancel_at ? (
                                    <Button
                                        variant="outline"
                                        disabled={busy === 'resume'}
                                        onClick={() => run('resume', async () => qc.setQueryData(['billing'], await resumeSubscription()))}
                                    >
                                        Keep my plan
                                    </Button>
                                ) : (
                                    <Button variant="outline" className="text-bad" disabled={busy === 'cancel'} onClick={cancel}>
                                        Cancel plan
                                    </Button>
                                ))}
                        </Card>
                    )}
                </TabsContent>

                <TabsContent value="methods">
                    <Card>
                        <CardHeader>
                            <div>
                                <CardTitle>Payment methods</CardTitle>
                                <CardDescription>
                                    Cards are stored securely by Stripe. The default card is charged for renewals and plan changes.
                                </CardDescription>
                            </div>
                            {canManage && b.stripe_configured && (
                                <Button variant="outline" onClick={() => setAddingCard(true)}>
                                    <PlusIcon /> Add payment method
                                </Button>
                            )}
                        </CardHeader>
                        <CardContent className="grid gap-3">
                            {cards.isLoading ? (
                                <Skeleton className="h-12" />
                            ) : methods.length === 0 ? (
                                <p className="text-[13px] text-muted-foreground">No card saved yet. Add one to subscribe to a paid plan.</p>
                            ) : (
                                methods.map((m) => (
                                    <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2.5">
                                        <CreditCardIcon className="size-5 text-muted-foreground" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium capitalize">
                                                {m.brand} •••• {m.last4} {m.is_default && <Badge tone="brand">Default</Badge>}
                                            </p>
                                            <p className="text-[12.5px] text-muted-foreground">
                                                Expires {String(m.exp_month).padStart(2, '0')}/{m.exp_year}
                                            </p>
                                        </div>
                                        {canManage && !m.is_default && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={busy === m.id}
                                                onClick={() =>
                                                    run(m.id, async () => qc.setQueryData(['billing', 'payment-methods'], await setDefaultPaymentMethod(m.id)))
                                                }
                                            >
                                                Make default
                                            </Button>
                                        )}
                                        {canManage && (
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                aria-label={`Remove card ending ${m.last4}`}
                                                disabled={busy === `rm-${m.id}`}
                                                onClick={() =>
                                                    window.confirm(`Remove the card ending ${m.last4}?`) &&
                                                    run(`rm-${m.id}`, async () =>
                                                        qc.setQueryData(['billing', 'payment-methods'], await removePaymentMethod(m.id)),
                                                    )
                                                }
                                            >
                                                <Trash2Icon />
                                            </Button>
                                        )}
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
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

            <PlanChangeDialog
                plan={addingCard ? null : choosing}
                yearly={yearly}
                card={defaultCard}
                onClose={() => setChoosing(null)}
                onAddCard={() => setAddingCard(true)}
                onConfirm={confirmPlan}
            />

            {key && (
                <AddCardDialog
                    open={addingCard}
                    onOpenChange={setAddingCard}
                    publishableKey={key}
                    onAdded={(paymentMethodId) => {
                        toast.success('Card saved');
                        // A card added from the billing summary is the one the customer wants to pay with.
                        const refresh = () => void qc.invalidateQueries({ queryKey: ['billing', 'payment-methods'] });
                        if (choosing && paymentMethodId) void setDefaultPaymentMethod(paymentMethodId).then(refresh, refresh);
                        else refresh();
                    }}
                />
            )}
        </div>
    );
}
