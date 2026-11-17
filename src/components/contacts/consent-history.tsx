'use client';

import { Badge, type Tone } from '@/components/ui/badge';
import { dateTime } from '@/lib/format';
import { useConsentHistory } from '@/lib/queries';

const ACTIONS: Record<string, { label: string; tone: Tone }> = {
    opted_in: { label: 'Opted in', tone: 'good' },
    opted_out: { label: 'Opted out', tone: 'bad' },
    marketing_opted_out: { label: 'Opted out of marketing', tone: 'bad' },
    marketing_opted_in: { label: 'Marketing allowed again', tone: 'good' },
    consent_requested: { label: 'Consent question sent', tone: 'info' },
    consent_declined: { label: 'Said no', tone: 'warn' },
};

/** A contact's consent history, newest first: what was recorded, how, the exact words shown and when. */
export function ConsentHistory({ contactId, limit = 10 }: { contactId: string; limit?: number }) {
    const history = useConsentHistory(contactId);
    const rows = (history.data ?? []).slice(0, limit);
    if (history.isLoading) return null;
    if (rows.length === 0) return <p className="text-[12.5px] text-muted-foreground">No consent recorded yet.</p>;

    return (
        <ol className="grid gap-2 text-[12.5px]" aria-label="Consent history">
            {rows.map((e) => {
                const a = ACTIONS[e.action] ?? { label: e.action.replace(/_/g, ' '), tone: 'grey' as Tone };

                return (
                    <li key={e.id} className="grid gap-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone={a.tone}>{a.label}</Badge>
                            <span className="text-muted-foreground">
                                {e.source_label} · {e.channel === 'whatsapp' ? 'WhatsApp' : e.channel} · {dateTime(e.created_at)}
                            </span>
                        </div>
                        {e.wording && <p className="text-muted-foreground italic">“{e.wording}”</p>}
                        {!e.wording && e.detail && <p className="text-muted-foreground">{e.detail}</p>}
                    </li>
                );
            })}
        </ol>
    );
}
