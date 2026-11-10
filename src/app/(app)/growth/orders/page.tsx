'use client';

import { SearchIcon, ShoppingCartIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { EmptyState, Forbidden, PageHeader } from '@/components/app/page-header';
import { useSelectedNumber } from '@/components/app/number-switcher';
import { useSession } from '@/components/app/session';
import { MATCH, MatchChip, money, SaleDetails, SourceLine, STATUS_TONE } from '@/components/growth/sales';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiError } from '@/lib/api';
import { dateTime, humanize } from '@/lib/format';
import { P } from '@/lib/permissions';
import { type SalesFilters, useSales } from '@/lib/queries';
import type { SalesMatch } from '@/lib/types';
import { cn } from '@/lib/utils';

const TABS: ['all' | SalesMatch, string][] = [
    ['all', 'All orders'],
    ['link', 'Chat link'],
    ['phone', 'WhatsApp contact'],
    ['review', 'Needs review'],
    ['unavailable', 'Attribution unavailable'],
    ['none', 'Website orders'],
];

/**
 * Growth Hub › Orders (Engagement Plan v4 §V.3, renamed in CN-02): the store's orders and the
 * evidence for each match, the way Leads works. Revenue figures live in Insights › Sales & Revenue.
 */
export default function OrdersPage() {
    const { can } = useSession();
    const allowed = can(P.GrowthView);
    const [filters, setFilters] = useState<SalesFilters>({ match: 'all', days: 30 });
    const [q, setQ] = useState('');
    const [openId, setOpenId] = useState<string | null>(null);
    // The number chosen in the top bar: orders matched to chats on that number (CN-02).
    const [numberId] = useSelectedNumber();
    const sales = useSales(numberId ? { ...filters, phone_number_id: numberId } : filters, allowed);

    if (!allowed) return <Forbidden />;
    const first = sales.data?.pages[0];
    const rows = sales.data?.pages.flatMap((p) => p.data) ?? [];
    const locked = sales.error instanceof ApiError && sales.error.status === 403;

    if (locked)
        return (
            <>
                <PageHeader title="Orders" description="Which WhatsApp chats became orders." />
                <EmptyState
                    icon={<ShoppingCartIcon />}
                    title="Sales from chats is part of the Pro plan"
                    description="Connect your WooCommerce store with the 10X Engage plugin to see which chats became orders, and the revenue behind each source."
                    action={
                        <Button asChild>
                            <Link href="/billing">See plans</Link>
                        </Button>
                    }
                />
            </>
        );

    return (
        <>
            <PageHeader
                title="Orders"
                description={
                    <>
                        Store orders matched to WhatsApp chats, with the evidence for each{numberId ? ' (chats on the selected number)' : ''}.
                        {can(P.AnalyticsView) && (
                            <>
                                {' '}
                                Revenue is in{' '}
                                <Link href="/insights/sales" className="font-medium underline-offset-2 hover:underline">
                                    Insights › Sales &amp; Revenue
                                </Link>
                                .
                            </>
                        )}
                    </>
                }
                actions={
                    <Select value={String(filters.days ?? 30)} onValueChange={(v) => setFilters((f) => ({ ...f, days: Number(v) }))}>
                        <SelectTrigger className="w-36" aria-label="Period">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {[7, 30, 90, 365].map((d) => (
                                <SelectItem key={d} value={String(d)}>
                                    Last {d} days
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                }
            />

            {first && first.meta.stores.length === 0 && (
                <div className="mb-4 rounded-md border border-warn/40 bg-warn-bg px-4 py-3 text-sm">
                    No store is connected yet.{' '}
                    <Link href="/integrations" className="font-medium underline">
                        Connect WooCommerce with the plugin
                    </Link>
                </div>
            )}

            <Card className="gap-0 overflow-hidden p-0">
                <div className="flex flex-wrap gap-1 border-b px-3 pt-2" role="tablist" aria-label="Orders">
                    {TABS.map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={filters.match === key}
                            onClick={() => setFilters((f) => ({ ...f, match: key }))}
                            className={cn(
                                '-mb-px flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-[13.5px] font-medium text-muted-foreground hover:text-foreground',
                                filters.match === key && 'border-primary text-foreground',
                            )}
                        >
                            {label}
                            {first && <span className="rounded-full bg-muted px-1.5 text-[11.5px] tabular-nums">{first.meta.counts[key] ?? 0}</span>}
                        </button>
                    ))}
                </div>
                <div className="flex flex-wrap gap-2 border-b p-3">
                    <form
                        className="relative w-72 max-w-full"
                        onSubmit={(e) => {
                            e.preventDefault();
                            setFilters((f) => ({ ...f, q: q.trim() || undefined }));
                        }}
                    >
                        <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input className="pl-9" placeholder="Order number, name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
                    </form>
                    {(first?.meta.stores.length ?? 0) > 1 && (
                        <Select value={filters.store ?? 'all'} onValueChange={(v) => setFilters((f) => ({ ...f, store: v === 'all' ? undefined : v }))}>
                            <SelectTrigger className="w-48" aria-label="Store">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All stores</SelectItem>
                                {first?.meta.stores.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                        {s.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>

                {sales.isLoading ? (
                    <div className="p-4">
                        <Skeleton className="h-40" />
                    </div>
                ) : rows.length === 0 ? (
                    <div className="p-10 text-center text-[13.5px] text-muted-foreground">
                        {filters.match && filters.match !== 'all'
                            ? `No ${MATCH[filters.match].short.toLowerCase()} orders in this period.`
                            : 'No orders in this period yet.'}
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Order</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Match</TableHead>
                                <TableHead className="text-right">Revenue</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Original source</TableHead>
                                <TableHead>Chat source</TableHead>
                                <TableHead>Placed</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((o) => (
                                <TableRow key={o.id} className="cursor-pointer" onClick={() => setOpenId(o.id)}>
                                    <TableCell>
                                        <p className="font-semibold">#{o.number}</p>
                                        <p className="text-[12px] text-muted-foreground">{o.store}</p>
                                    </TableCell>
                                    <TableCell>
                                        <p className="font-medium">{o.customer.display_name}</p>
                                        <p className="font-mono text-[12px] text-muted-foreground">{o.customer.phone ?? '—'}</p>
                                    </TableCell>
                                    <TableCell>
                                        <MatchChip match={o.match} short />
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        <p className={cn('font-medium', !o.counts_as_chat_revenue && 'text-muted-foreground')}>{money(o.net, o.currency)}</p>
                                        {Number(o.refunded) > 0 && (
                                            <p className="text-[11.5px] text-muted-foreground">{money(o.refunded, o.currency)} refunded</p>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge tone={STATUS_TONE[o.status] ?? 'grey'}>{humanize(o.status)}</Badge>
                                    </TableCell>
                                    <TableCell className="max-w-48 text-[12.5px]">
                                        <SourceLine source={o.original_source} />
                                    </TableCell>
                                    <TableCell className="max-w-48 text-[12.5px]">
                                        <SourceLine source={o.conversation_source} />
                                    </TableCell>
                                    <TableCell className="text-[12.5px]">{dateTime(o.placed_at)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
                {sales.hasNextPage && (
                    <div className="border-t p-3 text-center">
                        <Button variant="outline" size="sm" onClick={() => sales.fetchNextPage()} disabled={sales.isFetchingNextPage}>
                            Load more
                        </Button>
                    </div>
                )}
            </Card>

            <SaleDetails id={openId} onOpenChange={(o) => !o && setOpenId(null)} />
        </>
    );
}
