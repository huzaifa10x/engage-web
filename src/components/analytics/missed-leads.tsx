'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { useSession } from '@/components/app/session';
import { ContactLink } from '@/components/contacts/contact-sheet';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, ApiError, errorMessage } from '@/lib/api';
import { date } from '@/lib/format';
import { P } from '@/lib/permissions';
import { AED, clock } from '@/lib/promise';
import { useMissedLeads } from '@/lib/queries';
import type { MissedLeadsBaseline } from '@/lib/types';
import { cn } from '@/lib/utils';

const pct = (x: number, of: number) => (of ? `${Math.round((x / of) * 100)}%` : '—');

function Kpi({ value, label, tone, base }: { value: string | number; label: string; tone?: 'good' | 'bad' | 'warn'; base?: React.ReactNode }) {
    return (
        <div className="rounded-md border p-3">
            <p
                className={cn(
                    'text-xl font-semibold tabular-nums',
                    tone === 'good' && 'text-good',
                    tone === 'bad' && 'text-bad',
                    tone === 'warn' && 'text-warn',
                )}
            >
                {value}
            </p>
            <p className="text-[12px] text-muted-foreground">{label}</p>
            {base}
        </div>
    );
}

/** Compared with the week-zero audit: green when better, red when worse. */
function Versus({ current, base, lowerBetter }: { current: number; base: number | null | undefined; lowerBetter?: boolean }) {
    if (base === null || base === undefined) return null;
    const better = lowerBetter ? current <= base : current >= base;

    return <p className={cn('text-[11.5px] font-medium', better ? 'text-good' : 'text-bad')}>Week zero: {base}</p>;
}

/**
 * The weekly missed-leads report (3.3, the pilot kit): per enquiry, Monday to Sunday, against the
 * reply promise in business minutes. Emailed to Owners every Monday.
 */
