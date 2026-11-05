'use client';

import { TimerIcon } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useResponseTimes } from '@/lib/queries';
import type { ResponseStat } from '@/lib/types';

/** "45 s", "14 min", "2 h 10 min" */
export function duration(seconds: number | null): string {
    if (seconds === null) return '—';
    if (seconds < 60) return `${seconds} s`;
    const m = Math.round(seconds / 60);
    if (m < 60) return `${m} min`;

    return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
    return (
        <div className="rounded-md border p-3">
            <p className="text-[12px] text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold tabular-nums">{value}</p>
            <p className="text-[11.5px] text-muted-foreground">{hint}</p>
        </div>
    );
}

const within = (s: ResponseStat) => (s.within_target_pct === null ? '—' : `${s.within_target_pct}%`);

/**
 * Analytics › Conversations & Team (Engagement Plan §II): how fast people answer, in business hours
 * only — the bot doesn't count. Per agent and per number.
 */
export function ResponseTimesCard({ days, numberId }: { days: number; numberId: string | null }) {
    const q = useResponseTimes(days, numberId ?? undefined);
    const d = q.data;

    return (
        <Card className="gap-0 overflow-hidden p-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4 pb-3">
                <p className="flex items-center gap-2 text-sm font-semibold">
                    <TimerIcon className="size-4" /> Response times
                </p>
                {d && (
                    <p className="text-[12.5px] text-muted-foreground">
                        {d.business_hours ? 'Counted in opening hours only' : 'Business hours are off: counted in plain time'} · target{' '}
                        {duration(d.target_seconds)} · people only, not the bot
                    </p>
                )}
            </div>
            {q.isLoading || !d ? (
                <div className="px-5 pb-5">
                    <Skeleton className="h-28" />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-3 px-5 pb-4 lg:grid-cols-4">
                        <Stat
                            label="Needs reply now"
                            value={String(d.now.needs_reply)}
                            hint={`${d.now.over_target} over target · ${d.now.after_hours} arrived after hours`}
                        />
                        <Stat
                            label="First response (median)"
                            value={duration(d.first_response.median_seconds)}
                            hint={`${d.first_response.total} replies · average ${duration(d.first_response.average_seconds)}`}
                        />
                        <Stat
                            label="Answered within target"
                            value={within(d.first_response)}
                            hint={`${d.first_response.within_target} of ${d.first_response.total}`}
                        />
                        <Stat
                            label="Time to resolve (median)"
                            value={duration(d.resolution.median_seconds)}
                            hint={`${d.resolution.total} chats closed · average ${duration(d.resolution.average_seconds)}`}
                        />
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent">
                                <TableHead>Agent</TableHead>
                                <TableHead className="text-right">Replies</TableHead>
                                <TableHead className="text-right">First response (median)</TableHead>
                                <TableHead className="text-right">Within target</TableHead>
                                <TableHead className="text-right">After hours</TableHead>
                                <TableHead className="text-right">Time to resolve (avg)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {d.agents.map((a) => (
                                <TableRow key={a.membership_id}>
                                    <TableCell className="font-medium">{a.name}</TableCell>
                                    <TableCell className="text-right tabular-nums">{a.total}</TableCell>
                                    <TableCell className="text-right tabular-nums">{duration(a.median_seconds)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{within(a)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{a.after_hours}</TableCell>
                                    <TableCell className="text-right tabular-nums">{duration(a.resolution_average_seconds)}</TableCell>
                                </TableRow>
                            ))}
                            {d.agents.length === 0 && (
                                <TableRow className="hover:bg-transparent">
                                    <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                                        No replies by people in this period yet.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                    {d.numbers.length > 1 && (
                        <Table className="border-t">
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead>Number</TableHead>
                                    <TableHead className="text-right">Replies</TableHead>
                                    <TableHead className="text-right">First response (median)</TableHead>
                                    <TableHead className="text-right">Within target</TableHead>
                                    <TableHead className="text-right">After hours</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {d.numbers.map((n) => (
                                    <TableRow key={n.id}>
                                        <TableCell className="font-medium">{n.display ?? '—'}</TableCell>
                                        <TableCell className="text-right tabular-nums">{n.total}</TableCell>
                                        <TableCell className="text-right tabular-nums">{duration(n.median_seconds)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{within(n)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{n.after_hours}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </>
            )}
        </Card>
    );
}
