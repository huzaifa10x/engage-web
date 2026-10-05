'use client';

import { useState } from 'react';

import { EmptyState, Forbidden, PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { Funnel } from '@/components/campaigns/campaign-detail';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { errorMessage } from '@/lib/api';
import { P } from '@/lib/permissions';
import { useAnalytics, usePhoneNumbers } from '@/lib/queries';
import type { AnalyticsOverview } from '@/lib/types';

const ALL = '__all__';
const rate = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—');

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <Card className="gap-1 p-4">
            <p className="text-[12.5px] text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
            {hint && <p className="text-[12px] text-muted-foreground">{hint}</p>}
        </Card>
    );
}

/** Messages per day: sent (green) and received (blue) side by side. A table view is offered for screen readers. */
function DailyChart({ daily }: { daily: AnalyticsOverview['daily'] }) {
    const max = Math.max(1, ...daily.map((d) => Math.max(d.inbound, d.outbound)));
    const label = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    const step = Math.ceil(daily.length / 10);

    return (
        <div>
            <div className="flex h-44 items-end gap-[3px]" role="img" aria-label="Messages sent and received per day">
                {daily.map((d) => (
                    <div
                        key={d.date}
                        className="group relative flex h-full flex-1 items-end justify-center gap-px"
                        title={`${label(d.date)}: ${d.outbound} sent, ${d.inbound} received`}
                    >
                        <div
                            className="w-1/2 max-w-3 rounded-t-sm bg-whatsapp"
                            style={{ height: `${(d.outbound / max) * 100}%`, minHeight: d.outbound ? 2 : 0 }}
                        />
                        <div className="w-1/2 max-w-3 rounded-t-sm bg-info" style={{ height: `${(d.inbound / max) * 100}%`, minHeight: d.inbound ? 2 : 0 }} />
                    </div>
                ))}
            </div>
            <div className="mt-1.5 flex gap-[3px] border-t pt-1.5 text-[11px] text-muted-foreground">
                {daily.map((d, i) => (
                    <span key={d.date} className="flex-1 text-center whitespace-nowrap">
                        {i % step === 0 ? label(d.date) : ''}
                    </span>
                ))}
            </div>
            <div className="mt-2 flex gap-4 text-[12.5px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm bg-whatsapp" /> Sent
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm bg-info" /> Received
                </span>
            </div>
        </div>
    );
}

