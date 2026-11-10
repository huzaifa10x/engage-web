'use client';

import { DownloadIcon, PieChartIcon, SettingsIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { EmptyState, Forbidden, PageHeader } from '@/components/app/page-header';
import { useSelectedNumber } from '@/components/app/number-switcher';
import { useSession } from '@/components/app/session';
import { StageMappingDialog } from '@/components/growth/stage-mapping-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiError } from '@/lib/api';
import { relative } from '@/lib/format';
import { P } from '@/lib/permissions';
import { type MarketingFilters, useMarketingCampaigns, useMarketingFunnel, useMarketingOverview, useMarketingSources, useMarketingTrend } from '@/lib/queries';
import type { MarketingMetric, MarketingTrendPoint } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Today in the workspace's time zone (day boundaries are the workspace's, Spec §2). */
function localToday(tz: string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function addDays(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);

    return d.toISOString().slice(0, 10);
}

const fmt = (n: number | null | undefined, suffix = '') => (n === null || n === undefined ? '—' : `${Number.isInteger(n) ? n : n.toFixed(1)}${suffix}`);

function Change({ value, points = false }: { value: number | null | undefined; points?: boolean }) {
    if (value === null || value === undefined) return null;
    const up = value > 0;

    return (
        <span className={cn('text-[12px] font-semibold tabular-nums', value === 0 ? 'text-muted-foreground' : up ? 'text-good' : 'text-bad')}>
            {value === 0 ? '0%' : `${up ? '▲' : '▼'} ${Math.abs(value).toFixed(1)}${points ? ' pts' : '%'}`}
        </span>
    );
}

function Tile({
    label,
    value,
    change,
    hint,
    href,
    hero = false,
    points = false,
}: {
    label: string;
    value: string;
    change?: number | null;
    hint: string;
    href?: string;
    hero?: boolean;
    points?: boolean;
}) {
    const body = (
        <Card className={cn('h-full gap-1 p-4 transition-colors', hero && 'border-transparent bg-sidebar text-white', href && 'hover:border-primary/60')}>
            <p className={cn('text-[12.5px]', hero ? 'text-white/70' : 'text-muted-foreground')}>{label}</p>
            <p className="flex items-baseline gap-2 text-2xl font-semibold tabular-nums">
                <span className={hero ? 'text-primary' : undefined}>{value}</span>
                <Change value={change} points={points} />
            </p>
            <p className={cn('text-[12px]', hero ? 'text-white/70' : 'text-muted-foreground')}>{hint}</p>
        </Card>
    );

    return href ? (
        <Link href={href} className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none">
            {body}
        </Link>
    ) : (
        body
    );
}

