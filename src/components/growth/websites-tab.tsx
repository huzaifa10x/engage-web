'use client';

import { CopyIcon, GlobeIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { useState } from 'react';

import { EmptyState } from '@/components/app/page-header';
import { copyText, WebsiteWizard } from '@/components/growth/website-wizard';
import { Badge, type Tone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { relative } from '@/lib/format';
import { useSites } from '@/lib/queries';
import type { GrowthSite, SiteHealth } from '@/lib/types';

const GOOGLE_SUFFIX = 'utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}&utm_term={keyword}';

const STATUS: Record<SiteHealth['tracking_status'], [string, Tone]> = {
    active: ['Tracking', 'good'],
    awaiting_verification: ['Check pending', 'warn'],
    not_installed: ['Not installed', 'grey'],
    not_seen: ['Tracker not seen for 48 h', 'bad'],
    paused: ['Paused', 'grey'],
};

const ERRORS: Record<string, string> = {
    origin_not_allowed: 'A tap came from another domain. Install on the configured domain, or edit the allowed domain.',
    unknown_mapping: 'A button opens a WhatsApp number that isn’t on this website. Add the number in step 2.',
    invalid_payload: 'The tracker sent something we couldn’t read. Update the snippet.',
    event_id_conflict: 'A repeated tap with different details was refused.',
    reference_collision: 'Two taps had the same reference (very rare); the second was refused.',
};

/** The plain-language problem list (Technical Specification v1.2 §5). */
const PROBLEMS: [string, string][] = [
    ['Tracker not seen', 'Check the snippet is on every page, or publish the Google Tag Manager container.'],
    ['Wrong domain', 'Install on the configured domain, or edit the website address.'],
    ['Button not tracked', 'The button must open wa.me, api.whatsapp.com or whatsapp://; chat widgets need XG.link(url).'],
    ['Code shown, tap not received', 'An ad blocker, network or Content Security Policy blocked it. WhatsApp still works.'],
    ['No message', 'The visitor must press Send in WhatsApp.'],
    ['Code present, not matched', 'Check the website’s health and that the button’s number is on the website.'],
    ['Multi-page memory off', 'Only campaign details on the page where WhatsApp is tapped are used.'],
    ['Number not connected', 'Connect it in Channels.'],
];

function Fact({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-[11.5px] text-muted-foreground">{label}</p>
            <p className="text-[13px] font-medium tabular-nums">{value}</p>
        </div>
    );
}

function SiteCard({ site, editable, onOpen }: { site: GrowthSite; editable: boolean; onOpen: () => void }) {
    const h = site.health;
    const [label, tone] = STATUS[h.tracking_status];

    return (
        <Card className="gap-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <p className="flex items-center gap-2 text-[15px] font-semibold">
                        <GlobeIcon className="size-4" /> {site.display_name ?? site.domain}
                    </p>
                    <p className="text-[12.5px] text-muted-foreground">
                        {site.domain} · {site.numbers.map((n) => n.display_phone_number).join(', ')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge tone={tone} dot>
                        {label}
                    </Badge>
                    {editable && (
                        <Button size="sm" variant="outline" onClick={onOpen}>
                            {h.tracking_status === 'not_installed' ? 'Install' : 'Manage'}
                        </Button>
                    )}
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Fact label="Tracker last seen" value={h.sdk_last_seen_at ? relative(h.sdk_last_seen_at) : 'Never'} />
                <Fact label="Last tap" value={h.last_click_at ? relative(h.last_click_at) : 'None yet'} />
                <Fact label="Last match" value={h.last_match_at ? relative(h.last_match_at) : 'None yet'} />
                <Fact label="Taps · matched (24 h)" value={`${h.accepted_clicks_24h} · ${h.matched_24h}`} />
                <Fact label="Errors (24 h)" value={String(h.errors_24h)} />
            </div>
            <p className="text-[12px] text-muted-foreground">
                Mode: {site.consent_mode === 'consent' ? 'waits for cookie consent' : 'click-only, no cookies'} · multi-page memory{' '}
                {site.session_landing_mode ? 'on' : 'off'}
                {h.filtered_24h > 0 && ` · ${h.filtered_24h} bot or preview taps left out`}
            </p>
            {h.last_error_code && h.errors_24h > 0 && (
                <p className="rounded-md bg-warn-bg px-3 py-2 text-[12.5px] text-warn">{ERRORS[h.last_error_code] ?? h.last_error_code}</p>
            )}
        </Card>
    );
}

/**
 * Tracking Setup › Websites (Developer Handover §I.4): website cards with health (tracker last seen,
 * last tap, last match, 24 h errors, mode), "+ Add website", the "How to tag your Google ads" card
 * and the plain-language problem list.
 */
export function WebsitesTab({ editable }: { editable: boolean }) {
    const sites = useSites();
    const [wizard, setWizard] = useState<{ site?: GrowthSite } | null>(null);
    const list = sites.data ?? [];

    return (
        <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="max-w-2xl text-[13px] text-muted-foreground">
                    WhatsApp taps on your website are matched to the chats they start, with the campaign and landing page. No cookies, no visitor IDs: the
                    WhatsApp message carries a short reference.
                </p>
                {editable && (
                    <Button onClick={() => setWizard({})}>
                        <PlusIcon /> Add website
                    </Button>
                )}
            </div>

            {sites.isLoading ? (
                <Skeleton className="mb-4 h-40" />
            ) : list.length === 0 ? (
                <Card className="mb-4 p-0">
                    <EmptyState
                        icon={<GlobeIcon className="size-5" />}
                        title="No websites yet"
                        description="Add your website, install one line of code (or use Google Tag Manager), and check it in five minutes."
                    />
                </Card>
            ) : (
                <div className="mb-4 grid gap-3">
                    {list.map((s) => (
                        <SiteCard key={s.id} site={s} editable={editable} onOpen={() => setWizard({ site: s })} />
                    ))}
                </div>
            )}

            <Card className="mb-4 gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                    <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                        <SearchIcon className="size-4" /> How to tag your Google ads
                    </h2>
                    <Badge tone="info">Shows Google Ads and the campaign</Badge>
                </div>
                <ol className="grid max-w-3xl list-decimal gap-1.5 pl-5 text-[13px] text-muted-foreground">
                    <li>
                        In Google Ads › Admin › Account settings, turn on <b className="text-foreground">Auto-tagging</b>. Each click then carries a Google
                        click ID (gclid), which marks the lead as Google Ads.
                    </li>
                    <li>
                        In Account settings › Tracking, paste this into <b className="text-foreground">Final URL suffix</b>. It names the campaign (Google fills
                        in the IDs):
                    </li>
                </ol>
                <div className="flex max-w-3xl items-start gap-2">
                    <code className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-[12px] break-all">{GOOGLE_SUFFIX}</code>
                    <Button variant="outline" size="sm" onClick={() => copyText(GOOGLE_SUFFIX)} aria-label="Copy Final URL suffix">
                        <CopyIcon />
                    </Button>
                </div>
                <p className="max-w-3xl text-[12.5px] text-muted-foreground">
                    The campaign name only ever comes from utm_campaign; the click ID alone shows “Google Ads” without a campaign. Visitors from Google search
                    without an ad show as “Google organic”. Click IDs are stored with the lead for later conversion reporting and are never shown to agents.
                </p>
            </Card>

            <Card className="gap-2 p-4">
                <h2 className="text-[15px] font-semibold">If something doesn’t work</h2>
                <dl className="grid max-w-3xl gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-[14rem_1fr]">
                    {PROBLEMS.map(([k, v]) => (
                        <div key={k} className="contents">
                            <dt className="font-medium">{k}</dt>
                            <dd className="text-muted-foreground">{v}</dd>
                        </div>
                    ))}
                </dl>
            </Card>

            {wizard && <WebsiteWizard open onOpenChange={(o) => !o && setWizard(null)} site={wizard.site} />}
        </>
    );
}
