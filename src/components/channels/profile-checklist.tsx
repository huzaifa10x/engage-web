'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheckIcon, CheckCircle2Icon, CircleHelpIcon, ExternalLinkIcon, RefreshCwIcon, XCircleIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { relative } from '@/lib/format';

type Item = { key: string; label: string; state: 'done' | 'missing' | 'unknown'; detail: string | null; fix_url: string | null };
type Checklist = {
    official: boolean;
    coexistence: boolean;
    ready: boolean;
    eligibility_note: string | null;
    request_url: string;
    items: Item[];
    error: string | null;
    checked_at: string;
};

/** Channels › what Meta looks at before granting the blue tick, read live from Meta. */
export function ProfileChecklist({ numberId }: { numberId: string }) {
    const qc = useQueryClient();
    const key = ['phone-numbers', numberId, 'profile-checklist'];
    const q = useQuery({ queryKey: key, queryFn: () => api<{ data: Checklist }>(`phone-numbers/${numberId}/profile-checklist`).then((r) => r.data) });
    if (!q.data) return <Skeleton className="h-40" />;
    const d = q.data;
    const recheck = async () => {
        const fresh = await api<{ data: Checklist }>(`phone-numbers/${numberId}/profile-checklist`, { query: { fresh: 1 } });
        qc.setQueryData(key, fresh.data);
    };

    return (
        <div className="grid gap-3" role="region" aria-label="Business profile checklist">
            {d.official ? (
                <p className="flex items-center gap-2 rounded-md border border-good/30 bg-good-bg px-3 py-2 text-[13px]">
                    <BadgeCheckIcon className="size-4 text-good" /> This number already has Meta’s blue tick (Official Business Account).
                </p>
            ) : d.ready ? (
                <p className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-good/30 bg-good-bg px-3 py-2 text-[13px]">
                    <span>
                        <span className="font-semibold">Ready to apply for the blue tick.</span> Meta reviews each request and decides; approval isn’t
                        guaranteed.
                    </span>
                    <a
                        href={d.request_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-good underline-offset-2 hover:underline"
                    >
                        Request it in WhatsApp Manager <ExternalLinkIcon className="size-3.5" />
                    </a>
                </p>
            ) : d.eligibility_note ? (
                <p className="rounded-md border px-3 py-2 text-[13px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{d.eligibility_note}.</span> This number is shared with the WhatsApp Business app.
                </p>
            ) : null}
            {d.error && <p className="text-[12.5px] text-warn">Meta didn’t answer every check: {d.error}</p>}
            <ul className="grid gap-1.5" aria-label="Checklist">
                {d.items.map((i) => (
                    <li key={i.key} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                        {i.state === 'done' ? (
                            <CheckCircle2Icon className="size-4 text-good" aria-hidden />
                        ) : i.state === 'missing' ? (
                            <XCircleIcon className="size-4 text-bad" aria-hidden />
                        ) : (
                            <CircleHelpIcon className="size-4 text-muted-foreground" aria-hidden />
                        )}
                        <span className="font-medium">{i.label}</span>
                        <Badge tone={i.state === 'done' ? 'good' : i.state === 'missing' ? 'bad' : 'grey'}>
                            {i.state === 'done' ? 'Done' : i.state === 'missing' ? 'Missing' : 'Not confirmed'}
                        </Badge>
                        {i.detail && <span className="text-muted-foreground">{i.detail}</span>}
                        {i.fix_url && (
                            <a
                                href={i.fix_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-info underline-offset-2 hover:underline"
                            >
                                Fix in WhatsApp Manager <ExternalLinkIcon className="size-3" />
                            </a>
                        )}
                    </li>
                ))}
            </ul>
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                Checked with Meta {relative(d.checked_at)}.
                <Button size="sm" variant="ghost" onClick={() => void recheck()}>
                    <RefreshCwIcon /> Check again
                </Button>
            </div>
        </div>
    );
}
