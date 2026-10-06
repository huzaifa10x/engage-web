'use client';

import { Forbidden, PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { BillingPanel } from '@/components/billing/billing-panel';
import { P } from '@/lib/permissions';

export default function BillingPage() {
    const { can } = useSession();

    if (!can(P.BillingView)) return <Forbidden />;

    return (
        <>
            <PageHeader title="Billing" description="Your plan, payment methods, invoices and payments." />
            <BillingPanel canManage={can(P.BillingManage)} />
        </>
    );
}