export function MissedLeadsCard({ className }: { className?: string } = {}) {
    const { can } = useSession();
    const qc = useQueryClient();
    const [weeksAgo, setWeeksAgo] = useState(0);
    const q = useMissedLeads(weeksAgo);
    const r = q.data;
    const [draft, setDraft] = useState<MissedLeadsBaseline | null>(null);
    const base = draft ?? r?.baseline ?? {};
    const saveBaseline = useMutation({
        mutationFn: () =>
            api('reports/missed-leads/baseline', {
                method: 'PUT',
                body: {
                    enquiries: base.enquiries ?? null,
                    in_time: base.in_time ?? null,
                    over: base.over ?? null,
                    median_reply_minutes: base.median_reply_minutes ?? null,
                    note: base.note ?? null,
                },
            }),
        onSuccess: () => {
            toast.success('Week-zero baseline saved · every report now compares against it');
            setDraft(null);
            void qc.invalidateQueries({ queryKey: ['reports', 'missed-leads'] });
            void qc.invalidateQueries({ queryKey: ['reply-promise'] });
        },
        onError: (e) => toast.error(e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? e.message) : errorMessage(e)),
    });
    const num = (v: string) => (v === '' ? null : Math.max(0, Math.floor(Number(v))));

    return (
        <Card id="missed-leads" className={cn('grid gap-4 p-5', className)}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-semibold">Weekly missed-leads report</p>
                    <p className="text-[12.5px] text-muted-foreground">
                        {r
                            ? `${date(r.week.from)} to ${date(r.week.to)}${r.week.complete ? '' : ' (so far)'} · per enquiry · waiting limit ${r.limit_minutes} business minutes. Emailed to Owners every Monday.`
                            : 'Per enquiry, Monday to Sunday, against the reply promise.'}
                    </p>
                </div>
                <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Week">
                    {[
                        [0, 'This week'],
                        [1, 'Last week'],
                        [2, '2 weeks ago'],
                    ].map(([k, l]) => (
                        <button
                            key={k}
                            type="button"
                            aria-pressed={weeksAgo === k}
                            onClick={() => setWeeksAgo(k as number)}
                            className={cn(
                                'rounded px-2.5 py-1 text-[12.5px] font-medium',
                                weeksAgo === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                            )}
                        >
                            {l}
                        </button>
                    ))}
                </div>
            </div>

            {!r ? (
                <Skeleton className="h-48" />
            ) : (
                <>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Kpi value={r.enquiries} label="Enquiries in" base={<Versus current={r.enquiries} base={r.baseline?.enquiries} />} />
                        <Kpi
                            value={r.in_time}
                            label={`Answered within the limit · ${pct(r.in_time, r.enquiries)}`}
                            tone="good"
                            base={<Versus current={r.in_time} base={r.baseline?.in_time} />}
                        />
                        <Kpi
                            value={r.over}
                            label={`Waited over the limit · ${pct(r.over, r.enquiries)}`}
                            tone="bad"
                            base={<Versus current={r.over} base={r.baseline?.over} lowerBetter />}
                        />
                        <Kpi value={r.pending} label="Still within the limit, no reply yet" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Kpi
                            value={r.aed_at_stake === null ? '—' : AED(r.aed_at_stake)}
                            tone="warn"
                            label={
                                r.avg_booking_value === null
                                    ? 'AED at stake · set the average booking value in Settings › Business hours'
                                    : `AED at stake · ${r.over} waited over × ${AED(r.avg_booking_value)} average booking value`
                            }
                        />
                        <Kpi
                            value={AED(r.aed_protected)}
                            tone="good"
                            label={`AED protected · verified payments only (${r.verified_payments}). ${r.booked_without_payment} booking${r.booked_without_payment === 1 ? '' : 's'} marked by staff without payment not counted.`}
                        />
                    </div>

                    <section className="grid gap-2">
                        <h3 className="text-[13px] font-semibold">Waited over the limit</h3>
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Enquiry</TableHead>
                                    <TableHead>Waited</TableHead>
                                    <TableHead>Owner</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {r.waited_over.map((w) => (
                                    <TableRow key={w.enquiry_id}>
                                        <TableCell>
                                            <ContactLink contact={w.contact_id}>{w.customer}</ContactLink>
                                        </TableCell>
                                        <TableCell>{w.title ?? `Enquiry ${w.enquiry_number}`}</TableCell>
                                        <TableCell className="text-bad tabular-nums">
                                            {clock(w.waited_seconds)}
                                            {w.answered ? '' : ' · no reply yet'}
                                        </TableCell>
                                        <TableCell>{w.owner ?? 'Unassigned'}</TableCell>
                                    </TableRow>
                                ))}
                                {r.waited_over.length === 0 && (
                                    <TableRow className="hover:bg-transparent">
                                        <TableCell colSpan={4} className="text-muted-foreground">
                                            None this week.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </section>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <section className="grid content-start gap-2">
                            <h3 className="text-[13px] font-semibold">
                                Reply time per staff member <span className="font-normal text-muted-foreground">(business hours, all chats)</span>
                            </h3>
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead>Staff</TableHead>
                                        <TableHead>Replies</TableHead>
                                        <TableHead>Median reply</TableHead>
                                        <TableHead>Within limit</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {r.staff.map((s) => (
                                        <TableRow key={s.membership_id}>
                                            <TableCell>{s.name}</TableCell>
                                            <TableCell className="tabular-nums">{s.replies}</TableCell>
                                            <TableCell className="tabular-nums">{clock(s.median_seconds)}</TableCell>
                                            <TableCell className="tabular-nums">{pct(s.within_limit, s.replies)}</TableCell>
                                        </TableRow>
                                    ))}
                                    {r.staff.length === 0 && (
                                        <TableRow className="hover:bg-transparent">
                                            <TableCell colSpan={4} className="text-muted-foreground">
                                                No replies this week.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </section>
                        <section className="grid content-start gap-2">
                            <h3 className="text-[13px] font-semibold">Enquiries by ad and source</h3>
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead>Source</TableHead>
                                        <TableHead>Enquiries</TableHead>
                                        <TableHead>Verified</TableHead>
                                        <TableHead>Partial</TableHead>
                                        <TableHead>Unknown</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {r.by_ad.map((a) => (
                                        <TableRow key={a.label}>
                                            <TableCell className="max-w-48 truncate">{a.label}</TableCell>
                                            <TableCell className="tabular-nums">{a.enquiries}</TableCell>
                                            <TableCell className="tabular-nums">{a.verified}</TableCell>
                                            <TableCell className="tabular-nums">{a.partial}</TableCell>
                                            <TableCell className="tabular-nums">{a.unknown}</TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow className="font-semibold hover:bg-transparent">
                                        <TableCell>All</TableCell>
                                        <TableCell className="tabular-nums">{r.enquiries}</TableCell>
                                        {r.by_confidence.map((c) => (
                                            <TableCell key={c.key} className="tabular-nums">
                                                {c.enquiries} · {pct(c.enquiries, r.enquiries)}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                </TableBody>
                            </Table>
                            <p className="text-[11.5px] text-muted-foreground">
                                Verified: a Click-to-WhatsApp click ID or a tracked engageX link. Partial: a campaign label without a click ID. Unknown:
                                everything else. Never guessed.
                            </p>
                        </section>
                    </div>

                    <section className="grid gap-2 rounded-md border p-3">
                        <h3 className="text-[13px] font-semibold">
                            Week-zero audit baseline <span className="font-normal text-muted-foreground">(entered by hand)</span>
                        </h3>
                        <div className="grid gap-3 sm:grid-cols-4">
                            {(
                                [
                                    ['enquiries', 'Enquiries'],
                                    ['in_time', 'Answered within the limit'],
                                    ['over', 'Waited over'],
                                    ['median_reply_minutes', 'Median reply (minutes)'],
                                ] as const
                            ).map(([k, l]) => (
                                <div key={k} className="grid gap-1">
                                    <Label htmlFor={`base-${k}`} className="text-[12px]">
                                        {l}
                                    </Label>
                                    <Input
                                        id={`base-${k}`}
                                        inputMode="numeric"
                                        disabled={!can(P.SettingsManage)}
                                        value={base[k] ?? ''}
                                        onChange={(e) => setDraft({ ...base, [k]: num(e.target.value.replace(/\D/g, '')) })}
                                    />
                                </div>
                            ))}
                        </div>
                        <Input
                            disabled={!can(P.SettingsManage)}
                            value={base.note ?? ''}
                            maxLength={300}
                            onChange={(e) => setDraft({ ...base, note: e.target.value })}
                            placeholder="Where these numbers come from, e.g. audit of the last week of October"
                            aria-label="Note"
                        />
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-[11.5px] text-muted-foreground">
                                {r.baseline?.entered_at
                                    ? `Entered by ${r.baseline.entered_by ?? 'a teammate'}, ${date(r.baseline.entered_at)}.`
                                    : 'Not entered yet.'}
                            </p>
                            {can(P.SettingsManage) && (
                                <Button size="sm" onClick={() => saveBaseline.mutate()} disabled={draft === null || saveBaseline.isPending}>
                                    Save baseline
                                </Button>
                            )}
                        </div>
                    </section>
                </>
            )}
        </Card>
    );
}
