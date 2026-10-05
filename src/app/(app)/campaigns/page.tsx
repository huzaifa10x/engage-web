'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
    BanIcon,
    CopyIcon,
    DownloadIcon,
    EyeIcon,
    MegaphoneIcon,
    MoreHorizontalIcon,
    PauseIcon,
    PencilIcon,
    PlayIcon,
    PlusIcon,
    Trash2Icon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { EmptyState, Forbidden, PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { CAMPAIGN_STATUS, CampaignDetailDialog } from '@/components/campaigns/campaign-detail';
import { CampaignDialog } from '@/components/campaigns/campaign-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiError, errorMessage } from '@/lib/api';
import { relative } from '@/lib/format';
import { P } from '@/lib/permissions';
import { cancelCampaign, deleteCampaign, duplicateCampaign, keys, pauseCampaign, resumeCampaign, useCampaigns } from '@/lib/queries';
import type { Campaign } from '@/lib/types';

const when = (c: Campaign) =>
    c.status === 'scheduled' && c.scheduled_at
        ? `Starts ${new Date(c.scheduled_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
        : relative(c.started_at ?? c.created_at);

export default function CampaignsPage() {
    const { can } = useSession();
    const qc = useQueryClient();
    const allowed = can(P.CampaignsView);
    const campaigns = useCampaigns(allowed);
    const [editing, setEditing] = useState<Campaign | null | undefined>(undefined); // undefined = closed, null = new
    const [viewingId, setViewingId] = useState<string | null>(null);

    const rows = campaigns.data ?? [];
    const viewing = rows.find((c) => c.id === viewingId) ?? null; // from the live list, so numbers keep moving
    const notIncluded = campaigns.error instanceof ApiError && campaigns.error.code === 'feature_not_available';

    const act = useMutation({
        mutationFn: (action: () => Promise<unknown>) => action(),
        onSuccess: () => void qc.invalidateQueries({ queryKey: keys.campaigns }),
        onError: (e) => toast.error(errorMessage(e)),
    });

    if (!allowed) return <Forbidden />;

    return (
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
            <PageHeader
                title="Campaigns"
                description="Broadcast an approved template to a segment of your contacts and follow who received and read it."
                actions={
                    can(P.CampaignsCreate) && (
                        <Button onClick={() => setEditing(null)}>
                            <PlusIcon /> New campaign
                        </Button>
                    )
                }
            />

            <Card className="overflow-hidden p-0">
                {campaigns.isLoading ? (
                    <div className="grid gap-2 p-4">
                        <Skeleton className="h-10" />
                        <Skeleton className="h-10" />
                    </div>
                ) : campaigns.isError ? (
                    <EmptyState
                        title={notIncluded ? 'Campaigns are not part of your plan' : 'Campaigns could not be loaded'}
                        description={errorMessage(campaigns.error)}
                    />
                ) : rows.length === 0 ? (
                    <EmptyState
                        icon={<MegaphoneIcon className="size-5" />}
                        title="No campaigns yet"
                        description="Create a campaign to send an approved template to everyone in a segment, for example an offer to your VIP members."
                    />
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent">
                                <TableHead>Campaign</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Audience</TableHead>
                                <TableHead className="text-right">Sent</TableHead>
                                <TableHead className="text-right">Delivered</TableHead>
                                <TableHead className="text-right">Read</TableHead>
                                <TableHead className="text-right">Failed</TableHead>
                                <TableHead className="w-10" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((c) => {
                                const started = c.status !== 'draft' && c.status !== 'scheduled';
                                const n = (v: number) => (started ? v.toLocaleString() : '—');

                                return (
                                    <TableRow key={c.id} className="cursor-pointer" onClick={() => setViewingId(c.id)}>
                                        <TableCell>
                                            <p className="font-medium">{c.name}</p>
                                            <p className="text-[12.5px] text-muted-foreground">
                                                {c.template.name} ·{' '}
                                                {[
                                                    c.audience_name ?? (c.segment_id ? 'Segment' : c.audience_tag ? null : 'All contacts'),
                                                    c.audience_tag ? `tag ${c.audience_tag}` : null,
                                                ]
                                                    .filter(Boolean)
                                                    .join(' + ')}{' '}
                                                · {when(c)}
                                            </p>
                                        </TableCell>
                                        <TableCell>
                                            <Badge tone={CAMPAIGN_STATUS[c.status].tone} dot title={c.pause_reason ?? undefined}>
                                                {c.status === 'sending' && c.next_batch_at ? 'Waiting' : CAMPAIGN_STATUS[c.status].label}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {started ? `${c.stats.eligible.toLocaleString()} of ${c.stats.matched.toLocaleString()}` : '—'}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">{n(c.stats.sent)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{n(c.stats.delivered)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{n(c.stats.read)}</TableCell>
                                        <TableCell className={`text-right tabular-nums ${started && c.stats.failed > 0 ? 'font-medium text-bad' : ''}`}>
                                            {n(c.stats.failed)}
                                        </TableCell>
                                        <TableCell onClick={(e) => e.stopPropagation()}>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${c.name}`}>
                                                        <MoreHorizontalIcon />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onSelect={() => setViewingId(c.id)}>
                                                        <EyeIcon /> View results
                                                    </DropdownMenuItem>
                                                    {c.status === 'draft' && can(P.CampaignsCreate) && (
                                                        <DropdownMenuItem onSelect={() => setEditing(c)}>
                                                            <PencilIcon /> Edit and send
                                                        </DropdownMenuItem>
                                                    )}
                                                    {c.status === 'sending' && can(P.CampaignsSend) && (
                                                        <DropdownMenuItem onSelect={() => act.mutate(() => pauseCampaign(c.id))}>
                                                            <PauseIcon /> Pause
                                                        </DropdownMenuItem>
                                                    )}
                                                    {c.status === 'paused' && can(P.CampaignsSend) && (
                                                        <DropdownMenuItem onSelect={() => act.mutate(() => resumeCampaign(c.id))}>
                                                            <PlayIcon /> Resume
                                                        </DropdownMenuItem>
                                                    )}
                                                    {['sending', 'scheduled', 'paused'].includes(c.status) && can(P.CampaignsSend) && (
                                                        <DropdownMenuItem
                                                            onSelect={() =>
                                                                (c.status === 'scheduled' ||
                                                                    window.confirm(
                                                                        'Stop this campaign for good? Contacts not yet messaged will not receive it.',
                                                                    )) &&
                                                                act.mutate(() => cancelCampaign(c.id))
                                                            }
                                                        >
                                                            <BanIcon /> {c.status === 'scheduled' ? 'Unschedule' : 'Stop for good'}
                                                        </DropdownMenuItem>
                                                    )}
                                                    {can(P.CampaignsCreate) && (
                                                        <DropdownMenuItem onSelect={() => act.mutate(() => duplicateCampaign(c.id))}>
                                                            <CopyIcon /> Duplicate
                                                        </DropdownMenuItem>
                                                    )}
                                                    {c.status !== 'draft' && c.status !== 'scheduled' && (
                                                        <DropdownMenuItem asChild>
                                                            <a href={`/api/v1/campaigns/${c.id}/export`} download>
                                                                <DownloadIcon /> Download report
                                                            </a>
                                                        </DropdownMenuItem>
                                                    )}
                                                    {!['sending', 'scheduled', 'paused'].includes(c.status) && can(P.CampaignsCreate) && (
                                                        <DropdownMenuItem
                                                            destructive
                                                            onSelect={() =>
                                                                window.confirm(`Delete the campaign “${c.name}”? Its results are removed too.`) &&
                                                                act.mutate(() => deleteCampaign(c.id))
                                                            }
                                                        >
                                                            <Trash2Icon className="!text-destructive" /> Delete
                                                        </DropdownMenuItem>
                                                    )}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </Card>

            <CampaignDialog
                open={editing !== undefined}
                onOpenChange={(o) => !o && setEditing(undefined)}
                campaign={editing ?? null}
                canSend={can(P.CampaignsSend)}
            />
            <CampaignDetailDialog campaign={viewing} onOpenChange={(o) => !o && setViewingId(null)} />
        </div>
    );
}
