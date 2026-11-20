'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { useSession } from '@/components/app/session';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError, errorMessage } from '@/lib/api';
import { P } from '@/lib/permissions';
import { keys, useStages } from '@/lib/queries';
import type { Contact, CrmStage, StageRef } from '@/lib/types';
import { cn } from '@/lib/utils';

import type { Enquiry } from '@/lib/types';
import { StageBadge } from './stage-badge';

/** Where a stage change is made. "contact" (the Contacts & CRM edit form) is Owner and Admin only. */
export type StageVia = 'chat' | 'leads' | 'contact';

/** The contact's current enquiry: its stage, the version to send back, and whether a verified payment allows Won. */
export function useCurrentEnquiry(contactId: string, enabled = true) {
    return useQuery({
        queryKey: ['contacts', contactId, 'enquiries'],
        queryFn: () => api<{ data: Enquiry[] }>(`contacts/${contactId}/enquiries`).then((r) => r.data),
        enabled,
        select: (list) => list.find((e) => e.current) ?? null,
    });
}

export function invalidateStage(qc: ReturnType<typeof useQueryClient>, contactId: string) {
    void qc.invalidateQueries({ queryKey: keys.contactsAll });
    void qc.invalidateQueries({ queryKey: keys.conversationsAll });
    void qc.invalidateQueries({ queryKey: keys.leadsAll });
    void qc.invalidateQueries({ queryKey: keys.stages });
    void qc.invalidateQueries({ queryKey: keys.stageHistory(contactId) });
    void qc.invalidateQueries({ queryKey: ['contacts', contactId] });
    void qc.invalidateQueries({ queryKey: ['inbox', 'conversation'] });
}

/**
 * What a move to this stage still needs (item 4): a lost reason, or for Won without a verified
 * payment, a reference from anyone who replies to customers (3.3). null when it needs nothing more.
 */
export function stageRequirement(
    stage: Pick<CrmStage, 'group'> | null | undefined,
    enquiry: Pick<Enquiry, 'verified_paid'> | null | undefined,
    canApproveWon: boolean,
): { kind: 'lost' | 'reference' | 'blocked'; label: string; hint: string } | null {
    if (stage?.group === 'lost') return { kind: 'lost', label: 'Why was it lost?', hint: 'For example: chose another company, too expensive, dates changed.' };
    if (stage?.group !== 'won' || enquiry?.verified_paid) return null;
    if (canApproveWon)
        return {
            kind: 'reference',
            label: 'Reference',
            hint: 'No verified payment on this enquiry yet: add the invoice, receipt or contract number (at least 3 characters).',
        };

    return {
        kind: 'blocked',
        label: '',
        hint: 'Won needs a verified payment (Stripe, WooCommerce or an authorised person), or a reference from a teammate who replies to customers.',
    };
}

export function useMoveStage(contact: Contact, via: StageVia, onDone?: () => void) {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: ({ stageId, version, reason }: { stageId: string | null; version: number; reason?: string | null }) =>
            api(`contacts/${contact.id}/stage`, { method: 'POST', body: { stage_id: stageId, version, reason: reason?.trim() || null, via } }),
        onSuccess: () => {
            invalidateStage(qc, contact.id);
            onDone?.();
        },
        onError: (e) => {
            toast.error(errorMessage(e));
            // Someone else changed it (409): show the stage as it is now.
            if (e instanceof ApiError && e.status === 409) invalidateStage(qc, contact.id);
        },
    });
}

/**
 * Contacts & CRM owns the stage (Technical Specification v1.2 §1); Contacts & CRM itself only shows
 * it. It is changed from the chat sidebar and Growth Hub › Leads with this action, or by an Owner or
 * Admin in the contact's edit form. The stage belongs to the contact's current enquiry; every change
 * is kept in its history, and two people can't overwrite each other (item 4).
 */
export function ChangeStageDialog({
    contact,
    via,
    open,
    onOpenChange,
}: {
    contact: Contact;
    via: StageVia;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const { can } = useSession();
    const stages = (useStages(open).data ?? []).filter((s) => !s.archived);
    const enquiry = useCurrentEnquiry(contact.id, open);
    const [picked, setPicked] = useState<string | null | undefined>(undefined);
    const [reason, setReason] = useState('');
    const current = enquiry.data?.stage?.id ?? contact.stage?.id ?? null;
    const choice = picked === undefined ? current : picked;
    const need = stageRequirement(
        stages.find((s) => s.id === choice),
        enquiry.data,
        can(P.InboxReply) || can(P.StagesApproveWon),
    );
    const ready = need === null || (need.kind === 'lost' ? reason.trim() !== '' : need.kind === 'reference' && reason.trim().length >= 3);

    const move = useMoveStage(contact, via, () => {
        toast.success('Stage updated · saved to Contacts & CRM');
        close(false);
    });

    function close(o: boolean) {
        if (!o) {
            setPicked(undefined);
            setReason('');
        }
        onOpenChange(o);
    }

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>Change stage</DialogTitle>
                    <DialogDescription>
                        {contact.display_name} is now{' '}
                        <StageBadge
                            stage={enquiry.data?.stage ? ({ ...contact.stage, ...enquiry.data.stage } as StageRef) : contact.stage}
                            className="align-middle"
                        />
                        {enquiry.data ? ` (enquiry ${enquiry.data.number})` : ''}. The change is kept in the history.
                    </DialogDescription>
                </DialogHeader>
                {stages.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-4 text-center text-[13px] text-muted-foreground">
                        No stages yet. Add them under Contacts › Segments, tags, fields and stages › Stages.
                    </p>
                ) : (
                    <ul className="grid gap-1" role="radiogroup" aria-label="Stage">
                        {[...stages.map((s) => ({ id: s.id as string | null, stage: s })), { id: null, stage: null }].map(({ id, stage }) => (
                            <li key={id ?? 'none'}>
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={choice === id}
                                    onClick={() => setPicked(id)}
                                    className={cn(
                                        'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-[13px] transition-colors hover:bg-muted',
                                        choice === id && 'border-brand-600 bg-brand-100/40',
                                    )}
                                >
                                    {stage ? <StageBadge stage={stage} /> : <span className="text-muted-foreground">No stage</span>}
                                    {choice === id && <CheckIcon className="size-4 text-brand-600" />}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {need && choice !== current && (
                    <div className="grid gap-1.5">
                        {need.kind === 'blocked' ? (
                            <p role="alert" className="rounded-md bg-warn-bg px-3 py-2 text-[12.5px] text-warn">
                                {need.hint}
                            </p>
                        ) : (
                            <>
                                <Label htmlFor="stage-reason">{need.label}</Label>
                                <Input id="stage-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
                                <p className="text-[12px] text-muted-foreground">{need.hint}</p>
                            </>
                        )}
                    </div>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={() => close(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => move.mutate({ stageId: choice, version: enquiry.data?.stage_version ?? 0, reason })}
                        disabled={move.isPending || enquiry.isLoading || choice === current || stages.length === 0 || !ready}
                    >
                        Save stage
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** "Change stage" (chat sidebar, Leads) for people who may edit contacts. Nothing for read-only roles. */
export function ChangeStageButton({ contact, via, className }: { contact: Contact; via: Exclude<StageVia, 'contact'>; className?: string }) {
    const { can } = useSession();
    const [open, setOpen] = useState(false);
    if (!can(P.StagesChange)) return null;

    return (
        <>
            <Button type="button" size="sm" variant="outline" className={className} onClick={() => setOpen(true)}>
                Change stage
            </Button>
            <ChangeStageDialog contact={contact} via={via} open={open} onOpenChange={setOpen} />
        </>
    );
}
