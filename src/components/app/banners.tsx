'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ShieldAlertIcon, SparklesIcon, TriangleAlertIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { daysUntil } from '@/lib/format';
import { P } from '@/lib/permissions';
import { usePhoneNumbers } from '@/lib/queries';
import { disconnectExplanation } from '@/lib/whatsapp';

import { useSession } from './session';

/** Persistent while a Super Admin is signed in as this customer ("Log in as"). */
export function ImpersonationBanner() {
    const { me } = useSession();
    const qc = useQueryClient();
    const router = useRouter();
    if (!me.impersonation) return null;

    const end = async () => {
        await api('auth/impersonation', { method: 'DELETE' }).catch(() => undefined);
        qc.clear();
        window.close(); // support sessions open in their own tab; falls through if the browser refuses
        router.replace('/login');
    };

    return (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-warn px-4 py-2 text-[13px] text-white">
            <ShieldAlertIcon className="size-4" />
            <span className="font-semibold">Support session</span>
            <span className="opacity-90">
                {me.impersonation.admin_name ?? 'A 10X Digital admin'} is signed in as {me.user.name}
                {me.impersonation.reason ? ` · ${me.impersonation.reason}` : ''}. Every action is audited.
            </span>
            <Button size="sm" variant="outline" className="ml-auto h-7 border-white/40 bg-transparent text-white hover:bg-white/10" onClick={end}>
                End session
            </Button>
        </div>
    );
}

export function TrialBanner() {
    const { me, can } = useSession();
    const e = me.entitlements;
    if (!e || e.subscription?.status !== 'trialing') return null;
    const days = daysUntil(e.subscription.trial_ends_at);

    return (
        <div className="flex flex-wrap items-center gap-2 border-b border-brand-100 bg-brand-50 px-4 py-2 text-[13px] text-brand-600 sm:px-6">
            <SparklesIcon className="size-4" />
            <span>
                <span className="font-semibold">{e.plan?.name} trial</span> · {days === 0 ? 'ends today' : `${days} day${days === 1 ? '' : 's'} left`}. Your
                workspace moves to the Free plan when it ends.
            </span>
            {can(P.BillingView) && (
                <Link href="/billing" className="ml-auto font-semibold hover:underline">
                    View plan
                </Link>
            )}
        </div>
    );
}

/**
 * Batch 6, no grace period: the red bar on every page while a renewal is unpaid. Paid features are
 * paused at once; sending and receiving messages keep working.
 */
export function PaymentFailedBanner() {
    const { me, can } = useSession();
    const pathname = usePathname();
    // The Billing page shows its own notice, with the button that opens Stripe.
    if (me.entitlements?.subscription?.status !== 'past_due' || pathname.startsWith('/billing')) return null;

    return (
        <div role="alert" className="flex items-center gap-2 border-b border-bad/20 bg-bad px-4 py-2 text-[13px] text-white sm:flex-wrap sm:px-6">
            <TriangleAlertIcon className="size-4" />
            <span className="min-w-0 flex-1">
                <span className="font-semibold">Payment failed.</span>
                {/* Phones: one line; the Billing page explains the rest. */}
                <span className="max-sm:hidden"> Chatbots, automations, reply alerts, campaigns and extra seats are paused. Messaging still works.</span>
                <span className="sm:hidden"> Paid features paused.</span>
            </span>
            {can(P.BillingView) ? (
                <Link href="/billing" className="ml-auto shrink-0 font-semibold underline-offset-2 hover:underline">
                    {can(P.BillingManage) ? (
                        <>
                            <span className="max-sm:hidden">Update card and pay</span>
                            <span className="sm:hidden">Pay now</span>
                        </>
                    ) : (
                        'View billing'
                    )}
                </Link>
            ) : (
                <span className="ml-auto opacity-90">Ask the workspace owner to update the card.</span>
            )}
        </div>
    );
}

/**
 * Shown on every page while a WhatsApp number is disconnected because access was removed on the
 * customer's side (at Meta, or in the WhatsApp Business app): the workspace cannot send or
 * receive on it until someone reconnects it.
 */
export function ChannelDisconnectedBanner() {
    const { can } = useSession();
    const numbers = usePhoneNumbers();
    const lost = (numbers.data ?? []).filter((n) => n.status === 'disconnected' && disconnectExplanation(n.disconnect_reason) !== null);
    if (lost.length === 0) return null;

    const names = lost.map((n) => n.verified_name ?? n.display_phone_number).join(', ');

    return (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-bad/30 bg-bad-bg px-4 py-2 text-[13px] text-ink-2">
            <TriangleAlertIcon className="size-4 shrink-0 text-bad" />
            <span>
                <span className="font-semibold text-bad">WhatsApp disconnected: {names}.</span> {disconnectExplanation(lost[0].disconnect_reason)} Messages
                cannot be sent or received on {lost.length === 1 ? 'this number' : 'these numbers'} until {lost.length === 1 ? 'it is' : 'they are'}{' '}
                reconnected.
            </span>
            {/* For those who can fix it: straight into the connection window (also when already on Channels). */}
            <Link
                href={can(P.ChannelsManage) ? '/channels?connect=1' : '/channels'}
                className="ml-auto font-semibold text-bad underline-offset-2 hover:underline"
            >
                {can(P.ChannelsManage) ? 'Reconnect' : 'See Channels'}
            </Link>
        </div>
    );
}
