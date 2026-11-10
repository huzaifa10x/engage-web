'use client';

import {
    ArrowRightIcon,
    CheckCircle2Icon,
    CircleIcon,
    InboxIcon,
    MegaphoneIcon,
    MessageSquareIcon,
    MoonIcon,
    UserCheckIcon,
    UserXIcon,
    UsersIcon,
} from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '@/components/app/page-header';
import { useSelectedNumber } from '@/components/app/number-switcher';
import { useSession } from '@/components/app/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { number } from '@/lib/format';
import { P } from '@/lib/permissions';
import { useDashboardSummary, useInvitations, useMembers, usePhoneNumbers } from '@/lib/queries';
import { phoneDisplay, qualityLabel, qualityTone, statusLabel, statusTone, tierLabel } from '@/lib/whatsapp';
import { cn } from '@/lib/utils';

function greeting(): string {
    const h = new Date().getHours();

    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function Kpi({
    label,
    value,
    hint,
    icon,
    progress,
}: {
    label: string;
    value: React.ReactNode;
    hint?: React.ReactNode;
    icon: React.ReactNode;
    progress?: number | null;
}) {
    return (
        <Card className="p-5">
            <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
                <span className="text-muted-foreground">{icon}</span>
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
            {progress !== undefined && progress !== null && <Progress value={progress} className="mt-3" />}
            {hint && <p className="mt-2 text-[12.5px] text-muted-foreground">{hint}</p>}
        </Card>
    );
}

/** A Today's work count that opens the matching Inbox view. */
function WorkCard({
    label,
    value,
    hint,
    icon,
    href,
    urgent = false,
}: {
    label: string;
    value: number;
    hint: string;
    icon: React.ReactNode;
    href: string;
    urgent?: boolean;
}) {
    return (
        <Link href={href} className="group rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <Card className={cn('p-5 transition-colors group-hover:border-primary/50', urgent && 'border-warn/40 bg-warn-bg/40')}>
                <div className="flex items-center justify-between">
                    <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
                    <span className="text-muted-foreground">{icon}</span>
                </div>
                <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{number(value)}</p>
                <p className="mt-2 flex items-center gap-1 text-[12.5px] text-muted-foreground">
                    {hint}
                    <ArrowRightIcon className="ml-auto size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                </p>
            </Card>
        </Link>
    );
}

export default function DashboardPage() {
    const { me, membership, can } = useSession();
    const numbers = usePhoneNumbers();
    // The number chosen in the top bar filters the figures and the number list (CN-02).
    const [numberId] = useSelectedNumber();
    const summary = useDashboardSummary(can(P.InboxView), numberId);
    const s = summary.data;
    const members = useMembers(can(P.TeamView));
    const invitations = useInvitations(can(P.TeamView));

    const list = numbers.data ?? [];
    const connected = list.filter((n) => n.status === 'connected');
    const teamSize = (members.data?.data.length ?? 0) + (invitations.data?.length ?? 0);

    const checklist = [
        {
            done: connected.length > 0,
            title: 'Connect a WhatsApp number',
            body: 'Link your business number through Meta in about two minutes.',
            href: '/channels',
            cta: 'Connect',
            show: can(P.ChannelsView),
        },
        {
            done: teamSize > 1,
            title: 'Invite your team',
            body: 'Add agents and choose which numbers each of them can use.',
            href: '/team',
            cta: 'Invite',
            show: can(P.TeamView),
        },
        {
            done: me.entitlements?.subscription?.status === 'active',
            title: 'Choose your plan',
            body: 'Compare plans and usage before your trial ends.',
            href: '/billing',
            cta: 'Review',
            show: can(P.BillingView),
        },
    ].filter((c) => c.show);
    const done = checklist.filter((c) => c.done).length;

    return (
        <>
            <PageHeader title={`${greeting()}, ${me.user.name.split(' ')[0]}`} description={`Here is what is happening in ${membership.tenant?.name}.`} />

            {checklist.length > 0 && done < checklist.length && (
                <Card className="mb-6">
                    <CardHeader>
                        <div>
                            <CardTitle>Get set up</CardTitle>
                            <CardDescription>
                                {done} of {checklist.length} done
                            </CardDescription>
                        </div>
                        <Progress value={(done / checklist.length) * 100} className="mt-2 w-40" />
                    </CardHeader>
                    <ul className="divide-y divide-line-2">
                        {checklist.map((c) => (
                            <li key={c.title} className="flex items-center gap-4 px-5 py-3.5">
                                {c.done ? <CheckCircle2Icon className="size-5 shrink-0 text-good" /> : <CircleIcon className="size-5 shrink-0 text-faint" />}
                                <div className="min-w-0 flex-1">
                                    <p className={cn('text-sm font-semibold', c.done && 'text-muted-foreground line-through')}>{c.title}</p>
                                    <p className="text-[13px] text-muted-foreground">{c.body}</p>
                                </div>
                                {!c.done && (
                                    <Button asChild size="sm" variant="outline">
                                        <Link href={c.href}>
                                            {c.cta} <ArrowRightIcon />
                                        </Link>
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            {/* Today's work: the Inbox's own counts, each opening that view of the Inbox (CN feedback). */}
            {can(P.InboxView) && (
                <>
                    <h2 className="mb-2 text-[13px] font-semibold tracking-wider text-muted-foreground uppercase">Today’s work</h2>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        {!s ? (
                            [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)
                        ) : (
                            <>
                                <WorkCard
                                    label="Needs reply"
                                    icon={<InboxIcon className="size-4" />}
                                    value={s.needs_reply}
                                    hint="Customers waiting for the team"
                                    href="/inbox?tab=needs_reply"
                                    urgent={s.needs_reply > 0}
                                />
                                <WorkCard
                                    label="Unassigned"
                                    icon={<UserXIcon className="size-4" />}
                                    value={s.needs_reply_unassigned}
                                    hint="Need a reply, nobody assigned"
                                    href="/inbox?tab=needs_reply&assigned=unassigned"
                                />
                                <WorkCard
                                    label="Mine"
                                    icon={<UserCheckIcon className="size-4" />}
                                    value={s.needs_reply_mine}
                                    hint="Need a reply, assigned to you"
                                    href="/inbox?tab=needs_reply&assigned=me"
                                />
                                <WorkCard
                                    label="Arrived after hours"
                                    icon={<MoonIcon className="size-4" />}
                                    value={s.after_hours}
                                    hint="Came in while you were closed"
                                    href="/inbox?tab=needs_reply&after_hours=1"
                                />
                            </>
                        )}
                    </div>
                    {s && s.older_no_reply > 0 && (
                        <p className="mt-2 text-[13px] text-muted-foreground">
                            Also {number(s.older_no_reply)} older chat{s.older_no_reply === 1 ? '' : 's'} with no reply (imported history or from before reply
                            tracking); they are not counted in Needs reply.{' '}
                            <Link href="/inbox?tab=any" className="font-medium text-foreground underline-offset-2 hover:underline">
                                Open the inbox
                            </Link>
                        </p>
                    )}

                    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {!s ? (
                            [0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)
                        ) : (
                            <>
                                <Kpi
                                    label="Messages today"
                                    icon={<MessageSquareIcon className="size-4" />}
                                    value={
                                        <>
                                            {number(s.messages_received_today)}
                                            <span className="text-base font-normal text-muted-foreground"> in · </span>
                                            {number(s.messages_sent_today)}
                                            <span className="text-base font-normal text-muted-foreground"> out</span>
                                        </>
                                    }
                                    hint="Conversation messages, without campaigns"
                                />
                                <Kpi
                                    label="Conversations today"
                                    icon={<UsersIcon className="size-4" />}
                                    value={number(s.conversations_today)}
                                    hint="Customers who wrote today"
                                />
                                <Kpi
                                    label="Campaign messages this month"
                                    icon={<MegaphoneIcon className="size-4" />}
                                    value={number(s.campaign_messages_this_month)}
                                    hint={`${number(s.campaign_messages_today)} sent today`}
                                />
                            </>
                        )}
                    </div>
                </>
            )}

            {connected.length > 0 && (
                <Card className="mt-6">
                    <CardHeader>
                        <CardTitle>Number health</CardTitle>
                        {can(P.ChannelsView) && (
                            <Button asChild size="sm" variant="ghost">
                                <Link href="/channels">
                                    Manage <ArrowRightIcon />
                                </Link>
                            </Button>
                        )}
                    </CardHeader>
                    <CardContent className="grid gap-3 p-0">
                        <ul className="divide-y divide-line-2">
                            {list
                                .filter((n) => !numberId || n.id === numberId)
                                .map((n) => (
                                    <li key={n.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-semibold">{n.verified_name ?? 'Unnamed number'}</p>
                                            <p className="font-mono text-[12px] text-muted-foreground">{phoneDisplay(n.display_phone_number)}</p>
                                        </div>
                                        <span className="text-[13px] text-muted-foreground">{tierLabel(n.messaging_limit_tier)}</span>
                                        <Badge tone={qualityTone(n.quality_rating)} dot>
                                            {qualityLabel(n.quality_rating)}
                                        </Badge>
                                        <Badge tone={statusTone(n.status)}>{statusLabel(n.status)}</Badge>
                                    </li>
                                ))}
                        </ul>
                    </CardContent>
                </Card>
            )}
        </>
    );
}
