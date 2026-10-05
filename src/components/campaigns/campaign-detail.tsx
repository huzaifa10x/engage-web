'use client';

import { useState } from 'react';

import { Badge, type Tone } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { humanize } from '@/lib/format';
import { useCampaign, useCampaignRecipients } from '@/lib/queries';
import type { Campaign, CampaignStatus } from '@/lib/types';

export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; tone: Tone }> = {
    draft: { label: 'Draft', tone: 'grey' },
    scheduled: { label: 'Scheduled', tone: 'info' },
    sending: { label: 'Sending', tone: 'warn' },
    paused: { label: 'Paused', tone: 'bad' },
    completed: { label: 'Completed', tone: 'good' },
    cancelled: { label: 'Stopped', tone: 'grey' },
    failed: { label: 'Failed', tone: 'bad' },
};

const RECIPIENT_TONE: Record<string, Tone> = {
    read: 'good',
    delivered: 'good',
    sent: 'info',
    accepted: 'info',
    queued: 'grey',
    pending: 'grey',
    skipped: 'warn',
    failed: 'bad',
};

const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—');

/** Sent → delivered → read as bars, relative to what was sent. */
export function Funnel({ sent, delivered, read, failed }: { sent: number; delivered: number; read: number; failed: number }) {
    const base = Math.max(sent + failed, 1);
    const rows: [string, number, string][] = [
        ['Sent', sent, 'bg-info'],
        ['Delivered', delivered, 'bg-good'],
        ['Read', read, 'bg-whatsapp'],
        ['Failed', failed, 'bg-bad'],
    ];

    return (
        <div className="grid gap-2">
            {rows.map(([label, value, color]) => (
                <div key={label} className="grid grid-cols-[5.5rem_1fr_6.5rem] items-center gap-3 text-[13px]">
                    <span className="text-muted-foreground">{label}</span>
                    <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${label}: ${value}`}>
                        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, (value / base) * 100)}%` }} />
                    </div>
                    <span className="text-right tabular-nums">
                        <span className="font-semibold">{value.toLocaleString()}</span>{' '}
                        <span className="text-muted-foreground">{label === 'Sent' ? '' : percent(value, label === 'Failed' ? base : sent)}</span>
                    </span>
                </div>
            ))}
        </div>
    );
}

