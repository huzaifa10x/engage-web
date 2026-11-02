'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { useSession } from '@/components/app/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, errorMessage } from '@/lib/api';
import { P } from '@/lib/permissions';
import { keys, useStages } from '@/lib/queries';
import type { StageColor } from '@/lib/types';

const COLORS: { value: StageColor; label: string }[] = [
    { value: 'grey', label: 'Grey' },
    { value: 'info', label: 'Blue' },
    { value: 'brand', label: 'Purple' },
    { value: 'warn', label: 'Amber' },
    { value: 'good', label: 'Green' },
    { value: 'bad', label: 'Red' },
];

/** Contacts › Segments, tags & fields › Stages: the workspace's pipeline. Owners and Admins edit it. */
export function StagesTab({ open }: { open: boolean }) {
    const { can } = useSession();
    const editable = can(P.SettingsManage);
    const qc = useQueryClient();
    const stages = useStages(open);
    const list = stages.data ?? [];
    const [name, setName] = useState('');
    const [color, setColor] = useState<StageColor>('grey');

    const run = useMutation({
        mutationFn: (action: () => Promise<unknown>) => action(),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: keys.stages });
            void qc.invalidateQueries({ queryKey: keys.contactsAll });
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    const add = () => {
        if (!name.trim()) return;
        run.mutate(() => api('crm/stages', { method: 'POST', body: { name: name.trim(), color } }).then(() => setName('')));
    };
    const moveBy = (index: number, by: -1 | 1) => {
        const ids = list.map((s) => s.id);
        const [id] = ids.splice(index, 1);
        ids.splice(index + by, 0, id);
        run.mutate(() => api('crm/stages/order', { method: 'PUT', body: { ids } }));
    };

    return (
        <div className="grid gap-3">
            <p className="text-[12.5px] text-muted-foreground">
                Stages show where each contact is in your sales process. Every change is kept in the contact’s history, so reports can count how many leads
                qualified.
            </p>
            {list.length === 0 && !stages.isLoading && (
                <div className="grid justify-items-center gap-2 rounded-lg border border-dashed p-5 text-center text-[13px] text-muted-foreground">
                    No stages yet.
                    {editable && (
                        <Button size="sm" onClick={() => run.mutate(() => api('crm/stages/suggested', { method: 'POST' }))} disabled={run.isPending}>
                            Use suggested stages (New, Contacted, Qualified, Won, Lost)
                        </Button>
                    )}
                </div>
            )}
            <ol className="grid gap-1.5">
                {list.map((s, i) => (
                    <li key={s.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5">
                        <Badge tone={s.color} dot>
                            {s.name}
                        </Badge>
                        <span className="text-[12px] text-muted-foreground">{s.contacts ?? 0} contact(s)</span>
                        {editable && (
                            <span className="ml-auto flex gap-0.5">
                                <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    aria-label={`Move ${s.name} up`}
                                    disabled={i === 0 || run.isPending}
                                    onClick={() => moveBy(i, -1)}
                                >
                                    <ArrowUpIcon />
                                </Button>
                                <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    aria-label={`Move ${s.name} down`}
                                    disabled={i === list.length - 1 || run.isPending}
                                    onClick={() => moveBy(i, 1)}
                                >
                                    <ArrowDownIcon />
                                </Button>
                                <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    aria-label={`Remove stage ${s.name}`}
                                    disabled={run.isPending}
                                    onClick={() =>
                                        window.confirm(`Remove the stage “${s.name}”? Contacts on it must be moved first. Used stages are kept in history.`) &&
                                        run.mutate(() => api(`crm/stages/${s.id}`, { method: 'DELETE' }))
                                    }
                                >
                                    <Trash2Icon />
                                </Button>
                            </span>
                        )}
                    </li>
                ))}
            </ol>
            {editable && (
                <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        add();
                    }}
                >
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New stage, e.g. Booked" maxLength={40} aria-label="Stage name" />
                    <Select value={color} onValueChange={(v) => setColor(v as StageColor)}>
                        <SelectTrigger className="w-28" aria-label="Colour">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {COLORS.map((c) => (
                                <SelectItem key={c.value} value={c.value}>
                                    {c.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button type="submit" disabled={!name.trim() || run.isPending}>
                        <PlusIcon /> Add
                    </Button>
                </form>
            )}
        </div>
    );
}