/** New leads per day; dashed line is the previous period (prototype "Trend"). */
function TrendChart({ points, compare }: { points: MarketingTrendPoint[]; compare: boolean }) {
    const w = 720;
    const h = 200;
    const pad = { l: 28, r: 8, t: 10, b: 24 };
    const max = Math.max(1, ...points.map((p) => Math.max(p.new_leads, compare ? (p.prev_new_leads ?? 0) : 0)));
    const x = (i: number) => pad.l + (points.length <= 1 ? 0 : (i / (points.length - 1)) * (w - pad.l - pad.r));
    const y = (v: number) => pad.t + (1 - v / max) * (h - pad.t - pad.b);
    const line = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const cur = line(points.map((p) => p.new_leads));
    const prev = compare ? line(points.map((p) => p.prev_new_leads ?? 0)) : '';
    const ticks = [0, Math.round(max / 2), max];
    const step = Math.max(1, Math.ceil(points.length / 7));
    const label = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

    return (
        <figure>
            <svg
                viewBox={`0 0 ${w} ${h}`}
                className="h-52 w-full"
                role="img"
                aria-label={`New leads per day, ${points.length} days${compare ? ', with the previous period as a dashed line' : ''}`}
            >
                {ticks.map((t) => (
                    <g key={t}>
                        <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line, #e5e7eb)" strokeWidth={1} />
                        <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="currentColor" className="text-muted-foreground">
                            {t}
                        </text>
                    </g>
                ))}
                {points.map((p, i) =>
                    i % step === 0 ? (
                        <text key={p.date} x={x(i)} y={h - 6} textAnchor="middle" fontSize={10} fill="currentColor" className="text-muted-foreground">
                            {label(p.date)}
                        </text>
                    ) : null,
                )}
                {compare && <path d={prev} fill="none" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" />}
                <path d={`${cur} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="currentColor" className="text-sidebar" opacity={0.06} />
                <path d={cur} fill="none" stroke="currentColor" className="text-sidebar" strokeWidth={2} strokeLinejoin="round" />
                {points.map((p, i) => (
                    <circle key={p.date} cx={x(i)} cy={y(p.new_leads)} r={6} fill="transparent">
                        <title>
                            {label(p.date)}: {p.new_leads} new lead{p.new_leads === 1 ? '' : 's'}
                            {compare && p.prev_date ? ` · previous period ${label(p.prev_date)}: ${p.prev_new_leads ?? 0}` : ''}
                        </title>
                    </circle>
                ))}
            </svg>
            <figcaption className="mt-1 flex gap-4 text-[12px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                    <span className="h-0.5 w-4 bg-sidebar" /> This period
                </span>
                {compare && (
                    <span className="flex items-center gap-1.5">
                        <span className="h-0 w-4 border-t-2 border-dashed border-slate-400" /> Previous period
                    </span>
                )}
            </figcaption>
        </figure>
    );
}

/**
 * Insights › Marketing (Marketing Analytics Specification, prototype): which sources and campaigns
 * bring WhatsApp leads, and how many become qualified. Every number opens Growth Hub › Leads with
 * the same filters. No ad spend, cost or revenue.
 */
export default function MarketingPage() {
    const { can, me, membership } = useSession();
    const tier = me.growth?.tier;
    const tz = membership.tenant?.timezone || 'UTC';
    const today = localToday(tz);
    const [preset, setPreset] = useState<'7' | '30' | '90' | 'custom'>('30');
    const [custom, setCustom] = useState({ from: addDays(today, -29), to: today });
    const [compare, setCompare] = useState(true);
    // The number chosen in the top bar (CN-02).
    const [numberId] = useSelectedNumber();
    const [mappingOpen, setMappingOpen] = useState(false);

    const period = preset === 'custom' ? custom : { from: addDays(today, -(Number(preset) - 1)), to: today };
    const f: MarketingFilters = { ...period, compare: compare ? 'previous' : 'none', ...(numberId ? { number_id: numberId } : {}) };
    const allowed = can(P.GrowthView) && tier === 'full';
    const overview = useMarketingOverview(f, allowed);
    const sources = useMarketingSources(f, allowed);
    const campaigns = useMarketingCampaigns(f, allowed);
    const funnel = useMarketingFunnel(f, allowed);
    const trend = useMarketingTrend(f, allowed);

    if (!can(P.GrowthView)) return <Forbidden />;
    if (tier !== 'full' || (overview.error instanceof ApiError && overview.error.status === 402)) {
        return (
            <EmptyState
                icon={<PieChartIcon className="size-5" />}
                title="Marketing analytics is included in Growth, Pro and Enterprise"
                description="See which sources and campaigns bring WhatsApp leads, and how many become qualified. Upgrade your plan to turn it on."
                action={
                    can(P.BillingView) ? (
                        <Button asChild>
                            <Link href="/billing">See plans</Link>
                        </Button>
                    ) : undefined
                }
            />
        );
    }

    const o = overview.data;
    const ready = o?.stage_mapping_ready ?? true;
    /** Growth Hub › Leads with the same filters (Spec §7 drill-down). */
    const drill = (extra: Record<string, string | undefined> = {}) => {
        const q = new URLSearchParams({ from: period.from, to: period.to });
        if (numberId) q.set('number_id', numberId);
        for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);

        return `/growth/leads?${q.toString()}`;
    };
    const exportHref = `/api/v1/analytics/marketing/export?${new URLSearchParams({ from: period.from, to: period.to, ...(numberId ? { number_id: numberId } : {}) }).toString()}`;
    const sourceRows = sources.data?.rows ?? [];
    const maxLeads = Math.max(1, ...sourceRows.map((r) => r.new_leads));
    const steps = funnel.data?.steps ?? [];
    const newCount = steps[0]?.count ?? 0;
    const pct = (m: MarketingMetric) => fmt(m.value, '%');
    const provisional = o?.provisional ? (
        <Badge tone="warn" title="Some leads still have time to qualify.">
            Provisional
        </Badge>
    ) : null;

    return (
        <>
            <PageHeader
                title="Marketing"
                description="Which sources and campaigns bring WhatsApp leads, and how many become qualified."
                actions={
                    <>
                        {can(P.GrowthManage) && (
                            <Button variant="outline" onClick={() => setMappingOpen(true)}>
                                <SettingsIcon /> Set up stages
                            </Button>
                        )}
                        <Button variant="outline" asChild>
                            <a href={exportHref}>
                                <DownloadIcon /> Export
                            </a>
                        </Button>
                    </>
                }
            />

            <div className="mb-4 flex flex-wrap items-center gap-2">
                <Select value={preset} onValueChange={(v) => setPreset(v as typeof preset)}>
                    <SelectTrigger className="w-40" aria-label="Period">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="7">Last 7 days</SelectItem>
                        <SelectItem value="30">Last 30 days</SelectItem>
                        <SelectItem value="90">Last 90 days</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                </Select>
                {preset === 'custom' && (
                    <>
                        <Input
                            type="date"
                            className="w-40"
                            aria-label="From"
                            value={custom.from}
                            max={custom.to}
                            onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))}
                        />
                        <Input
                            type="date"
                            className="w-40"
                            aria-label="To"
                            value={custom.to}
                            min={custom.from}
                            max={today}
                            onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))}
                        />
                    </>
                )}
                <div className="flex items-center gap-2 px-1">
                    <Checkbox id="mk-compare" checked={compare} onCheckedChange={(v) => setCompare(v === true)} />
                    <Label htmlFor="mk-compare" className="text-[13px] font-normal">
                        Compare with previous period
                    </Label>
                </div>
                <span className="ml-auto text-[12px] text-muted-foreground">
                    {o?.updated_at ? `Updated ${relative(o.updated_at)}` : ''} · {tz}
                </span>
            </div>

            {o && !ready && (
                <Card className="mb-4 flex-row flex-wrap items-center gap-3 border-dashed border-warn/50 bg-warn-bg/40 p-4">
                    <SettingsIcon className="size-5 shrink-0" />
                    <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold">Set up your stages to see qualified leads</p>
                        <p className="text-[12.5px] text-muted-foreground">
                            Choose which of your CRM stages mean “Contacted” and “Qualified”. Lead counts and sources already work.
                        </p>
                    </div>
                    {can(P.GrowthManage) && <Button onClick={() => setMappingOpen(true)}>Set up stages</Button>}
                </Card>
            )}

            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {!o ? (
                    Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[112px]" />)
                ) : (
                    <>
                        <Tile
                            hero
                            label="New leads"
                            value={fmt(o.new_leads.value)}
                            change={compare ? o.new_leads.change_pct : null}
                            hint={
                                compare && o.new_leads.previous !== null ? `vs ${o.new_leads.previous} previous period` : 'first enquiries after tracking began'
                            }
                            href={drill()}
                        />
                        <Tile
                            label="Qualified leads"
                            value={fmt(o.qualified_leads.value)}
                            change={compare ? o.qualified_leads.change_pct : null}
                            hint={ready ? 'reached a Qualified stage within 30 days' : 'set up stages to see this'}
                            href={ready ? drill({ step: 'qualified' }) : undefined}
                        />
                        <Tile
                            label="Qualification rate"
                            value={pct(o.qualification_rate)}
                            change={
                                compare && o.qualification_rate.value !== null && o.qualification_rate.previous !== null
                                    ? Number((o.qualification_rate.value - o.qualification_rate.previous).toFixed(1))
                                    : null
                            }
                            points
                            hint="qualified ÷ new leads"
                        />
                        <Tile
                            label="Confirmed-source coverage"
                            value={pct(o.confirmed_coverage)}
                            change={
                                compare && o.confirmed_coverage.value !== null && o.confirmed_coverage.previous !== null
                                    ? Number((o.confirmed_coverage.value - o.confirmed_coverage.previous).toFixed(1))
                                    : null
                            }
                            points
                            hint={`${o.confirmed_coverage.confirmed} of ${o.new_leads.value ?? 0} leads with proven source`}
                        />
                    </>
                )}
            </div>
            {o && (o.provisional || o.returning_contacts > 0) && (
                <p className="-mt-2 mb-4 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
                    {provisional}
                    {o.provisional && <span>Some leads in this period still have time to qualify.</span>}
                    {o.returning_contacts > 0 && (
                        <span>
                            Returning contacts: {o.returning_contacts} existing customer{o.returning_contacts === 1 ? '' : 's'} from before tracking came back
                            through a tracked source (not counted as new leads).
                        </span>
                    )}
                </p>
            )}

            <div className="grid gap-4 xl:grid-cols-2">
                <Card className="gap-3 p-4">
                    <div>
                        <h2 className="text-[15px] font-semibold">Lead sources</h2>
                        <p className="text-[12.5px] text-muted-foreground">Leads and qualified leads by original source. Click a row to see the leads.</p>
                    </div>
                    {sources.isLoading ? (
                        <Skeleton className="h-48" />
                    ) : sourceRows.length === 0 ? (
                        <p className="py-6 text-center text-[13px] text-muted-foreground">No new leads in this period.</p>
                    ) : (
                        <ul className="grid gap-1">
                            {sourceRows.map((r) => (
                                <li key={r.bucket}>
                                    <Link
                                        href={drill({ bucket: r.bucket })}
                                        className="grid grid-cols-[minmax(9rem,13rem)_1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
                                    >
                                        <span className="text-[13px] font-medium">{r.label}</span>
                                        <span className="relative h-3 overflow-hidden rounded-full bg-muted" aria-hidden>
                                            <span
                                                className="absolute inset-y-0 left-0 rounded-full bg-info/35"
                                                style={{ width: `${(r.new_leads / maxLeads) * 100}%` }}
                                            />
                                            {r.qualified !== null && (
                                                <span
                                                    className="absolute inset-y-0 left-0 rounded-full bg-sidebar"
                                                    style={{ width: `${(r.qualified / maxLeads) * 100}%` }}
                                                />
                                            )}
                                        </span>
                                        <span className="flex items-baseline gap-2 text-[12.5px] whitespace-nowrap tabular-nums">
                                            <b>{r.new_leads}</b> leads
                                            {r.qualified !== null && <span className="text-muted-foreground">· {r.qualified} qualified</span>}
                                            {compare && <Change value={r.change_pct} />}
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                    <p className="flex gap-4 text-[12px] text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-sm bg-info/35" /> Leads
                        </span>
                        {ready && (
                            <span className="flex items-center gap-1.5">
                                <span className="size-2.5 rounded-sm bg-sidebar" /> Qualified
                            </span>
                        )}
                    </p>
                </Card>

                <Card className="gap-3 p-4">
                    <div>
                        <h2 className="flex items-center gap-2 text-[15px] font-semibold">Lead funnel {provisional}</h2>
                        <p className="text-[12.5px] text-muted-foreground">New leads in the period and how far they got within 30 days.</p>
                    </div>
                    {!ready ? (
                        <p className="rounded-md bg-muted px-3 py-2 text-[12.5px]">Choose which CRM stages mean Contacted and Qualified to see the funnel.</p>
                    ) : funnel.isLoading ? (
                        <Skeleton className="h-36" />
                    ) : (
                        <ol className="grid gap-2">
                            {steps.map((s) => {
                                const label = { new: 'New', contacted: 'Contacted', qualified: 'Qualified' }[s.step];
                                const width = s.count === null || newCount === 0 ? 0 : (s.count / newCount) * 100;

                                return (
                                    <li key={s.step}>
                                        <Link
                                            href={drill(s.step === 'new' ? {} : { step: s.step })}
                                            className="grid grid-cols-[6rem_1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
                                        >
                                            <span className="text-[13px] font-medium">{label}</span>
                                            <span className="relative h-7 overflow-hidden rounded-md bg-muted" aria-hidden>
                                                <span className="absolute inset-y-0 left-0 rounded-md bg-sidebar/85" style={{ width: `${width}%` }} />
                                            </span>
                                            <span className="text-[13px] whitespace-nowrap tabular-nums">
                                                <b>{fmt(s.count)}</b>
                                                {s.step !== 'new' && s.count !== null && newCount > 0 && (
                                                    <span className="text-muted-foreground"> · {Math.round((s.count / newCount) * 100)}%</span>
                                                )}
                                            </span>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </Card>
            </div>

            <Card className="mt-4 gap-2 p-4">
                <div>
                    <h2 className="text-[15px] font-semibold">Trend</h2>
                    <p className="text-[12.5px] text-muted-foreground">New leads per day{compare ? ' · dashed line is the previous period' : ''}</p>
                </div>
                {trend.data ? <TrendChart points={trend.data.points} compare={compare} /> : <Skeleton className="h-52" />}
            </Card>

            <Card className="mt-4 gap-0 overflow-hidden p-0">
                <div className="p-4">
                    <h2 className="flex items-center gap-2 text-[15px] font-semibold">Campaign performance {provisional}</h2>
                    <p className="text-[12.5px] text-muted-foreground">
                        Campaign name from website UTMs, or the Meta ad headline. Ad spend and cost per lead come in a later release.
                    </p>
                </div>
                {campaigns.isLoading ? (
                    <div className="p-4">
                        <Skeleton className="h-32" />
                    </div>
                ) : (campaigns.data?.rows ?? []).length === 0 ? (
                    <p className="px-4 pb-6 text-center text-[13px] text-muted-foreground">No campaigns in this period.</p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Campaign</TableHead>
                                <TableHead>Source</TableHead>
                                <TableHead className="text-right">Leads</TableHead>
                                <TableHead className="text-right">Qualified</TableHead>
                                <TableHead className="text-right">Rate</TableHead>
                                {compare && <TableHead className="text-right">Vs previous</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(campaigns.data?.rows ?? []).map((c) => (
                                <TableRow key={c.campaign_key}>
                                    <TableCell className="font-semibold">
                                        <Link href={drill({ campaign: c.campaign_key })} className="hover:underline">
                                            {c.label}
                                        </Link>
                                    </TableCell>
                                    <TableCell className="text-[12.5px]">{c.source}</TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        <Link href={drill({ campaign: c.campaign_key })} className="hover:underline">
                                            {c.new_leads}
                                        </Link>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {c.qualified === null ? (
                                            '—'
                                        ) : (
                                            <Link href={drill({ campaign: c.campaign_key, step: 'qualified' })} className="hover:underline">
                                                {c.qualified}
                                            </Link>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">{fmt(c.rate, '%')}</TableCell>
                                    {compare && (
                                        <TableCell className="text-right">
                                            {c.is_new ? (
                                                <span className="text-[12px] font-semibold text-muted-foreground">New</span>
                                            ) : (
                                                <Change value={c.change_pct} />
                                            )}
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </Card>

            <StageMappingDialog open={mappingOpen} onOpenChange={setMappingOpen} />
        </>
    );
}
