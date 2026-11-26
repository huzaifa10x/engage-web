'use client';

import { BellIcon, CreditCardIcon } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { useSelectedNumber } from '@/components/app/number-switcher';
import { useSession } from '@/components/app/session';
import { useNow } from '@/components/inbox/conversation-list';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { dur, fmtDay, fmtTime } from '@/lib/inbox';
import { P } from '@/lib/permissions';
import { useBilling, useConversations, useDashboardSummary } from '@/lib/queries';
import { cn } from '@/lib/utils';

import { Kpi, Meter, mins, Row, RowCard, RowText, SectionLabel, Spark, WaitPill } from './kit';

function greeting(): string {
    const h = new Date().getHours();

    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const first = (name: string | null | undefined) => (name ?? '').trim().split(' ')[0] || null;

/**
 * Home on a phone (mobile prototype): who is waiting with a one-tap reply to the longest wait, the
 * week's figures, the chats that need someone, today's follow-ups and the plan. Each part shows only
 * with the same permission as on a computer.
 */
export function MobileHome() {
    const { me, can } = useSession();
    const [numberId] = useSelectedNumber();
    const now = useNow(15_000);
    const inbox = can(P.InboxView);
    const summary = useDashboardSummary(inbox, numberId);
    const waiting = useConversations({ state: 'needs_reply', phone_number_id: numberId, sort: 'waiting' }, 30_000, inbox);
    const followups = useConversations({ followup: true, status: 'open', phone_number_id: numberId }, false, inbox);
    const billing = useBilling(can(P.BillingView));

    const s = summary.data;
    const w = s?.week;
    const list = waiting.data?.pages[0]?.data ?? [];
    const fetchedAt = waiting.dataUpdatedAt;
    const oldest = list[0];
    const endOfToday = new Date().setHours(23, 59, 59, 999);
    const due = useMemo(
        () =>
            (followups.data?.pages.flatMap((p) => p.data) ?? [])
                .filter((c) => c.next_step && new Date(c.next_step.due_at).getTime() <= endOfToday)
                .sort((a, b) => new Date(a.next_step!.due_at).getTime() - new Date(b.next_step!.due_at).getTime())
                .slice(0, 3),
        [followups.data, endOfToday],
    );
    const sub = billing.data?.subscription;
    const today = w?.new_enquiries.at(-1) ?? 0;
    const yesterday = w?.new_enquiries.at(-2) ?? 0;

    return (
        <div className="grid gap-0">
            <h1 className="pt-1 pb-2 text-[26px] leading-tight font-extrabold tracking-[-0.5px]">
                {greeting()}, {first(me.user.name)}
            </h1>

            {inbox && (
                <>
                    {/* The hero: who is waiting, and a reply to the longest wait. */}
                    <div className="relative mt-1 overflow-hidden rounded-[20px] bg-[linear-gradient(135deg,var(--foreground)_0%,var(--ink-2)_100%)] p-[18px] text-white/75">
                        <span className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-primary/15" aria-hidden />
                        <b className="text-[15px] font-semibold text-white">Waiting for a reply</b>
                        <div className="mt-1.5 mb-0.5 text-[44px] leading-none font-extrabold tracking-[-1px] text-white tabular-nums">
                            {s ? s.needs_reply : '–'}
                        </div>
                        <div className="text-[13px]">
                            {oldest
                                ? `Longest: ${oldest.contact?.display_name ?? 'WhatsApp user'}${oldest.needs_reply_since ? ` · ${dur(Math.max(0, now - new Date(oldest.needs_reply_since).getTime()), true)}` : ''}`
                                : s && s.needs_reply === 0
                                  ? 'Everyone has a reply 🎉'
                                  : ' '}
                        </div>
                        {oldest && (
                            <Link
                                href={`/inbox?c=${oldest.id}`}
                                className="relative mt-3 inline-flex h-9 items-center rounded-[10px] bg-primary px-3.5 text-[13px] font-bold text-primary-foreground active:scale-[.97]"
                            >
                                Reply to {first(oldest.contact?.display_name) ?? 'them'}
                            </Link>
                        )}
                    </div>

                    {/* The week in four tiles. */}
                    <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                        {!w ? (
                            [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
                        ) : (
                            <>
                                <Kpi label="New enquiries today" value={today}>
                                    <div className={cn('mt-1 text-[11.5px] font-bold', today >= yesterday ? 'text-good' : 'text-muted-foreground')}>
                                        {today === yesterday
                                            ? 'Same as yesterday'
                                            : `${today > yesterday ? '▲' : '▼'} ${Math.abs(today - yesterday)} vs yesterday`}
                                    </div>
                                    <Spark points={w.new_enquiries} />
                                </Kpi>
                                <Kpi label="Median first reply" value={mins(w.median_seconds)}>
                                    <div className="mt-1 text-[11.5px] font-bold text-good">Target: {mins(w.target_seconds)}</div>
                                    <Spark points={w.first_reply_median_seconds} />
                                </Kpi>
                                <Kpi label="Answered on time" value={w.on_time_pct === null ? '—' : `${w.on_time_pct}%`}>
                                    <div className="mt-2.5">
                                        <Meter pct={w.on_time_pct ?? 0} />
                                    </div>
                                    <div className="mt-1.5 text-[11.5px] text-muted-foreground">Last 7 days · {w.replies} replies</div>
                                </Kpi>
                                <Kpi label="Deals won this week" value={w.won}>
                                    <div className="mt-1 text-[11.5px] font-bold text-good">From WhatsApp</div>
                                </Kpi>
                            </>
                        )}
                    </div>

                    <SectionLabel>Needs you</SectionLabel>
                    <RowCard>
                        {list.slice(0, 3).map((c) => (
                            <Row key={c.id} href={`/inbox?c=${c.id}`}>
                                <Avatar name={c.contact?.display_name ?? 'WhatsApp user'} />
                                <RowText
                                    title={c.contact?.display_name ?? 'WhatsApp user'}
                                    sub={`${first(c.assigned_name) ?? 'Unassigned'} · ${c.last_message_preview ?? ''}`}
                                />
                                <WaitPill conversation={c} fetchedAt={fetchedAt} now={now} />
                            </Row>
                        ))}
                        {waiting.isSuccess && list.length === 0 && (
                            <Row>
                                <span className="text-[13px] text-muted-foreground">Nothing waiting</span>
                            </Row>
                        )}
                        {waiting.isLoading && <Skeleton className="h-14 rounded-none" />}
                    </RowCard>

                    <SectionLabel>Today’s follow-ups</SectionLabel>
                    <RowCard>
                        {due.map((c) => {
                            const step = c.next_step!;
                            const late = new Date(step.due_at).getTime() < now;

                            return (
                                <Row key={c.id} href={`/inbox?c=${c.id}`} chevron>
                                    <span
                                        className={cn(
                                            'grid size-[34px] shrink-0 place-items-center rounded-[10px] text-white',
                                            late ? 'bg-bad' : 'bg-muted-foreground',
                                        )}
                                    >
                                        <BellIcon className="size-4" aria-hidden />
                                    </span>
                                    <RowText
                                        title={step.title || step.type_label}
                                        sub={`${c.contact?.display_name ?? 'WhatsApp user'} · ${late ? `overdue since ${fmtDay(step.due_at, now)}` : fmtTime(step.due_at)}`}
                                    />
                                </Row>
                            );
                        })}
                        {followups.isSuccess && due.length === 0 && (
                            <Row>
                                <span className="text-[13px] text-muted-foreground">No follow-ups due today</span>
                            </Row>
                        )}
                        {followups.isLoading && <Skeleton className="h-14 rounded-none" />}
                    </RowCard>
                </>
            )}

            {can(P.BillingView) && billing.data && (
                <>
                    <SectionLabel>Your plan</SectionLabel>
                    <RowCard>
                        <Row href="/billing" chevron>
                            <span className="grid size-[34px] shrink-0 place-items-center rounded-[10px] bg-foreground text-primary">
                                <CreditCardIcon className="size-4" aria-hidden />
                            </span>
                            <RowText
                                title={billing.data.plan.name}
                                sub={
                                    sub?.paused
                                        ? 'Payment failed · paid features paused'
                                        : sub?.status === 'trialing' && sub.trial_ends_at
                                          ? `Trial ends ${new Date(sub.trial_ends_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
                                          : sub?.cancel_at
                                            ? `Ends ${new Date(sub.cancel_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
                                            : sub?.current_period_end
                                              ? `Renews ${new Date(sub.current_period_end).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
                                              : 'Manage your plan'
                                }
                            />
                        </Row>
                    </RowCard>
                </>
            )}
        </div>
    );
}
