'use client';

import { useQueryClient } from '@tanstack/react-query';
import { TrophyIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { GOAL_LABELS, KIND_LABELS } from '@/components/campaigns/ab-test-settings';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api';
import { keys, sendCampaignRest } from '@/lib/queries';
import type { AbResults, Campaign } from '@/lib/types';

const pct = (rate: number | null) => (rate === null ? '—' : `${(rate * 100).toFixed(1)}%`);

const ROWS: [keyof AbResults['variants'][number], string][] = [
    ['sent', 'Sent'],
    ['delivered', 'Delivered'],
    ['read', 'Read'],
    ['replied', 'Replied'],
    ['clicked', 'Clicked a button'],
    ['leads', 'Leads'],
    ['purchases', 'Purchases'],
];

/** A/B test results on a campaign: each variant's numbers, the difference and the verdict; sending the rest of the list. */
export function AbResultsPanel({ campaign, canSend }: { campaign: Campaign; canSend: boolean }) {
    const qc = useQueryClient();
    const [busy, setBusy] = useState<'A' | 'B' | null>(null);
    const [chooseAnyway, setChooseAnyway] = useState(false);
    const ab = campaign.stats.ab;
    const settings = campaign.ab_test;
    if (!ab || !settings) return null;
    const [a, b] = ab.variants;
    const held = campaign.stats.held ?? 0;
    const restOpen = settings.test_percent === 20 && !settings.rest && held > 0;

    const send = async (variant: 'A' | 'B') => {
        setBusy(variant);
        try {
            await sendCampaignRest(campaign.id, variant);
            toast.success(`Variant ${variant} is being sent to the rest of the list`);
            void qc.invalidateQueries({ queryKey: keys.campaigns });
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="grid gap-2 rounded-md border p-3 text-[13px]" role="region" aria-label="A/B test results">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">A/B test · {KIND_LABELS[settings.kind]}</p>
                <p className="text-[12px] text-muted-foreground">
                    Goal: {GOAL_LABELS[ab.goal]} · minimum {ab.min_sample.toLocaleString()} sent per variant
                    {settings.kind === 'send_time' && settings.b_delay_hours ? ` · B sent ${settings.b_delay_hours} h after A` : ''}
                </p>
            </div>
            <p className="text-[12px] text-muted-foreground">
                A: {campaign.template.name}
                {settings.b ? ` · B: ${settings.b.template_name}` : ' · B: same template, later'}
            </p>
            <table className="w-full text-[12.5px] tabular-nums">
                <thead className="text-muted-foreground">
                    <tr>
                        <th className="text-left font-normal" />
                        <th className="text-right font-normal">A</th>
                        <th className="text-right font-normal">B</th>
                    </tr>
                </thead>
                <tbody>
                    {ROWS.map(([key, label]) => (
                        <tr key={key} className={ab.metric === key ? 'font-semibold' : ''}>
                            <td>{label}</td>
                            <td className="text-right">{Number(a[key]).toLocaleString()}</td>
                            <td className="text-right">{Number(b[key]).toLocaleString()}</td>
                        </tr>
                    ))}
                    <tr className="border-t font-semibold">
                        <td>{GOAL_LABELS[ab.goal]}</td>
                        <td className="text-right">{pct(a.rate)}</td>
                        <td className="text-right">{pct(b.rate)}</td>
                    </tr>
                </tbody>
            </table>
            {ab.difference !== null && (
                <p className="text-[12.5px] text-muted-foreground">
                    Difference: B is {ab.difference >= 0 ? `${ab.difference} points higher` : `${Math.abs(ab.difference)} points lower`} than A.
                </p>
            )}
            {ab.state === 'winner' ? (
                <p className="flex items-center gap-1.5 rounded-md bg-good-bg px-3 py-2 font-semibold text-good" role="status">
                    <TrophyIcon className="size-4" /> {ab.message}
                </p>
            ) : (
                <p className="rounded-md bg-muted px-3 py-2" role="status">
                    <span className="font-semibold">Not enough data yet.</span> {ab.message.replace(/^Not enough data yet:?\s*/, '')}
                </p>
            )}

            {settings.rest?.variant && (
                <p className="text-[12.5px]">
                    Variant {settings.rest.variant} was sent to the rest of the list
                    {settings.rest.auto ? ' automatically' : ''} ({(settings.rest.recipients ?? 0).toLocaleString()} contacts).
                </p>
            )}
            {settings.rest?.stopped && <p className="text-[12.5px] text-muted-foreground">The rest of the list was not sent.</p>}
            {restOpen && (
                <div className="grid gap-2">
                    <p className="text-[12.5px]">
                        {held.toLocaleString()} contacts are waiting for the winner
                        {settings.auto_send_winner ? '. The winner goes to them automatically once it is clear.' : '.'}
                    </p>
                    {canSend && campaign.status === 'completed' && (
                        <div className="flex flex-wrap gap-2">
                            {ab.winner && (
                                <Button size="sm" onClick={() => send(ab.winner as 'A' | 'B')} disabled={busy !== null}>
                                    {busy ? 'Sending…' : `Send ${ab.winner} (winner) to the other ${held.toLocaleString()}`}
                                </Button>
                            )}
                            {!ab.winner && !chooseAnyway && (
                                <Button size="sm" variant="outline" onClick={() => setChooseAnyway(true)}>
                                    Choose a variant anyway
                                </Button>
                            )}
                            {!ab.winner &&
                                chooseAnyway &&
                                (['A', 'B'] as const).map((v) => (
                                    <Button key={v} size="sm" variant="outline" onClick={() => send(v)} disabled={busy !== null}>
                                        {busy === v ? 'Sending…' : `Send ${v} to the other ${held.toLocaleString()}`}
                                    </Button>
                                ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
