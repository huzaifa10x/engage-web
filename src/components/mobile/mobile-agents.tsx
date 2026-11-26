'use client';

import { ArrowLeftIcon, BarChart3Icon, SettingsIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useSelectedNumber } from '@/components/app/number-switcher';
import { useSession } from '@/components/app/session';
import { useNow } from '@/components/inbox/conversation-list';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { P } from '@/lib/permissions';
import { useConversations, useMembers, useResponseTimes } from '@/lib/queries';
import type { ResponseStat } from '@/lib/types';

import { Kpi, LargeTitle, Meter, mins, Pill, Row, RowCard, RowText, SectionLabel, Segmented, WaitPill } from './kit';

type Period = '1' | '7' | '30';
const PERIODS: [Period, string][] = [
    ['1', 'Today'],
    ['7', '7 days'],
    ['30', '30 days'],
];
const tone = (pct: number | null) => (pct === null ? ('grey' as const) : pct >= 85 ? ('good' as const) : pct >= 70 ? ('warn' as const) : ('bad' as const));
const RESULT = { on_time: ['good', 'On time'], slow: ['warn', 'Slow'], late: ['bad', 'Late'] } as const;

type AgentRow = ResponseStat & { membership_id: string; name: string };

/**
 * Agents on a phone (mobile prototype): team median and who is waiting now, each teammate's replies,
 * median and share on time, and the reply log. A teammate opens their own figures and open chats.
 * Same permission as Insights on a computer.
 */
export function MobileAgents({ agentId }: { agentId: string | null }) {
    const { can, membership } = useSession();
    const router = useRouter();
    const now = useNow(15_000);
    const [numberId] = useSelectedNumber();
    const [period, setPeriod] = useState<Period>('1');
    const times = useResponseTimes(Number(period), numberId ?? undefined);
    const members = useMembers(can(P.TeamView));
    const waiting = useConversations({ state: 'needs_reply', phone_number_id: numberId, sort: 'waiting' }, 30_000, can(P.InboxView));
    const d = times.data;
    const list = waiting.data?.pages[0]?.data ?? [];

    // Everyone on the team, with their figures for the period (no replies yet: dashes).
    const stats = new Map((d?.agents ?? []).map((a) => [a.membership_id, a]));
    const team: AgentRow[] = [
        ...(d?.agents ?? []),
        ...(members.data?.data ?? [])
            .filter((m) => m.status === 'active' && !stats.has(m.id))
            .map((m) => ({
                membership_id: m.id,
                name: m.user?.name ?? 'Teammate',
                total: 0,
                median_seconds: null,
                average_seconds: null,
                within_target: 0,
                within_target_pct: null,
                after_hours: 0,
            })),
    ];

    if (agentId) {
        const a = team.find((t) => t.membership_id === agentId);

        return (
            <AgentScreen agent={a ?? null} id={agentId} teamMedian={d?.first_response.median_seconds ?? null} period={period} onBack={() => router.back()} />
        );
    }

    return (
        <div>
            <LargeTitle
                title="Agents"
                actions={
                    can(P.SettingsView) ? (
                        <Link
                            href="/settings?tab=hours"
                            aria-label="Reply alert settings"
                            className="grid size-10 place-items-center rounded-full text-ink-2 active:bg-muted"
                        >
                            <SettingsIcon className="size-5" />
                        </Link>
                    ) : null
                }
            >
                <Segmented value={period} onChange={setPeriod} options={PERIODS} label="Period" />
            </LargeTitle>

            <div className="mt-3 grid grid-cols-2 gap-2.5">
                <Kpi label="Team median first reply" value={d ? mins(d.first_response.median_seconds) : '–'} />
                <Kpi
                    label="Answered on time"
                    value={d?.first_response.within_target_pct === null || !d ? '—' : `${Math.round(d.first_response.within_target_pct)}%`}
                />
                <Kpi
                    label="Slow (up to 2× target)"
                    value={<span className={(d?.first_response.slow ?? 0) > 0 ? 'text-warn' : ''}>{d ? (d.first_response.slow ?? 0) : '–'}</span>}
                />
                <Kpi
                    label="Late (over 2× target)"
                    value={<span className={(d?.first_response.late ?? 0) > 0 ? 'text-bad' : ''}>{d ? (d.first_response.late ?? 0) : '–'}</span>}
                />
            </div>

            {can(P.InboxView) && (
                <>
                    <SectionLabel>Waiting right now</SectionLabel>
                    <RowCard>
                        {list.map((c) => (
                            <Row key={c.id} href={`/inbox?c=${c.id}`}>
                                <Avatar name={c.contact?.display_name ?? 'WhatsApp user'} />
                                <RowText
                                    title={c.contact?.display_name ?? 'WhatsApp user'}
                                    sub={c.assigned_name ? `Assigned to ${c.assigned_name.split(' ')[0]}` : 'Unassigned'}
                                />
                                <WaitPill conversation={c} fetchedAt={waiting.dataUpdatedAt} now={now} />
                            </Row>
                        ))}
                        {waiting.isSuccess && list.length === 0 && (
                            <Row>
                                <span className="text-[13px] text-muted-foreground">Everyone has a reply</span>
                            </Row>
                        )}
                        {waiting.isLoading && <Skeleton className="h-14 rounded-none" />}
                    </RowCard>
                </>
            )}

            <SectionLabel>Team</SectionLabel>
            <RowCard>
                {!d && <Skeleton className="h-40 rounded-none" />}
                {d &&
                    team.map((a) => (
                        <Row key={a.membership_id} href={`/insights?agent=${a.membership_id}`}>
                            <Avatar name={a.name} className="size-11 text-[15px]" />
                            <span className="min-w-0 flex-1">
                                <b className="block truncate text-[15px] font-semibold">
                                    {a.name}
                                    {a.membership_id === membership.id ? ' (you)' : ''}
                                </b>
                                <span className="block truncate text-[13px] text-muted-foreground">
                                    {a.total} {a.total === 1 ? 'reply' : 'replies'} · median {mins(a.median_seconds)}
                                </span>
                                <span className="mt-1.5 block">
                                    <Meter
                                        pct={a.within_target_pct ?? 0}
                                        tone={a.within_target_pct === null ? 'dark' : (tone(a.within_target_pct) as 'good' | 'warn' | 'bad')}
                                    />
                                </span>
                            </span>
                            <Pill tone={tone(a.within_target_pct)}>{a.within_target_pct === null ? '—' : `${Math.round(a.within_target_pct)}%`}</Pill>
                        </Row>
                    ))}
                {d && team.length === 0 && (
                    <Row>
                        <span className="text-[13px] text-muted-foreground">No replies in this period yet</span>
                    </Row>
                )}
            </RowCard>

            {d?.log && d.log.length > 0 && (
                <>
                    <SectionLabel>Reply log</SectionLabel>
                    <RowCard>
                        {d.log.map((r) => (
                            <Row key={`${r.conversation_id}-${r.at}`} href={`/inbox?c=${r.conversation_id}`}>
                                <RowText
                                    title={r.contact}
                                    sub={`${r.by ?? 'Someone'} · replied after ${mins(r.seconds)}${r.after_hours ? ' · after hours' : ''}`}
                                />
                                <Pill tone={RESULT[r.result][0]}>{RESULT[r.result][1]}</Pill>
                            </Row>
                        ))}
                    </RowCard>
                </>
            )}

            <SectionLabel>More</SectionLabel>
            <RowCard>
                <Row href="/insights?full=1" chevron>
                    <span className="grid size-[34px] shrink-0 place-items-center rounded-[10px] bg-muted">
                        <BarChart3Icon className="size-4" aria-hidden />
                    </span>
                    <RowText title="Full reports" sub="Messages, delivery, templates and follow-ups" />
                </Row>
            </RowCard>
        </div>
    );
}

