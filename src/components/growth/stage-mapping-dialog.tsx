'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { StageBadge } from '@/components/contacts/stage-badge';
import { StagesTab } from '@/components/contacts/stages-tab';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, errorMessage } from '@/lib/api';
import { keys, useStageMapping, useStages } from '@/lib/queries';
import type { CrmStage } from '@/lib/types';
import { cn } from '@/lib/utils';

type Step = 'contacted' | 'qualified';

/**
 * Analytics › Marketing › Set up stages (Marketing Analytics Specification §3): which of the
 * workspace's CRM stages mean Contacted and which mean Qualified. "New" is every new lead. A stage
 * belongs to one step. Saving recalculates the whole history. Owner and Admin only.
 */
export function StageMappingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
    const qc = useQueryClient();
    const stages = (useStages(open).data ?? []).filter((s) => !s.archived);
    const mapping = useStageMapping(open);
    const [draft, setDraft] = useState<Record<string, Step | null> | null>(null);
    const [editing, setEditing] = useState(false); // add, rename or reorder stages right here
    const current: Record<string, Step | null> =
        draft ??
        Object.fromEntries(
            stages.map((s) => [s.id, mapping.data?.qualified.includes(s.id) ? 'qualified' : mapping.data?.contacted.includes(s.id) ? 'contacted' : null]),
        );

    const save = useMutation({
        mutationFn: () =>
            api('analytics/marketing/stage-mapping', {
                method: 'PUT',
                body: {
                    contacted: Object.entries(current)
                        .filter(([, v]) => v === 'contacted')
                        .map(([k]) => k),
                    qualified: Object.entries(current)
                        .filter(([, v]) => v === 'qualified')
                        .map(([k]) => k),
                },
            }),
        onSuccess: () => {
            toast.success('Stages saved · the reports were recalculated');
            void qc.invalidateQueries({ queryKey: ['analytics', 'marketing'] });
            setDraft(null);
            onOpenChange(false);
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    // No stages yet: add the suggested pipeline and pre-fill the usual mapping (Contacted → Contacted;
    // Qualified and Won → Qualified). Nothing is saved until "Save stages".
    const suggest = useMutation({
        mutationFn: () => api<{ data: CrmStage[] }>('crm/stages/suggested', { method: 'POST' }).then((r) => r.data),
        onSuccess: (created) => {
            void qc.invalidateQueries({ queryKey: keys.stages });
            const step = (name: string): Step | null => (name === 'Contacted' ? 'contacted' : name === 'Qualified' || name === 'Won' ? 'qualified' : null);
            setDraft(Object.fromEntries(created.map((s) => [s.id, step(s.name)])));
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    const set = (id: string, step: Step | null) => setDraft({ ...current, [id]: step });
    const anyQualified = Object.values(current).includes('qualified');

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (!o) {
                    setDraft(null);
                    setEditing(false);
                }
                onOpenChange(o);
            }}
        >
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Set up your stages</DialogTitle>
                    <DialogDescription>
                        Choose which CRM stages mean <b>Contacted</b> and <b>Qualified</b>. A lead counts as qualified when it reaches any Qualified stage
                        within 30 days of its first message; Qualified stages also count as Contacted.
                    </DialogDescription>
                </DialogHeader>
                {editing ? (
                    <div className="grid gap-3">
                        <StagesTab open={open} />
                        <Button size="sm" variant="outline" className="w-fit" onClick={() => setEditing(false)}>
                            Done: choose Contacted and Qualified
                        </Button>
                    </div>
                ) : stages.length === 0 ? (
                    <div className="grid justify-items-center gap-3 rounded-lg border border-dashed p-4 text-center text-[13px] text-muted-foreground">
                        <p>Your workspace has no CRM stages yet. Start with the suggested pipeline, or create your own.</p>
                        <div className="flex flex-wrap justify-center gap-2">
                            <Button size="sm" onClick={() => suggest.mutate()} disabled={suggest.isPending}>
                                {suggest.isPending ? 'Adding…' : 'Add suggested stages (New, Contacted, Qualified, Won, Lost)'}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                                Create my own stages
                            </Button>
                        </div>
                    </div>
                ) : (
                    <ul className="grid gap-1.5">
                        {stages.map((s) => (
                            <li key={s.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                                <StageBadge stage={s} />
                                <div className="flex gap-1" role="radiogroup" aria-label={`${s.name} counts as`}>
                                    {(
                                        [
                                            [null, 'Neither'],
                                            ['contacted', 'Contacted'],
                                            ['qualified', 'Qualified'],
                                        ] as [Step | null, string][]
                                    ).map(([v, label]) => (
                                        <button
                                            key={label}
                                            type="button"
                                            role="radio"
                                            aria-checked={current[s.id] === v}
                                            onClick={() => set(s.id, v)}
                                            className={cn(
                                                'rounded-md border px-2 py-1 text-[12px] font-medium text-muted-foreground hover:bg-muted',
                                                current[s.id] === v && 'border-brand-600 bg-brand-100/50 text-foreground',
                                            )}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
                {!editing && stages.length > 0 && (
                    <button type="button" className="w-fit text-[12.5px] text-info underline-offset-2 hover:underline" onClick={() => setEditing(true)}>
                        Add or change stages
                    </button>
                )}
                {!editing && !anyQualified && stages.length > 0 && (
                    <p className="text-[12.5px] text-warn">Choose at least one Qualified stage to see qualified leads.</p>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={() => save.mutate()} disabled={save.isPending || stages.length === 0}>
                        {save.isPending ? 'Saving…' : 'Save stages'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