export function CampaignDetailDialog({ campaign, onOpenChange }: { campaign: Campaign | null; onOpenChange: (o: boolean) => void }) {
    const [status, setStatus] = useState('all');
    const recipients = useCampaignRecipients(campaign?.id ?? null, status === 'all' ? undefined : status);
    const detail = useCampaign(campaign?.id ?? null); // adds the failure reasons to what the list already has
    const s = campaign?.stats;
    const reasons = detail.data?.failure_reasons ?? [];

    return (
        <Dialog open={campaign !== null} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex flex-wrap items-center gap-2">
                        {campaign?.name}
                        {campaign && (
                            <Badge tone={CAMPAIGN_STATUS[campaign.status].tone} dot>
                                {CAMPAIGN_STATUS[campaign.status].label}
                            </Badge>
                        )}
                    </DialogTitle>
                    <DialogDescription>
                        {campaign
                            ? `${campaign.template.name} · ${campaign.audience_name ?? 'All contacts'} · from ${campaign.phone_number?.display ?? 'removed number'}`
                            : ''}
                    </DialogDescription>
                </DialogHeader>

                {campaign?.failure_reason && (
                    <p className="rounded-md border border-bad/20 bg-bad-bg px-3 py-2 text-[13px] text-bad">{campaign.failure_reason}</p>
                )}
                {campaign?.status === 'paused' && (
                    <p className="rounded-md border border-bad/20 bg-bad-bg px-3 py-2 text-[13px] text-bad">
                        {campaign.pause_reason ?? 'Paused'}. Resume it from the campaign list.
                    </p>
                )}
                {campaign?.status === 'sending' && campaign.next_batch_at && (
                    <p className="rounded-md border px-3 py-2 text-[13px] text-muted-foreground">
                        Waiting: sending continues at {new Date(campaign.next_batch_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}{' '}
                        (quiet hours or drip sending).
                    </p>
                )}
                {campaign?.notes && <p className="rounded-md bg-muted px-3 py-2 text-[13px] whitespace-pre-wrap text-ink-2">{campaign.notes}</p>}

                {s && (
                    <>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {(
                                [
                                    ['Matched audience', s.matched],
                                    ['Eligible (consent)', s.eligible],
                                    ['Waiting to send', s.pending + s.queued],
                                    ['Replied', s.replied],
                                ] as [string, number][]
                            ).map(([label, value]) => (
                                <div key={label} className="rounded-md border px-3 py-2">
                                    <p className="text-[12px] text-muted-foreground">{label}</p>
                                    <p className="text-lg font-semibold tabular-nums">{value.toLocaleString()}</p>
                                </div>
                            ))}
                        </div>
                        <Funnel sent={s.sent} delivered={s.delivered} read={s.read} failed={s.failed} />
                        {reasons.length > 0 && (
                            <div className="rounded-md border p-3 text-[13px]">
                                <p className="font-semibold">Why some contacts did not get it</p>
                                <ul className="mt-1.5 grid gap-1">
                                    {reasons.slice(0, 8).map((r) => (
                                        <li key={`${r.stage}-${r.reason}-${r.code ?? ''}`} className="flex justify-between gap-3">
                                            <span className="text-muted-foreground">
                                                {r.reason}
                                                {r.code ? ` (${r.code})` : ''} ·{' '}
                                                {r.stage === 'skipped'
                                                    ? 'skipped before sending'
                                                    : r.stage === 'failed'
                                                      ? 'rejected by WhatsApp'
                                                      : 'could not be sent'}
                                            </span>
                                            <span className="font-medium tabular-nums">{r.count.toLocaleString()}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </>
                )}

                <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-ink-2">
                        Recipients{' '}
                        {campaign && campaign.status !== 'draft' && campaign.status !== 'scheduled' && (
                            <a
                                href={`/api/v1/campaigns/${campaign.id}/export`}
                                download
                                className="ml-2 font-normal text-info underline-offset-2 hover:underline"
                            >
                                Download report (CSV)
                            </a>
                        )}
                    </p>
                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className="h-8 w-40" aria-label="Recipient status">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Everyone</SelectItem>
                            <SelectItem value="queued">Sent to WhatsApp</SelectItem>
                            <SelectItem value="skipped">Skipped</SelectItem>
                            <SelectItem value="failed">Failed</SelectItem>
                            <SelectItem value="pending">Waiting</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="max-h-72 overflow-y-auto rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent">
                                <TableHead>Contact</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Reason</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(recipients.data ?? []).map((r) => (
                                <TableRow key={r.id}>
                                    <TableCell>
                                        <span className="font-medium">{r.contact?.display_name ?? 'Deleted contact'}</span>{' '}
                                        <span className="font-mono text-[12px] text-muted-foreground">{r.contact?.phone}</span>
                                    </TableCell>
                                    <TableCell>
                                        <Badge tone={RECIPIENT_TONE[r.status] ?? 'grey'}>{humanize(r.status === 'accepted' ? 'sent' : r.status)}</Badge>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{r.reason ?? ''}</TableCell>
                                </TableRow>
                            ))}
                            {(recipients.data ?? []).length === 0 && (
                                <TableRow className="hover:bg-transparent">
                                    <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                                        {recipients.isLoading
                                            ? 'Loading…'
                                            : campaign?.status === 'draft' || campaign?.status === 'scheduled'
                                              ? 'Recipients are listed once the campaign starts.'
                                              : 'Nobody here.'}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                {(recipients.data ?? []).length === 100 && (
                    <p className="text-[12.5px] text-muted-foreground">Showing the first 100. Use the filter to narrow the list.</p>
                )}
            </DialogContent>
        </Dialog>
    );
}
