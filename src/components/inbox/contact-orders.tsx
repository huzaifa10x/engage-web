'use client';

import { MatchChip, money, STATUS_TONE } from '@/components/growth/sales';
import { Badge } from '@/components/ui/badge';
import { date, humanize } from '@/lib/format';
import { useContactOrders } from '@/lib/queries';

/**
 * Conversation sidebar › Orders (Engagement Plan v4 §V.3): the contact's store orders, their status
 * and total spend after refunds. Every agent who sees the chat sees this; never ad cost.
 */
export function ContactOrders({ contactId }: { contactId: string }) {
    const orders = useContactOrders(contactId);
    const d = orders.data;
    if (!d || d.count === 0) return null;

    return (
        <section className="grid gap-2.5 border-t px-5 py-4 text-[13px]" aria-label="Orders">
            <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Orders · {d.count}</h4>
                <span className="text-[12px] text-muted-foreground">Spent {d.total_spend.map((s) => money(s.net, s.currency)).join(' + ')}</span>
            </div>
            <ul className="grid gap-2">
                {d.orders.slice(0, 5).map((o) => (
                    <li key={o.id} className="grid gap-1 rounded-md border px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">#{o.number}</span>
                            <span className="tabular-nums">{money(o.total, o.currency)}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone={STATUS_TONE[o.status] ?? 'grey'}>{humanize(o.status)}</Badge>
                            <MatchChip match={o.match} short />
                            <span className="text-[12px] text-muted-foreground">{date(o.placed_at)}</span>
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
}
