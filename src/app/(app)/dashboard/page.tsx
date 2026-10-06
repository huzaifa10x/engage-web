'use client';

import { ArrowRightIcon, CheckCircle2Icon, CircleIcon, InboxIcon, MegaphoneIcon, PhoneIcon, UsersIcon } from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { number } from '@/lib/format';
import { P } from '@/lib/permissions';
import { useEntitlements, useInvitations, useMembers, usePhoneNumbers } from '@/lib/queries';
import { qualityLabel, qualityTone, statusLabel, statusTone, tierLabel } from '@/lib/whatsapp';
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

export default function DashboardPage() {
    const { me, membership, can } = useSession();
    const numbers = usePhoneNumbers();
    const entitlements = useEntitlements();
    const members = useMembers(can(P.TeamView));
    const invitations = useInvitations(can(P.TeamView));

    const list = numbers.data ?? [];
    const connected = list.filter((n) => n.status === 'connected');
    const f = entitlements.data?.features;
    const numberSlots = f?.whatsapp_numbers;
    const seats = f?.team_seats;
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
            done: !!me.entitlements && me.entitlements.subscription_status === 'active',
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

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {numbers.isLoading || entitlements.isLoading ? (
                    [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)
                ) : (
                    <>
                        <Kpi
                            label="WhatsApp numbers"
                            icon={<PhoneIcon className="size-4" />}
                            value={
                                <>
                                    {connected.length}
                                    {numberSlots && !numberSlots.unlimited && (
                                        <span className="text-base font-normal text-muted-foreground"> / {numberSlots.limit}</span>
                                    )}
                                </>
                            }
                            progress={numberSlots && !numberSlots.unlimited && numberSlots.limit ? ((numberSlots.used ?? 0) / numberSlots.limit) * 100 : null}
                            hint={list.length > connected.length ? `${list.length - connected.length} setting up or disconnected` : 'Connected and ready'}
                        />
                        <Kpi
                            label="Team seats"
                            icon={<UsersIcon className="size-4" />}
                            value={
                                <>
                                    {number(seats?.used ?? null)}
                                    {seats && !seats.unlimited && <span className="text-base font-normal text-muted-foreground"> / {seats.limit}</span>}
                                </>
                            }
                            progress={seats && !seats.unlimited && seats.limit ? ((seats.used ?? 0) / seats.limit) * 100 : null}
                            hint="Members plus pending invitations"
                        />
                        <Kpi label="Conversations today" icon={<InboxIcon className="size-4" />} value="—" hint="Available when the Team Inbox launches" />
                        <Kpi label="Campaigns sent" icon={<MegaphoneIcon className="size-4" />} value="—" hint="Available when Campaigns launch" />
                    </>
                )}
            </div>

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
                            {list.map((n) => (
                                <li key={n.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold">{n.verified_name ?? 'Unnamed number'}</p>
                                        <p className="font-mono text-[12px] text-muted-foreground">{n.display_phone_number}</p>
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
