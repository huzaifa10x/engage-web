'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CopyIcon, GlobeIcon, MegaphoneIcon } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

import { EmptyState, Forbidden, PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { StageBadge } from '@/components/contacts/stage-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { relative } from '@/lib/format';
import { P } from '@/lib/permissions';
import { keys, useMetaAds } from '@/lib/queries';
import type { MetaAd } from '@/lib/types';

const BOTH = '__both__';
const UTM = 'utm_source={{site_source_name}}&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}';

function PlatformSelect({ ad, editable }: { ad: MetaAd; editable: boolean }) {
    const qc = useQueryClient();
    const save = useMutation({
        mutationFn: (platform: string | null) => api<{ data: { leads_updated: number } }>(`growth/meta-ads/${ad.id}`, { method: 'PUT', body: { platform } }),
        onSuccess: (r) => {
            toast.success(`Saved · ${r.data.leads_updated} lead${r.data.leads_updated === 1 ? '' : 's'} updated`);
            void qc.invalidateQueries({ queryKey: ['growth', 'meta-ads'] });
            void qc.invalidateQueries({ queryKey: keys.leadsAll });
            void qc.invalidateQueries({ queryKey: keys.contactsAll });
            void qc.invalidateQueries({ queryKey: keys.conversationsAll });
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    if (!editable) {
        return <span className="text-[13px]">{ad.platform === 'instagram' ? 'Instagram only' : ad.platform === 'facebook' ? 'Facebook only' : 'Not set'}</span>;
    }

    return (
        <Select value={ad.platform ?? BOTH} onValueChange={(v) => save.mutate(v === BOTH ? null : v)} disabled={save.isPending}>
            <SelectTrigger size="sm" className="w-44" aria-label={`Where ${ad.headline ?? 'this ad'} runs`}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={BOTH}>Both / not sure</SelectItem>
                <SelectItem value="instagram">Instagram only</SelectItem>
                <SelectItem value="facebook">Facebook only</SelectItem>
            </SelectContent>
        </Select>
    );
}

/**
 * Growth Hub › Tracking Setup (Developer Handover §I.4). R1 part available now: the Click-to-WhatsApp
 * ads leads came from, and the one-platform tag that proves "Meta ad · Instagram / Facebook" (Meta's
 * referral has no platform field). Website tracking (sites, wizard, health) comes with the tracker.
 */
export default function TrackingSetupPage() {
    const { can, me } = useSession();
    const full = me.growth?.tier === 'full';
    const allowed = can(P.GrowthView) && full;
    const editable = can(P.GrowthManage);
    const ads = useMetaAds(allowed);

    if (!can(P.GrowthView)) return <Forbidden />;
    if (!full) {
        return (
            <EmptyState
                icon={<GlobeIcon className="size-5" />}
                title="Growth Hub isn’t available on this workspace"
                description="Growth Hub shows where every WhatsApp lead came from. It is included in the Growth, Pro and Enterprise plans."
            />
        );
    }

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(UTM);
            toast.success('Copied');
        } catch {
            toast.error('Copy failed. Select the text and copy it.');
        }
    };

    return (
        <>
            <PageHeader title="Tracking Setup" description="See which Meta ads start your WhatsApp chats, and tell us where each ad runs." />

            <Card className="mb-4 gap-0 overflow-hidden p-0">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
                    <div>
                        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                            <MegaphoneIcon className="size-4" /> Click-to-WhatsApp ads
                        </h2>
                        <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
                            When someone taps the WhatsApp button on your Facebook or Instagram ad and sends a message, Meta attaches the ad to that message.
                            Nothing to install. Every ad that started a chat is listed here.
                        </p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                        <Link href="/growth/leads">View leads</Link>
                    </Button>
                </div>
                {ads.isLoading ? (
                    <div className="p-5">
                        <Skeleton className="h-32" />
                    </div>
                ) : (ads.data ?? []).length === 0 ? (
                    <EmptyState
                        icon={<MegaphoneIcon className="size-5" />}
                        title="No ad chats yet"
                        description="Ads appear here after the first customer taps the WhatsApp button on one and sends a message."
                    />
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-48">Ad</TableHead>
                                <TableHead>Meta ad ID</TableHead>
                                <TableHead className="text-right">New leads</TableHead>
                                <TableHead className="text-right">Chats started</TableHead>
                                <TableHead>Within 30 days</TableHead>
                                <TableHead>Number</TableHead>
                                <TableHead>Last chat</TableHead>
                                <TableHead>Runs on</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(ads.data ?? []).map((ad) => (
                                <TableRow key={ad.id}>
                                    <TableCell>
                                        <p className="font-semibold">
                                            {ad.headline ?? <span className="text-muted-foreground">No headline sent by Meta</span>}
                                        </p>
                                        <p className="text-[12px] text-muted-foreground">{ad.source_type === 'post' ? 'Boosted post' : 'Ad'}</p>
                                    </TableCell>
                                    <TableCell className="font-mono text-[12px]">{ad.ad_id}</TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        <Link href={`/growth/leads?ad=${ad.id}`} className="underline-offset-2 hover:underline">
                                            {ad.leads}
                                        </Link>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">{ad.messages}</TableCell>
                                    <TableCell>
                                        {ad.outcomes.length === 0 ? (
                                            <span className="text-[12.5px] text-muted-foreground">No stage changes yet</span>
                                        ) : (
                                            <div className="flex max-w-56 flex-wrap gap-1">
                                                {ad.outcomes.map((o) => (
                                                    <span key={o.stage.id} className="inline-flex items-center gap-1 text-[12px] tabular-nums">
                                                        <StageBadge stage={o.stage} /> {o.leads}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-[12.5px]">
                                        {ad.numbers.map((n) => (
                                            <p key={n.id} className="font-mono whitespace-nowrap" title={n.verified_name ?? undefined}>
                                                {n.display_phone_number}
                                                {ad.numbers.length > 1 && <span className="text-muted-foreground"> · {n.chats}</span>}
                                            </p>
                                        ))}
                                    </TableCell>
                                    <TableCell className="text-[12.5px] text-muted-foreground">{relative(ad.last_seen_at)}</TableCell>
                                    <TableCell>
                                        <PlatformSelect ad={ad} editable={editable} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
                <p className="m-3 rounded-md bg-muted px-3 py-2 text-[12.5px] leading-snug">
                    Meta doesn’t say whether a chat came from Facebook or Instagram, and an ad on both keeps one ad ID. Set <b>Instagram only</b> or{' '}
                    <b>Facebook only</b> for an ad whose placements are on one platform: its leads then show “Meta ad · Instagram” or “Meta ad · Facebook”.
                    Otherwise they show “Meta ad”. New leads counts people whose first message came from the ad; chats started also counts returning customers.
                    “Within 30 days” is the furthest CRM stage those new leads reached within 30 days of their first message.
                </p>
            </Card>

            <Card className="mb-4 gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[15px] font-semibold">How to tag your Meta ads</h2>
                    <Badge tone="info">Shows Instagram vs Facebook</Badge>
                </div>
                <ul className="grid max-w-3xl list-disc gap-1.5 pl-5 text-[13px] text-muted-foreground">
                    <li>
                        <b className="text-foreground">For an exact split, run separate ad sets for Facebook and Instagram.</b> Each ad then has its own ad ID;
                        set it to Instagram only or Facebook only above.
                    </li>
                    <li>
                        For Meta ads that send people to your <b className="text-foreground">website</b>, paste this into <b>URL parameters</b>. Meta fills in
                        the platform (ig, fb) for each click:
                    </li>
                </ul>
                <div className="flex max-w-3xl items-start gap-2">
                    <code className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-[12px] break-all">{UTM}</code>
                    <Button variant="outline" size="sm" onClick={copy} aria-label="Copy URL parameters">
                        <CopyIcon />
                    </Button>
                </div>
                <p className="max-w-3xl text-[12.5px] text-muted-foreground">
                    Your inbox only sees people who sent a message, not everyone who tapped. Taps, impressions and ad spend come later, with access to your ad
                    account.
                </p>
            </Card>

            <Card className="gap-1 p-4">
                <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                    <GlobeIcon className="size-4" /> Websites <Badge tone="grey">Coming next</Badge>
                </h2>
                <p className="max-w-2xl text-[13px] text-muted-foreground">
                    Connect your website so WhatsApp taps there are matched to the chats they start, with campaign and landing page.
                </p>
            </Card>
        </>
    );
}
