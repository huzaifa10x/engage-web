'use client';

import { XIcon } from 'lucide-react';

import { useSession } from '@/components/app/session';
import { Button } from '@/components/ui/button';
import { aedK, dur } from '@/lib/inbox';
import { P } from '@/lib/permissions';
import { useInboxHealth, useResolutionReview } from '@/lib/queries';
import { cn } from '@/lib/utils';

function Kpi({ value, label, className, small = false }: { value: React.ReactNode; label: React.ReactNode; className?: string; small?: boolean }) {
    return (
        <div className="rounded-lg bg-muted/60 px-3 py-2.5">
            <b className={cn('block font-semibold tabular-nums', small ? 'text-[17px]' : 'text-[22px]', className)}>{value}</b>
            <span className="block text-[11px] leading-snug text-muted-foreground">{label}</span>
        </div>
    );
}

/**
 * Inbox health (3.5): window expiry rate, first responses (human and automation kept apart), the sales
 * follow-up figures, and for managers the resolution review. A floating panel over the inbox.
 */
export function InboxHealthPanel({ phoneNumberId, onClose }: { phoneNumberId: string | null; onClose: () => void }) {
    const { can } = useSession();
    const q = useInboxHealth(phoneNumberId);
    const review = useResolutionReview(7, can(P.InboxAssign));
    const k = q.data;
    const rows = review.data?.agents ?? [];
    const max = Math.max(0, ...rows.map((r) => r.not_lead));
    const ms = (s: number | null | undefined) => (s === null || s === undefined ? '—' : dur(s * 1000, true));

    return (
        <section
            aria-label="Inbox health"
            className="fixed right-4 bottom-[calc(1rem+var(--tabbar))] z-50 max-h-[calc(100dvh-120px-var(--tabbar))] w-[340px] max-w-[calc(100vw-32px)] origin-bottom-right animate-in overflow-y-auto rounded-xl border bg-card px-4 py-3.5 shadow-raised zoom-in-95 fade-in motion-reduce:animate-none"
        >
            <div className="flex items-center justify-between">
                <b className="text-[15px] font-semibold">Inbox health</b>
                <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close inbox health">
                    <XIcon />
                </Button>
            </div>
            <p className="text-[12px] text-muted-foreground">
                Last {k?.days ?? 30} days on {phoneNumberId ? 'this number' : 'all numbers'}.
            </p>
            <div className="my-3 grid grid-cols-2 gap-2">
                <Kpi
                    value={k?.rate === null || k?.rate === undefined ? '—' : `${Math.round(k.rate * 100)}%`}
                    className={k?.rate !== null && k?.rate !== undefined && k.rate > 0.3 ? 'text-bad' : 'text-brand-600'}
                    label={
                        <>
                            Window expiry rate
                            <br />
                            {k?.expired ?? 0} of {k?.decided ?? 0} with a known outcome
                        </>
                    }
                />
                <Kpi
                    value={ms(k?.human_first_response.median_seconds)}
                    label={
                        <>
                            Median human first response
                            <br />
                            {k?.human_first_response.count ?? 0} answered
                        </>
                    }
                />
            </div>
            <div className="mb-3 grid grid-cols-3 gap-2">
                <Kpi small value={k?.expired ?? 0} className="text-bad" label="Expired" />
                <Kpi small value={k?.in_time ?? 0} className="text-brand-600" label="Replied in time" />
                <Kpi small value={k?.pending ?? 0} className="text-warn" label="Pending · window still open" />
            </div>
            <p className="text-[12px] text-muted-foreground">
                Automation first response: <b className="font-semibold text-foreground">{ms(k?.automation_first_response.median_seconds)}</b> (
                {k?.automation_first_response.count ?? 0} chats). Tracked separately and never counted as a human reply. Spam excluded.
            </p>
            <div className="mt-3 border-t pt-2.5">
                <b className="text-[13px] font-semibold">Sales</b>{' '}
                <span className="text-[12px] text-muted-foreground">(kept separate from response metrics)</span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                    <Kpi small value={`${k?.sales.open_with_next_step ?? 0} / ${k?.sales.open ?? 0}`} label="Open deals with an upcoming next step" />
                    <Kpi
                        small
                        value={aedK(k?.sales.open_value ?? 0)}
                        label={`Open pipeline value (${k?.sales.open_valued ?? 0} of ${k?.sales.open ?? 0} valued)`}
                    />
                </div>
            </div>
            {can(P.InboxAssign) && (
                <div className="mt-3 border-t pt-2.5">
                    <b className="text-[13px] font-semibold">Resolution review · last 7 days</b>
                    <table className="mt-2 w-full text-[12px]">
                        <thead>
                            <tr className="text-left text-[11px] text-muted-foreground">
                                <th className="py-1 font-semibold">Agent</th>
                                <th className="py-1 font-semibold">Resolved</th>
                                <th className="py-1 font-semibold">Not a lead</th>
                                <th className="py-1 font-semibold">Flagged</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="py-1.5 text-muted-foreground">
                                        No closures this week
                                    </td>
                                </tr>
                            )}
                            {rows.map((r) => (
                                <tr key={r.membership_id} className="border-t border-line-2">
                                    <td className="py-1.5">{r.name.split(' ')[0]}</td>
                                    <td className="tabular-nums">{r.resolved}</td>
                                    <td className={cn('tabular-nums', r.not_lead > 0 && r.not_lead === max && 'font-semibold text-bad')}>{r.not_lead}</td>
                                    <td className="tabular-nums">{r.flagged}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className="mt-1.5 text-[12px] text-muted-foreground">
                        “Not a lead” is excluded from response KPIs, so a high count is worth a look. Open the Resolved tab and filter by agent.
                    </p>
                </div>
            )}
        </section>
    );
}
