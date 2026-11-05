'use client';

import { ShoppingCartIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { EmptyState, Forbidden, PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { MatchChip, money } from '@/components/growth/sales';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { P } from '@/lib/permissions';
import { useSalesAnalytics } from '@/lib/queries';
import type { SalesAnalytics, SalesMatch } from '@/lib/types';
import { cn } from '@/lib/utils';

type Ready = Extract<SalesAnalytics, { locked: false }>;

function Kpi({ label, value, hint, hero = false }: { label: string; value: string; hint: string; hero?: boolean }) {
    return (
        <Card className={cn('gap-1 p-4', hero && 'border-primary/40 bg-primary/5')}>
            <p className="text-[12.5px] text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
            <p className="text-[12px] text-muted-foreground">{hint}</p>
        </Card>
    );
}

const hours = (h: number | null) => (h === null ? '—' : h < 1 ? 'Under 1 h' : h < 48 ? `${h} h` : `${Math.round(h / 24)} days`);

/** Revenue per day: chat-link orders and phone-matched orders side by side (never added together). */
function DailyChart({ data }: { data: Ready }) {
    const days = data.daily;
    const w = 720;
    const h = 190;
    const pad = { l: 8, r: 8, t: 8, b: 22 };
    const max = Math.max(1, ...days.map((d) => Math.max(Number(d.link), Number(d.phone))));
    const slot = (w - pad.l - pad.r) / Math.max(1, days.length);
    const bar = Math.max(2, Math.min(14, slot / 2 - 2));
    const y = (v: number) => pad.t + (1 - v / max) * (h - pad.t - pad.b);
    const step = Math.max(1, Math.ceil(days.length / 7));
    const label = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

    if (days.length === 0) return <p className="py-10 text-center text-[13px] text-muted-foreground">No orders in this period.</p>;

    return (
        <figure>
            <svg viewBox={`0 0 ${w} ${h}`} className="h-48 w-full" role="img" aria-label="Revenue per day from chat links and from WhatsApp contacts">
                <line x1={pad.l} x2={w - pad.r} y1={y(0)} y2={y(0)} stroke="var(--line, #e5e7eb)" />
                {days.map((d, i) => {
                    const x = pad.l + i * slot + slot / 2;

                    return (
                        <g key={d.day}>
                            <rect x={x - bar - 1} y={y(Number(d.link))} width={bar} height={y(0) - y(Number(d.link))} className="fill-good" rx={2}>
                                <title>{`${label(d.day)} · chat links ${money(d.link, data.currency)}`}</title>
                            </rect>
                            <rect x={x + 1} y={y(Number(d.phone))} width={bar} height={y(0) - y(Number(d.phone))} className="fill-info" opacity={0.7} rx={2}>
                                <title>{`${label(d.day)} · WhatsApp contacts ${money(d.phone, data.currency)}`}</title>
                            </rect>
                            {i % step === 0 && (
                                <text x={x} y={h - 6} textAnchor="middle" fontSize={10} fill="currentColor" className="text-muted-foreground">
                                    {label(d.day)}
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>
            <figcaption className="mt-1 flex flex-wrap gap-4 text-[12px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm bg-good" /> Tracked chat links
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm bg-info opacity-70" /> WhatsApp contacts (by phone)
                </span>
            </figcaption>
        </figure>
    );
}

function SourceTable({ title, hint, rows, currency }: { title: string; hint: string; rows: Ready['by_original_source']; currency: string }) {
    return (
        <Card className="gap-0 overflow-hidden p-0">
            <div className="border-b px-4 py-3">
                <p className="text-[14px] font-semibold">{title}</p>
                <p className="text-[12.5px] text-muted-foreground">{hint}</p>
            </div>
            {rows.length === 0 ? (
                <p className="p-6 text-center text-[13px] text-muted-foreground">No chat-link orders in this period.</p>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Source</TableHead>
                            <TableHead className="text-right">Orders</TableHead>
                            <TableHead className="text-right">Revenue</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((r) => (
                            <TableRow key={`${r.source}-${r.label}`}>
                                <TableCell>{r.label}</TableCell>
                                <TableCell className="text-right tabular-nums">{r.orders}</TableCell>
                                <TableCell className="text-right tabular-nums">{money(r.revenue, currency)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </Card>
    );
}

/**
 * Analytics › Sales & Revenue (Engagement Plan v4 §V.3), next to Marketing: revenue from tracked chat
 * links, phone-matched orders shown separately, net after refunds, average order value, sales by
 * original source and by the chat's source, products sold by source, and time from first chat to order.
 */
export default function SalesRevenuePage() {
    const { can } = useSession();
    const allowed = can(P.AnalyticsView);
    const [days, setDays] = useState(30);
    const q = useSalesAnalytics(days, allowed);

    if (!allowed) return <Forbidden />;
    const d = q.data;

    return (
        <>
            <PageHeader
                title="Sales & Revenue"
                description="Which WhatsApp chats became orders. Only orders from a tracked chat link count as revenue from a chat; orders matched by phone are shown on their own."
                actions={
                    <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
                        <SelectTrigger className="w-36" aria-label="Period">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {[7, 30, 90, 365].map((n) => (
                                <SelectItem key={n} value={String(n)}>
                                    Last {n} days
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                }
            />

            {!d ? (
                <Skeleton className="h-96" />
            ) : d.locked ? (
                <EmptyState
                    icon={<ShoppingCartIcon />}
                    title="Sales & Revenue is part of the Pro plan"
                    description="Connect your WooCommerce store with the 10X Engage plugin to see revenue from WhatsApp chats by source and product."
                    action={
                        <Button asChild>
                            <Link href="/billing">See plans</Link>
                        </Button>
                    }
                />
            ) : (
                <div className="grid gap-4">
                    {d.stores === 0 && (
                        <div className="rounded-md border border-warn/40 bg-warn-bg px-4 py-3 text-sm">
                            No store is connected yet.{' '}
                            <Link href="/integrations" className="font-medium underline">
                                Connect WooCommerce with the plugin
                            </Link>
                        </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        <Kpi
                            hero
                            label="Revenue from tracked chat links"
                            value={money(d.chat_link.revenue, d.currency)}
                            hint={`${d.chat_link.paid_orders} paid order${d.chat_link.paid_orders === 1 ? '' : 's'} · net of refunds`}
                        />
                        <Kpi
                            label="Orders from WhatsApp contacts"
                            value={money(d.phone.revenue, d.currency)}
                            hint={`${d.phone.orders} by phone · shown apart, never credited`}
                        />
                        <Kpi label="Net revenue, all orders" value={money(d.total.net, d.currency)} hint={`${money(d.total.refunded, d.currency)} refunded`} />
                        <Kpi
                            label="Average chat-link order"
                            value={money(d.chat_link.aov, d.currency)}
                            hint={`all paid orders: ${money(d.total.aov, d.currency)}`}
                        />
                        <Kpi label="First chat to order" value={hours(d.time_to_order.median_hours)} hint="median, chat-link orders" />
                    </div>

                    <Card className="p-4">
                        <p className="mb-2 text-[14px] font-semibold">Revenue per day</p>
                        <DailyChart data={d} />
                    </Card>

                    <Card className="gap-0 overflow-hidden p-0">
                        <div className="border-b px-4 py-3">
                            <p className="text-[14px] font-semibold">How orders were matched</p>
                            <p className="text-[12.5px] text-muted-foreground">Every order is kept. Only chat-link orders add to chat or campaign revenue.</p>
                        </div>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Match</TableHead>
                                    <TableHead className="text-right">Orders</TableHead>
                                    <TableHead className="text-right">Paid</TableHead>
                                    <TableHead className="text-right">Revenue</TableHead>
                                    <TableHead className="text-right">Refunded</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(
                                    [
                                        ['link', d.chat_link],
                                        ['phone', d.phone],
                                        ['review', d.review],
                                        ['unavailable', d.unavailable],
                                        ['none', d.website],
                                    ] as [SalesMatch, Ready['phone']][]
                                ).map(([m, c]) => (
                                    <TableRow key={m}>
                                        <TableCell>
                                            <MatchChip match={m} />
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">{c.orders}</TableCell>
                                        <TableCell className="text-right tabular-nums">{c.paid_orders}</TableCell>
                                        <TableCell className="text-right tabular-nums">{money(c.revenue, d.currency)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{money(c.refunded, d.currency)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Card>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <SourceTable
                            title="By the contact’s original source"
                            hint="Where the buyer first came from (Growth Hub). Chat-link orders only."
                            rows={d.by_original_source}
                            currency={d.currency}
                        />
                        <SourceTable
                            title="By the source of the chat"
                            hint="The source of the conversation the link was sent in — a returning buyer’s new ad gets the credit here."
                            rows={d.by_conversation_source}
                            currency={d.currency}
                        />
                    </div>

                    <Card className="gap-0 overflow-hidden p-0">
                        <div className="border-b px-4 py-3">
                            <p className="text-[14px] font-semibold">Products sold by source</p>
                            <p className="text-[12.5px] text-muted-foreground">Paid orders from chat links and from WhatsApp contacts.</p>
                        </div>
                        {d.products.length === 0 ? (
                            <p className="p-6 text-center text-[13px] text-muted-foreground">No products sold through WhatsApp in this period.</p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Product</TableHead>
                                        <TableHead>Source</TableHead>
                                        <TableHead>Match</TableHead>
                                        <TableHead className="text-right">Quantity</TableHead>
                                        <TableHead className="text-right">Revenue</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {d.products.map((p, i) => (
                                        <TableRow key={i}>
                                            <TableCell className="font-medium">{p.name}</TableCell>
                                            <TableCell>{p.source}</TableCell>
                                            <TableCell>
                                                <MatchChip match={p.match} short />
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">{p.quantity}</TableCell>
                                            <TableCell className="text-right tabular-nums">{money(p.revenue, d.currency)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </Card>

                    {d.other_currencies.length > 0 && (
                        <p className="text-[12.5px] text-muted-foreground">
                            Orders in {d.other_currencies.join(', ')} are not added to these {d.currency} figures.
                        </p>
                    )}
                </div>
            )}
        </>
    );
}
