'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import type { MessageTemplate } from '@/lib/types';

const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(n);

/** The template page: what Meta charges per message of this template's category, in every market. */
export function TemplatePricing({ templateId }: { templateId: string }) {
    const [q, setQ] = useState('');
    const t = useQuery({
        queryKey: ['templates', templateId, 'detail'],
        queryFn: () => api<{ data: MessageTemplate }>(`templates/${templateId}`).then((r) => r.data),
    });
    const pricing = t.data?.pricing;
    if (!pricing) return <Skeleton className="h-24" />;
    const needle = q.trim().toLowerCase();
    // Two letters: a country code (AE); otherwise part of the market's name.
    const rows = pricing.markets.filter((m) =>
        needle === '' ? true : needle.length === 2 ? m.countries.some((c) => c.toLowerCase() === needle) : m.market.toLowerCase().includes(needle),
    );

    return (
        <section className="grid gap-2" aria-label="Cost per message by country">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[13px] font-semibold">Cost per message by country</p>
                <p className="text-[12px] font-medium">{pricing.label}</p>
            </div>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Country or code, e.g. AE" aria-label="Find a country" className="h-8" />
            <div className="max-h-56 overflow-y-auto rounded-md border">
                <table className="w-full text-[12.5px]">
                    <tbody className="tabular-nums">
                        {rows.map((m) => (
                            <tr key={m.market} className="border-b last:border-0">
                                <td className="px-2.5 py-1">
                                    {m.market}
                                    {m.countries.length > 1 && <span className="text-muted-foreground"> · {m.countries.join(', ')}</span>}
                                </td>
                                <td className="px-2.5 py-1 text-right">{usd(m.rate)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-[12px] text-muted-foreground">
                {t.data?.category === 'UTILITY' ? 'Free when the customer wrote to you in the last 24 hours. ' : ''}
                Meta’s rates from{' '}
                {pricing.rates_effective_from
                    ? new Date(`${pricing.rates_effective_from}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
                    : 'unknown'}
                , in USD, before any volume discount. Countries not listed are priced as Other.
            </p>
        </section>
    );
}
