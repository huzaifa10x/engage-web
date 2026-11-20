'use client';

import { ResolveMenu } from './resolve-menu';
import { WINDOW_BADGE, windowState } from '@/lib/inbox';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { XIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ResizeHandle } from '@/components/app/resize-handle';
import { ChangeStageButton, useCurrentEnquiry } from '@/components/contacts/change-stage-dialog';
import { ContactLink, useOpenContact } from '@/components/contacts/contact-sheet';
import { EnquiryCard } from '@/components/contacts/enquiry-card';
import { RecordConsentDialog } from '@/components/contacts/record-consent-dialog';
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
import { contactSource, dateTime, humanize, relative, timeLeft } from '@/lib/format';
import { P } from '@/lib/permissions';
import { keys, requestConsent, useAssignees, useInboxTeams, useWaitAlerts } from '@/lib/queries';
import type { Conversation } from '@/lib/types';

const UNASSIGNED = '__none__';
const ROLE_LABEL = { agent: 'Assigned agent', manager: 'Managers', owner: 'Owner' } as const;
const CHANNEL_LABEL = { app: 'In-app notification', email: 'email', whatsapp: 'WhatsApp' } as const;
const NO_TEAM = '__no_team__';

/**
 * Contact details, assignment, consent, stage and status for the open chat. On screens narrower than
 * xl the column is hidden and the same panel opens as a slide-over (`open`, from the chat header).
 */
