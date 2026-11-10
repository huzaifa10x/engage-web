'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { ResizeHandle } from '@/components/app/resize-handle';
import { ChangeStageButton } from '@/components/contacts/change-stage-dialog';
import { ContactDialog } from '@/components/contacts/contact-dialog';
import { StageBadge } from '@/components/contacts/stage-badge';
import { SourceSection } from '@/components/growth/source-section';
import { ContactOrders } from '@/components/inbox/contact-orders';
import { useSession } from '@/components/app/session';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStored } from '@/hooks/use-stored';
import { api, errorMessage } from '@/lib/api';
import { dateTime, humanize, timeLeft } from '@/lib/format';
import { P } from '@/lib/permissions';
import { keys, useAssignees } from '@/lib/queries';
import type { Contact, Conversation } from '@/lib/types';

const UNASSIGNED = '__none__';

export function ContactPanel({ conversation }: { conversation: Conversation }) {
    const { can, membership } = useSession();
    const qc = useQueryClient();
    const assignees = useAssignees(conversation.id, can(P.InboxAssign));
    const contact = conversation.contact;
    const [width, setWidth] = useStored<number>('engage.inbox.panel-width', 320);
    const [crmOpen, setCrmOpen] = useState(false);

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
            api<{ data: Contact; meta?: { changed: boolean; confirmation: { status: string; message: string } | null } }>(`contacts/${contact?.id}/consent`, {
                method: 'POST',
                body: { state, note: 'Changed from the inbox', notify: true, conversation_id: conversation.id },
            }),
        onSuccess: (r, state) => {
            const what = state === 'opted_in' ? 'Opt-in recorded.' : 'Opt-out recorded.';
            const c = r.meta?.confirmation;
            if (!c || c.status === 'sent') {
                toast.success(c ? `${what} ${c.message}` : what);
            } else if (c.status === 'failed') {
                toast.error(c.message);
            } else {
                toast.warning(`${what} ${c.message}`);
            }
            refresh();
            void qc.invalidateQueries({ queryKey: keys.thread(conversation.id) });
        },
        onError: (e) => toast.error(`The consent could not be recorded: ${errorMessage(e)}`),
    });

    if (!contact) return null;

    return (
        <>
            <ResizeHandle
                className="hidden xl:block"
                label="Resize the contact details panel"
                direction="left"
                width={width}
                min={260}
                max={520}
                onResize={setWidth}
                onReset={() => setWidth(320)}
            />
            <aside
                className="hidden h-full min-h-0 w-(--panel-width) shrink-0 overflow-y-auto border-l bg-card xl:block"
                style={{ '--panel-width': `${width}px` } as React.CSSProperties}
                aria-label="Contact details"
            >
                <div className="flex flex-col items-center border-b px-5 py-6 text-center">
                    <Avatar name={contact.display_name} className="size-16 text-lg" />
                    <p className="mt-3 text-[15px] font-semibold">{contact.display_name}</p>
                    {contact.phone && <p className="font-mono text-[13px] text-muted-foreground">{contact.phone}</p>}
                    {contact.username && <p className="text-[13px] text-muted-foreground">@{contact.username}</p>}
                </div>

                <SourceSection contact={contact} />

                {/* Contacts & CRM owns the stage: shown here, changed only through "Change stage" (prototype › Contact). */}
                <section className="grid gap-2.5 border-b px-5 py-4 text-[13px]" aria-label="Contact">
                    <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Contact</h4>
                    <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
                        <dt className="text-muted-foreground">Stage</dt>
                        <dd>
                            <StageBadge stage={contact.stage} />
                        </dd>
                        <dt className="text-muted-foreground">First contact</dt>
                        <dd>{dateTime(contact.created_at)}</dd>
                    </dl>
                    <div className="flex flex-wrap gap-2">
                        <ChangeStageButton contact={contact} via="chat" />
                        {can(P.ContactsView) && (
                            <Button size="sm" variant="outline" onClick={() => setCrmOpen(true)}>
                                Open CRM record
                            </Button>
                        )}
                    </div>
                    {crmOpen && <ContactDialog open={crmOpen} onOpenChange={setCrmOpen} contact={contact} />}
                </section>

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
                        {can(P.InboxAssign) && assignees.data ? (
                            <Select
                                value={conversation.assigned_membership_id ?? UNASSIGNED}
                                onValueChange={(v) => update.mutate({ assigned_membership_id: v === UNASSIGNED ? null : v })}
                            >
                                <SelectTrigger size="sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                                    {assignees.data.map((m) => (
                                        // Teammates without this number can't take the chat: shown, but not selectable.
                                        <SelectItem key={m.id} value={m.id} disabled={!m.can_access}>
                                            {m.name}
                                            {m.id === membership.id ? ' (you)' : ''}
                                            {!m.can_access ? ' · no access to this number' : ''}
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
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => consent.mutate('opted_in')}
                                    disabled={consent.isPending}
                                    title="Record that the customer agreed to receive messages. If they wrote in the last 24 hours, they also get your opt-in confirmation (Consent & Privacy settings)."
                                >
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
                        <dt className="text-muted-foreground">{contact.acquisition ? 'Added via' : 'Source'}</dt>
                        <dd>{humanize(contact.source)}</dd>
                        <dt className="text-muted-foreground">Last message</dt>
                        <dd>{dateTime(contact.last_inbound_at)}</dd>
                        <dt className="text-muted-foreground">Via</dt>
                        <dd className="truncate">{conversation.phone_number?.verified_name ?? conversation.phone_number?.display_phone_number}</dd>
                    </dl>
                </section>
                <ContactOrders contactId={contact.id} />
            </aside>
        </>
    );
}