export default function AnalyticsPage() {
    const { can } = useSession();
    const allowed = can(P.AnalyticsView);
    const [days, setDays] = useState(30);
    const [numberId, setNumberId] = useState<string | null>(null);
    const numbers = usePhoneNumbers();
    const analytics = useAnalytics({ days, phone_number_id: numberId }, allowed);
    const d = analytics.data;

    if (!allowed) return <Forbidden />;

    return (
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
            <PageHeader
                title="Analytics"
                description="What was sent, delivered and read across your WhatsApp numbers."
                actions={
                    <>
                        {(numbers.data ?? []).length > 1 && (
                            <Select value={numberId ?? ALL} onValueChange={(v) => setNumberId(v === ALL ? null : v)}>
                                <SelectTrigger className="w-52" aria-label="Number">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL}>All numbers</SelectItem>
                                    {(numbers.data ?? []).map((n) => (
                                        <SelectItem key={n.id} value={n.id}>
                                            {n.verified_name ?? n.display_phone_number}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
                            <SelectTrigger className="w-40" aria-label="Period">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="7">Last 7 days</SelectItem>
                                <SelectItem value="30">Last 30 days</SelectItem>
                                <SelectItem value="90">Last 90 days</SelectItem>
                            </SelectContent>
                        </Select>
                    </>
                }
            />

            {analytics.isLoading ? (
                <div className="grid gap-3">
                    <Skeleton className="h-24" />
                    <Skeleton className="h-64" />
                </div>
            ) : analytics.isError || !d ? (
                <Card>
                    <EmptyState title="Analytics could not be loaded" description={errorMessage(analytics.error)} />
                </Card>
            ) : (
                <div className="grid gap-4">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                        <Kpi label="Messages sent" value={d.totals.sent.toLocaleString()} hint={`${d.by_origin.campaign.toLocaleString()} from campaigns`} />
                        <Kpi label="Delivered" value={rate(d.totals.delivered, d.totals.sent)} hint={`${d.totals.delivered.toLocaleString()} messages`} />
                        <Kpi label="Read" value={rate(d.totals.read, d.totals.sent)} hint={`${d.totals.read.toLocaleString()} messages`} />
                        <Kpi label="Failed" value={d.totals.failed.toLocaleString()} hint={rate(d.totals.failed, d.totals.outbound) + ' of attempts'} />
                        <Kpi
                            label="Messages received"
                            value={d.totals.inbound.toLocaleString()}
                            hint={`${d.totals.open_conversations.toLocaleString()} open conversations`}
                        />
                    </div>

                    <div className="grid gap-4 lg:grid-cols-3">
                        <Card className="p-5 lg:col-span-2">
                            <p className="mb-3 text-sm font-semibold">Messages per day</p>
                            {d.totals.outbound + d.totals.inbound === 0 ? (
                                <p className="py-12 text-center text-[13px] text-muted-foreground">No messages in this period yet.</p>
                            ) : (
                                <DailyChart daily={d.daily} />
                            )}
                        </Card>
                        <Card className="p-5">
                            <p className="mb-3 text-sm font-semibold">Delivery funnel</p>
                            <Funnel sent={d.totals.sent} delivered={d.totals.delivered} read={d.totals.read} failed={d.totals.failed} />
                            <p className="mt-4 text-[12.5px] text-muted-foreground">
                                {d.totals.new_contacts.toLocaleString()} new contact{d.totals.new_contacts === 1 ? '' : 's'} in this period ·{' '}
                                {d.totals.contacts.toLocaleString()} in total. “Read” depends on the customer having read receipts turned on.
                            </p>
                        </Card>
                    </div>

                    <Card className="overflow-hidden p-0">
                        <p className="px-5 pt-4 pb-2 text-sm font-semibold">By number</p>
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead>Number</TableHead>
                                    <TableHead>Quality</TableHead>
                                    <TableHead className="text-right">Sent</TableHead>
                                    <TableHead className="text-right">Delivered</TableHead>
                                    <TableHead className="text-right">Read</TableHead>
                                    <TableHead className="text-right">Failed</TableHead>
                                    <TableHead className="text-right">Received</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {d.numbers.map((n) => (
                                    <TableRow key={n.id}>
                                        <TableCell className="font-medium">{n.display ?? '—'}</TableCell>
                                        <TableCell>
                                            {n.quality_rating ? (
                                                <Badge
                                                    tone={
                                                        n.quality_rating === 'GREEN'
                                                            ? 'good'
                                                            : n.quality_rating === 'RED'
                                                              ? 'bad'
                                                              : n.quality_rating === 'YELLOW'
                                                                ? 'warn'
                                                                : 'grey'
                                                    }
                                                >
                                                    {n.quality_rating.toLowerCase()}
                                                </Badge>
                                            ) : (
                                                '—'
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">{n.sent.toLocaleString()}</TableCell>
                                        <TableCell className="text-right tabular-nums">{rate(n.delivered, n.sent)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{rate(n.read, n.sent)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{n.failed.toLocaleString()}</TableCell>
                                        <TableCell className="text-right tabular-nums">{n.inbound.toLocaleString()}</TableCell>
                                    </TableRow>
                                ))}
                                {d.numbers.length === 0 && (
                                    <TableRow className="hover:bg-transparent">
                                        <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                                            No connected numbers.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Card>

                    <Card className="overflow-hidden p-0">
                        <p className="px-5 pt-4 pb-2 text-sm font-semibold">Top templates</p>
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead>Template</TableHead>
                                    <TableHead className="text-right">Sent</TableHead>
                                    <TableHead className="text-right">Delivered</TableHead>
                                    <TableHead className="text-right">Read</TableHead>
                                    <TableHead className="text-right">Failed</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {d.top_templates.map((t) => (
                                    <TableRow key={t.name}>
                                        <TableCell className="font-medium">{t.name}</TableCell>
                                        <TableCell className="text-right tabular-nums">{t.sent.toLocaleString()}</TableCell>
                                        <TableCell className="text-right tabular-nums">{rate(t.delivered, t.sent)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{rate(t.read, t.sent)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{t.failed.toLocaleString()}</TableCell>
                                    </TableRow>
                                ))}
                                {d.top_templates.length === 0 && (
                                    <TableRow className="hover:bg-transparent">
                                        <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                                            No templates were sent in this period.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Card>
                </div>
            )}
        </div>
    );
}
