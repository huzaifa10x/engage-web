'use client';

import { ArrowRightIcon, CreditCardIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { FormError } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, errorMessage } from '@/lib/api';
import { date } from '@/lib/format';
import { previewPlan } from '@/lib/queries';
import type { BillingPlan, BillingPreview, PaymentMethod } from '@/lib/types';

const money = (minor: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);

function Row({ label, value, strong = false, muted = false }: { label: React.ReactNode; value: string; strong?: boolean; muted?: boolean }) {
    return (
        <div
            className={`flex items-baseline justify-between gap-4 ${strong ? 'text-[15px] font-semibold' : 'text-sm'} ${muted ? 'text-muted-foreground' : ''}`}
        >
            <span>{label}</span>
            <span className="tabular-nums">{value}</span>
        </div>
    );
}

/**
 * The confirmation step before any plan or billing-period change. The numbers are Stripe's own
 * calculation (fetched when the dialog opens); nothing is charged until "Confirm" is pressed.
 */
export function PlanChangeDialog({
    plan,
    yearly,
    card,
    onClose,
    onAddCard,
    onConfirm,
}: {
    plan: BillingPlan | null;
    yearly: boolean;
    card: PaymentMethod | null;
    onClose: () => void;
    onAddCard: () => void;
    /** Resolves to an error message, or null when the plan is now active. */
    onConfirm: (plan: BillingPlan) => Promise<string | null>;
}) {
    const [preview, setPreview] = useState<BillingPreview | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [working, setWorking] = useState(false);
    const planKey = plan?.key ?? null;

    useEffect(() => {
        if (!planKey) return;
        let cancelled = false;
        previewPlan(planKey, yearly ? 'yearly' : 'monthly')
            .then((p) => !cancelled && setPreview(p))
            .catch((e: unknown) => {
                if (cancelled) return;
                const first = e instanceof ApiError ? Object.values(e.fields)[0]?.[0] : undefined;
                setError(first ?? errorMessage(e));
            });

        return () => {
            cancelled = true;
            setPreview(null);
            setError(null);
        };
    }, [planKey, yearly]);

    const confirm = async () => {
        if (!plan) return;
        setWorking(true);
        setError(null);
        const problem = await onConfirm(plan);
        setWorking(false);
        if (problem) setError(problem);
        else onClose();
    };

    const p = preview;
    const period = yearly ? 'year' : 'month';
    // Wallet credit includes VAT, so the downgrade breakdown is shown with VAT as well.
    const newPlanWithTax = p ? Math.round(p.price_minor * (1 + p.tax_percent / 100)) : 0;
    const withVat = p && p.tax_percent > 0 ? ' (incl. VAT)' : '';

    return (
        <Dialog open={plan !== null} onOpenChange={(o) => !o && !working && onClose()}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{p?.change ? 'Confirm plan change' : 'Confirm your plan'}</DialogTitle>
                    <DialogDescription>Review the billing summary. Your plan changes only after the payment has gone through.</DialogDescription>
                </DialogHeader>
                <FormError message={error} />

                {!p && !error && <Skeleton className="h-56" />}

                {p && (
                    <div className="grid gap-4">
                        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm">
                            {p.change && p.from && (
                                <>
                                    <span className="text-muted-foreground">
                                        {p.from.plan} · {p.from.interval === 'yearly' ? 'yearly' : 'monthly'}
                                    </span>
                                    <ArrowRightIcon className="size-4 text-muted-foreground" />
                                </>
                            )}
                            <span className="font-semibold">
                                {p.plan.name} · {yearly ? 'yearly' : 'monthly'}
                            </span>
                            <span className="ml-auto tabular-nums">
                                {money(p.price_minor, p.currency)} / {period}
                            </span>
                        </div>

                        <div className="grid gap-2 rounded-lg border p-4">
                            <p className="text-[12.5px] font-semibold tracking-wide text-muted-foreground uppercase">Billing summary</p>
                            {p.lines.map((line, i) => (
                                <Row
                                    key={i}
                                    label={line.description || (line.proration ? 'Proration' : p.plan.name)}
                                    value={money(line.amount_minor, p.currency)}
                                    muted={line.amount_minor < 0}
                                />
                            ))}
                            <div className="my-1 border-t" />
                            <Row label="Subtotal" value={money(p.subtotal_minor, p.currency)} />
                            {p.tax_minor > 0 && <Row label={`VAT (${p.tax_percent}%)`} value={money(p.tax_minor, p.currency)} />}
                            {p.balance_applied_minor > 0 && <Row label="Wallet credit used" value={`− ${money(p.balance_applied_minor, p.currency)}`} muted />}
                            <div className="my-1 border-t" />
                            <Row label="Due today" value={money(p.amount_due_minor, p.currency)} strong />
                        </div>

                        {p.credit_kept_minor > 0 ? (
                            <div className="grid gap-2 rounded-lg border border-good/30 bg-good-bg p-4">
                                <p className="text-sm font-semibold">You keep {money(p.credit_kept_minor, p.currency)} as wallet credit</p>
                                <Row label={`Unused on your current plan${withVat}`} value={money(p.credit_kept_minor + newPlanWithTax, p.currency)} />
                                <Row
                                    label={`${p.plan.name} for the first ${period}${withVat}, paid from it`}
                                    value={`− ${money(newPlanWithTax, p.currency)}`}
                                    muted
                                />
                                <div className="my-0.5 border-t border-good/20" />
                                <Row label="Added to your wallet" value={money(p.credit_kept_minor, p.currency)} strong />
                                <p className="text-[13px] text-muted-foreground">
                                    Nothing is charged today and nothing is refunded to your card. The credit stays in your wallet
                                    {p.wallet_after_minor > p.credit_kept_minor ? ` (${money(p.wallet_after_minor, p.currency)} in total)` : ''} and is used
                                    automatically for your next renewal payments, or if you upgrade again.
                                </p>
                            </div>
                        ) : (
                            p.change &&
                            p.unused_credit_minor > 0 && (
                                <p className="text-[13px] text-muted-foreground">
                                    You have {money(p.unused_credit_minor, p.currency)} of unused time on your current plan. It is deducted from today&apos;s
                                    charge, nothing is refunded to your card, and a new billing {period} starts today.
                                </p>
                            )
                        )}
                        <p className="text-[13px] text-muted-foreground">
                            Renews automatically on {date(p.renews_at)} at {money(p.price_minor, p.currency)}
                            {p.tax_percent > 0 ? ` + ${p.tax_percent}% VAT` : ''} per {period}. You can cancel at any time.
                        </p>

                        <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm">
                            <CreditCardIcon className="size-5 text-muted-foreground" />
                            {card ? (
                                <span className="capitalize">
                                    {card.brand} •••• {card.last4}
                                </span>
                            ) : (
                                <span className="text-muted-foreground">No card saved yet</span>
                            )}
                            <Button variant="outline" size="sm" className="ml-auto" onClick={onAddCard} disabled={working}>
                                {card ? 'Use another card' : 'Add a card'}
                            </Button>
                        </div>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={working}>
                        Cancel
                    </Button>
                    <Button onClick={confirm} disabled={!p || !card || working}>
                        {working ? 'Processing…' : p && p.amount_due_minor > 0 ? `Confirm and pay ${money(p.amount_due_minor, p.currency)}` : 'Confirm change'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
