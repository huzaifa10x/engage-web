'use client';

import { useState } from 'react';

import { Badge, type Tone } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { humanize } from '@/lib/format';
import { useCampaignRecipients } from '@/lib/queries';
import type { Campaign, CampaignStatus } from '@/lib/types';

export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; tone: Tone }> = {
    draft: { label: 'Draft', tone: 'grey' },
    scheduled: { label: 'Scheduled', tone: 'info' },
    sending: { label: 'Sending', tone: 'warn' },
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
    const s = campaign?.stats;

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

                {s && (
                    <>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {(
                                [
                                    ['Matched segment', s.matched],
                                    ['Eligible (consent)', s.eligible],
                                    ['Skipped', s.skipped],
                                    ['Waiting to send', s.pending + s.queued],
                                ] as [string, number][]
                            ).map(([label, value]) => (
                                <div key={label} className="rounded-md border px-3 py-2">
                                    <p className="text-[12px] text-muted-foreground">{label}</p>
                                    <p className="text-lg font-semibold tabular-nums">{value.toLocaleString()}</p>
                                </div>
                            ))}
                        </div>
                        <Funnel sent={s.sent} delivered={s.delivered} read={s.read} failed={s.failed} />
                    </>
                )}

                <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-ink-2">Recipients</p>
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
