'use client';

import { BarChart3Icon, ExternalLinkIcon, FlaskConicalIcon, TrophyIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { type ChatbotFlow, formatDuration, useChatbotAnalytics } from '@/lib/chatbots';
import { cn } from '@/lib/utils';

/** The flow dashboard: completion, time to complete, handoffs, drop-off by block, A/B results. */
export function FlowDashboard({ flow, onOpenChange }: { flow: ChatbotFlow | null; onOpenChange: (o: boolean) => void }) {
    const [days, setDays] = useState(30);
    const analytics = useChatbotAnalytics(flow?.id ?? 'none', days, flow !== null);
    const a = analytics.data;
    const max = Math.max(1, ...(a?.daily ?? []).map((d) => d.started));

    return (
        <Dialog open={flow !== null} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <BarChart3Icon className="size-5" /> {flow?.name}
                    </DialogTitle>
                    <DialogDescription>How customers move through this flow. Test chats are never counted.</DialogDescription>
                </DialogHeader>
                <div className="flex items-center gap-1 rounded-lg bg-muted p-1 text-[12.5px] font-semibold">
                    {[7, 30, 90].map((d) => (
                        <button
                            key={d}
                            onClick={() => setDays(d)}
                            className={cn('flex-1 rounded-md px-2 py-1', days === d ? 'bg-card shadow-xs' : 'text-muted-foreground')}
                        >
                            Last {d} days
                        </button>
                    ))}
                </div>
                {!a ? (
                    <Skeleton className="h-64 w-full" />
                ) : (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                            {(
                                [
                                    ['Started', a.sessions.started],
                                    ['Completion rate', a.sessions.completion_rate === null ? '—' : `${a.sessions.completion_rate}%`],
                                    ['Avg. time to complete', formatDuration(a.sessions.avg_seconds)],
                                    ['Handoff rate', a.sessions.handoff_rate === null ? '—' : `${a.sessions.handoff_rate}%`],
                                    ['Left midway', a.sessions.abandoned],
                                ] as [string, string | number][]
                            ).map(([l, v]) => (
                                <div key={l} className="rounded-xl border px-3 py-2.5">
                                    <p className="text-[11px] font-semibold text-muted-foreground">{l}</p>
                                    <p className="text-[19px] font-bold tabular-nums">{v}</p>
                                </div>
                            ))}
                        </div>

                        <section>
                            <p className="mb-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Conversations per day</p>
                            {a.daily.length === 0 ? (
                                <p className="rounded-lg border border-dashed px-4 py-6 text-center text-[12.5px] text-muted-foreground">
                                    No conversations yet in this period.
                                </p>
                            ) : (
                                <div
                                    className="flex h-32 items-end gap-1 rounded-lg border px-3 pt-3 pb-2"
                                    role="img"
                                    aria-label="Conversations started and finished per day"
                                >
                                    {a.daily.map((d) => (
                                        <div
                                            key={d.day}
                                            className="group relative flex h-full flex-1 flex-col justify-end"
                                            title={`${d.day}: ${d.started} started, ${d.finished} finished`}
                                        >
                                            <div
                                                className="flex w-full flex-col justify-end overflow-hidden rounded-t bg-brand-100"
                                                style={{ height: `${(d.started / max) * 100}%` }}
                                            >
                                                <div className="w-full bg-brand-500" style={{ height: `${d.started ? (d.finished / d.started) * 100 : 0}%` }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <p className="mt-1 text-[11px] text-muted-foreground">Light: started · dark: completed or handed to a person.</p>
                        </section>

                        <section>
                            <p className="mb-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Where customers leave</p>
                            {a.dropoff.length === 0 ? (
                                <p className="text-[12.5px] text-muted-foreground">Nobody left midway in this period.</p>
                            ) : (
                                <ul className="space-y-1.5">
                                    {a.dropoff.map((d) => (
                                        <li key={d.node_id} className="grid grid-cols-[1fr_auto] items-center gap-3 text-[12.5px]">
                                            <div>
                                                <p className="font-semibold">{d.title}</p>
                                                <div className="mt-1 h-1.5 rounded-full bg-muted">
                                                    <div
                                                        className="h-1.5 rounded-full bg-warn"
                                                        style={{ width: `${d.entries ? Math.min(100, (d.abandoned / d.entries) * 100) : 0}%` }}
                                                    />
                                                </div>
                                            </div>
                                            <span className="font-semibold text-warn tabular-nums">
                                                {d.abandoned} of {d.entries} ({d.entries ? Math.round((d.abandoned / d.entries) * 100) : 0}%)
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        {a.ab.length > 0 && (
                            <section>
                                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                                    <FlaskConicalIcon className="size-3.5" /> A/B tests
                                </p>
                                {a.ab.map((t) => {
                                    const winner =
                                        t.a.rate !== null && t.b.rate !== null && t.a.sessions >= 20 && t.b.sessions >= 20
                                            ? t.a.rate === t.b.rate
                                                ? null
                                                : t.a.rate > t.b.rate
                                                  ? 'a'
                                                  : 'b'
                                            : null;

                                    return (
                                        <div key={t.node_id} className="mb-2 rounded-xl border p-3">
                                            <p className="text-[13px] font-semibold">{t.title}</p>
                                            <p className="text-[11.5px] text-muted-foreground">
                                                Goal: {t.goal ? `reach “${t.goal.title}”` : 'finish the flow (or be handed over)'}
                                            </p>
                                            <div className="mt-2 grid grid-cols-2 gap-2">
                                                {(['a', 'b'] as const).map((v) => (
                                                    <div key={v} className={cn('rounded-lg bg-muted px-3 py-2', winner === v && 'bg-good-bg')}>
                                                        <p className="flex items-center gap-1 text-[11px] font-bold uppercase">
                                                            {v.toUpperCase()} · {v === 'a' ? t.percent_a : 100 - t.percent_a}%{' '}
                                                            {winner === v && <TrophyIcon className="size-3.5 text-good" />}
                                                        </p>
                                                        <p className="text-[17px] font-bold tabular-nums">{t[v].rate === null ? '—' : `${t[v].rate}%`}</p>
                                                        <p className="text-[11px] text-muted-foreground">
                                                            {t[v].goals} of {t[v].sessions} reached the goal
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                            {!winner && (
                                                <p className="mt-1.5 text-[11px] text-muted-foreground">
                                                    A winner is shown once both versions have at least 20 customers.
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                            </section>
                        )}

                        {flow && (
                            <Button asChild variant="outline" size="sm">
                                <Link href={`/chatbots/builder?id=${flow.id}`}>
                                    <ExternalLinkIcon /> Open in the builder (Analytics shows these numbers on each block)
                                </Link>
                            </Button>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
