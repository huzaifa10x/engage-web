'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClockIcon, CheckIcon, MessageCircleIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';

import { Forbidden } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { BottomSheet, LargeTitle, Segmented } from '@/components/mobile/kit';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api, errorMessage } from '@/lib/api';
import { fmtDay, fmtTime } from '@/lib/inbox';
import { undoToast } from '@/lib/mobile';
import { P } from '@/lib/permissions';
import type { NextStep } from '@/lib/types';
import { cn } from '@/lib/utils';

type Bucket = 'overdue' | 'today' | 'upcoming' | 'done';
type Row = NextStep & { contact: { id: string; name: string; deleted: boolean } | null; chat_id: string | null };
type Feed = { data: Row[]; meta: { counts: Record<Bucket, number>; everyone: boolean; can_see_everyone: boolean } };

const EDGE: Record<Bucket, string> = { overdue: 'border-l-bad', today: 'border-l-warn', upcoming: 'border-l-line-2', done: 'border-l-good' };

/** Reschedule presets: in 1 hour, tomorrow 09:00, next Monday 09:00. */
function preset(kind: 'hour' | 'tomorrow' | 'monday'): Date {
    const d = new Date();
    if (kind === 'hour') return new Date(d.getTime() + 3_600_000);
    if (kind === 'tomorrow') d.setDate(d.getDate() + 1);
    else d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
    d.setHours(9, 0, 0, 0);

    return d;
}
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/**
 * Follow-ups (mobile brief v5): every customer's next steps by due date: Overdue, Today, Upcoming,
 * Done (last 30 days), Mine or Everyone for people who see every chat. Open the chat, reschedule
 * (1 hour, tomorrow 09:00, next Monday, or pick), complete with Undo; tap to edit or delete. The same
 * records as the contact's next steps on a computer. Resolving a chat doesn't complete them.
 */
function FollowUps() {
    const { can } = useSession();
    const qc = useQueryClient();
    const router = useRouter();
    const params = useSearchParams();
    const bucket = (['overdue', 'today', 'upcoming', 'done'].includes(params.get('bucket') ?? '') ? params.get('bucket') : 'today') as Bucket;
    const [who, setWho] = useState<'mine' | 'everyone'>('mine');
    const [moving, setMoving] = useState<Row | null>(null);
    const [editing, setEditing] = useState<Row | null>(null);
    const feed = useQuery({
        queryKey: ['next-steps', bucket, who],
        queryFn: () => api<Feed>('next-steps', { query: { bucket, who } }),
    });
    const counts = feed.data?.meta.counts;
    const reload = () => qc.invalidateQueries({ queryKey: ['next-steps'] });
    const patch = async (s: Row, body: Record<string, unknown>) => {
        await api(`next-steps/${s.id}`, { method: 'PATCH', body });
        await reload();
        void qc.invalidateQueries({ queryKey: ['dashboard'] });
    };
    const complete = async (s: Row) => {
        try {
            await patch(s, { status: 'done' });
            undoToast(`Done · ${s.title}`, () => patch(s, { status: 'open' }));
        } catch (e) {
            toast.error(errorMessage(e));
        }
    };
    const reschedule = async (s: Row, at: Date) => {
        setMoving(null);
        try {
            await patch(s, { due_at: at.toISOString(), ...(s.status !== 'open' ? { status: 'open' } : {}) });
            toast.success(`Moved to ${fmtDay(at.toISOString())} ${fmtTime(at.toISOString())}`);
        } catch (e) {
            toast.error(errorMessage(e));
        }
    };
    if (!can(P.ContactsView)) return <Forbidden />;
    const canEdit = can(P.ContactsUpdate);

    return (
        <div className="mx-auto max-w-xl">
            <LargeTitle title="Follow-ups">
                <Segmented
                    value={bucket}
                    onChange={(b) => router.replace(`/next-steps?bucket=${b}`, { scroll: false })}
                    options={[
                        ['overdue', `Overdue${counts?.overdue ? ` ${counts.overdue}` : ''}`],
                        ['today', `Today${counts?.today ? ` ${counts.today}` : ''}`],
                        ['upcoming', `Later${counts?.upcoming ? ` ${counts.upcoming}` : ''}`],
                        ['done', 'Done'],
                    ]}
                    label="When"
                />
                {feed.data?.meta.can_see_everyone && (
                    <div className="mt-2 w-48">
                        <Segmented
                            value={who}
                            onChange={setWho}
                            options={[
                                ['mine', 'Mine'],
                                ['everyone', 'Everyone'],
                            ]}
                            label="Whose"
                        />
                    </div>
                )}
            </LargeTitle>

            <div className="mt-3 grid gap-2.5">
                {feed.isLoading && <Skeleton className="h-40 rounded-2xl" />}
                {feed.isError && <p className="text-[13px] text-bad">{errorMessage(feed.error)}</p>}
                {feed.data?.data.map((s) => (
                    <article key={s.id} className={cn('rounded-2xl border-l-4 bg-card p-3.5 shadow-[0_1px_2px_rgba(13,17,9,.05)]', EDGE[bucket])}>
                        <button type="button" className="block w-full text-left" onClick={() => canEdit && setEditing(s)} disabled={!canEdit}>
                            <span className="flex items-baseline justify-between gap-2">
                                <b className="min-w-0 truncate text-[15px] font-semibold">{s.contact?.name ?? 'Deleted contact'}</b>
                                <span className={cn('shrink-0 text-[12.5px] font-semibold', s.overdue ? 'text-bad' : 'text-muted-foreground')}>
                                    {bucket === 'done' && s.done_at ? `Done ${fmtDay(s.done_at)}` : `${fmtDay(s.due_at)} ${fmtTime(s.due_at)}`}
                                </span>
                            </span>
                            <span className="mt-0.5 block text-[14px]">
                                {s.type_label}
                                {s.title && s.title !== s.type_label ? ` · ${s.title}` : ''}
                            </span>
                            <span className="mt-0.5 block text-[12.5px] text-muted-foreground">{s.assigned?.name ?? 'No owner'}</span>
                        </button>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                            {s.chat_id && (
                                <Link
                                    href={`/inbox?c=${s.chat_id}`}
                                    className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-semibold"
                                >
                                    <MessageCircleIcon className="size-4" aria-hidden /> Open chat
                                </Link>
                            )}
                            {canEdit && s.status === 'open' && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => setMoving(s)}
                                        className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-semibold"
                                    >
                                        <CalendarClockIcon className="size-4" aria-hidden /> Reschedule
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void complete(s)}
                                        className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-primary px-3 text-[13px] font-bold text-primary-foreground"
                                    >
                                        <CheckIcon className="size-4" aria-hidden /> Complete
                                    </button>
                                </>
                            )}
                        </div>
                    </article>
                ))}
                {feed.data && feed.data.data.length === 0 && (
                    <p className="mt-8 text-center text-[14px] text-muted-foreground">
                        {bucket === 'overdue'
                            ? 'Nothing overdue 🎉'
                            : bucket === 'today'
                              ? 'No follow-ups due today'
                              : bucket === 'upcoming'
                                ? 'Nothing planned yet'
                                : 'Nothing done in the last 30 days'}
                    </p>
                )}
                <p className="mt-2 text-center text-[12.5px] text-muted-foreground">Add a follow-up from a chat: ⋯ → Add a follow-up.</p>
            </div>

            <BottomSheet open={moving !== null} onOpenChange={(o) => !o && setMoving(null)} title="Reschedule">
                {moving && <RescheduleOptions onPick={(d) => void reschedule(moving, d)} />}
            </BottomSheet>
            <BottomSheet open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title="Edit follow-up">
                {editing && (
                    <EditStep
                        step={editing}
                        onSave={async (body) => {
                            await patch(editing, body);
                            setEditing(null);
                            toast.success('Follow-up saved');
                        }}
                        onDelete={async () => {
                            const s = editing;
                            await patch(s, { status: 'cancelled', cancel_reason: 'Deleted' });
                            setEditing(null);
                            undoToast('Follow-up deleted', () => patch(s, { status: 'open' }));
                        }}
                    />
                )}
            </BottomSheet>
        </div>
    );
}

