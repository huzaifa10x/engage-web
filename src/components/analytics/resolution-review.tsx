'use client';

import { FlagIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useResolutionReview } from '@/lib/queries';

/**
 * Resolution review (3.5, managers): how each teammate closed chats over the period. "Not a lead" is left
 * out of response figures, so it is the one to look at; flagged closures went back for another look.
 */
export function ResolutionReviewCard() {
    const [days, setDays] = useState('7');
    const q = useResolutionReview(Number(days));
    const rows = q.data?.agents ?? [];

    return (
        <Card className="grid gap-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <p className="text-sm font-semibold">Resolution review</p>
                    <p className="text-[12.5px] text-muted-foreground">
                        Closures per teammate. “Not a lead” doesn’t count in response figures: check it here. Flag a closure from{' '}
                        <Link href="/inbox?tab=resolved" className="font-semibold text-brand-600 underline-offset-2 hover:underline">
                            Inbox › Resolved
                        </Link>
                        .
                    </p>
                </div>
                <Select value={days} onValueChange={setDays}>
                    <SelectTrigger size="sm" className="w-32" aria-label="Period">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="7">Last 7 days</SelectItem>
                        <SelectItem value="30">Last 30 days</SelectItem>
                        <SelectItem value="90">Last 90 days</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            {q.isLoading ? (
                <Skeleton className="h-24" />
            ) : rows.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">Nobody resolved a chat in this period.</p>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent">
                            <TableHead>Teammate</TableHead>
                            <TableHead className="text-right">Resolved</TableHead>
                            <TableHead className="text-right">Not a lead</TableHead>
                            <TableHead className="text-right">No action</TableHead>
                            <TableHead className="text-right">Flagged</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((r) => {
                            const share = r.resolved ? r.not_lead / r.resolved : 0;

                            return (
                                <TableRow key={r.membership_id}>
                                    <TableCell className="font-semibold">{r.name}</TableCell>
                                    <TableCell className="text-right tabular-nums">{r.resolved}</TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        <span className={share >= 0.3 && r.not_lead >= 3 ? 'font-semibold text-warn' : undefined}>
                                            {r.not_lead}
                                            {r.resolved > 0 && <span className="ml-1 text-[11px] text-muted-foreground">({Math.round(share * 100)}%)</span>}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">{r.no_action}</TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {r.flagged > 0 ? (
                                            <span className="inline-flex items-center gap-1 text-warn">
                                                <FlagIcon className="size-3" /> {r.flagged}
                                            </span>
                                        ) : (
                                            0
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            )}
        </Card>
    );
}
