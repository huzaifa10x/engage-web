'use client';

import { dateTime } from '@/lib/format';
import { useStageHistory } from '@/lib/queries';

import { StageBadge } from './stage-select';

/** The last stage changes of a contact (newest first). */
export function StageHistory({ contactId, limit = 5 }: { contactId: string; limit?: number }) {
    const history = useStageHistory(contactId);
    const rows = (history.data ?? []).slice(0, limit);
    if (rows.length === 0) return null;

    return (
        <ol className="grid gap-1 text-[12.5px]" aria-label="Stage history">
            {rows.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                    <StageBadge stage={e.from} />→<StageBadge stage={e.to} />
                    <span>
                        {dateTime(e.changed_at)}
                        {e.changed_by ? ` · ${e.changed_by}` : ''}
                    </span>
                </li>
            ))}
        </ol>
    );
}
