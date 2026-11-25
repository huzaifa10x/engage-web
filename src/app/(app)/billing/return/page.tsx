'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2Icon, CircleAlertIcon, LoaderCircleIcon } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

import { Forbidden, PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { errorMessage } from '@/lib/api';
import { P } from '@/lib/permissions';
import { confirmBillingReturn, fetchBillingSummary, keys } from '@/lib/queries';
import type { Billing, BillingPortalFlow } from '@/lib/types';

type View = { tone: 'busy' | 'good' | 'bad'; title: string; body: string };

const FLOWS: BillingPortalFlow[] = ['update', 'card', 'cancel', 'manage'];

/** The paid plan Checkout started is live once the summary shows a self-serve subscription. */
const activated = (b: Billing) => Boolean(b.subscription?.self_serve) && b.subscription?.status !== 'past_due';

/**
 * Where Stripe sends the client back (Batch 6). The redirect proves nothing by itself: the server
 * checks the Checkout session with Stripe, and the plan changes only when Stripe's webhook arrives.
 * This page polls the summary every 2 seconds for up to 30 seconds, then keeps checking quietly.
 */
function BillingReturn() {
    const params = useSearchParams();
    const qc = useQueryClient();
    const sessionId = params.get('session_id');
    const flowParam = params.get('flow');
    const flow = FLOWS.find((f) => f === flowParam);
    const [view, setView] = useState<View>({ tone: 'busy', title: 'Confirming with Stripe…', body: 'This usually takes a few seconds.' });
    const started = useRef(false);

    useEffect(() => {
        if (started.current) return; // once, even in development's double effects
        started.current = true;
        let stop = false;
        const timers: ReturnType<typeof setTimeout>[] = [];
        const refresh = () => {
            void qc.invalidateQueries({ queryKey: ['billing'] });
            void qc.invalidateQueries({ queryKey: keys.entitlements });
            void qc.invalidateQueries({ queryKey: keys.me });
        };

        /** Polls the summary until the webhook has made the change: 2 s for 30 s, then every 15 s. */
        const waitForWebhook = (started: number) => {
            const tick = async () => {
                if (stop) return;
                const summary = await fetchBillingSummary().catch(() => null);
                if (summary && activated(summary)) {
                    refresh();
                    setView({ tone: 'good', title: `You're on ${summary.plan.name}`, body: 'Your plan is active. Thank you!' });

                    return;
                }
                const waited = Date.now() - started;
                if (waited >= 30_000) {
                    setView({
                        tone: 'good',
                        title: 'Payment received',
                        body: 'Your plan will update in a minute. You can keep working; this page checks again by itself.',
                    });
                }
                timers.push(setTimeout(tick, waited >= 30_000 ? 15_000 : 2_000));
            };
            void tick();
        };

        const run = async () => {
            try {
                if (sessionId) {
                    const result = await confirmBillingReturn({ session_id: sessionId });
                    if (result.status === 'paid' || result.status === 'processing') {
                        waitForWebhook(Date.now());
                    } else if (result.status === 'incomplete') {
                        setView({ tone: 'bad', title: 'Payment not completed', body: 'Nothing was changed. You can upgrade again from Billing.' });
                    } else {
                        setView({
                            tone: 'bad',
                            title: "We couldn't confirm this payment",
                            body: 'Nothing was changed on this workspace. If you were charged, contact us.',
                        });
                    }

                    return;
                }
                if (flow) {
                    const result = await confirmBillingReturn({ flow });
                    refresh();
                    if (flow === 'card') {
                        setView(
                            result.status === 'paid'
                                ? { tone: 'good', title: 'Invoice paid', body: 'Your new card is saved with Stripe and paid features are back on.' }
                                : result.status === 'failed'
                                  ? {
                                        tone: 'bad',
                                        title: 'The payment did not go through',
                                        body: `${result.message ?? 'Your bank declined it.'} Try another card.`,
                                    }
                                  : { tone: 'good', title: 'Card updated', body: 'Stripe will charge this card for your next renewal.' },
                        );
                    } else {
                        setView({ tone: 'good', title: 'Billing updated', body: 'Changes you confirmed on Stripe show on the Billing page.' });
                    }

                    return;
                }
                setView({ tone: 'good', title: 'Nothing was changed', body: '' });
            } catch (e) {
                setView({ tone: 'bad', title: "We couldn't check with Stripe", body: errorMessage(e) });
            }
        };
        void run();

        return () => {
            stop = true;
            timers.forEach(clearTimeout);
        };
    }, [sessionId, flow, qc]);

    const Icon = view.tone === 'busy' ? LoaderCircleIcon : view.tone === 'good' ? CheckCircle2Icon : CircleAlertIcon;

    return (
        <Card className="mx-auto mt-6 max-w-lg items-center gap-3 p-8 text-center">
            <Icon
                className={`size-10 ${view.tone === 'busy' ? 'animate-spin text-muted-foreground motion-reduce:animate-none' : view.tone === 'good' ? 'text-good' : 'text-bad'}`}
            />
            <p className="text-lg font-semibold" role="status" aria-live="polite">
                {view.title}
            </p>
            {view.body && <p className="text-sm text-muted-foreground">{view.body}</p>}
            {view.tone !== 'busy' && (
                <Button asChild className="mt-2">
                    <Link href="/billing">Back to Billing</Link>
                </Button>
            )}
        </Card>
    );
}

export default function BillingReturnPage() {
    const { can } = useSession();
    if (!can(P.BillingView)) return <Forbidden />;

    return (
        <>
            <PageHeader title="Billing" />
            <Suspense>
                <BillingReturn />
            </Suspense>
        </>
    );
}
