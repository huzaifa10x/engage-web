'use client';

import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFollowUps } from '@/lib/queries';

const RULES: [string, string, string][] = [
    ['reply_alert', 'Remind the agent', 'Team'],
    ['reply_escalation', 'Escalate', 'Team'],
    ['window_alert', 'Window about to close', 'Team'],
    ['unassigned_assign', 'Assign unassigned chats', 'Team'],
    ['nudge', 'Nudge', 'Customer'],
    ['nudge_template', 'Second nudge (template)', 'Customer'],
];

/** Insights › Messages & Team: what the follow-up rules did in the last 30 days (all numbers). */
export function FollowUpResultsCard() {
    const query = useFollowUps();
    if (query.isLoading) return <Skeleton className="h-48" />;
    const stats = query.data?.stats;
    if (!stats) return null;
    const rows = RULES.map(([key, label, who]) => ({ key, label, who, ...(stats[key] ?? { fired: 0, replied: 0, skipped: 0 }) }));
    const any = rows.some((r) => r.fired > 0 || r.skipped > 0);

    return (
        <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4 pb-2">
                <p className="text-sm font-semibold">Follow-up rules · last 30 days, all numbers</p>
                <Link href="/follow-ups" className="text-[13px] font-medium text-brand-600 underline-offset-2 hover:underline">
                    Follow-ups &amp; Alerts
                </Link>
            </div>
            {!any ? (
                <p className="px-5 pb-5 text-[13px] text-muted-foreground">No rule has run in the last 30 days.</p>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent">
                            <TableHead>Rule</TableHead>
                            <TableHead>For</TableHead>
                            <TableHead className="text-right">Ran</TableHead>
                            <TableHead className="text-right">Customer replied within 24 h</TableHead>
                            <TableHead className="text-right">Skipped</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((r) => (
                            <TableRow key={r.key}>
                                <TableCell className="font-medium">{r.label}</TableCell>
                                <TableCell className="text-muted-foreground">{r.who}</TableCell>
                                <TableCell className="text-right tabular-nums">{r.fired.toLocaleString()}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {r.fired > 0 ? `${r.replied.toLocaleString()} (${Math.round((r.replied / r.fired) * 100)}%)` : '—'}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">{r.skipped.toLocaleString()}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </Card>
    );
}
