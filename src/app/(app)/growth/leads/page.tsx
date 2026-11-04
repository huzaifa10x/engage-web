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

type Tab = 'all' | 'new' | 'unattributed' | 'clicks';

const SOURCES: [string, string][] = [
    ['google_ads', 'Google Ads'],
    ['meta', 'Meta (ads and boosted posts)'],
    ['meta_paid', 'Meta ad (paid)'],
    ['meta_post', 'Meta boosted post'],
    ['meta_instagram', 'Meta ad · Instagram'],
    ['meta_facebook', 'Meta ad · Facebook'],
    ['organic', 'Organic'],
    ['direct', 'Direct'],
    ['unknown', 'Unknown'],
    ['before', 'Before tracking'],
];

const STATUSES: [string, string][] = [
    ['ref', 'Reference matched'],
    ['meta', 'Meta ad'],
    ['multi', 'Multiple sources'],
    ['web', 'Website · details unavailable'],
    ['unattributed', 'Unattributed'],
    ['before', 'Before tracking'],
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
                    description="WhatsApp taps on your website that don’t become a chat show here once a site is connected in Tracking Setup."
                />
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Click</TableHead>
                            <TableHead>When</TableHead>
                            <TableHead>Page</TableHead>
                            <TableHead>Campaign details</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((c) => (
                            <TableRow key={c.id}>
                                <TableCell className="font-mono text-[12px] text-muted-foreground">{c.id}</TableCell>
                                <TableCell>{dateTime(c.received_at)}</TableCell>
                                <TableCell className="font-mono text-[12px]">{c.page ?? '—'}</TableCell>
                                <TableCell>{c.source}</TableCell>
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
    const [filters, setFilters] = useState<LeadFilters>(() => (params.get('ad') ? { days: 365, ad: params.get('ad') ?? undefined } : { days: 30 }));
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
                    seesAll ? 'Every WhatsApp lead with where it came from. Same records as Contacts & CRM.' : 'Your assigned leads and where they came from.'
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

            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {!k ? (
                    Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[104px]" />)
                ) : (
                    <>
                        <Kpi hero label="WhatsApp leads · 30 days" value={String(k.leads)} hint="new enquiries after tracking began" />
                        <Kpi
                            label="Confirmed source"
                            value={k.confirmed_rate === null ? '—' : `${k.confirmed_rate}%`}
                            hint={`${k.confirmed} by reference or Meta ad`}
                        />
                        <Kpi label="From Meta ads" value={String(k.meta)} hint={`${k.meta_posts} boosted posts · ${k.meta_instagram} proven Instagram`} />
                        <Kpi label="Website, details lost" value={String(k.website_lost)} hint="valid code, click not registered" />
                        <Kpi
                            label="Unmatched clicks"
                            value={k.unmatched_clicks ? String(k.unmatched_clicks.total) : '—'}
                            hint={k.unmatched_clicks ? `${k.unmatched_clicks.pending} still pending` : 'not available for agents'}
                        />
                    </>
                )}
            </div>

            <Card className="gap-0 overflow-hidden p-0">
                <div className="flex flex-wrap gap-1 border-b px-3 pt-2" role="tablist" aria-label="Leads">
                    {(
                        [
                            ['all', 'All leads', counts?.all],
                            ['new', 'New', counts?.new],
                            ['unattributed', 'Unattributed', counts?.unattributed],
                            ...(seesAll ? ([['clicks', 'Unmatched clicks', k?.unmatched_clicks?.total]] as const) : []),
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
                                description="Leads appear here as customers message your WhatsApp numbers."
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
                                                <TableCell>{a?.source?.name ?? '—'}</TableCell>
                                                <TableCell className="max-w-56 truncate text-[12.5px]" title={a?.source?.campaign ?? undefined}>
                                                    {a?.source?.campaign ?? <span className="text-muted-foreground">—</span>}
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
