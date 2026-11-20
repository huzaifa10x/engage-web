'use client';

import { useQueryClient } from '@tanstack/react-query';
import { MessageCircleIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { useSession } from '@/components/app/session';
import { burst } from '@/components/inbox/context-panel';
import { useNow } from '@/components/inbox/conversation-list';
import { OwnerAvatar } from '@/components/inbox/window-ring';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError, errorMessage } from '@/lib/api';
import { aedK, fmtDay, fmtMoney } from '@/lib/inbox';
import { P } from '@/lib/permissions';
import { useEnquiryBoard } from '@/lib/queries';
import type { CrmStage, Enquiry, EnquiryBoard } from '@/lib/types';
import { cn } from '@/lib/utils';

import { useOpenContact } from './contact-sheet';
import { useTeamOwners } from './crm-fields';
import { CloseEnquiryDialog, invalidateEnquiry } from './enquiry-card';

// Open stages in order: brand, violet, blue, amber…; Won green, Lost grey.
const OPEN_DOTS = ['var(--brand-500)', '#7c3aed', '#2563eb', '#ca8a04', '#0e7490', '#db2777'];

export function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
    return (
        <span className="inline-flex overflow-hidden rounded-md border bg-card" role="group">
            {options.map(([k, l]) => (
                <button
                    key={k}
                    type="button"
                    aria-pressed={value === k}
                    onClick={() => onChange(k)}
                    className={cn(
                        'h-[26px] px-2.5 text-[13px]',
                        value === k ? 'bg-primary font-semibold text-primary-foreground' : 'text-ink-2 hover:bg-muted',
                    )}
                >
                    {l}
                </button>
            ))}
        </span>
    );
}

export function BStat({ value, label, warn = false }: { value: string; label: string; warn?: boolean }) {
    return (
        <div className="rounded-lg border bg-card px-3 py-2">
            <b className={cn('block text-[17px] font-semibold tracking-tight tabular-nums', warn && 'text-warn')}>{value}</b>
            <span className="text-[11px] text-muted-foreground">{label}</span>
        </div>
    );
}

/**
 * Contacts & CRM › Deals pipeline (3.5): one card per deal across all contacts. Drag a card to change
 * stage; Won or Lost asks about open tasks. Same deal records as the inbox Sales card.
 */
