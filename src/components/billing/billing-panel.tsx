'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CheckIcon, CreditCardIcon, DownloadIcon, ExternalLinkIcon } from 'lucide-react';
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
import { ApiError, errorMessage } from '@/lib/api';
import { COUNTRIES, VAT_COUNTRY } from '@/lib/countries';
import { date } from '@/lib/format';
import { cancelSubscription, keys, openBillingPortal, resumeSubscription, startCheckout, updateBillingDetails, useBilling, useInvoices } from '@/lib/queries';
import type { Billing, BillingPlan } from '@/lib/types';

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

/** Plan, payment, billing details and invoices. Payments, cards and refunds are handled by Stripe. */
export function BillingPanel({ canManage }: { canManage: boolean }) {
    const qc = useQueryClient();
    const router = useRouter();
    const params = useSearchParams();
    const returned = params.get('checkout');
    const [timedOut, setTimedOut] = useState(false);
    const billing = useBilling(true, returned === 'success' && !timedOut);
    const invoices = useInvoices();
    const [yearly, setYearly] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const b = billing.data;
    // Back from Checkout: Stripe confirms the payment by webhook a moment later.
    const confirmed = b?.subscription?.provider === 'stripe' && b.subscription.status === 'active';
    const waiting = returned === 'success' && !confirmed && !timedOut;
    const planName = b?.plan.name;

    useEffect(() => {
        if (returned === 'cancelled') {
            toast.message('Checkout cancelled. Your plan was not changed.');
            router.replace('/settings?tab=plan');
        }
        if (returned !== 'success') return;
        const stop = setTimeout(() => setTimedOut(true), 45_000);

        return () => clearTimeout(stop);
    }, [returned, router]);
    useEffect(() => {
        if (returned === 'success' && confirmed) {
            toast.success(`You are now on the ${planName} plan`);
            void qc.invalidateQueries({ queryKey: keys.entitlements });
            void qc.invalidateQueries({ queryKey: ['billing', 'invoices'] });
            router.replace('/settings?tab=plan');
        }
    }, [returned, confirmed, planName, qc, router]);

    if (billing.isLoading) return <Skeleton className="h-72" />;
    if (!b) return <p className="text-sm text-bad">{errorMessage(billing.error)}</p>;

    const sub = b.subscription;
    const stripeSub = sub?.provider === 'stripe';

    const run = async (key: string, action: () => Promise<unknown>) => {
        setBusy(key);
        try {
            await action();
        } catch (e) {
            const first = e instanceof ApiError ? Object.values(e.fields)[0]?.[0] : undefined;
            toast.error(first ?? errorMessage(e));
        } finally {
            setBusy(null);
        }
    };

    const choose = (plan: BillingPlan) =>
        run(plan.key, async () => {
            if (!b.details.country) {
                toast.error('Choose your billing country below first, so the correct tax is applied.');

                return;
            }
            const result = await startCheckout(plan.key, yearly ? 'yearly' : 'monthly');
            if (result.url) {
                window.location.assign(result.url); // Stripe's secure payment page
            } else {
                toast.success(`Plan changed to ${plan.name}`);
                void qc.invalidateQueries({ queryKey: ['billing'] });
                void qc.invalidateQueries({ queryKey: keys.entitlements });
            }
        });

    return (
        <div className="grid gap-4">
            {waiting && (
                <div className="rounded-lg border border-info/20 bg-info-bg px-4 py-3 text-sm" role="status">
                    Payment received. Confirming your new plan with Stripe…
                </div>
            )}
            {returned === 'success' && timedOut && !confirmed && (
                <div className="rounded-lg border border-warn/30 bg-warn-bg px-4 py-3 text-sm" role="status">
                    Your payment is taking longer than usual to confirm. Refresh this page in a minute; if the plan has not changed, contact support.
                </div>
            )}
            {sub?.status === 'past_due' && (
                <div className="rounded-lg border border-bad/20 bg-bad-bg px-4 py-3 text-sm text-bad" role="alert">
                    Your last payment failed. Update your payment method to keep your plan; otherwise the workspace moves to the Free plan.
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
                                ? `${b.vat.percent}% UAE VAT is added at checkout.`
                                : b.details.country
                                  ? 'No VAT applies to your country.'
                                  : 'Tax depends on your billing country.'}{' '}
                            {stripeSub && sub.cancel_at
                                ? `Your subscription ends on ${date(sub.cancel_at)}; after that you move to the Free plan.`
                                : stripeSub && sub.current_period_end
                                  ? `Renews on ${date(sub.current_period_end)}.`
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
                                {y ? 'Yearly · 2 months free' : 'Monthly'}
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
                    {canManage && b.has_payment_history && (
                        <div className="flex flex-wrap gap-2">
                            <Button
                                variant="outline"
                                disabled={busy === 'portal'}
                                onClick={() => run('portal', async () => window.location.assign(await openBillingPortal()))}
                            >
                                <CreditCardIcon /> Payment method & receipts <ExternalLinkIcon />
                            </Button>
                            {stripeSub &&
                                (sub.cancel_at ? (
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
                                ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <DetailsForm key={JSON.stringify(b.details)} billing={b} canManage={canManage} />

            <Card className="overflow-hidden p-0">
                <p className="px-5 pt-4 pb-2 text-sm font-semibold">Invoices</p>
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent">
                            <TableHead>Invoice</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">VAT</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-10" />
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
                                    {(i.invoice_pdf ?? i.hosted_invoice_url) && (
                                        <Button asChild variant="ghost" size="icon-sm">
                                            <a
                                                href={i.invoice_pdf ?? i.hosted_invoice_url ?? '#'}
                                                target="_blank"
                                                rel="noreferrer"
                                                aria-label={`Download invoice ${i.number ?? ''}`}
                                            >
                                                <DownloadIcon />
                                            </a>
                                        </Button>
                                    )}
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
        </div>
    );
}
