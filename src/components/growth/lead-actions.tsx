'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import { useSession } from '@/components/app/session';
import { ChangeStageButton } from '@/components/contacts/change-stage-dialog';
import { inHours, nextMonday, tomorrowAt } from '@/components/inbox/thread-tools';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { api, errorMessage } from '@/lib/api';
import { P } from '@/lib/permissions';
import { addConversationNote, keys, snoozeConversation, useMembers } from '@/lib/queries';
import type { Lead } from '@/lib/types';

/**
 * Lead details › CRM actions (Developer Handover §I.4): Open chat, Assign, Change stage, Add note,
 * Follow-up. Each calls the existing CRM / inbox API, so the change lands on the same contact and
 * conversation everyone else sees. Agents cannot reassign (no inbox.assign).
 */
export function LeadActions({ lead }: { lead: Lead }) {
    const { can, feature, membership } = useSession();
    const qc = useQueryClient();
    const [noteOpen, setNoteOpen] = useState(false);
    const [note, setNote] = useState('');
    const members = useMembers(can(P.TeamView) && can(P.InboxAssign));
    const done = (what: string) => {
        toast.success(`${what} · saved to Contacts & CRM`);
        void qc.invalidateQueries({ queryKey: keys.leadsAll });
        void qc.invalidateQueries({ queryKey: keys.conversationsAll });
        void qc.invalidateQueries({ queryKey: keys.conversation(lead.conversation_id) });
    };

    const assign = useMutation({
        mutationFn: (id: string | null) => api(`conversations/${lead.conversation_id}`, { method: 'PATCH', body: { assigned_membership_id: id } }),
        onSuccess: () => done('Assigned'),
        onError: (e) => toast.error(errorMessage(e)),
    });
    const followUp = useMutation({
        mutationFn: (until: Date) => snoozeConversation(lead.conversation_id, until.toISOString()),
        onSuccess: () => done('Follow-up scheduled'),
        onError: (e) => toast.error(errorMessage(e)),
    });
    const addNote = useMutation({
        mutationFn: () => addConversationNote(lead.conversation_id, note.trim(), []),
        onSuccess: () => {
            setNote('');
            setNoteOpen(false);
            void qc.invalidateQueries({ queryKey: ['inbox', 'notes', lead.conversation_id] });
            done('Note added');
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    return (
        <div className="flex flex-wrap gap-2">
            <Button size="sm" asChild>
                <Link href={`/inbox?c=${lead.conversation_id}`}>Open chat</Link>
            </Button>
            {can(P.InboxAssign) && members.data && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" disabled={assign.isPending}>
                            Assign
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                        <DropdownMenuItem onSelect={() => assign.mutate(null)}>Unassigned</DropdownMenuItem>
                        {members.data.data.map((m) => (
                            <DropdownMenuItem key={m.id} onSelect={() => assign.mutate(m.id)}>
                                {m.user?.name}
                                {m.id === membership.id ? ' (you)' : ''}
                                {m.id === lead.assigned?.id ? ' ✓' : ''}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
            <ChangeStageButton contact={lead.contact} via="leads" />
            {can(P.InboxReply) && feature('internal_notes').enabled && (
                <Button size="sm" variant="outline" onClick={() => setNoteOpen(true)}>
                    Add note
                </Button>
            )}
            {can(P.InboxReply) && feature('snooze').enabled && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" disabled={followUp.isPending}>
                            Follow-up
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        <DropdownMenuItem onSelect={() => followUp.mutate(inHours(3))}>In 3 hours</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => followUp.mutate(tomorrowAt(9))}>Tomorrow, 9:00</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => followUp.mutate(nextMonday())}>Monday, 9:00</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => followUp.mutate(tomorrowAt(9, 7))}>In a week</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}

            <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Add note</DialogTitle>
                        <DialogDescription>An internal note on {lead.contact.display_name}’s chat. The customer never sees it.</DialogDescription>
                    </DialogHeader>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={4}
                        maxLength={4000}
                        aria-label="Note"
                        className="w-full rounded-md border bg-card px-3 py-2 text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setNoteOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={() => addNote.mutate()} disabled={!note.trim() || addNote.isPending}>
                            Save note
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
