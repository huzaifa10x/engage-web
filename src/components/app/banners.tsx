'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ShieldAlertIcon, SparklesIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { daysUntil } from '@/lib/format';
import { P } from '@/lib/permissions';

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
