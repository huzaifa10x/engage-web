'use client';

import { DownloadIcon, SearchIcon, TargetIcon } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { EmptyState, Forbidden, PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { StageBadge } from '@/components/contacts/stage-badge';
import { LeadDetails } from '@/components/growth/lead-details';
import { StatusChip } from '@/components/growth/source-chip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { dateTime, relative } from '@/lib/format';
import { P } from '@/lib/permissions';
import { type LeadFilters, useLeads, useLeadSummary, useMembers, useMetaAds, usePhoneNumbers, useStages, useUnmatchedClicks } from '@/lib/queries';
import type { Lead } from '@/lib/types';
import { cn } from '@/lib/utils';

const ALL = '__all__';

type Tab = 'all' | 'new' | 'returning' | 'clicks';

// Leads are paid-advertising leads only: Meta Click-to-WhatsApp ads and boosted posts, and taps on
// your website from Google Ads, Meta ads or another paid campaign. Ordinary chats stay in Chat and Contacts.
const META_SOURCES: [string, string][] = [
    ['meta', 'Meta (ads and boosted posts)'],
    ['meta_paid', 'Meta ad (paid)'],
    ['meta_post', 'Meta boosted post'],
    ['meta_instagram', 'Meta ad · Instagram'],
    ['meta_facebook', 'Meta ad · Facebook'],
];
const WEBSITE_SOURCES: [string, string][] = [
    ['google_ads', 'Google Ads'],
    ['paid_other', 'Other paid campaign'],
    ['website', 'Any website tap'],
];

const STATUSES: [string, string][] = [
    ['meta', 'Meta ad'],
    ['ref', 'Reference matched (website)'],
    ['multi', 'Multiple sources'],
    ['web', 'Website · details unavailable'],
];

function Kpi({ label, value, hint, hero = false }: { label: string; value: string; hint: string; hero?: boolean }) {
    return (
        <Card className={cn('gap-1 p-4', hero && 'border-primary/40 bg-primary/5')}>
            <p className="text-[12.5px] text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
            <p className="text-[12px] text-muted-foreground">{hint}</p>
        </Card>
    );
}

function FilterSelect({
    label,
    value,
    onChange,
    options,
    all,
}: {
    label: string;
    value?: string;
    onChange: (v?: string) => void;
    options: [string, string][];
    all: string;
}) {
    return (
        <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
            <SelectTrigger className="w-auto min-w-40" aria-label={label}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={ALL}>{all}</SelectItem>
                {options.map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                        {l}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

function UnmatchedClicks() {
    const clicks = useUnmatchedClicks();
    const rows = clicks.data ?? [];

    return (
        <>
            {clicks.isLoading ? (
                <div className="p-5">
                    <Skeleton className="h-32" />
                </div>
            ) : rows.length === 0 ? (
                <EmptyState
                    icon={<TargetIcon className="size-5" />}
                    title="No unmatched clicks"
                    description="WhatsApp taps on your website that didn’t become a chat show here."
                />
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Click</TableHead>
                            <TableHead>When</TableHead>
                            <TableHead>Website</TableHead>
                            <TableHead>Page</TableHead>
                            <TableHead>Source</TableHead>
                            <TableHead>Campaign</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((c) => (
                            <TableRow key={c.id}>
                                <TableCell className="font-mono text-[12px] text-muted-foreground">{c.id}</TableCell>
                                <TableCell>{dateTime(c.received_at)}</TableCell>
                                <TableCell className="text-[12.5px]">{c.site ?? '—'}</TableCell>
                                <TableCell className="font-mono text-[12px]">{c.page ?? '—'}</TableCell>
                                <TableCell>{c.source}</TableCell>
                                <TableCell className="text-[12.5px]">{c.campaign ?? <span className="text-muted-foreground">—</span>}</TableCell>
                                <TableCell>
                                    <Badge tone={c.status === 'pending' ? 'warn' : 'grey'} dot>
                                        {c.status === 'pending' ? 'Pending match' : 'Unattributed'}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-[12.5px] text-muted-foreground">{c.note}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
            <p className="m-3 rounded-md bg-muted px-3 py-2 text-[12.5px] leading-snug">
                These are taps on the WhatsApp button that haven’t become a chat. They are click events only, never contacts. A click stays <b>Pending</b> for
                24 hours, then becomes <b>Unattributed</b>.
            </p>
        </>
    );
}

/**
 * Growth Hub › Leads (Developer Handover §I.4, prototype): every WhatsApp lead with where it came
 * from — the same records as Contacts & CRM. Owners and Admins see all leads, evidence, Unmatched
 * clicks and Export; Agents see their own leads and the source only.
 */
function LeadsPage() {
    const { can, me } = useSession();
    const full = me.growth?.tier === 'full';
    const allowed = can(P.InboxView) && full;
    const seesAll = can(P.GrowthView);
    const [tab, setTab] = useState<Tab>('all');
    // Tracking Setup links here with ?ad=<id> to show one ad's leads.
    const params = useSearchParams();
    // Analytics › Marketing links here with the clicked period, source, campaign and funnel step.
    const [filters, setFilters] = useState<LeadFilters>(() => {
        const v = (k: string) => params.get(k) ?? undefined;
        if (v('from') && v('to')) {
            const step = v('step');

            return {
                from: v('from'),
                to: v('to'),
                bucket: v('bucket'),
                campaign: v('campaign'),
                step: step === 'contacted' || step === 'qualified' ? step : undefined,
                phone_number_id: v('number_id'),
            };
        }

        return v('ad') ? { days: 365, ad: v('ad') } : { days: 30 };
    });
    const drilled = !!filters.from;
    const [search, setSearch] = useState('');
    const [openId, setOpenId] = useState<string | null>(null);

    const query: LeadFilters = { ...filters, tab: tab === 'clicks' ? 'all' : tab };
    const leads = useLeads(query, allowed && tab !== 'clicks');
    const summary = useLeadSummary(allowed);
    const numbers = usePhoneNumbers();
    const stages = (useStages(allowed).data ?? []).filter((s) => !s.archived);
    const members = useMembers(allowed && seesAll && can(P.TeamView));
    // Leads grouped by the Meta ad (ad ID) that started them.
    const ads = useMetaAds(allowed && seesAll).data ?? [];
    // Website cards (details lost, unmatched clicks) only once a website is tracked.
    const websites = (summary.data?.websites ?? 0) > 0;
    const SOURCES = websites ? [...META_SOURCES, ...WEBSITE_SOURCES] : META_SOURCES;

    const rows = leads.data?.pages.flatMap((p) => p.data) ?? [];
    const counts = leads.data?.pages[0]?.meta.counts;
    const open: Lead | undefined = rows.find((l) => l.id === openId);
    const set = (patch: Partial<LeadFilters>) => setFilters((f) => ({ ...f, ...patch }));
    const k = summary.data;

    if (!can(P.InboxView)) return <Forbidden />;
    if (!full) {
        return (
            <EmptyState
                icon={<TargetIcon className="size-5" />}
                title="Growth Hub isn’t available on this workspace"
                description="Growth Hub shows where every WhatsApp lead came from. It is included in the Growth, Pro and Enterprise plans."
            />
        );
    }

    const exportParams = new URLSearchParams(
        Object.entries({ ...query, tab: query.tab ?? 'all' })
            .filter(([, v]) => v !== undefined && v !== '')
            .map(([key, v]) => [key, String(v)]),
    );

    return (
        <>
            <PageHeader
                title="Leads"
                description={
                    seesAll
                        ? 'Chats that came from your paid ads (Meta ads, and Google Ads or other paid campaigns on your website), with the ad behind each. Same records as Contacts & CRM.'
                        : 'Your assigned ad leads and the ad behind each.'
                }
                actions={
                    seesAll &&
                    can(P.ContactsExport) && (
                        <Button variant="outline" asChild>
                            <a href={`/api/v1/growth/leads/export?${exportParams.toString()}`}>
                                <DownloadIcon /> Export
                            </a>
                        </Button>
                    )
                }
            />

            {drilled && (
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-info/30 bg-info-bg/50 px-3 py-2 text-[13px]">
                    <span>
                        From <b>Analytics › Marketing</b>: new leads with a first message from {filters.from} to {filters.to}
                        {filters.bucket ? ' · one source' : ''}
                        {filters.campaign ? ' · one campaign' : ''}
                        {filters.step ? ` · ${filters.step} within 30 days` : ''}
                        {filters.phone_number_id ? ' · one number' : ''}.
                    </span>
                    <Button size="sm" variant="outline" className="ml-auto" onClick={() => setFilters({ days: 30 })}>
                        Show all leads
                    </Button>
                </div>
            )}
            <div className={cn('mb-4 grid gap-3 sm:grid-cols-2', websites && seesAll ? 'lg:grid-cols-6' : 'lg:grid-cols-4')}>
                {!k ? (
                    Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[104px]" />)
                ) : (
                    <>
                        <Kpi hero label="Ad leads · 30 days" value={String(k.leads)} hint="chats from your paid ads in the last 30 days" />
                        <Kpi label="New customers" value={String(k.new_customers)} hint="their first-ever message came from an ad — same as the New tab" />
                        <Kpi label="Returning" value={String(k.returning)} hint="existing contacts who came back through an ad" />
                        <Kpi label="From boosted posts" value={String(k.meta_posts)} hint={`${k.meta_instagram} proven Instagram · rest not split`} />
                        {websites && seesAll && k.unmatched_clicks && (
                            <>
                                <Kpi
                                    label="Website details lost"
                                    value={String(k.website_lost ?? 0)}
                                    hint="came from your website, but the tap didn’t register (ad blocker, network)"
                                />
                                <Kpi label="Unmatched clicks" value={String(k.unmatched_clicks.total)} hint={`${k.unmatched_clicks.pending} still pending`} />
                            </>
                        )}
                    </>
                )}
            </div>

            <Card className="gap-0 overflow-hidden p-0">
                <div className="flex flex-wrap gap-1 border-b px-3 pt-2" role="tablist" aria-label="Leads">
                    {(
                        [
                            ['all', 'All leads', counts?.all],
                            ['new', 'New', counts?.new],
                            ['returning', 'Returning', counts?.returning],
                            ...(seesAll && websites ? ([['clicks', 'Unmatched clicks', k?.unmatched_clicks?.total]] as const) : []),
                        ] as [Tab, string, number | undefined][]
                    ).map(([key, label, n]) => (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={tab === key}
                            onClick={() => setTab(key)}
                            className={cn(
                                '-mb-px flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-[13.5px] font-medium text-muted-foreground hover:text-foreground',
                                tab === key && 'border-primary text-foreground',
                            )}
                        >
                            {label}
                            {n !== undefined && <span className="rounded-full bg-muted px-1.5 text-[11.5px] tabular-nums">{n}</span>}
                        </button>
                    ))}
                </div>

                {tab === 'clicks' ? (
                    <UnmatchedClicks />
                ) : (
                    <>
                        <div className="flex flex-wrap items-center gap-2 border-b p-3">
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    set({ q: search.trim() || undefined });
                                }}
                                className="relative w-full sm:w-60"
                            >
                                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
                                <Input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Name or number"
                                    className="pl-8"
                                    aria-label="Search leads"
                                />
                            </form>
                            <FilterSelect label="Source" value={filters.source} onChange={(v) => set({ source: v })} options={SOURCES} all="All sources" />
                            <FilterSelect
                                label="Match status"
                                value={filters.status}
                                onChange={(v) => set({ status: v })}
                                options={STATUSES}
                                all="All match statuses"
                            />
                            {seesAll && ads.length > 0 && (
                                <FilterSelect
                                    label="Meta ad"
                                    value={filters.ad}
                                    onChange={(v) => set({ ad: v })}
                                    options={ads.map((ad) => [ad.id, `${ad.headline ?? 'Untitled ad'} · ${ad.ad_id}`] as [string, string])}
                                    all="All Meta ads"
                                />
                            )}
                            <FilterSelect
                                label="Number"
                                value={filters.phone_number_id}
                                onChange={(v) => set({ phone_number_id: v })}
                                options={(numbers.data ?? []).map((n) => [n.id, [n.display_phone_number, n.verified_name].filter(Boolean).join(' · ')])}
                                all="All numbers"
                            />
                            {seesAll && (
                                <FilterSelect
                                    label="Agent"
                                    value={filters.assigned}
                                    onChange={(v) => set({ assigned: v })}
                                    options={[
                                        ['unassigned', 'Unassigned'],
                                        ...(members.data?.data ?? []).map((m) => [m.id, m.user?.name ?? 'Teammate'] as [string, string]),
                                    ]}
                                    all="All agents"
                                />
                            )}
                            {stages.length > 0 && (
                                <FilterSelect
                                    label="Stage"
                                    value={filters.stage_id}
                                    onChange={(v) => set({ stage_id: v })}
                                    options={[...stages.map((s) => [s.id, s.name] as [string, string]), ['none', 'No stage']]}
                                    all="Any stage"
                                />
                            )}
                            <Select value={String(filters.days ?? 30)} onValueChange={(v) => set({ days: Number(v) })}>
                                <SelectTrigger className="w-auto min-w-36" aria-label="Date range">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="7">Last 7 days</SelectItem>
                                    <SelectItem value="30">Last 30 days</SelectItem>
                                    <SelectItem value="90">Last 90 days</SelectItem>
                                    <SelectItem value="365">Last 12 months</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {leads.isLoading ? (
                            <div className="p-5">
                                <Skeleton className="h-48" />
                            </div>
                        ) : rows.length === 0 ? (
                            <EmptyState
                                icon={<TargetIcon className="size-5" />}
                                title="No leads match these filters"
                                description="Leads appear here when someone taps the WhatsApp button on one of your Meta ads, or on your website after a paid ad, and sends a message."
                            />
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Source</TableHead>
                                        <TableHead>Campaign</TableHead>
                                        <TableHead>Match</TableHead>
                                        <TableHead>First contact</TableHead>
                                        <TableHead>Agent</TableHead>
                                        <TableHead>Stage</TableHead>
                                        <TableHead>Last activity</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.map((l) => {
                                        const a = l.contact.acquisition;

                                        return (
                                            <TableRow key={l.id} className="cursor-pointer" onClick={() => setOpenId(l.id)}>
                                                <TableCell>
                                                    <p className="font-semibold">{l.contact.display_name}</p>
                                                    <p className="font-mono text-[12px] text-muted-foreground">{l.contact.phone}</p>
                                                </TableCell>
                                                <TableCell>
                                                    <p>{a?.source?.name ?? '—'}</p>
                                                    {a?.returning && <p className="text-[11.5px] text-muted-foreground">Returning contact</p>}
                                                </TableCell>
                                                <TableCell
                                                    className="max-w-56 text-[12.5px]"
                                                    title={a?.source?.latest?.line ?? a?.source?.campaign ?? undefined}
                                                >
                                                    <p className="truncate">{a?.source?.campaign ?? <span className="text-muted-foreground">—</span>}</p>
                                                    {a?.source?.latest && (
                                                        <p className="truncate text-[11.5px] text-muted-foreground">
                                                            {a.source.latest.campaign ? `Latest: ${a.source.latest.campaign}` : a.source.latest.line}
                                                        </p>
                                                    )}
                                                </TableCell>
                                                <TableCell>{a && <StatusChip status={a.status} />}</TableCell>
                                                <TableCell className="text-[12.5px]">{dateTime(l.first_contact_at)}</TableCell>
                                                <TableCell className="text-[12.5px]">
                                                    {l.assigned?.name ?? <span className="text-muted-foreground">Unassigned</span>}
                                                </TableCell>
                                                <TableCell>
                                                    <StageBadge stage={l.contact.stage} />
                                                </TableCell>
                                                <TableCell className="text-[12.5px] text-muted-foreground">{relative(l.last_activity_at)}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        )}
                        {leads.hasNextPage && (
                            <div className="flex justify-center border-t p-3">
                                <Button variant="outline" onClick={() => leads.fetchNextPage()} disabled={leads.isFetchingNextPage}>
                                    {leads.isFetchingNextPage ? 'Loading…' : 'Load more'}
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </Card>

            {open && <LeadDetails contact={open.contact} lead={open} open={!!open} onOpenChange={(o) => !o && setOpenId(null)} />}
        </>
    );
}

export default function LeadsRoute() {
    return (
        <Suspense>
            <LeadsPage />
        </Suspense>
    );
}
