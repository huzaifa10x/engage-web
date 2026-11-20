'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CalendarClockIcon, CheckIcon, SearchIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError, errorMessage } from '@/lib/api';
import { date } from '@/lib/format';
import { P } from '@/lib/permissions';
import { AED } from '@/lib/promise';
import { useEnquiryBoard } from '@/lib/queries';
import type { CrmStage, Enquiry, EnquiryBoard } from '@/lib/types';
import { cn } from '@/lib/utils';

import { useOpenContact } from './contact-sheet';
import { CloseEnquiryDialog, invalidateEnquiry, money } from './enquiry-card';

function Stat({ value, label, tone }: { value: string; label: string; tone?: 'good' | 'warn' }) {
    return (
        <div className="rounded-lg border bg-card px-4 py-3">
            <p className={cn('text-[20px] font-semibold tabular-nums', tone === 'good' && 'text-good', tone === 'warn' && 'text-warn')}>{value}</p>
            <p className="text-[12px] text-muted-foreground">{label}</p>
        </div>
    );
}

/** Column dot: Won green, Lost grey, open stages from the tag palette (status colours stay for status). */
function stageDot(stage: { name: string; group?: string | null }): string {
    if (stage.group === 'won') return 'var(--good)';
    if (stage.group === 'lost') return 'var(--faint)';

    let h = 0;
    for (const ch of stage.name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;

    return OPEN_DOTS[h % OPEN_DOTS.length];
}

// Open stages: blues, violets and teals only, so no open stage reads as Won (green) or as a warning.
const OPEN_DOTS = ['#2b5fa8', '#7c4dcc', '#0e8a8a', '#4d5b8c', '#5b8def', '#9a6bd8'];

/** A short tick burst on a card that was just won. */
function WonBurst() {
    return (
        <span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
            style={{ animation: 'won-fade 1.2s ease-out forwards' }}
        >
            {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                <span
                    key={a}
                    className="absolute size-1.5 rounded-full bg-good"
                    style={{ '--a': `${a}deg`, animation: 'won-ray 700ms ease-out forwards' } as React.CSSProperties}
                />
            ))}
            <span
                className="inline-flex size-8 items-center justify-center rounded-full bg-good text-white shadow-raised"
                style={{ animation: 'won-pop 420ms ease-out forwards' }}
            >
                <CheckIcon className="size-4" />
            </span>
        </span>
    );
}

function Card({
    enquiry,
    draggable,
    onDragStart,
    onDragEnd,
    dragging,
    burst,
}: {
    enquiry: Enquiry;
    draggable: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: () => void;
    dragging: boolean;
    burst: boolean;
}) {
    const openContact = useOpenContact();
    const step = enquiry.next_step;

    return (
        <li
            draggable={draggable}
            onDragStart={(e) => {
                // The browser snapshots the card for the drag right after this handler: lift and tilt it
                // for the snapshot, then put the card back.
                const el = e.currentTarget;
                el.classList.add('-rotate-1', 'shadow-raised');
                requestAnimationFrame(() => el.classList.remove('-rotate-1', 'shadow-raised'));
                onDragStart(e);
            }}
            onDragEnd={onDragEnd}
            className={cn(
                'relative grid gap-1 rounded-md border bg-card p-2.5 text-[12.5px] transition-opacity duration-150',
                draggable && 'cursor-grab active:cursor-grabbing',
                dragging && 'opacity-40',
            )}
            aria-label={enquiry.title ?? `Enquiry ${enquiry.number}`}
        >
            {burst && <WonBurst />}
            <p className="leading-snug font-semibold">{enquiry.title ?? `Enquiry ${enquiry.number}`}</p>
            {enquiry.contact && (
                <button
                    type="button"
                    className="w-fit text-left font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() => openContact(enquiry.contact_id)}
                >
                    {enquiry.contact.name}
                </button>
            )}
            <p className={cn('font-medium', enquiry.value === null ? 'text-muted-foreground' : 'text-good')}>
                {money(enquiry)}
                {enquiry.verified_paid && ' · ✓ paid'}
            </p>
            {enquiry.group === 'won' && enquiry.won?.reference && !enquiry.verified_paid && (
                <p className="text-[11.5px] text-muted-foreground">Reference {enquiry.won.reference}</p>
            )}
            {enquiry.group === 'lost' && enquiry.lost_reason && <p className="text-[11.5px] text-muted-foreground">{enquiry.lost_reason}</p>}
            <div className="mt-0.5 flex items-center gap-2">
                {enquiry.group === 'open' &&
                    (step ? (
                        <span
                            className={cn(
                                'flex min-w-0 flex-1 items-center gap-1 truncate text-[11.5px]',
                                step.overdue ? 'font-semibold text-bad' : 'text-muted-foreground',
                            )}
                        >
                            <CalendarClockIcon className="size-3 shrink-0" /> {step.title} {date(step.due_at)}
                        </span>
                    ) : (
                        <span className="flex-1 text-[11.5px] font-semibold text-warn">No next step</span>
                    ))}
                {enquiry.group !== 'open' && <span className="flex-1" />}
                {enquiry.owner ? (
                    <span title={enquiry.owner.name}>
                        <Avatar name={enquiry.owner.name} className="size-5 text-[9px]" />
                    </span>
                ) : (
                    <span
                        className="inline-flex size-5 items-center justify-center rounded-full border border-dashed text-[10px] text-muted-foreground"
                        title="No owner"
                    >
                        ?
                    </span>
                )}
            </div>
        </li>
    );
}

