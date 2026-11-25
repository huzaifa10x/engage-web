'use client';

import { Suspense } from 'react';

import { Forbidden, PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { BillingPanel } from '@/components/billing/billing-panel';
import { Skeleton } from '@/components/ui/skeleton';
import { P } from '@/lib/permissions';

export default function BillingPage() {
    const { can } = useSession();

    if (!can(P.BillingView)) return <Forbidden />;

    return (
        <>
            <PageHeader title="Billing" description="Your plan, invoices and payments. Payments are made on Stripe's secure pages." />
            <Suspense fallback={<Skeleton className="h-72" />}>
                <BillingPanel canManage={can(P.BillingManage)} />
            </Suspense>
        </>
    );
}
