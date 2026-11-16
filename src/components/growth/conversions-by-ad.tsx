'use client';

import { useQuery } from '@tanstack/react-query';
import { MegaphoneIcon } from 'lucide-react';

import { EmptyState } from '@/components/app/page-header';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, ApiError } from '@/lib/api';
import { relative } from '@/lib/format';

type Revenue = { currency: string; value: number }[];

export type ConversionResults = {
    from: string;
    to: string;
    totals: { leads: number; purchases: number; revenue: Revenue; sent_to_meta: number };
    ads: { source_id: string | null; headline: string | null; leads: number; purchases: number; revenue: Revenue; sent_to_meta: number; last_at: string }[];
};

export type ConversionPeriod = { days?: number; since?: string; until?: string };

const money = (r: Revenue) =>
    r.length === 0 ? '—' : r.map((x) => new Intl.NumberFormat(undefined, { style: 'currency', currency: x.currency }).format(x.value)).join(' · ');

/**
 * Growth Hub › Meta conversions (Conversions to Meta). null = this workspace does not have it:
 * the API answers 404 and no tab is shown.
 */
export function useConversionResults(period: ConversionPeriod, enabled: boolean) {
    return useQuery({
        queryKey: ['conversions', 'results', period],
        enabled,
        retry: false,
        queryFn: async () => {
            const q = new URLSearchParams(Object.entries(period).flatMap(([k, v]) => (v === undefined ? [] : [[k, String(v)]])));
            try {
                return (await api<{ data: ConversionResults }>(`growth/conversions?${q.toString()}`)).data;
            } catch (e) {
                if (e instanceof ApiError && e.status === 404) return null;
                throw e;
            }
        },
    });
}

function Total({ label, value, hint }: { label: string; value: string; hint: string }) {
    return (
        <Card className="gap-1 p-4">
            <p className="text-[12.5px] text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
            <p className="text-[12px] text-muted-foreground">{hint}</p>
        </Card>
    );
}

/** Leads, purchases and revenue per Meta ad. No cost per result or return on ad spend: there is no ad spend data. */
export function ConversionsByAd({ data, loading }: { data: ConversionResults | null | undefined; loading: boolean }) {
    if (loading || !data) {
        return (
            <div className="p-5">
                <Skeleton className="h-48" />
            </div>
        );
    }

    return (
        <div className="grid gap-4 p-3" role="region" aria-label="Meta conversions per ad">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Total label="Leads" value={String(data.totals.leads)} hint="from chats that started on a Meta ad" />
                <Total label="Purchases" value={String(data.totals.purchases)} hint="linked WooCommerce orders" />
                <Total label="Revenue" value={money(data.totals.revenue)} hint="from those purchases" />
                <Total label="Reported to Meta" value={String(data.totals.sent_to_meta)} hint="of these, already sent to Meta" />
            </div>
            {data.ads.length === 0 ? (
                <EmptyState
                    icon={<MegaphoneIcon className="size-5" />}
                    title="No conversions from ads in this period"
                    description="Leads and purchases appear here when a chat that started on a Meta ad reaches a lead rule or places an order. Set the rules in Integrations › Meta conversion reporting."
                />
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Ad</TableHead>
                            <TableHead className="text-right">Leads</TableHead>
                            <TableHead className="text-right">Purchases</TableHead>
                            <TableHead className="text-right">Revenue</TableHead>
                            <TableHead className="text-right">Reported to Meta</TableHead>
                            <TableHead>Last conversion</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.ads.map((ad) => (
                            <TableRow key={ad.source_id ?? 'unknown'}>
                                <TableCell className="max-w-72">
                                    <p className="truncate font-semibold">{ad.headline ?? 'Untitled ad'}</p>
                                    <p className="font-mono text-[12px] text-muted-foreground">{ad.source_id ?? 'Ad ID not shared by Meta'}</p>
                                </TableCell>
                                <TableCell className="text-right tabular-nums">{ad.leads}</TableCell>
                                <TableCell className="text-right tabular-nums">{ad.purchases}</TableCell>
                                <TableCell className="text-right tabular-nums">{money(ad.revenue)}</TableCell>
                                <TableCell className="text-right tabular-nums">{ad.sent_to_meta}</TableCell>
                                <TableCell className="text-[12.5px] text-muted-foreground">{relative(ad.last_at)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </div>
    );
}