function AgentScreen({
    agent: a,
    id,
    teamMedian,
    period,
    onBack,
}: {
    agent: AgentRow | null;
    id: string;
    teamMedian: number | null;
    period: Period;
    onBack: () => void;
}) {
    const { can } = useSession();
    const now = useNow(15_000);
    const chats = useConversations({ assignee: id, status: 'open' }, 30_000, can(P.InboxView));
    const [numberId] = useSelectedNumber();
    const slowest = useResponseTimes(Number(period), numberId ?? undefined, true, id).data?.log ?? [];
    const list = chats.data?.pages.flatMap((p) => p.data) ?? [];
    const name = a?.name ?? 'Teammate';
    const faster = a?.median_seconds !== null && a?.median_seconds !== undefined && teamMedian !== null && a.median_seconds < teamMedian;
    const when = PERIODS.find(([k]) => k === period)?.[1] ?? '';

    return (
        <div>
            <div className="-mx-4 -mt-6 flex h-14 items-center gap-1 border-b bg-card px-2">
                <button type="button" onClick={onBack} aria-label="Back" className="grid size-10 place-items-center rounded-full active:bg-muted">
                    <ArrowLeftIcon className="size-5" />
                </button>
                <b className="min-w-0 flex-1 truncate text-[17px] font-bold">{name}</b>
            </div>
            <div className="flex justify-center pt-5 pb-3">
                <Avatar name={name} className="size-[72px] text-[26px]" />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
                <Kpi label={`Replies · ${when}`} value={a?.total ?? 0} />
                <Kpi label="Median reply" value={mins(a?.median_seconds)} />
                <Kpi label="On time" value={a?.within_target_pct === null || !a ? '—' : `${Math.round(a.within_target_pct)}%`} />
                <Kpi label="Team median" value={mins(teamMedian)}>
                    {faster && <div className="mt-1 text-[11.5px] font-bold text-good">Faster than the team</div>}
                </Kpi>
            </div>
            {slowest.length > 0 && (
                <>
                    <SectionLabel>Their slowest replies · {when}</SectionLabel>
                    <RowCard>
                        {slowest.map((r) => (
                            <Row key={`${r.conversation_id}-${r.at}`} href={`/inbox?c=${r.conversation_id}`}>
                                <RowText title={r.contact} sub={`Replied after ${mins(r.seconds)}${r.after_hours ? ' · after hours' : ''}`} />
                                <Pill tone={RESULT[r.result][0]}>{RESULT[r.result][1]}</Pill>
                            </Row>
                        ))}
                    </RowCard>
                </>
            )}
            {can(P.InboxView) && (
                <>
                    <SectionLabel>Their open chats</SectionLabel>
                    <RowCard>
                        {list.map((c) => (
                            <Row key={c.id} href={`/inbox?c=${c.id}`}>
                                <Avatar name={c.contact?.display_name ?? 'WhatsApp user'} />
                                <RowText title={c.contact?.display_name ?? 'WhatsApp user'} sub={c.last_message_preview ?? c.contact?.stage?.name ?? ''} />
                                <WaitPill conversation={c} fetchedAt={chats.dataUpdatedAt} now={now} />
                            </Row>
                        ))}
                        {chats.isSuccess && list.length === 0 && (
                            <Row>
                                <span className="text-[13px] text-muted-foreground">No open chats</span>
                            </Row>
                        )}
                        {chats.isLoading && <Skeleton className="h-14 rounded-none" />}
                    </RowCard>
                </>
            )}
        </div>
    );
}
