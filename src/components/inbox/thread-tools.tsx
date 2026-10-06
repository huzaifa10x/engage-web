'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AlarmClockIcon, StickyNoteIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { useSession } from '@/components/app/session';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { errorMessage } from '@/lib/api';
import { P } from '@/lib/permissions';
import { addConversationNote, keys, snoozeConversation, useConversationNotes, useMembers } from '@/lib/queries';
import type { Conversation } from '@/lib/types';

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000);

function tomorrowAt(hour: number, addDays = 1): Date {
    const d = new Date();
    d.setDate(d.getDate() + addDays);
    d.setHours(hour, 0, 0, 0);

    return d;
}

function nextMonday(): Date {
    const d = new Date();
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
    d.setHours(9, 0, 0, 0);

    return d;
}

/** Hide a conversation until later. It returns by itself at that time, or as soon as the customer writes. */
export function SnoozeMenu({ conversation }: { conversation: Conversation }) {
    const qc = useQueryClient();
    const { feature } = useSession();
    const snoozed = conversation.snoozed_until !== null;

    const apply = async (until: Date | null) => {
        try {
            await snoozeConversation(conversation.id, until ? until.toISOString() : null);
            toast.success(
                until ? `Snoozed until ${until.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Back in the inbox',
            );
            void qc.invalidateQueries({ queryKey: keys.conversation(conversation.id) });
            void qc.invalidateQueries({ queryKey: keys.conversationsAll });
        } catch (e) {
            toast.error(errorMessage(e));
        }
    };

    if (!feature('snooze').enabled) return null;

    if (snoozed) {
        return (
            <Button
                variant="outline"
                size="sm"
                onClick={() => apply(null)}
                title={`Snoozed until ${new Date(conversation.snoozed_until ?? '').toLocaleString()}`}
            >
                <AlarmClockIcon /> Unsnooze
            </Button>
        );
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                    <AlarmClockIcon /> Snooze
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => apply(inHours(1))}>For 1 hour</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => apply(inHours(3))}>For 3 hours</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => apply(tomorrowAt(9))}>Until tomorrow, 9:00</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => apply(nextMonday())}>Until Monday, 9:00</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => apply(tomorrowAt(9, 7))}>For a week</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/** Internal notes: seen by the team only, never sent to the customer. Teammates can be mentioned. */
export function NotesButton({ conversation }: { conversation: Conversation }) {
    const qc = useQueryClient();
    const { can, feature } = useSession();
    const [open, setOpen] = useState(false);
    const [body, setBody] = useState('');
    const [mentions, setMentions] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const notes = useConversationNotes(conversation.id, true);
    const members = useMembers(open && can(P.TeamView));
    const allowed = feature('internal_notes').enabled;
    const count = notes.data?.length ?? 0;

    const save = async () => {
        if (!body.trim()) return;
        setSaving(true);
        try {
            await addConversationNote(conversation.id, body.trim(), mentions);
            setBody('');
            setMentions([]);
            void qc.invalidateQueries({ queryKey: ['inbox', 'notes', conversation.id] });
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setSaving(false);
        }
    };

    if (!allowed && count === 0) return null;

    return (
        <>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                <StickyNoteIcon /> Notes{count > 0 ? ` (${count})` : ''}
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Internal notes</DialogTitle>
                        <DialogDescription>Only your team sees these. Nothing here is sent to the customer.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-2">
                        {count === 0 && <p className="text-[13px] text-muted-foreground">No notes yet.</p>}
                        {(notes.data ?? []).map((n) => (
                            <div key={n.id} className="rounded-md border border-warn/30 bg-warn-bg px-3 py-2">
                                <p className="text-[13.5px] break-words whitespace-pre-wrap">{n.body}</p>
                                <p className="mt-1 text-[12px] text-muted-foreground">
                                    {n.mine ? 'You' : n.author}
                                    {n.mentions.length > 0 && ` · mentioned ${n.mentions.join(', ')}`}
                                    {n.created_at && ` · ${new Date(n.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`}
                                </p>
                            </div>
                        ))}
                    </div>
                    {allowed && can(P.InboxReply) && (
                        <div className="grid gap-2 border-t pt-3">
                            <textarea
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                maxLength={4000}
                                placeholder="Write a note for your team…"
                                aria-label="New note"
                                className="field-sizing-content min-h-20 w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm leading-5 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
                            />
                            {(members.data?.data ?? []).length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
                                    Mention:
                                    {(members.data?.data ?? []).map((m) => (
                                        <button
                                            key={m.id}
                                            type="button"
                                            aria-pressed={mentions.includes(m.id)}
                                            onClick={() => setMentions((cur) => (cur.includes(m.id) ? cur.filter((x) => x !== m.id) : [...cur, m.id]))}
                                            className={`rounded-full border px-2 py-0.5 ${mentions.includes(m.id) ? 'border-brand-500 bg-brand-50 font-semibold text-brand-600' : 'hover:bg-muted'}`}
                                        >
                                            @{m.user?.name ?? 'Member'}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="flex justify-end">
                                <Button onClick={save} disabled={saving || !body.trim()}>
                                    {saving ? 'Saving…' : 'Add note'}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