export function ContactPanel({ conversation, open = false, onClose }: { conversation: Conversation; open?: boolean; onClose?: () => void }) {
    const { can, membership } = useSession();
    const qc = useQueryClient();
    const assignees = useAssignees(conversation.id, can(P.InboxAssign));
    const teams = useInboxTeams();
    const contact = conversation.contact;
    const [width, setWidth] = useStored<number>('engage.inbox.panel-width', 320);

    const refresh = () => {
        void qc.invalidateQueries({ queryKey: keys.conversation(conversation.id) });
        void qc.invalidateQueries({ queryKey: keys.conversationsAll });
    };

    const update = useMutation({
        mutationFn: (body: { status?: 'open' | 'closed'; assigned_membership_id?: string | null; assigned_team_id?: string | null }) =>
            api(`conversations/${conversation.id}`, { method: 'PATCH', body }),
        onSuccess: refresh,
        onError: (e) => toast.error(errorMessage(e)),
    });

    // Double opt-in: the customer gets the question with Subscribe / Unsubscribe buttons; only their tap is recorded.
    const ask = useMutation({
        mutationFn: () => requestConsent(conversation.id),
        onSuccess: () => {
            toast.success('Consent question sent. Their answer (Subscribe or Unsubscribe) is recorded automatically.');
            refresh();
            void qc.invalidateQueries({ queryKey: keys.thread(conversation.id) });
        },
        onError: (e) => toast.error(errorMessage(e)),
    });
    const [recording, setRecording] = useState<'opted_in' | 'opted_out' | null>(null);
    const openContact = useOpenContact();
    const enquiry = useCurrentEnquiry(contact?.id ?? '', !!contact && can(P.ContactsView));
    const alerts = useWaitAlerts(conversation.id);
    const canAsk = conversation.window.replies_allowed ?? conversation.window.open;

    // Escape closes the slide-over.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
        window.addEventListener('keydown', onKey);

        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!contact) return null;

    const details = (
        <>
            <div className="flex flex-col items-center border-b px-5 py-6 text-center">
                <Avatar name={contact.display_name} className="size-16 text-lg" />
                <p className="mt-3 text-[15px] font-semibold">
                    <ContactLink contact={contact} className="font-semibold text-foreground">
                        {contact.display_name}
                    </ContactLink>
                </p>
                {contact.phone && <p className="font-mono text-[13px] text-muted-foreground">{contact.phone}</p>}
                {contact.username && <p className="text-[13px] text-muted-foreground">@{contact.username}</p>}
            </div>

            <SourceSection contact={contact} />

            {/* The enquiry this chat is about (3.3): stage stepper, Booked / Not booked, money and the next step. */}
            <section className="grid gap-2.5 border-b px-5 py-4 text-[13px]" aria-label="Enquiry">
                <div className="flex items-center justify-between gap-2">
                    <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Enquiry</h4>
                    {can(P.ContactsView) && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" onClick={() => openContact(contact)}>
                            Open contact
                        </Button>
                    )}
                </div>
                {enquiry.data ? (
                    <EnquiryCard enquiry={enquiry.data} conversationId={conversation.id} />
                ) : enquiry.isLoading ? null : (
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Stage</span>
                        <StageBadge stage={contact.stage} />
                    </div>
                )}
                {!enquiry.data && <ChangeStageButton contact={contact} via="chat" className="w-fit" />}
                <p className="text-[12px] text-muted-foreground">First contact {dateTime(contact.created_at)}</p>
            </section>

            <section className="grid gap-3 border-b px-5 py-4 text-[13px]">
                <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Service window</span>
                    <Badge tone={WINDOW_BADGE[windowState(conversation.window.expires_at).tone]} title={windowState(conversation.window.expires_at).label}>
                        {conversation.window.open ? `${timeLeft(conversation.window.expires_at)} left` : 'Closed'}
                    </Badge>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Conversation</span>
                    {/* The header's Resolve does it; on narrow screens this panel is the slide-over, so it offers it too. */}
                    <span className="hidden xl:inline">
                        <Badge tone={conversation.status === 'open' ? 'info' : 'grey'}>
                            {conversation.status === 'open' ? 'Open' : (conversation.resolution?.reason_label ?? 'Resolved')}
                        </Badge>
                    </span>
                    {can(P.InboxView) && (
                        <span className="xl:hidden">
                            <ResolveMenu conversation={conversation} />
                        </span>
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
                {((teams.data ?? []).length > 0 || conversation.assigned_team_id) && (
                    <div className="grid gap-1.5">
                        <span className="text-muted-foreground">Team</span>
                        {can(P.InboxAssign) ? (
                            <Select
                                value={conversation.assigned_team_id ?? NO_TEAM}
                                onValueChange={(v) => update.mutate({ assigned_team_id: v === NO_TEAM ? null : v })}
                            >
                                <SelectTrigger size="sm" aria-label="Team">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NO_TEAM}>No team</SelectItem>
                                    {(teams.data ?? []).map((t) => (
                                        <SelectItem key={t.id} value={t.id}>
                                            {t.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <span className="font-medium">{(teams.data ?? []).find((t) => t.id === conversation.assigned_team_id)?.name ?? 'No team'}</span>
                        )}
                    </div>
                )}
            </section>

            <section className="grid gap-3 px-5 py-4 text-[13px]">
                <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Consent</span>
                    <Badge tone={contact.consent_state === 'opted_out' ? 'bad' : contact.consent_state === 'opted_in' ? 'good' : 'grey'}>
                        {humanize(contact.consent_state)}
                    </Badge>
                </div>
                {contact.marketing_opted_out && <p className="rounded-md bg-warn-bg px-2.5 py-1.5 text-warn">Opted out of marketing messages.</p>}
                {contact.consent_requested_at && contact.consent_state !== 'opted_in' && (
                    <p className="rounded-md bg-info-bg px-2.5 py-1.5 text-info">
                        Consent question sent {relative(contact.consent_requested_at)}, waiting for the customer to tap Subscribe or Unsubscribe.
                    </p>
                )}
                {(contact.consent_state !== 'opted_in' || contact.marketing_opted_out) && can(P.InboxReply) && (
                    <div className="grid gap-1">
                        <Button size="sm" onClick={() => ask.mutate()} disabled={ask.isPending || !canAsk} className="w-fit">
                            {ask.isPending ? 'Sending…' : contact.consent_requested_at ? 'Ask again' : 'Ask for marketing consent'}
                        </Button>
                        <p className="text-[12px] text-muted-foreground">
                            {canAsk
                                ? 'Sends your consent question with Subscribe and Unsubscribe buttons. Nothing is recorded until the customer taps one.'
                                : contact.consent_state === 'opted_out' && conversation.window.open
                                  ? 'This contact opted out after their last message. You can ask again once they write to you.'
                                  : 'Available within 24 hours of the customer’s last message (WhatsApp only allows buttons then).'}
                        </p>
                    </div>
                )}
                {can(P.ContactsUpdate) && (
                    <div className="flex flex-wrap gap-2">
                        {contact.consent_state !== 'opted_in' && (
                            <Button size="sm" variant="ghost" onClick={() => setRecording('opted_in')}>
                                Consent given elsewhere…
                            </Button>
                        )}
                        {contact.consent_state !== 'opted_out' && (
                            <Button size="sm" variant="outline" onClick={() => setRecording('opted_out')}>
                                Opt out
                            </Button>
                        )}
                    </div>
                )}
                <RecordConsentDialog
                    contact={contact}
                    open={recording !== null}
                    onOpenChange={(o) => {
                        if (!o) setRecording(null);
                        refresh();
                    }}
                    initialState={recording ?? 'opted_in'}
                    conversationId={conversation.id}
                />
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                    {contact.email && (
                        <>
                            <dt className="text-muted-foreground">Email</dt>
                            <dd className="truncate">{contact.email}</dd>
                        </>
                    )}
                    <dt className="text-muted-foreground">{contact.acquisition ? 'Added via' : 'Source'}</dt>
                    <dd>{contactSource(contact.source, contact.source_detail)}</dd>
                    <dt className="text-muted-foreground">Last message</dt>
                    <dd>{dateTime(contact.last_inbound_at)}</dd>
                    <dt className="text-muted-foreground">Via</dt>
                    <dd className="truncate">{conversation.phone_number?.verified_name ?? conversation.phone_number?.display_phone_number}</dd>
                </dl>
            </section>
            {(alerts.data ?? []).length > 0 && (
                <section className="grid gap-2 border-t px-5 py-4 text-[13px]" aria-label="Wait alerts">
                    <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Wait alerts · {alerts.data!.length}</h4>
                    <ol className="grid gap-2">
                        {alerts.data!.map((a) => (
                            <li key={a.id} className="grid gap-0.5 border-l-2 border-bad/50 pl-2.5">
                                <span className="font-medium">
                                    {a.minutes} min → {a.recipients.map((r) => r.name?.split(' ')[0] ?? 'Teammate').join(', ') || ROLE_LABEL[a.role]}
                                </span>
                                <span className="text-[12px] text-muted-foreground">
                                    {dateTime(a.created_at)} · {a.channels.map((c) => CHANNEL_LABEL[c]).join(' + ')}
                                    {a.whatsapp_error && a.role === 'owner' ? ` · WhatsApp not sent: ${a.whatsapp_error}` : ''}
                                </span>
                            </li>
                        ))}
                    </ol>
                </section>
            )}
            <ContactOrders contactId={contact.id} />
        </>
    );

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
            {/* Wide screens: a column beside the chat. Narrower screens: the same details as a slide-over. */}
            <aside
                className="hidden h-full min-h-0 w-(--panel-width) shrink-0 overflow-y-auto border-l bg-card xl:block"
                style={{ '--panel-width': `${width}px` } as React.CSSProperties}
                aria-label="Contact details"
            >
                {!open && details}
            </aside>
            {open && (
                <div className="fixed inset-0 z-50 flex justify-end bg-black/40 xl:hidden" onClick={onClose}>
                    <aside
                        className="flex h-full w-full max-w-sm flex-col bg-card shadow-xl"
                        aria-label="Contact details"
                        role="dialog"
                        aria-modal="true"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b px-4 py-2.5">
                            <p className="text-[14px] font-semibold">Contact details</p>
                            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close contact details">
                                <XIcon />
                            </Button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto">{details}</div>
                    </aside>
                </div>
            )}
        </>
    );
}