function RescheduleOptions({ onPick }: { onPick: (d: Date) => void }) {
    const [custom, setCustom] = useState(() => localInput(preset('tomorrow')));
    const row = 'flex min-h-13 w-full items-center px-4 text-left text-[15px] font-semibold active:bg-muted';

    return (
        <>
            <button type="button" className={row} onClick={() => onPick(preset('hour'))}>
                In 1 hour
            </button>
            <button type="button" className={row} onClick={() => onPick(preset('tomorrow'))}>
                Tomorrow 09:00
            </button>
            <button type="button" className={row} onClick={() => onPick(preset('monday'))}>
                Next Monday 09:00
            </button>
            <div className="flex items-center gap-2 px-4 py-3">
                <Input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Pick a time" className="flex-1" />
                <button
                    type="button"
                    onClick={() => custom && onPick(new Date(custom))}
                    className="h-10 rounded-[10px] bg-primary px-3.5 text-[13px] font-bold text-primary-foreground"
                >
                    Set
                </button>
            </div>
        </>
    );
}

function EditStep({ step, onSave, onDelete }: { step: Row; onSave: (body: Record<string, unknown>) => Promise<void>; onDelete: () => Promise<void> }) {
    const [title, setTitle] = useState(step.title);
    const [due, setDue] = useState(() => localInput(new Date(step.due_at)));
    const [busy, setBusy] = useState(false);
    const run = async (fn: () => Promise<void>) => {
        setBusy(true);
        try {
            await fn();
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="grid gap-3 px-4 pt-1 pb-2">
            <label className="grid gap-1 text-[13px] font-semibold">
                What
                <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
            </label>
            <label className="grid gap-1 text-[13px] font-semibold">
                Due
                <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
            </label>
            <button
                type="button"
                disabled={busy || !title.trim() || !due}
                onClick={() => void run(() => onSave({ title: title.trim(), due_at: new Date(due).toISOString() }))}
                className="h-12 rounded-xl bg-primary text-[15px] font-bold text-primary-foreground disabled:opacity-50"
            >
                Save
            </button>
            <button type="button" disabled={busy} onClick={() => void run(onDelete)} className="h-11 text-[14px] font-semibold text-bad">
                Delete follow-up
            </button>
        </div>
    );
}

export default function NextStepsPage() {
    return (
        <Suspense>
            <FollowUps />
        </Suspense>
    );
}