/**
 * Contacts & CRM › Enquiries pipeline (3.3): one column per stage, in the workspace's order. Drag a
 * card to move it: into an Open stage straight away; into a Won-group stage it asks for a reference
 * unless a verified payment exists, into a Lost-group stage for a reason. Closed enquiries stay
 * visible for 30 days. Clicking a name opens the contact over the board.
 */
export function EnquiryBoardView() {
    const { can } = useSession();
    const qc = useQueryClient();
    const [owner, setOwner] = useState<'all' | 'me' | 'none'>('all');
    const [filter, setFilter] = useState<'all' | 'no_next_step' | 'overdue'>('all');
    const [search, setSearch] = useState('');
    const [q, setQ] = useState('');
    const board = useEnquiryBoard({ owner: owner === 'all' ? null : owner, filter: filter === 'all' ? null : filter, search: q || null });
    const [dragging, setDragging] = useState<Enquiry | null>(null);
    const [over, setOver] = useState<string | null>(null);
    const [closing, setClosing] = useState<{ enquiry: Enquiry; stage: CrmStage } | null>(null);
    const canMove = can(P.StagesChange);
    // Won tick burst: the card moved to a Won stage shows a short burst once the board has it there.
    const pendingWon = useRef<string | null>(null);
    const [burst, setBurst] = useState<string | null>(null);
    useEffect(() => {
        const id = pendingWon.current;
        if (!id || !board.data) return;
        if (board.data.stages.some((st) => st.group === 'won' && st.enquiries.some((x) => x.id === id))) {
            pendingWon.current = null;
            setBurst(id);
            const t = setTimeout(() => setBurst(null), 1300);

            return () => clearTimeout(t);
        }
    }, [board.data]);

    const drop = async (stage: EnquiryBoard['stages'][number]) => {
        const e = dragging;
        setDragging(null);
        setOver(null);
        if (!e || e.stage?.id === stage.id) return;
        if ((stage.group ?? 'open') !== 'open') {
            if (stage.group === 'won') pendingWon.current = e.id;
            setClosing({ enquiry: e, stage });

            return;
        }
        try {
            await api(`contacts/${e.contact_id}/stage`, {
                method: 'POST',
                body: { stage_id: stage.id, version: e.stage_version, enquiry_id: e.id, via: 'leads' },
            });
            toast.success(`${e.title ?? `Enquiry ${e.number}`} → ${stage.name}`);
        } catch (err) {
            toast.error(errorMessage(err));
            if (!(err instanceof ApiError) || err.status !== 409) return;
        } finally {
            invalidateEnquiry(qc, e.contact_id);
        }
    };

    const s = board.data?.stats;

    return (
        <>
            <PageHeader title="Enquiries pipeline" description="Every enquiry by stage. Money counts verified payments apart from Wons marked by staff." />
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {s ? (
                    <>
                        <Stat value={AED(s.open_value)} label={`Open pipeline · ${s.open_count} enquiries (${s.open_valued} valued)`} />
                        <Stat value={AED(s.won_marked_30d)} label="Won (marked) · last 30 days" />
                        <Stat value={AED(s.paid_verified_30d)} label="Paid (verified) · last 30 days" tone="good" />
                        <Stat
                            value={String(s.open_without_next_step)}
                            label="Open enquiries with no next step"
                            tone={s.open_without_next_step > 0 ? 'warn' : undefined}
                        />
                    </>
                ) : (
                    [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[68px]" />)
                )}
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <form
                    className="relative w-full sm:w-64"
                    onSubmit={(e) => {
                        e.preventDefault();
                        setQ(search.trim());
                    }}
                >
                    <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Enquiry or customer"
                        className="pl-8"
                        aria-label="Search enquiries"
                    />
                </form>
                {(
                    [
                        [
                            owner,
                            setOwner,
                            [
                                ['all', 'All owners'],
                                ['me', 'Mine'],
                                ['none', 'No owner'],
                            ],
                        ],
                        [
                            filter,
                            setFilter,
                            [
                                ['all', 'All'],
                                ['no_next_step', 'No next step'],
                                ['overdue', 'Overdue'],
                            ],
                        ],
                    ] as const
                ).map(([value, set, options], i) => (
                    <div key={i} className="inline-flex rounded-md border bg-card p-0.5" role="group">
                        {options.map(([k, l]) => (
                            <button
                                key={k}
                                type="button"
                                aria-pressed={value === k}
                                onClick={() => (set as (v: string) => void)(k)}
                                className={cn(
                                    'rounded px-2.5 py-1 text-[12.5px] font-medium',
                                    value === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {l}
                            </button>
                        ))}
                    </div>
                ))}
            </div>
            {!board.data ? (
                <Skeleton className="h-80" />
            ) : board.data.stages.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-[13px] text-muted-foreground">
                    No stages yet. Add them under Segments, tags, fields & stages › Stages.
                </p>
            ) : (
                <div className="flex gap-3 overflow-x-auto pb-3" role="region" aria-label="Stages">
                    {board.data.stages.map((stage) => (
                        <section
                            key={stage.id}
                            aria-label={stage.name}
                            onDragOver={(e) => {
                                if (!dragging) return;
                                e.preventDefault();
                                setOver(stage.id);
                            }}
                            onDragLeave={() => setOver((o) => (o === stage.id ? null : o))}
                            onDrop={(e) => {
                                e.preventDefault();
                                void drop(stage);
                            }}
                            className={cn('flex w-64 shrink-0 flex-col rounded-lg bg-muted/60 p-2', over === stage.id && 'ring-2 ring-primary/50')}
                        >
                            <header className="mb-2 px-1">
                                <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: stageDot(stage) }} aria-hidden />
                                    {stage.name}
                                    {(stage.group ?? 'open') !== 'open' && <span className="sr-only">({stage.group})</span>}
                                </p>
                                <p className="text-[11.5px] text-muted-foreground">
                                    {stage.count} · {AED(stage.value)}
                                </p>
                            </header>
                            <ul className="grid gap-2">
                                {stage.enquiries.map((e) => (
                                    <Card
                                        key={e.id}
                                        enquiry={e}
                                        draggable={canMove}
                                        onDragStart={(ev) => {
                                            ev.dataTransfer.effectAllowed = 'move';
                                            setDragging(e);
                                        }}
                                        onDragEnd={() => (setDragging(null), setOver(null))}
                                        dragging={dragging?.id === e.id}
                                        burst={burst === e.id}
                                    />
                                ))}
                                {stage.enquiries.length === 0 && (
                                    <li className="rounded-md border border-dashed px-2 py-6 text-center text-[12px] text-muted-foreground">
                                        {canMove ? 'Drop an enquiry here' : 'Nothing here'}
                                    </li>
                                )}
                            </ul>
                        </section>
                    ))}
                </div>
            )}
            {board.data?.truncated && (
                <p className="text-[12px] text-muted-foreground">Showing the 200 most recently active enquiries. Search or filter to narrow it down.</p>
            )}
            {closing && <CloseEnquiryDialog enquiry={closing.enquiry} stage={closing.stage} open onOpenChange={(o) => !o && setClosing(null)} />}
        </>
    );
}
