'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontalIcon, RefreshCwIcon, UnplugIcon, WebhookIcon } from 'lucide-react';
import Link from 'next/link';
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
import { ConnectWhatsappDialog } from '@/components/channels/connect-whatsapp-dialog';
import { MarketingMessagesPanel } from '@/components/channels/marketing-messages';
import { LinksPanel } from '@/components/channels/links-panel';
import { ProfileChecklist } from '@/components/channels/profile-checklist';
import { QualityPanel } from '@/components/channels/quality-panel';
import { SyncProgress, syncSummary } from '@/components/channels/sync-progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api, errorMessage } from '@/lib/api';
import { humanize, relative } from '@/lib/format';
import { keys } from '@/lib/queries';
import type { WabaAccount } from '@/lib/types';
import {
    coexistenceLabel,
    disconnectExplanation,
    nameStatusLabel,
    onboardingLabel,
    phoneDisplay,
    qualityLabel,
    qualityTone,
    statusLabel,
    statusTone,
    tierLabel,
} from '@/lib/whatsapp';

export function WabaCard({ waba, canManage }: { waba: WabaAccount; canManage: boolean }) {
    const qc = useQueryClient();
    const [confirm, setConfirm] = useState(false);
    const [reconnecting, setReconnecting] = useState(false);
    const [qualityOpen, setQualityOpen] = useState<string | null>(null);
    const [profileOpen, setProfileOpen] = useState<string | null>(null);
    const [linksOpen, setLinksOpen] = useState<string | null>(null);
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

    const reconnectWebhooks = useMutation({
        mutationFn: () => api(`whatsapp/accounts/${waba.id}/webhooks`, { method: 'POST' }),
        onSuccess: () => {
            toast.success('Webhooks reconnected. Messages and updates from Meta reach 10X Engage again.');
            invalidate();
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    const register = useMutation({
        mutationFn: (numberId: string) => api(`whatsapp/accounts/${waba.id}/numbers/${numberId}/register`, { method: 'POST' }),
        onSuccess: () => {
            toast.success('Number registered with Meta');
            invalidate();
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    // Never one click (audit APP-013): the last 4 digits of the number are typed to confirm.
    const [typed, setTyped] = useState('');
    const last4 = (numbers[0]?.display_phone_number ?? '').replace(/\D/g, '').slice(-4);
    const answers = numbers.map((n) => (n.display_phone_number ?? '').replace(/\D/g, '').slice(-4)).filter(Boolean);
    const confirmed = answers.length ? answers.includes(typed.trim()) : typed.trim().toLowerCase() === 'disconnect';
    const disconnect = useMutation({
        mutationFn: () => api(`whatsapp/accounts/${waba.id}`, { method: 'DELETE', body: { reason: 'Disconnected from Channels', confirm: typed.trim() } }),
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
                        {waba.business_name ? `${waba.business_name} · ` : ''}
                        {waba.meta_business_id && (
                            <>
                                Business ID <span className="font-mono">{waba.meta_business_id}</span> ·{' '}
                            </>
                        )}
                        WABA <span className="font-mono">{waba.waba_id}</span>
                        {waba.account_review_status ? ` · Review ${humanize(waba.account_review_status).toLowerCase()}` : ''}
                    </p>
                    {!disconnected && !waba.is_subscribed_to_webhooks && (
                        <div
                            role="alert"
                            className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warn/30 bg-warn-bg px-3 py-2 text-[13px] leading-relaxed text-ink-2"
                        >
                            <span>
                                <span className="font-semibold text-warn">Meta isn’t sending this account’s messages to 10X Engage.</span> New messages,
                                delivery updates and quality alerts won’t arrive until the webhooks are reconnected.
                            </span>
                            {canManage && (
                                <Button size="sm" variant="outline" onClick={() => reconnectWebhooks.mutate()} disabled={reconnectWebhooks.isPending}>
                                    <RefreshCwIcon /> {reconnectWebhooks.isPending ? 'Reconnecting…' : 'Reconnect webhooks'}
                                </Button>
                            )}
                        </div>
                    )}
                    {!disconnected && waba.needs_reconnect && (
                        <p role="alert" className="mt-2.5 rounded-lg border border-warn/30 bg-warn-bg px-3 py-2 text-[13px] leading-relaxed text-ink-2">
                            <span className="font-semibold text-warn">Meta hasn’t given 10X Engage permission to manage this account.</span> Reconnect it: sign
                            in with the Facebook account that manages this business, choose the same business and WhatsApp account, and allow every permission
                            it asks for. Your conversations, contacts and templates are kept.{' '}
                            {canManage && (
                                <Link href="/channels?connect=1" className="font-semibold text-warn underline underline-offset-2">
                                    Reconnect
                                </Link>
                            )}
                        </p>
                    )}
                    {lostAccess && (
                        <p role="alert" className="mt-2.5 rounded-lg border border-bad/30 bg-bad-bg px-3 py-2 text-[13px] leading-relaxed text-ink-2">
                            <span className="font-semibold text-bad">Messages cannot be sent or received.</span> {lostAccess} Your conversations and contacts
                            are kept.{' '}
                            {canManage && (
                                <Link href="/channels?connect=1" className="font-semibold text-bad underline underline-offset-2">
                                    Reconnect now
                                </Link>
                            )}
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
                            <DropdownMenuItem onSelect={() => reconnectWebhooks.mutate()} disabled={reconnectWebhooks.isPending}>
                                <WebhookIcon /> Reconnect webhooks
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                destructive
                                onSelect={() => {
                                    setTyped('');
                                    setConfirm(true);
                                }}
                            >
                                <UnplugIcon className="!text-destructive" /> Disconnect
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </CardHeader>

            {!disconnected && waba.conversions && (
                <ConversionReportingRow
                    status={waba.conversions.status}
                    canReconnect={canManage && waba.conversions.can_reconnect}
                    onReconnect={() => setReconnecting(true)}
                />
            )}
            {waba.conversions && (
                <ConnectWhatsappDialog open={reconnecting} onOpenChange={setReconnecting} conversions={{ coexistence: waba.conversions.coexistence }} />
            )}

            <MarketingMessagesPanel waba={waba} canManage={canManage} />

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
                                        <div className="font-mono text-[13px] font-semibold">{phoneDisplay(n.display_phone_number) || n.phone_number_id}</div>
                                        <div className="text-[12.5px] text-muted-foreground">
                                            {n.verified_name ?? 'Display name pending'}
                                            {nameStatusLabel(n.name_status) ? ` · ${nameStatusLabel(n.name_status)}` : ''}
                                        </div>
                                        {n.status === 'connected' && (
                                            <button
                                                type="button"
                                                className="mt-1 block text-[12px] text-info underline-offset-2 hover:underline"
                                                aria-expanded={profileOpen === n.id}
                                                onClick={() => setProfileOpen(profileOpen === n.id ? null : n.id)}
                                            >
                                                {profileOpen === n.id ? 'Hide profile checklist' : 'Profile checklist'}
                                            </button>
                                        )}
                                        {n.status === 'connected' && (
                                            <button
                                                type="button"
                                                className="mt-1 block text-[12px] text-info underline-offset-2 hover:underline"
                                                aria-expanded={linksOpen === n.id}
                                                onClick={() => setLinksOpen(linksOpen === n.id ? null : n.id)}
                                            >
                                                {linksOpen === n.id ? 'Hide links and QR codes' : 'Links and QR codes'}
                                            </button>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge tone={qualityTone(n.quality_rating)} dot>
                                            {qualityLabel(n.quality_rating)}
                                        </Badge>
                                        {n.status === 'connected' && (
                                            <button
                                                type="button"
                                                className="mt-1 block text-[12px] text-info underline-offset-2 hover:underline"
                                                aria-expanded={qualityOpen === n.id}
                                                onClick={() => setQualityOpen(qualityOpen === n.id ? null : n.id)}
                                            >
                                                {qualityOpen === n.id ? 'Hide quality and limits' : 'Quality and limits'}
                                            </button>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-[13px] tabular-nums">
                                        {tierLabel(n.messaging_limit_tier)}
                                        {n.daily_limit && n.daily_limit.limit !== null && (
                                            <div
                                                className={`text-[12px] ${n.daily_limit.remaining === 0 ? 'font-medium text-warn' : 'text-muted-foreground'}`}
                                                title="New conversations started in the last 24 hours, shared by all numbers of this business. People who wrote to you in the last 24 hours don't count."
                                            >
                                                {n.daily_limit.used.toLocaleString()} used · {(n.daily_limit.remaining ?? 0).toLocaleString()} left
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-[13px]">
                                        {onboardingLabel(n.onboarding_type)}
                                        <div className="text-[12px] text-muted-foreground">
                                            {n.status === 'disconnected' && n.disconnect_reason === 'offboarded'
                                                ? 'Disconnected in the WhatsApp Business app'
                                                : n.sync && n.sync.state !== 'complete'
                                                  ? syncSummary(n.sync)
                                                  : (coexistenceLabel(n.coexistence_status) ?? 'Cloud API')}
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
                    {numbers
                        .filter((n) => n.id === qualityOpen)
                        .map((n) => (
                            <div key={`quality-${n.id}`} className="border-t px-5 py-4">
                                <p className="mb-3 text-[12.5px] font-semibold text-muted-foreground">
                                    Quality and limits · {phoneDisplay(n.display_phone_number) || n.phone_number_id}
                                </p>
                                <QualityPanel numberId={n.id} />
                            </div>
                        ))}
                    {numbers
                        .filter((n) => n.id === profileOpen)
                        .map((n) => (
                            <div key={`profile-${n.id}`} className="border-t px-5 py-4">
                                <p className="mb-3 text-[12.5px] font-semibold text-muted-foreground">
                                    Business profile checklist · {phoneDisplay(n.display_phone_number) || n.phone_number_id}
                                </p>
                                <ProfileChecklist numberId={n.id} />
                            </div>
                        ))}
                    {numbers
                        .filter((n) => n.id === linksOpen)
                        .map((n) => (
                            <div key={`links-${n.id}`} className="border-t px-5 py-4">
                                <p className="mb-3 text-[12.5px] font-semibold text-muted-foreground">
                                    Links and QR codes · {phoneDisplay(n.display_phone_number) || n.phone_number_id}
                                </p>
                                <LinksPanel numberId={n.id} canManage={canManage} />
                            </div>
                        ))}
                    {/* Meta's 14-day rule: a new number must be registered on the Cloud API after Embedded Signup. */}
                    {numbers
                        .filter((n) => n.registration)
                        .map((n) => (
                            <div
                                key={`reg-${n.id}`}
                                role="alert"
                                className={`flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3 text-[13px] ${n.registration!.overdue ? 'bg-bad-bg' : 'bg-warn-bg'}`}
                            >
                                <span>
                                    <span className={`font-semibold ${n.registration!.overdue ? 'text-bad' : 'text-warn'}`}>
                                        {phoneDisplay(n.display_phone_number) || n.phone_number_id} isn’t registered with Meta yet.
                                    </span>{' '}
                                    {n.registration!.overdue
                                        ? 'Meta’s 14 days after connecting have passed. Register it now; if Meta refuses, connect the number again.'
                                        : `Meta requires it within 14 days of connecting: ${n.registration!.days_left} ${n.registration!.days_left === 1 ? 'day' : 'days'} left. Until then it can’t send or receive messages.`}
                                </span>
                                {canManage && (
                                    <Button size="sm" variant="outline" onClick={() => register.mutate(n.id)} disabled={register.isPending}>
                                        {register.isPending ? 'Registering…' : 'Register now'}
                                    </Button>
                                )}
                            </div>
                        ))}
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
                                    Messages to{' '}
                                    <b className="font-semibold text-foreground">
                                        {numbers.length ? numbers.map((n) => phoneDisplay(n.display_phone_number)).join(', ') : 'this account'}
                                    </b>{' '}
                                    stop reaching engageX: no new chats, replies or campaigns from {numbers.length === 1 ? 'it' : 'them'}. The access token is
                                    destroyed. You can reconnect later with Connect WhatsApp.
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
                    <label className="grid gap-1.5 text-[13px] font-semibold">
                        {answers.length
                            ? `Type the last 4 digits of the number (${phoneDisplay(numbers[0]?.display_phone_number ?? '')}) to confirm`
                            : 'Type “disconnect” to confirm'}
                        <Input
                            value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                            inputMode={answers.length ? 'numeric' : 'text'}
                            autoComplete="off"
                            placeholder={answers.length ? last4.replace(/\d/g, '•') : 'disconnect'}
                            aria-label="Confirm disconnect"
                        />
                    </label>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep connected</AlertDialogCancel>
                        <AlertDialogAction destructive disabled={!confirmed || disconnect.isPending} onClick={() => disconnect.mutate()}>
                            Disconnect
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}

/** Conversions to Meta (flagged workspaces only): whether this account's token allows reporting conversions. */
function ConversionReportingRow({
    status,
    canReconnect,
    onReconnect,
}: {
    status: 'enabled' | 'not_enabled' | 'unknown';
    canReconnect: boolean;
    onReconnect: () => void;
}) {
    const enabled = status === 'enabled';

    return (
        <div data-testid="conversion-reporting" className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3 text-[13px] text-ink-2">
            <span className="flex items-center gap-2">
                Conversion reporting:
                <Badge tone={enabled ? 'good' : 'grey'} dot>
                    {enabled ? 'Enabled' : 'Not enabled'}
                </Badge>
                {!enabled && <span className="text-muted-foreground">Meta hasn’t allowed 10X Engage to report conversions for this account.</span>}
            </span>
            {!enabled && canReconnect && (
                <Button size="sm" variant="outline" onClick={onReconnect}>
                    <RefreshCwIcon /> Reconnect to enable
                </Button>
            )}
        </div>
    );
}
