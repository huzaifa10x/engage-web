'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useSession } from '@/components/app/session';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, errorMessage } from '@/lib/api';
import { P } from '@/lib/permissions';
import { keys, useStages } from '@/lib/queries';
import type { Contact, StageRef } from '@/lib/types';
import { cn } from '@/lib/utils';

const NONE = '__none__';

export function StageBadge({ stage, className }: { stage?: StageRef | null; className?: string }) {
    if (!stage) return <span className={cn('text-muted-foreground', className)}>—</span>;

    return (
        <Badge tone={stage.color} dot className={className}>
            {stage.name}
        </Badge>
    );
}

/**
 * The contact's CRM stage. People who can edit contacts change it here; every change is kept in
 * the contact's stage history. Read-only (a badge) otherwise, or when the workspace has no stages.
 */
export function StageSelect({ contact, size = 'sm', className }: { contact: Contact; size?: 'sm' | 'default'; className?: string }) {
    const { can } = useSession();
    const qc = useQueryClient();
    const editable = can(P.ContactsUpdate);
    const stages = useStages(can(P.ContactsView));
    const active = (stages.data ?? []).filter((s) => !s.archived);

    const move = useMutation({
        mutationFn: (stageId: string | null) => api(`contacts/${contact.id}/stage`, { method: 'POST', body: { stage_id: stageId } }),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: keys.contactsAll });
            void qc.invalidateQueries({ queryKey: keys.conversationsAll });
            void qc.invalidateQueries({ queryKey: keys.stages });
            void qc.invalidateQueries({ queryKey: keys.stageHistory(contact.id) });
            void qc.invalidateQueries({ queryKey: ['inbox', 'conversation'] });
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    if (!editable || active.length === 0) return <StageBadge stage={contact.stage} className={className} />;

    return (
        <Select value={contact.stage?.id ?? NONE} onValueChange={(v) => move.mutate(v === NONE ? null : v)} disabled={move.isPending}>
            <SelectTrigger size={size} className={cn('min-w-32', className)} aria-label="Stage">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={NONE}>No stage</SelectItem>
                {active.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                        {s.name}
                    </SelectItem>
                ))}
                {contact.stage?.archived && (
                    <SelectItem value={contact.stage.id} disabled>
                        {contact.stage.name} (archived)
                    </SelectItem>
                )}
            </SelectContent>
        </Select>
    );
}
