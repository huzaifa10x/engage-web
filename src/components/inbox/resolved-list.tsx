'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2Icon, FlagIcon, HistoryIcon, RotateCcwIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { useSession } from '@/components/app/session';
import { RingAvatar } from '@/components/inbox/window-ring';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { shortTime } from '@/lib/format';
import { REASONS } from '@/lib/inbox';
import { P } from '@/lib/permissions';
import { flagResolution, keys, useResolutions } from '@/lib/queries';
import type { Resolution, ResolutionReason } from '@/lib/types';
import { cn } from '@/lib/utils';

const REOPEN: Record<string, string> = {
    customer: 'Reopened · the customer wrote again',
    agent: 'Reopened by',
    flag: 'Reopened · flagged for review',
    message: 'Reopened · a message was sent',
};

const PERIODS = [
    { id: '7', label: 'Last 7 days' },
    { id: '30', label: 'Last 30 days' },
    { id: '90', label: 'Last 90 days' },
    { id: '0', label: 'All time' },
];

/**
 * Inbox › Resolved (3.5): one row per closure, newest first, with who closed it, why, and whether it was
 * opened again. A chat closed twice shows twice; the older row says so. Managers can flag a closure for
 * review: the chat goes back to whoever resolved it with a team note.
 */
export function ResolvedList({
    phoneNumberId,
    selectedId,
    onOpen,
    polling,
}: {
    phoneNumberId: string | null;
    selectedId: string | null;
    onOpen: (conversationId: string) => void;
    polling: boolean;
}) {
    const { can } = useSession();
    const [reason, setReason] = useState<'all' | ResolutionReason>('all');
    const [agent, setAgent] = useState('all');
    const [days, setDays] = useState('7');
    const [flagging, setFlagging] = useState<Resolution | null>(null);
    const list = useResolutions(
        { phone_number_id: phoneNumberId, reason: reason === 'all' ? null : reason, agent: agent === 'all' ? null : agent, days: Number(days) },
        polling ? 30_000 : false,
    );
    const rows = useMemo(() => list.data ?? [], [list.data]);
    // Teammates who resolved something in the period (Agents can't list the team).
    const people = useMemo(() => {
        const m = new Map<string, string>();
        for (const r of rows) if (r.resolved_by) m.set(r.resolved_by.id, r.resolved_by.name);

        return [...m];
    }, [rows]);
    const manager = can(P.InboxAssign);

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="grid grid-cols-3 gap-1 border-b px-3 py-2">
                <Select value={reason} onValueChange={(v) => setReason(v as typeof reason)}>
                    <SelectTrigger size="sm" className="w-full min-w-0" aria-label="Reason">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Any reason</SelectItem>
                        {REASONS.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                                {r.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={agent} onValueChange={setAgent}>
                    <SelectTrigger size="sm" className="w-full min-w-0" aria-label="Resolved by">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Anyone</SelectItem>
                        {people.map(([id, name]) => (
                            <SelectItem key={id} value={id}>
                                {name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={days} onValueChange={setDays}>
                    <SelectTrigger size="sm" className="w-full min-w-0" aria-label="Period">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {PERIODS.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                                {p.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Resolved chats">
                {list.isLoading &&
                    [0, 1, 2, 3].map((i) => (
                        <li key={i} className="flex gap-3 border-b border-line-2 p-3">
                            <Skeleton className="size-10 rounded-full" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-3.5 w-1/2" />
                                <Skeleton className="h-3 w-3/4" />
                            </div>
                        </li>
                    ))}
                {!list.isLoading && rows.length === 0 && (
                    <li className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
                        <CheckCircle2Icon className="size-6" />
                        {reason !== 'all' || agent !== 'all' ? 'No closures match these filters.' : 'Nothing was resolved in this period.'}
                    </li>
                )}
                {rows.map((r) => {
                    const name = r.contact?.display_name ?? 'WhatsApp user';
                    const expires = r.contact?.last_inbound_at ? new Date(new Date(r.contact.last_inbound_at).getTime() + 86_400_000).toISOString() : null;
                    const older = (r.later_closures ?? 0) > 0;

                    return (
                        <li key={r.id} className={cn('border-b border-line-2', selectedId === r.conversation_id && !older && 'bg-brand-50')}>
                            {older && (
                                <p className="flex items-center gap-1.5 bg-muted/70 px-3 py-1 text-[11px] text-muted-foreground">
                                    <HistoryIcon className="size-3" /> Older closure · this chat was closed{' '}
                                    {r.later_closures === 1 ? 'again later' : `${r.later_closures} more times later`}
                                </p>
                            )}
                            <div className="flex gap-3 px-3 py-2.5">
                                <button
                                    onClick={() => onOpen(r.conversation_id)}
                                    className="flex min-w-0 flex-1 gap-3 text-left"
                                    aria-label={`Open the chat with ${name}`}
                                >
                                    <RingAvatar name={name} expiresAt={expires} hasChat={!!r.contact?.last_inbound_at} className="size-10 text-[13px]" />
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-baseline gap-2">
                                            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{name}</span>
                                            <span className="shrink-0 text-[11px] text-muted-foreground">{shortTime(r.resolved_at)}</span>
                                        </span>
                                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                                            <Badge tone={r.reason === 'resolved' ? 'good' : 'grey'} className="text-[11px]">
                                                {r.reason_label}
                                            </Badge>
                                            <span className="text-[12px] text-muted-foreground">by {r.resolved_by?.name ?? 'the chatbot'}</span>
                                        </span>
                                        {r.reopened_at && (
                                            <span className="mt-1 flex items-center gap-1 text-[12px] text-info">
                                                <RotateCcwIcon className="size-3" />
                                                {r.reopen_how === 'agent'
                                                    ? `${REOPEN.agent} ${r.reopened_by?.name ?? 'a teammate'}`
                                                    : REOPEN[r.reopen_how ?? 'customer']}{' '}
                                                · {shortTime(r.reopened_at)}
                                            </span>
                                        )}
                                        {r.flag && (
                                            <span className="mt-1 flex items-start gap-1 text-[12px] text-warn">
                                                <FlagIcon className="mt-0.5 size-3 shrink-0" />
                                                <span className="min-w-0">
                                                    Flagged by {r.flag.by.name}: <span className="text-ink-2">{r.flag.note}</span>
                                                </span>
                                            </span>
                                        )}
                                    </span>
                                </button>
                                {manager && !r.flag && (
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        className="self-center"
                                        title="Flag for review: reopens the chat for whoever resolved it, with your note"
                                        aria-label={`Flag the closure of ${name} for review`}
                                        onClick={() => setFlagging(r)}
                                    >
                                        <FlagIcon />
                                    </Button>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ul>
            <FlagDialog resolution={flagging} onClose={() => setFlagging(null)} onOpen={onOpen} />
        </div>
    );
}

function FlagDialog({ resolution, onClose, onOpen }: { resolution: Resolution | null; onClose: () => void; onOpen: (id: string) => void }) {
    const qc = useQueryClient();
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const name = resolution?.contact?.display_name ?? 'this chat';
    const who = resolution?.resolved_by?.name;

    const submit = async () => {
        if (!resolution) return;
        if (note.trim().length < 3) return setError('Say what should be reviewed.');
        setBusy(true);
        setError(null);
        try {
            await flagResolution(resolution.id, note.trim());
            void qc.invalidateQueries({ queryKey: ['inbox', 'resolutions'] });
            void qc.invalidateQueries({ queryKey: keys.conversationsAll });
            void qc.invalidateQueries({ queryKey: keys.conversation(resolution.conversation_id) });
            toast.success(`${name} · flagged for review${who ? ` · back with ${who}` : ''}`, {
                action: { label: 'Open chat', onClick: () => onOpen(resolution.conversation_id) },
            });
            setNote('');
            onClose();
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={!!resolution} onOpenChange={(o) => !o && (setNote(''), setError(null), onClose())}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Flag for review</DialogTitle>
                    <DialogDescription>
                        The chat with {name} reopens{who ? ` and goes back to ${who}` : ''}. Your note is added for the team only; the customer sees nothing.
                    </DialogDescription>
                </DialogHeader>
                <label className="grid gap-1.5 text-[13px] font-semibold">
                    What should be reviewed?
                    <textarea
                        autoFocus
                        value={note}
                        maxLength={300}
                        onChange={(e) => setNote(e.target.value)}
                        rows={3}
                        placeholder="The customer asked about pricing before this was closed."
                        className="resize-none rounded-md border border-input bg-card px-3 py-2 text-sm font-normal outline-none placeholder:text-faint focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
                    />
                </label>
                {error && <p className="text-[13px] text-bad">{error}</p>}
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={busy}>
                        <FlagIcon /> {busy ? 'Flagging…' : 'Flag and reopen'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
