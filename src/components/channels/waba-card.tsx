'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontalIcon, RefreshCwIcon, UnplugIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SyncProgress, syncSummary } from '@/components/channels/sync-progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api, errorMessage } from '@/lib/api';
import { humanize, relative } from '@/lib/format';
import { keys } from '@/lib/queries';
import type { WabaAccount } from '@/lib/types';
import { coexistenceLabel, disconnectExplanation, onboardingLabel, qualityLabel, qualityTone, statusLabel, statusTone, tierLabel } from '@/lib/whatsapp';

export function WabaCard({ waba, canManage }: { waba: WabaAccount; canManage: boolean }) {
    const qc = useQueryClient();
    const [confirm, setConfirm] = useState(false);
    const numbers = waba.phone_numbers ?? [];
    const hasCoexistence = numbers.some((n) => n.onboarding_type === 'coexistence');
    const disconnected = waba.status === 'disconnected';
    // Set when the customer's side ended the connection (not when it was disconnected here on purpose).
    const lostAccess = disconnected ? disconnectExplanation(waba.disconnect_reason) : null;

    const invalidate = () => {
        void qc.invalidateQueries({ queryKey: keys.accounts });
        void qc.invalidateQueries({ queryKey: keys.numbers });
    };

    const refresh = useMutation({
        mutationFn: () => api(`whatsapp/accounts/${waba.id}/refresh`, { method: 'POST' }),
        onSuccess: () => {
            toast.success('Refreshed from Meta');
            invalidate();
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    const disconnect = useMutation({
        mutationFn: () => api(`whatsapp/accounts/${waba.id}`, { method: 'DELETE', body: { reason: 'Disconnected from Channels' } }),
        onSuccess: () => {
            toast.success('WhatsApp account disconnected');
            invalidate();
            void qc.invalidateQueries({ queryKey: keys.me });
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    return (
        <Card className={disconnected ? 'opacity-75' : undefined}>
            <CardHeader>
                <div className="min-w-0">
                    <CardTitle className="flex flex-wrap items-center gap-2">
                        {waba.name ?? 'WhatsApp Business Account'}
                        <Badge tone={disconnected ? (lostAccess ? 'bad' : 'grey') : 'good'} dot>
                            {disconnected ? (lostAccess ? 'Disconnected · access removed' : 'Disconnected') : 'Connected'}
                        </Badge>
                        {waba.ban_state && waba.ban_state !== 'NONE' && <Badge tone="bad">{humanize(waba.ban_state)}</Badge>}
                        {!disconnected && !waba.is_subscribed_to_webhooks && <Badge tone="warn">Events not subscribed</Badge>}
                    </CardTitle>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                        {waba.business_name ? `${waba.business_name} · ` : ''}WABA <span className="font-mono">{waba.waba_id}</span>
                        {waba.account_review_status ? ` · Review ${humanize(waba.account_review_status).toLowerCase()}` : ''}
                    </p>
                    {lostAccess && (
                        <p role="alert" className="mt-2.5 rounded-lg border border-bad/30 bg-bad-bg px-3 py-2 text-[13px] leading-relaxed text-ink-2">
                            <span className="font-semibold text-bad">Messages cannot be sent or received.</span> {lostAccess} Your conversations and contacts
                            are kept. Use “Connect a WhatsApp number” above to reconnect and carry on.
                        </p>
                    )}
                </div>
                {canManage && !disconnected && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label="Account actions">
                                <MoreHorizontalIcon />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => refresh.mutate()} disabled={refresh.isPending}>
                                <RefreshCwIcon /> Refresh from Meta
                            </DropdownMenuItem>
                            <DropdownMenuItem destructive onSelect={() => setConfirm(true)}>
                                <UnplugIcon className="!text-destructive" /> Disconnect
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </CardHeader>

            {numbers.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground">No phone number yet. Add one in WhatsApp Manager, then refresh.</p>
            ) : (
                <>
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent">
                                <TableHead>Number</TableHead>
                                <TableHead>Quality</TableHead>
                                <TableHead>Messaging limit</TableHead>
                                <TableHead>Connection</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {numbers.map((n) => (
                                <TableRow key={n.id}>
                                    <TableCell>
                                        <div className="font-mono text-[13px] font-semibold">{n.display_phone_number ?? n.phone_number_id}</div>
                                        <div className="text-[12.5px] text-muted-foreground">
                                            {n.verified_name ?? 'Display name pending'}
                                            {n.name_status && n.name_status !== 'APPROVED' ? ` · name ${humanize(n.name_status).toLowerCase()}` : ''}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge tone={qualityTone(n.quality_rating)} dot>
                                            {qualityLabel(n.quality_rating)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-[13px] tabular-nums">{tierLabel(n.messaging_limit_tier)}</TableCell>
                                    <TableCell className="text-[13px]">
                                        {onboardingLabel(n.onboarding_type)}
                                        <div className="text-[12px] text-muted-foreground">
                                            {n.status === 'disconnected' && n.disconnect_reason === 'offboarded'
                                                ? 'Disconnected in the WhatsApp Business app'
                                                : n.sync && n.sync.state !== 'complete'
                                                  ? syncSummary(n.sync)
                                                  : (coexistenceLabel(n.coexistence_status) ?? `${n.max_mps} msg/s`)}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span>
                                                    <Badge tone={statusTone(n.status)}>{statusLabel(n.status)}</Badge>
                                                </span>
                                            </TooltipTrigger>
                                            <TooltipContent>Last synced {relative(n.last_synced_at)}</TooltipContent>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    {/* Import from the WhatsApp Business app: exact counts, pace and time left, per number. */}
                    {numbers
                        .filter((n) => n.sync && n.sync.state !== 'complete')
                        .map((n) => (
                            <div key={n.id} className="border-t bg-muted/40 px-5 py-4">
                                <p className="mb-2.5 text-[12.5px] font-semibold text-muted-foreground">{n.verified_name ?? n.display_phone_number}</p>
                                {n.sync && <SyncProgress sync={n.sync} />}
                            </div>
                        ))}
                </>
            )}

            <AlertDialog open={confirm} onOpenChange={setConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Disconnect {waba.name ?? 'this account'}?</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="grid gap-2">
                                <p>
                                    10X Engage will stop receiving and sending messages for its numbers, and the access token is destroyed. You can reconnect
                                    later with Connect WhatsApp.
                                </p>
                                {hasCoexistence && (
                                    <p>
                                        Numbers shared with the WhatsApp Business app keep working in the app. To fully unlink them, open the app › Settings ›
                                        Account › Business Platform › Disconnect.
                                    </p>
                                )}
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep connected</AlertDialogCancel>
                        <AlertDialogAction destructive onClick={() => disconnect.mutate()}>
                            Disconnect
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}
