'use client';

import { useQuery } from '@tanstack/react-query';
import { SmileIcon } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';

type Row = { sent: number; answered: number; good: number; ok: number; poor: number; skipped: number; score: number | null; response_rate: number | null };
type Report = {
    from: string;
    to: string;
    timezone: string;
    totals: Row & { reviews_sent: number };
    agents: (Row & { membership_id: string | null; name: string })[];
    weeks: (Row & { week: string; reviews: number })[];
    skipped: { reason: string; count: number }[];
};

const pct = (n: number | null) => (n === null ? '—' : `${n}%`);

function Rows({ rows, first }: { rows: (Row & { label: string; extra?: number })[]; first: string }) {
    return (
        <Table>
            <TableHeader>
                <TableRow className="hover:bg-transparent">
                    <TableHead>{first}</TableHead>
                    <TableHead className="text-right">Asked</TableHead>
                    <TableHead className="text-right">Answered</TableHead>
                    <TableHead className="text-right">Good</TableHead>
                    <TableHead className="text-right">OK</TableHead>
                    <TableHead className="text-right">Poor</TableHead>
                    <TableHead className="text-right">CSAT</TableHead>
                    {rows.some((r) => r.extra !== undefined) && <TableHead className="text-right">Feedback requests</TableHead>}
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((r) => (
                    <TableRow key={r.label}>
                        <TableCell className="font-medium">{r.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.sent}</TableCell>
                        <TableCell className="text-right tabular-nums">
                            {r.answered} <span className="text-muted-foreground">({pct(r.response_rate)})</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.good}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.ok}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.poor}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{pct(r.score)}</TableCell>
                        {r.extra !== undefined && <TableCell className="text-right tabular-nums">{r.extra}</TableCell>}
                    </TableRow>
                ))}
                {rows.length === 0 && (
                    <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                            No ratings yet in this period.
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        </Table>
    );
}

/** Analytics › Messages & Team: CSAT per agent and per week, and feedback requests sent. */
export function FeedbackResultsCard({ days }: { days: number }) {
    const q = useQuery({
        queryKey: ['analytics', 'feedback', days],
        queryFn: () =>
            api<{ data: Report }>('analytics/feedback', { query: { from: new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10) } }).then(
                (r) => r.data,
            ),
    });
    if (!q.data) return <Skeleton className="h-48" />;
    const d = q.data;
    const week = (w: string) => new Date(`${w}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    return (
        <Card className="overflow-hidden p-0" role="region" aria-label="Customer satisfaction">
            <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
                <div className="flex items-start gap-2">
                    <SmileIcon className="mt-0.5 size-4 text-muted-foreground" />
                    <div>
                        <p className="text-sm font-semibold">Customer satisfaction</p>
                        <p className="text-[12.5px] text-muted-foreground">
                            CSAT = share of answers that were Good. Ratings are asked when a support chat is closed.
                        </p>
                    </div>
                </div>
                <p className="text-[13px]">
                    CSAT <span className="text-lg font-semibold">{pct(d.totals.score)}</span> · {d.totals.answered} of {d.totals.sent} answered ·{' '}
                    {d.totals.reviews_sent} feedback requests sent
                </p>
            </div>
            <p className="px-5 pt-3 text-[12.5px] font-semibold text-muted-foreground">Per agent</p>
            <Rows first="Agent" rows={d.agents.map((a) => ({ ...a, label: a.name }))} />
            <p className="px-5 pt-3 text-[12.5px] font-semibold text-muted-foreground">Per week (from Monday)</p>
            <Rows first="Week of" rows={d.weeks.map((w) => ({ ...w, label: week(w.week), extra: w.reviews }))} />
            {d.skipped.length > 0 && (
                <p className="px-5 py-3 text-[12px] text-muted-foreground">Not sent: {d.skipped.map((s) => `${s.reason} (${s.count})`).join(' · ')}</p>
            )}
        </Card>
    );
}
