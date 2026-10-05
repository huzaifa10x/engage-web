'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CheckIcon, CreditCardIcon, DownloadIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Field, FormError } from '@/components/app/field';
import { Badge, type Tone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
    setAutoPay,
    setDefaultPaymentMethod,
    subscribeToPlan,
    updateBillingDetails,
    useBilling,
    useInvoices,
    usePaymentMethods,
} from '@/lib/queries';
import { getStripe } from '@/lib/stripe';
import type { Billing, BillingPlan } from '@/lib/types';

import { AddCardDialog } from './add-card-dialog';

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
        <div className={`flex flex-col rounded-lg border p-4 ${plan.current ? 'border-primary ring-1 ring-primary' : ''}`}>
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

/**
 * Plan, payment methods, auto-pay, billing details and invoices — all inside the platform.
 * Stripe processes the money; its card field and bank verification step appear in our own pages.
 */
export function BillingPanel({ canManage }: { canManage: boolean }) {
    const qc = useQueryClient();
    const billing = useBilling();
    const invoices = useInvoices();
    const cards = usePaymentMethods(billing.data?.stripe_configured ?? false);
    const [yearly, setYearly] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [addingCard, setAddingCard] = useState(false);
    const [pendingPlan, setPendingPlan] = useState<BillingPlan | null>(null); // chosen before a card existed
    const b = billing.data;

    if (billing.isLoading) return <Skeleton className="h-72" />;
    if (!b) return <p className="text-sm text-bad">{errorMessage(billing.error)}</p>;

    const sub = b.subscription;
    const stripeSub = sub?.provider === 'stripe';
    const methods = cards.data ?? [];
    const key = b.stripe_publishable_key;

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

    const choose = (plan: BillingPlan, paymentMethod?: string | null) =>
        run(plan.key, async () => {
            if (!b.details.country) {
                toast.error('Choose your billing country below first, so the correct tax is applied.');

                return;
            }
            if (!stripeSub && methods.length === 0 && !paymentMethod) {
                setPendingPlan(plan); // add a card first, then continue with this plan
                setAddingCard(true);

                return;
            }

            const step = await subscribeToPlan(plan.key, yearly ? 'yearly' : 'monthly', paymentMethod);
            if (step.status === 'requires_confirmation' && step.client_secret) {
                const problem = await confirmInPage(step.client_secret, step.payment_method);
                if (problem) {
                    await refreshBilling(true); // cancel the unpaid attempt
                    toast.error(`${problem} Your plan was not changed.`);

                    return;
                }
                const status = await refreshBilling();
                toast.success(status === 'active' ? `You are now on the ${plan.name} plan` : 'Payment received. Your plan will update in a moment.');
            } else {
                toast.success(step.updated ? `Plan changed to ${plan.name}` : `You are now on the ${plan.name} plan`);
            }
            refreshAll();
        });

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

    return (
        <div className="grid gap-4">
            {sub?.status === 'past_due' && (
                <div className="rounded-lg border border-bad/20 bg-bad-bg px-4 py-3 text-sm text-bad" role="alert">
                    Your last payment failed. Update your card or pay the open invoice below to keep your plan; otherwise the workspace moves to the Free plan.
                </div>
            )}
            {!b.stripe_configured && (
                <div className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">
                    Online payments are not switched on yet. Contact support to change your plan.
                </div>
            )}

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
                            {stripeSub && sub.cancel_at
                                ? `Your subscription ends on ${date(sub.cancel_at)}; after that you move to the Free plan.`
                                : stripeSub && sub.current_period_end
                                  ? `${sub.auto_pay ? 'Renews' : 'Next invoice'} on ${date(sub.current_period_end)}.`
                                  : ''}
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
                                busy={busy === plan.key}
                                onChoose={() => choose(plan)}
                            />
                        ))}
                    </div>
                    {canManage && stripeSub && (
                        <div className="flex flex-wrap gap-2">
                            {sub.cancel_at ? (
                                <Button
                                    variant="outline"
                                    disabled={busy === 'resume'}
                                    onClick={() => run('resume', async () => qc.setQueryData(['billing'], await resumeSubscription()))}
                                >
                                    Keep my subscription
                                </Button>
                            ) : (
                                <Button
                                    variant="ghost"
                                    disabled={busy === 'cancel'}
                                    onClick={() =>
                                        window.confirm(
                                            `Cancel your subscription? You keep ${b.plan.name} until ${date(sub.current_period_end)}, then move to the Free plan.`,
                                        ) && run('cancel', async () => qc.setQueryData(['billing'], await cancelSubscription()))
                                    }
                                >
                                    Cancel subscription
                                </Button>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {b.stripe_configured && (
                <Card>
                    <CardHeader>
                        <div>
                            <CardTitle>Payment methods</CardTitle>
                            <CardDescription>Cards are stored securely by Stripe. The default card is used for your subscription.</CardDescription>
                        </div>
                        {canManage && (
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
                                                run(`rm-${m.id}`, async () => qc.setQueryData(['billing', 'payment-methods'], await removePaymentMethod(m.id)))
                                            }
                                        >
                                            <Trash2Icon />
                                        </Button>
                                    )}
                                </div>
                            ))
                        )}
                        {stripeSub && (
                            <label className="flex items-start justify-between gap-4 rounded-md border px-3 py-2.5">
                                <span>
                                    <span className="block text-sm font-medium">Auto-pay</span>
                                    <span className="block text-[12.5px] text-muted-foreground">
                                        {sub.auto_pay
                                            ? 'On: your default card is charged automatically at each renewal.'
                                            : 'Off: at each renewal you receive an invoice and pay it here within 7 days. Unpaid invoices move the workspace to the Free plan.'}
                                    </span>
                                </span>
                                <Switch
                                    checked={sub.auto_pay}
                                    disabled={!canManage || busy === 'autopay'}
                                    aria-label="Auto-pay"
                                    onCheckedChange={(v) => run('autopay', async () => qc.setQueryData(['billing'], await setAutoPay(v)))}
                                />
                            </label>
                        )}
                    </CardContent>
                </Card>
            )}

            <DetailsForm key={JSON.stringify(b.details)} billing={b} canManage={canManage} />

            <Card className="overflow-hidden p-0">
                <p className="px-5 pt-4 pb-2 text-sm font-semibold">Billing history</p>
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

            {key && (
                <AddCardDialog
                    open={addingCard}
                    onOpenChange={(o) => {
                        setAddingCard(o);
                        if (!o) setPendingPlan(null);
                    }}
                    publishableKey={key}
                    onAdded={(paymentMethodId) => {
                        toast.success('Card saved');
                        void qc.invalidateQueries({ queryKey: ['billing', 'payment-methods'] });
                        const plan = pendingPlan;
                        setPendingPlan(null);
                        if (plan) void choose(plan, paymentMethodId); // continue with the plan they picked
                    }}
                />
            )}
        </div>
    );
}
