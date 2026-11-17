'use client';

import type { CategoryChange, CostEstimate } from '@/lib/types';

const usd = (n: number, digits = 2) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const category = (c: string | null) => (c ? c.charAt(0) + c.slice(1).toLowerCase() : '');

/** Meta re-categorised the template recently: the price changed with it. */
export function CategoryChangeWarning({ change }: { change: CategoryChange | null | undefined }) {
    if (!change) return null;

    return (
        <p role="alert" className="rounded-md border border-warn/30 bg-warn-bg px-3 py-2 text-[13px] text-ink-2">
            <span className="font-semibold text-warn">
                Meta re-categorised this template from {category(change.from)} to {category(change.to)}
            </span>{' '}
            on {new Date(change.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}. It is now charged at the{' '}
            {category(change.to).toLowerCase()} rate{change.to === 'MARKETING' ? ', and contacts who opted out of marketing no longer receive it' : ''}.
        </p>
    );
}

/** What Meta will charge for this send: recipients by country × Meta's rate, in USD, paid by the client to Meta. */
export function CostEstimateBox({ estimate, excludedOptedOut = 0 }: { estimate: CostEstimate; excludedOptedOut?: number }) {
    const top = estimate.by_country.slice(0, 6);
    const rest = estimate.by_country.slice(6);
    const excluded = excludedOptedOut + estimate.excluded_invalid;

    return (
        <div className="rounded-md border px-3 py-2.5 text-[13px]" role="region" aria-label="Estimated Meta cost">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p>
                    <span className="text-muted-foreground">Estimated Meta cost: </span>
                    <span className="text-lg font-semibold tabular-nums">{usd(estimate.total)}</span>
                    <span className="text-muted-foreground">
                        {' '}
                        for {estimate.recipients.toLocaleString()} {category(estimate.category).toLowerCase()} message{estimate.recipients === 1 ? '' : 's'}
                    </span>
                </p>
                <p className="text-[12px] font-medium">{estimate.label}</p>
            </div>
            {top.length > 0 && (
                <table className="mt-2 w-full text-[12.5px]">
                    <thead className="text-muted-foreground">
                        <tr>
                            <th className="py-0.5 text-left font-normal">Country</th>
                            <th className="py-0.5 text-right font-normal">Recipients</th>
                            <th className="py-0.5 text-right font-normal">Per message</th>
                            <th className="py-0.5 text-right font-normal">Cost</th>
                        </tr>
                    </thead>
                    <tbody className="tabular-nums">
                        {top.map((r) => (
                            <tr key={`${r.country ?? 'unknown'}-${r.market}`}>
                                <td className="py-0.5">{r.country ? `${r.country} · ${r.market}` : `Number hidden · priced as ${r.market}`}</td>
                                <td className="py-0.5 text-right">{r.recipients.toLocaleString()}</td>
                                <td className="py-0.5 text-right">{usd(r.rate, 4)}</td>
                                <td className="py-0.5 text-right">{usd(r.cost, 2)}</td>
                            </tr>
                        ))}
                        {rest.length > 0 && (
                            <tr className="text-muted-foreground">
                                <td className="py-0.5">{rest.length} more countries</td>
                                <td className="py-0.5 text-right">{rest.reduce((s, r) => s + r.recipients, 0).toLocaleString()}</td>
                                <td />
                                <td className="py-0.5 text-right">{usd(rest.reduce((s, r) => s + r.cost, 0))}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            )}
            <p className="mt-1.5 text-[12px] text-muted-foreground">
                {excluded > 0 &&
                    `${excluded.toLocaleString()} excluded (${[excludedOptedOut > 0 ? `${excludedOptedOut.toLocaleString()} opted out` : null, estimate.excluded_invalid > 0 ? `${estimate.excluded_invalid.toLocaleString()} invalid numbers` : null].filter(Boolean).join(', ')}). `}
                {estimate.free_in_window > 0 && `${estimate.free_in_window.toLocaleString()} free (wrote to you in the last 24 hours). `}
                Meta’s rates from {estimate.rates_effective_from ? day(estimate.rates_effective_from) : 'unknown'}, before any volume discount.
            </p>
        </div>
    );
}
