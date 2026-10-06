'use client';

import { CheckIcon, MinusIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { date, daysUntil, humanize, number } from '@/lib/format';
import { useEntitlements } from '@/lib/queries';
import type { FeatureUsage } from '@/lib/types';

function configSummary(f: FeatureUsage): string | null {
    const c = f.config ?? {};
    const parts = Object.entries(c)
        .filter(([, v]) => typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number')
        .map(([k, v]) => (typeof v === 'boolean' ? `${humanize(k)}: ${v ? 'yes' : 'no'}` : `${humanize(String(v))}`));

    return parts.length ? parts.join(' · ') : null;
}

/** What the current plan includes and how much of each limit is used. */
export function PlanUsage() {
    const q = useEntitlements();
    if (q.isLoading) return <Skeleton className="h-64" />;
    if (!q.data) return null;

    const { plan, subscription, features } = q.data;
    const entries = Object.entries(features);
    const limits = entries.filter(([, f]) => f.type === 'limit' || f.type === 'metered');
    const toggles = entries.filter(([, f]) => f.type !== 'limit' && f.type !== 'metered');
    const trialDays = subscription.status === 'trialing' ? daysUntil(subscription.trial_ends_at) : null;

    return (
        <div className="grid gap-4">
            <Card>
                <CardHeader>
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            {plan.name} plan
                            <Badge tone={subscription.status === 'active' ? 'good' : subscription.status === 'trialing' ? 'brand' : 'warn'}>
                                {humanize(subscription.status ?? 'free')}
                            </Badge>
                        </CardTitle>
                        <CardDescription>
                            {trialDays !== null
                                ? `Trial ends ${date(subscription.trial_ends_at)} (${trialDays} day${trialDays === 1 ? '' : 's'} left). You move to the Free plan unless you subscribe.`
                                : 'Messaging fees are billed by Meta directly to your business.'}
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="grid gap-5 sm:grid-cols-2">
                    {limits.map(([key, f]) => {
                        const pct = f.unlimited || !f.limit ? 0 : Math.min(100, Math.round(((f.used ?? 0) / f.limit) * 100));

                        return (
                            <div key={key}>
                                <div className="flex items-baseline justify-between gap-2 text-sm">
                                    <span className="font-medium">{f.label}</span>
                                    <span className="text-muted-foreground tabular-nums">
                                        {!f.enabled
                                            ? 'Not included'
                                            : f.used === null
                                              ? f.unlimited
                                                  ? 'Unlimited'
                                                  : `${number(f.limit)} ${f.unit ?? ''}`
                                              : `${number(f.used)} / ${f.unlimited ? '∞' : number(f.limit)}`}
                                    </span>
                                </div>
                                {f.enabled && f.used !== null && !f.unlimited && (
                                    <Progress value={pct} className="mt-2" indicatorClassName={pct >= 90 ? 'bg-bad' : pct >= 75 ? 'bg-warn' : undefined} />
                                )}
                            </div>
                        );
                    })}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Features</CardTitle>
                </CardHeader>
                <ul className="grid divide-y divide-line-2 sm:grid-cols-2 sm:divide-y-0">
                    {toggles.map(([key, f]) => (
                        <li key={key} className="flex items-start gap-3 px-5 py-3">
                            {f.enabled ? <CheckIcon className="mt-0.5 size-4 text-good" /> : <MinusIcon className="mt-0.5 size-4 text-faint" />}
                            <span className={f.enabled ? undefined : 'text-muted-foreground'}>
                                <span className="block text-sm">{f.label}</span>
                                {f.enabled && configSummary(f) && <span className="block text-[12px] text-muted-foreground">{configSummary(f)}</span>}
                            </span>
                        </li>
                    ))}
                </ul>
            </Card>
        </div>
    );
}
