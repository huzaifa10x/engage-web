'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useSession } from '@/components/app/session';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, errorMessage } from '@/lib/api';
import { dateTime, humanize, timeLeft } from '@/lib/format';
import { P } from '@/lib/permissions';
import { keys, useMembers } from '@/lib/queries';
import type { Contact, Conversation } from '@/lib/types';

const UNASSIGNED = '__none__';

export function ContactPanel({ conversation }: { conversation: Conversation }) {
    const { can, membership } = useSession();
    const qc = useQueryClient();
    const members = useMembers(can(P.TeamView) && can(P.InboxAssign));
    const contact = conversation.contact;

    const refresh = () => {
        void qc.invalidateQueries({ queryKey: keys.conversation(conversation.id) });
        void qc.invalidateQueries({ queryKey: keys.conversationsAll });
    };

    const update = useMutation({
        mutationFn: (body: { status?: 'open' | 'closed'; assigned_membership_id?: string | null }) =>
            api(`conversations/${conversation.id}`, { method: 'PATCH', body }),
        onSuccess: refresh,
        onError: (e) => toast.error(errorMessage(e)),
    });

    const consent = useMutation({
        mutationFn: (state: 'opted_in' | 'opted_out') =>
            api<{ data: Contact }>(`contacts/${contact?.id}/consent`, { method: 'POST', body: { state, note: 'Changed from the inbox' } }),
        onSuccess: () => {
            toast.success('Consent updated');
            refresh();
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    if (!contact) return null;

    return (
        <aside className="hidden h-full min-h-0 w-80 shrink-0 overflow-y-auto border-l bg-card xl:block" aria-label="Contact details">
            <div className="flex flex-col items-center border-b px-5 py-6 text-center">
                <Avatar name={contact.display_name} className="size-16 text-lg" />
                <p className="mt-3 text-[15px] font-semibold">{contact.display_name}</p>
                {contact.phone && <p className="font-mono text-[13px] text-muted-foreground">{contact.phone}</p>}
                {contact.username && <p className="text-[13px] text-muted-foreground">@{contact.username}</p>}
            </div>

            <section className="grid gap-3 border-b px-5 py-4 text-[13px]">
                <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Service window</span>
                    <Badge tone={conversation.window.open ? 'good' : 'grey'}>
                        {conversation.window.open ? `${timeLeft(conversation.window.expires_at)} left` : 'Closed'}
                    </Badge>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Conversation</span>
                    {can(P.InboxView) && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => update.mutate({ status: conversation.status === 'open' ? 'closed' : 'open' })}
                            disabled={update.isPending}
                        >
                            {conversation.status === 'open' ? 'Close' : 'Reopen'}
                        </Button>
                    )}
                </div>
                <div className="grid gap-1.5">
                    <span className="text-muted-foreground">Assigned to</span>
                    {can(P.InboxAssign) && members.data ? (
                        <Select
                            value={conversation.assigned_membership_id ?? UNASSIGNED}
                            onValueChange={(v) => update.mutate({ assigned_membership_id: v === UNASSIGNED ? null : v })}
                        >
                            <SelectTrigger size="sm">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                                {members.data.data.map((m) => (
                                    <SelectItem key={m.id} value={m.id}>
                                        {m.user?.name}
                                        {m.id === membership.id ? ' (you)' : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                        <span className="font-medium">
                            {conversation.assigned_membership_id === null
                                ? 'Unassigned'
                                : conversation.assigned_membership_id === membership.id
                                  ? 'You'
                                  : 'A teammate'}
                        </span>
                    )}
                </div>
            </section>

            <section className="grid gap-3 px-5 py-4 text-[13px]">
                <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Consent</span>
                    <Badge tone={contact.consent_state === 'opted_out' ? 'bad' : contact.consent_state === 'opted_in' ? 'good' : 'grey'}>
                        {humanize(contact.consent_state)}
                    </Badge>
                </div>
                {contact.marketing_opted_out && <p className="rounded-md bg-warn-bg px-2.5 py-1.5 text-warn">Stopped marketing messages in WhatsApp.</p>}
                {can(P.ContactsUpdate) && (
                    <div className="flex gap-2">
                        {contact.consent_state !== 'opted_in' && (
                            <Button size="sm" variant="outline" onClick={() => consent.mutate('opted_in')} disabled={consent.isPending}>
                                Record opt-in
                            </Button>
                        )}
                        {contact.consent_state !== 'opted_out' && (
                            <Button size="sm" variant="outline" onClick={() => consent.mutate('opted_out')} disabled={consent.isPending}>
                                Opt out
                            </Button>
                        )}
                    </div>
                )}
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                    {contact.email && (
                        <>
                            <dt className="text-muted-foreground">Email</dt>
                            <dd className="truncate">{contact.email}</dd>
                        </>
                    )}
                    <dt className="text-muted-foreground">Source</dt>
                    <dd>{humanize(contact.source)}</dd>
                    <dt className="text-muted-foreground">Last message</dt>
                    <dd>{dateTime(contact.last_inbound_at)}</dd>
                    <dt className="text-muted-foreground">Via</dt>
                    <dd className="truncate">{conversation.phone_number?.verified_name ?? conversation.phone_number?.display_phone_number}</dd>
                </dl>
            </section>
        </aside>
    );
}