export function EnquiryBoardView() {
    const { can } = useSession();
    const qc = useQueryClient();
    const router = useRouter();
    const now = useNow();
    const openContact = useOpenContact();
    const owners = useTeamOwners();
    const [owner, setOwner] = useState('');
    const [filter, setFilter] = useState<'' | 'no_next_step' | 'overdue'>('');
    const board = useEnquiryBoard({ owner: owner || null, filter: filter || null, search: null });
    const [dragging, setDragging] = useState<Enquiry | null>(null);
    const [over, setOver] = useState<string | null>(null);
    const [closing, setClosing] = useState<{ enquiry: Enquiry; stage: CrmStage } | null>(null);
    const cards = useRef(new Map<string, HTMLElement>());
    const canMove = can(P.StagesChange) || can(P.ContactsUpdate);
    const s = board.data?.stats;
    let openIndex = 0;
    const dots = new Map(
        (board.data?.stages ?? []).map((st) => [
            st.id,
            st.group === 'won' ? 'var(--good)' : st.group === 'lost' ? 'var(--faint)' : OPEN_DOTS[openIndex++ % OPEN_DOTS.length],
        ]),
    );

    const drop = async (stage: EnquiryBoard['stages'][number]) => {
        const e = dragging;
        setDragging(null);
        setOver(null);
        if (!e || e.stage?.id === stage.id) return;
        if ((stage.group ?? 'open') !== 'open') return setClosing({ enquiry: e, stage });
        try {
            await api(`contacts/${e.contact_id}/stage`, {
                method: 'POST',
                body: { stage_id: stage.id, version: e.stage_version, enquiry_id: e.id, via: 'leads' },
            });
            toast.success(`Moved to ${stage.name} · saved to the inbox Sales card`);
        } catch (err) {
            toast.error(errorMessage(err));
            if (!(err instanceof ApiError) || err.status !== 409) return;
        } finally {
            invalidateEnquiry(qc, e.contact_id);
        }
    };

    return (
        <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <BStat value={aedK(s?.open_value ?? 0)} label={`Open pipeline · ${s?.open_count ?? 0} deals`} />
                <BStat value={aedK(s?.won_marked_30d ?? 0)} label="Won · last 30 days" />
                <BStat value={String(s?.open_without_next_step ?? 0)} label="Open deals with no next step" warn={(s?.open_without_next_step ?? 0) > 0} />
                <span className="flex-1" />
                <select
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    aria-label="Owner"
                    className="h-8 rounded-md border border-input bg-card px-2 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
                >
                    <option value="">All owners</option>
                    {owners.map((o) => (
                        <option key={o.id} value={o.id}>
                            {o.name.split(' ')[0]}
                        </option>
                    ))}
                </select>
                <Seg
                    value={filter}
                    onChange={setFilter}
                    options={[
                        ['', 'All'],
                        ['no_next_step', 'No next step'],
                        ['overdue', 'Overdue'],
                    ]}
                />
            </div>
            {!board.data ? (
                <Skeleton className="h-80" />
            ) : board.data.stages.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-[13px] text-muted-foreground">No stages yet.</p>
            ) : (
                <div
                    className="grid items-start gap-2.5 overflow-x-auto pb-2.5"
                    style={{ gridTemplateColumns: `repeat(${board.data.stages.length}, minmax(210px, 1fr))` }}
                    role="region"
                    aria-label="Deals pipeline"
                >
                    {board.data.stages.map((stage) => (
                        <section
                            key={stage.id}
                            aria-label={stage.name}
                            onDragOver={(e) => {
                                if (!dragging) return;
                                e.preventDefault();
                                setOver(stage.id);
                            }}
                            onDragLeave={(e) => {
                                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === stage.id ? null : o));
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                void drop(stage);
                            }}
                            className={cn(
                                'min-h-60 rounded-[10px] border border-transparent bg-[#f0efed] p-2 transition-colors duration-150 motion-reduce:transition-none',
                                over === stage.id && 'border-dashed border-brand-500 bg-brand-50',
                            )}
                        >
                            <header className="flex flex-col px-1 pt-1 pb-2 text-[13px] font-semibold">
                                <b className="flex items-center gap-1.5 font-semibold">
                                    <span className="size-2 rounded-full" style={{ background: dots.get(stage.id) }} aria-hidden />
                                    {stage.name}
                                </b>
                                <span className="text-[11px] font-normal text-muted-foreground tabular-nums">
                                    {stage.count} · {aedK(stage.value)}
                                </span>
                            </header>
                            {stage.enquiries.map((d) => {
                                const step = d.next_step;
                                const late = !!step && new Date(step.due_at).getTime() < now;

                                return (
                                    <div
                                        key={d.id}
                                        ref={(el) => {
                                            if (el) cards.current.set(d.id, el);
                                            else cards.current.delete(d.id);
                                        }}
                                        draggable={canMove}
                                        onDragStart={(e) => {
                                            e.dataTransfer.effectAllowed = 'move';
                                            setDragging(d);
                                        }}
                                        onDragEnd={() => (setDragging(null), setOver(null))}
                                        className={cn(
                                            'relative mb-2 rounded-lg border bg-card p-2.5 text-[13px] transition-[box-shadow,border-color,transform] duration-150 hover:border-[#d6d3d1] motion-reduce:transition-none',
                                            canMove && 'cursor-grab active:cursor-grabbing',
                                            dragging?.id === d.id && 'translate-y-[-2px] rotate-1 border-brand-500/40 shadow-[0_12px_28px_rgba(28,25,23,.15)]',
                                        )}
                                    >
                                        <b className="block pr-6 leading-snug font-semibold" dir="auto">
                                            {d.title ?? `Enquiry ${d.number}`}
                                        </b>
                                        {d.contact && (
                                            <div className="mt-1 flex items-center gap-2">
                                                <Avatar name={d.contact.name} className="size-5 text-[9px]" />
                                                <button
                                                    type="button"
                                                    className="min-w-0 truncate text-left text-[13px] font-semibold text-brand-600 hover:underline"
                                                    onClick={() => openContact(d.contact_id)}
                                                >
                                                    {d.contact.name}
                                                </button>
                                            </div>
                                        )}
                                        <div className="mt-1 mb-1.5 font-semibold tabular-nums">{fmtMoney(d.value, d.value_period)}</div>
                                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                            {step ? (
                                                <span className={cn(late && 'font-semibold text-bad')}>
                                                    {late ? '⚠' : '→'} {step.type_label} {fmtDay(step.due_at, now)}
                                                </span>
                                            ) : d.group === 'open' ? (
                                                <span className="font-semibold text-warn">No next step</span>
                                            ) : (
                                                <span />
                                            )}
                                            <OwnerAvatar name={d.owner?.name} className="size-5 text-[9px]" />
                                        </div>
                                        {d.contact?.chat_id && (
                                            <button
                                                type="button"
                                                title="Open WhatsApp chat"
                                                aria-label="Open WhatsApp chat"
                                                onClick={() => router.push(`/inbox?c=${d.contact?.chat_id}`)}
                                                className="absolute top-2 right-1.5 rounded p-0.5 text-faint hover:bg-brand-50 hover:text-brand-600"
                                            >
                                                <MessageCircleIcon className="size-4" />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                            {stage.enquiries.length === 0 && <p className="py-5 text-center text-[13px] text-faint">Drop a deal here</p>}
                        </section>
                    ))}
                </div>
            )}
            {board.data?.truncated && (
                <p className="text-[12px] text-muted-foreground">Showing the 200 most recently active deals. Filter to narrow it down.</p>
            )}
            {closing && (
                <CloseEnquiryDialog
                    enquiry={closing.enquiry}
                    stage={closing.stage}
                    open
                    onOpenChange={(o) => !o && setClosing(null)}
                    onWon={() => {
                        const id = closing.enquiry.id;
                        // The card is in the Won column after the refetch: burst there.
                        setTimeout(() => burst(cards.current.get(id) ?? null), 350);
                    }}
                />
            )}
        </>
    );
}
