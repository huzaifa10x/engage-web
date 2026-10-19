'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLinkIcon, SparklesIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Badge, type Tone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { relative } from '@/lib/format';
import { keys } from '@/lib/queries';
import type { MarketingMessagesStatus, WabaAccount } from '@/lib/types';

const WHATSAPP_MANAGER = 'https://business.facebook.com/latest/whatsapp_manager/overview';

export const MM_STATUS: Record<MarketingMessagesStatus, { label: string; tone: Tone }> = {
    onboarded: { label: 'Enabled', tone: 'good' },
    request_sent: { label: 'Setting up…', tone: 'warn' },
    eligible: { label: 'Not enabled', tone: 'grey' },
    not_started: { label: 'Not enabled', tone: 'grey' },
    not_eligible: { label: 'Not available', tone: 'grey' },
};

/** Accounts whose campaign marketing could move to the Marketing Messages API but has not yet. */
export function needsMarketingMessages(waba: WabaAccount): boolean {
    const mm = waba.marketing_messages;

    return Boolean(mm?.enabled && waba.status === 'connected' && (mm.status === 'eligible' || mm.status === 'not_started' || mm.status === 'request_sent'));
}

/**
 * Marketing Messages API status of one WhatsApp Business Account. Read-only: only Meta switches it
 * on (when a portfolio admin accepts its terms). "Enable" asks Meta to send them the request.
 */
export function MarketingMessagesPanel({ waba, canManage }: { waba: WabaAccount; canManage: boolean }) {
    const qc = useQueryClient();
    const mm = waba.marketing_messages;

    const enroll = useMutation({
        mutationFn: () => api<{ meta?: { result?: string } }>(`whatsapp/accounts/${waba.id}/marketing-messages`, { method: 'POST' }),
        onSuccess: (r) => {
            const result = r.meta?.result;
            if (result === 'onboarded') toast.success('Marketing Messages API is enabled for this account');
            else if (result === 'request_sent') toast.success('Request sent: your business portfolio admins get an email from Meta to accept the terms');
            else if (result === 'not_eligible') toast.info('Meta does not offer the Marketing Messages API to this account');
            else toast.info('A business portfolio admin needs to accept the terms in WhatsApp Manager');
            void qc.invalidateQueries({ queryKey: keys.accounts });
            void qc.invalidateQueries({ queryKey: keys.numbers });
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    if (!mm?.enabled || waba.status !== 'connected') return null;

    const status = MM_STATUS[mm.status] ?? MM_STATUS.not_started;
    const canEnable = canManage && (mm.status === 'eligible' || mm.status === 'not_started' || (mm.status === 'request_sent' && Boolean(mm.request_error)));

    return (
        <div className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 text-[13px] leading-relaxed">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                    <SparklesIcon className="size-4 text-muted-foreground" aria-hidden />
                    Marketing Messages API
                    <Badge tone={status.tone} dot>
                        {status.label}
                    </Badge>
                </p>
                <p className="mt-1 text-muted-foreground">
                    {mm.status === 'onboarded' &&
                        'Campaign marketing messages go through Meta’s Marketing Messages API, with optimised delivery. Utility and service messages stay on the Cloud API.'}
                    {mm.status === 'request_sent' &&
                        'Meta emailed your business portfolio admins to accept the Marketing Messages terms. It switches on by itself once they accept — until then campaigns send through the Cloud API as usual.'}
                    {(mm.status === 'eligible' || mm.status === 'not_started') &&
                        'Campaign marketing sends through the Cloud API. Enable the Marketing Messages API for optimised delivery: a business portfolio admin accepts Meta’s terms once.'}
                    {mm.status === 'not_eligible' &&
                        'Meta does not offer the Marketing Messages API to this account. Campaigns keep sending through the Cloud API.'}
                </p>
                {mm.request_error && mm.status !== 'onboarded' && (
                    <p className="mt-2 rounded-md border border-warn/30 bg-warn-bg px-3 py-2 text-ink-2">
                        To finish, a business portfolio admin opens <span className="font-semibold">WhatsApp Manager › Overview › Alerts</span> and clicks{' '}
                        <span className="font-semibold">Accept terms</span> for the Marketing Messages API.{' '}
                        <a
                            href={WHATSAPP_MANAGER}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
                        >
                            Open WhatsApp Manager <ExternalLinkIcon className="size-3.5" aria-hidden />
                        </a>
                    </p>
                )}
                {mm.synced_at && <p className="mt-1 text-[12px] text-muted-foreground">Checked with Meta {relative(mm.synced_at)}</p>}
            </div>
            {canEnable && (
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => enroll.mutate()} disabled={enroll.isPending}>
                    {enroll.isPending ? 'Checking…' : mm.request_error ? 'Check again' : 'Enable'}
                </Button>
            )}
        </div>
    );
}
