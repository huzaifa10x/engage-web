'use client';

import { useQueryClient } from '@tanstack/react-query';
import { MessageSquareIcon } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

import { useSession } from '@/components/app/session';
import { Badge, type Tone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { dateTime, humanize } from '@/lib/format';
import { P } from '@/lib/permissions';
import { reviewSale, useSale } from '@/lib/queries';
import type { SalesMatch, SalesSource } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Engagement Plan §V.2 labels. */
export const MATCH: Record<SalesMatch, { label: string; short: string; tone: Tone }> = {
    link: { label: 'Order from a tracked chat link', short: 'Chat link', tone: 'good' },
    review: { label: 'Needs review: phone differs', short: 'Needs review', tone: 'warn' },
    phone: { label: 'Order from a WhatsApp contact', short: 'WhatsApp contact', tone: 'info' },
    unavailable: { label: 'Attribution unavailable', short: 'Attribution unavailable', tone: 'teal' },
    none: { label: 'Website order', short: 'Website order', tone: 'grey' },
};

export function MatchChip({ match, short = false }: { match: SalesMatch; short?: boolean }) {
    const m = MATCH[match];

    return (
        <Badge tone={m.tone} dot>
            {short ? m.short : m.label}
        </Badge>
    );
}

/** AED 1,234.50 — the store's currency, always shown. */
export function money(value: string | number, currency: string): string {
    const n = typeof value === 'string' ? Number(value) : value;

    return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const STATUS_TONE: Record<string, Tone> = {
    completed: 'good',
    processing: 'good',
    'on-hold': 'warn',
    pending: 'warn',
    refunded: 'grey',
    cancelled: 'bad',
    failed: 'bad',
};

export function SourceLine({ source, empty = '—' }: { source: SalesSource | null; empty?: string }) {
    if (!source) return <span className="text-muted-foreground">{empty}</span>;

    return (
        <span>
            {source.label}
            {source.campaign && <span className="block text-[12px] text-muted-foreground">{source.campaign}</span>}
        </span>
    );
}

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
    return (
        <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-1.5 text-[13px]">
            {rows.map(([k, v]) => (
                <div key={k} className="contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="min-w-0 break-words">{v}</dd>
                </div>
            ))}
        </dl>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="grid gap-2.5 border-t pt-4">
            <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</h4>
            {children}
        </section>
    );
}

const EVENT: Record<string, string> = {
    created: 'Order placed',
    paid: 'Paid',
    completed: 'Completed',
    refunded: 'Refund',
    cancelled: 'Cancelled',
    failed: 'Payment failed',
    pending: 'Pending payment',
    updated: 'Order edited',
};

/**
 * Growth Hub › Sales › order details: the match and its evidence (the chat link, who sent it and when),
 * the two sources (the contact's original source and the source of the chat the link came from),
 * WooCommerce's own order source, items and every change the store reported.
 */
export function SaleDetails({ id, onOpenChange }: { id: string | null; onOpenChange: (open: boolean) => void }) {
    const qc = useQueryClient();
    const { can } = useSession();
    const sale = useSale(id);
    const o = sale.data;
    const review = async (action: 'attach' | 'keep_apart') => {
        if (!o) return;
        try {
            const r = await reviewSale(o.id, action);
            qc.setQueryData(['growth', 'sale', o.id], r);
            void qc.invalidateQueries({ queryKey: ['growth', 'sales'] });
            void qc.invalidateQueries({ queryKey: ['analytics', 'sales'] });
            toast.success(action === 'attach' ? 'Attached to the chat' : 'Kept apart from the chat');
        } catch (e) {
            toast.error(errorMessage(e));
        }
    };

    return (
        <Dialog open={id !== null} onOpenChange={onOpenChange}>
            <DialogContent
                className={cn(
                    'top-0 right-0 left-auto h-dvh max-h-dvh w-full max-w-full translate-x-0 translate-y-0 content-start overflow-y-auto rounded-none border-y-0 border-r-0 sm:max-w-md',
                    'data-[state=closed]:zoom-out-100 data-[state=closed]:slide-out-to-right data-[state=open]:zoom-in-100 data-[state=open]:slide-in-from-right',
                )}
            >
                {!o ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>Order</DialogTitle>
                            <DialogDescription>Loading…</DialogDescription>
                        </DialogHeader>
                        <Skeleton className="h-64" />
                    </>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle>
                                Order #{o.number} · {money(o.total, o.currency)}
                            </DialogTitle>
                            <DialogDescription>
                                {o.store} · {dateTime(o.placed_at)}
                            </DialogDescription>
                        </DialogHeader>

                        <section className="grid gap-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                                <MatchChip match={o.match} />
                                <Badge tone={STATUS_TONE[o.status] ?? 'grey'}>{humanize(o.status)}</Badge>
                            </div>
                            {o.explain && <p className="rounded-md bg-muted px-3 py-2 text-[12.5px] leading-snug">{o.explain}</p>}
                            {o.match_note && <p className="text-[12.5px] text-muted-foreground">{o.match_note}</p>}
                            {o.match === 'review' && can(P.GrowthManage) && (
                                <div className="flex flex-wrap gap-2">
                                    <Button size="sm" onClick={() => review('attach')}>
                                        Same buyer — attach to the chat
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => review('keep_apart')}>
                                        Different buyer — keep apart
                                    </Button>
                                </div>
                            )}
                            <Rows
                                rows={[
                                    ['Customer', `${o.customer.display_name}${o.customer.phone ? ` · ${o.customer.phone}` : ''}`],
                                    ...(o.billing_phone && o.billing_phone !== o.customer.phone
                                        ? ([['Phone on the order', o.billing_phone]] as [string, React.ReactNode][])
                                        : []),
                                    [
                                        'Revenue',
                                        <span key="r">
                                            {money(o.net, o.currency)}
                                            {Number(o.refunded) > 0 && (
                                                <span className="text-muted-foreground"> · {money(o.refunded, o.currency)} refunded</span>
                                            )}
                                            {!o.paid && <span className="text-muted-foreground"> · not paid</span>}
                                        </span>,
                                    ],
                                    ['Counts as chat revenue', o.counts_as_chat_revenue ? 'Yes' : 'No'],
                                    ...(o.hours_to_order !== null
                                        ? ([
                                              [
                                                  'First chat to order',
                                                  o.hours_to_order < 1
                                                      ? 'Under 1 h'
                                                      : o.hours_to_order < 48
                                                        ? `${o.hours_to_order} h`
                                                        : `${Math.round(o.hours_to_order / 24)} days`,
                                              ],
                                          ] as [string, React.ReactNode][])
                                        : []),
                                ]}
                            />
                            {o.conversation_id && (
                                <Button asChild size="sm" variant="outline" className="w-fit">
                                    <Link href={`/inbox?c=${o.conversation_id}`}>
                                        <MessageSquareIcon /> Open the chat
                                    </Link>
                                </Button>
                            )}
                        </section>

                        <Section title="Evidence">
                            {o.link ? (
                                <Rows
                                    rows={[
                                        ['Chat link sent', `${dateTime(o.link.sent_at)} · by ${o.link.sent_by}`],
                                        [
                                            'Link',
                                            <span key="u" className="font-mono text-[12px] break-all">
                                                {o.link.url}
                                            </span>,
                                        ],
                                        ['Valid until', dateTime(o.link.expires_at)],
                                        ['Token on the order', 'Yes — saved by the plugin at checkout'],
                                    ]}
                                />
                            ) : (
                                <p className="text-[13px] text-muted-foreground">No chat link token came back on this order.</p>
                            )}
                        </Section>

                        <Section title="Sources">
                            <Rows
                                rows={[
                                    ['Contact’s original source', <SourceLine key="o" source={o.original_source} empty="Not a WhatsApp contact" />],
                                    [
                                        'Source of this chat',
                                        <SourceLine key="c" source={o.conversation_source} empty={o.link ? 'No tracked source for this chat' : '—'} />,
                                    ],
                                    [
                                        'WooCommerce’s own source',
                                        o.store_source ? (
                                            <span key="s" className="font-mono text-[12px]">
                                                {Object.entries(o.store_source)
                                                    .map(([k, v]) => `${k}=${v}`)
                                                    .join(' · ')}
                                            </span>
                                        ) : (
                                            <span className="text-muted-foreground">Not sent</span>
                                        ),
                                    ],
                                ]}
                            />
                        </Section>

                        <Section title={`Items · ${o.items_count}`}>
                            <ul className="grid gap-1 text-[13px]">
                                {o.items.map((i, n) => (
                                    <li key={n} className="flex justify-between gap-3">
                                        <span>
                                            {i.quantity} × {i.name}
                                            {i.sku && <span className="text-muted-foreground"> · {i.sku}</span>}
                                        </span>
                                        <span className="tabular-nums">{money(i.total, o.currency)}</span>
                                    </li>
                                ))}
                            </ul>
                        </Section>

                        <Section title="What the store reported">
                            <ol className="grid gap-2 border-l pl-4 text-[13px]">
                                {o.events.map((e, n) => (
                                    <li key={n} className="relative">
                                        <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-card bg-good" />
                                        <p className="font-medium">
                                            {EVENT[e.event] ?? humanize(e.event)}
                                            {e.via === 'catch_up' && (
                                                <span className="font-normal text-muted-foreground"> · filled in by the nightly catch-up</span>
                                            )}
                                        </p>
                                        <p className="text-[12px] text-muted-foreground">
                                            {dateTime(e.at)}
                                            {e.status ? ` · ${humanize(e.status)}` : ''}
                                            {e.refunded && Number(e.refunded) > 0 ? ` · ${money(e.refunded, o.currency)} refunded` : ''}
                                        </p>
                                    </li>
                                ))}
                            </ol>
                        </Section>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
