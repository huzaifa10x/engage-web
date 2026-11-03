'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { useSession } from '@/components/app/session';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, errorMessage } from '@/lib/api';
import { P } from '@/lib/permissions';
import { keys, useStages } from '@/lib/queries';
import type { Contact } from '@/lib/types';
import { cn } from '@/lib/utils';

import { StageBadge } from './stage-badge';

/**
 * Contacts & CRM owns the stage (Technical Specification v1.2 §1). It is changed only through this
 * deliberate action on the contact record — never inline in a list — and every change is written to
 * the contact's stage history (CN-01).
 */
export function ChangeStageDialog({ contact, open, onOpenChange }: { contact: Contact; open: boolean; onOpenChange: (open: boolean) => void }) {
    const qc = useQueryClient();
    const stages = (useStages(open).data ?? []).filter((s) => !s.archived);
    const [picked, setPicked] = useState<string | null | undefined>(undefined);
    const current = contact.stage?.id ?? null;
    const choice = picked === undefined ? current : picked;

    const move = useMutation({
        mutationFn: (stageId: string | null) => api(`contacts/${contact.id}/stage`, { method: 'POST', body: { stage_id: stageId } }),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: keys.contactsAll });
            void qc.invalidateQueries({ queryKey: keys.conversationsAll });
            void qc.invalidateQueries({ queryKey: keys.stages });
            void qc.invalidateQueries({ queryKey: keys.stageHistory(contact.id) });
            void qc.invalidateQueries({ queryKey: ['inbox', 'conversation'] });
            toast.success('Stage updated · saved to Contacts & CRM');
            onOpenChange(false);
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    const close = (o: boolean) => {
        if (!o) setPicked(undefined);
        onOpenChange(o);
    };

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>Change stage</DialogTitle>
                    <DialogDescription>
                        {contact.display_name} is now <StageBadge stage={contact.stage} className="align-middle" />. The change is kept in the stage history.
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
                <DialogFooter>
                    <Button variant="outline" onClick={() => close(false)}>
                        Cancel
                    </Button>
                    <Button onClick={() => move.mutate(choice)} disabled={move.isPending || choice === current || stages.length === 0}>
                        Save stage
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** "Change stage" for people who may edit contacts (Owner, Admin, Agent). Nothing for read-only roles. */
export function ChangeStageButton({ contact, className }: { contact: Contact; className?: string }) {
    const { can } = useSession();
    const [open, setOpen] = useState(false);
    if (!can(P.ContactsUpdate)) return null;

    return (
        <>
            <Button type="button" size="sm" variant="outline" className={className} onClick={() => setOpen(true)}>
                Change stage
            </Button>
            <ChangeStageDialog contact={contact} open={open} onOpenChange={setOpen} />
        </>
    );
}
