'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import type { CrmStage, StageColor, StageGroup } from '@/lib/types';
import { confirmAction } from '@/components/ui/confirm';

const COLORS: { value: StageColor; label: string }[] = [
    { value: 'grey', label: 'Grey' },
    { value: 'info', label: 'Blue' },
    { value: 'brand', label: 'Purple' },
    { value: 'warn', label: 'Amber' },
    { value: 'good', label: 'Green' },
    { value: 'bad', label: 'Red' },
];

/** Contacts › Segments, tags & fields › Stages: the workspace's pipeline. Owners and Admins edit it. */
/** Reports count by group, so a stage can be renamed freely (item 4). */
const GROUPS: { value: StageGroup; label: string }[] = [
    { value: 'open', label: 'Open' },
    { value: 'won', label: 'Won' },
    { value: 'lost', label: 'Lost' },
];

function GroupSelect({ value, onChange, label, disabled }: { value: StageGroup; onChange: (g: StageGroup) => void; label: string; disabled?: boolean }) {
    return (
        <Select value={value} onValueChange={(v) => onChange(v as StageGroup)} disabled={disabled}>
            <SelectTrigger className="h-8 w-24" aria-label={label}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {GROUPS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                        {g.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

export function StagesTab({ open }: { open: boolean }) {
    const { can } = useSession();
    const editable = can(P.SettingsManage);
    const qc = useQueryClient();
    const stages = useStages(open);
    const list = stages.data ?? [];
    const archived = useQuery({
        queryKey: [...keys.stages, 'archived'],
        queryFn: () => api<{ data: CrmStage[] }>('crm/stages', { query: { include_archived: 1 } }).then((r) => r.data.filter((s) => s.archived)),
        enabled: open,
    });
    const [name, setName] = useState('');
    const [color, setColor] = useState<StageColor>('grey');
    const [group, setGroup] = useState<StageGroup>('open');
    const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

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
        run.mutate(() => api('crm/stages', { method: 'POST', body: { name: name.trim(), color, group } }).then(() => setName('')));
    };
    const patch = (s: CrmStage, body: { name?: string; group?: StageGroup }) => run.mutate(() => api(`crm/stages/${s.id}`, { method: 'PATCH', body }));
    const moveBy = (index: number, by: -1 | 1) => {
        const ids = list.map((s) => s.id);
        const [id] = ids.splice(index, 1);
        ids.splice(index + by, 0, id);
        run.mutate(() => api('crm/stages/order', { method: 'PUT', body: { ids } }));
    };

    return (
        <div className="grid gap-3">
            <p className="text-[12.5px] text-muted-foreground">
                Stages show where each enquiry is in your sales process. Each stage is Open, Won or Lost, so reports keep working when you rename it. Won needs
                a verified payment or a reference; Lost asks why.
            </p>
            {list.length === 0 && !stages.isLoading && (
                <div className="grid justify-items-center gap-2 rounded-lg border border-dashed p-5 text-center text-[13px] text-muted-foreground">
                    No stages yet.
                    {editable && (
                        <Button size="sm" onClick={() => run.mutate(() => api('crm/stages/suggested', { method: 'POST' }))} disabled={run.isPending}>
                            Use the default stages (New, Qualified, Quote sent, Booked, Won, Lost)
                        </Button>
                    )}
                </div>
            )}
            <ol className="grid gap-1.5">
                {list.map((s, i) => (
                    <li key={s.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5">
                        {renaming?.id === s.id ? (
                            <form
                                className="flex gap-1"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    if (renaming.name.trim()) patch(s, { name: renaming.name.trim() });
                                    setRenaming(null);
                                }}
                            >
                                <Input
                                    autoFocus
                                    className="h-8 w-36"
                                    value={renaming.name}
                                    maxLength={40}
                                    aria-label={`New name for ${s.name}`}
                                    onChange={(e) => setRenaming({ id: s.id, name: e.target.value })}
                                />
                                <Button type="submit" size="sm" variant="outline">
                                    Save
                                </Button>
                            </form>
                        ) : (
                            <button type="button" disabled={!editable} onClick={() => setRenaming({ id: s.id, name: s.name })} aria-label={`Rename ${s.name}`}>
                                <Badge tone={s.color} dot>
                                    {s.name}
                                </Badge>
                            </button>
                        )}
                        <span className="text-[12px] text-muted-foreground">
                            {s.enquiries ?? 0} enquir{(s.enquiries ?? 0) === 1 ? 'y' : 'ies'}
                        </span>
                        {editable ? (
                            <GroupSelect
                                value={s.group ?? 'open'}
                                onChange={(g) => patch(s, { group: g })}
                                label={`Group of ${s.name}`}
                                disabled={run.isPending}
                            />
                        ) : (
                            <span className="text-[12px] text-muted-foreground">{GROUPS.find((g) => g.value === (s.group ?? 'open'))?.label}</span>
                        )}
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
                                    onClick={async () =>
                                        (await confirmAction({
                                            title: `Archive the stage “${s.name}”? Every enquiry on it must be moved first, and you always keep at least one Open, one Won and one Lost stage. Archived stages stay in the history and can be restored.`,
                                            destructive: true,
                                        })) && run.mutate(() => api(`crm/stages/${s.id}`, { method: 'DELETE' }))
                                    }
                                >
                                    <Trash2Icon />
                                </Button>
                            </span>
                        )}
                    </li>
                ))}
            </ol>
            {(archived.data ?? []).length > 0 && (
                <div className="grid gap-1.5">
                    <p className="text-[12px] font-semibold text-muted-foreground">Archived</p>
                    <ul className="grid gap-1.5">
                        {archived.data!.map((s) => (
                            <li key={s.id} className="flex items-center gap-2 rounded-md border border-dashed px-2.5 py-1.5 opacity-80">
                                <Badge tone="grey">{s.name}</Badge>
                                <span className="text-[12px] text-muted-foreground">{GROUPS.find((g) => g.value === (s.group ?? 'open'))?.label}</span>
                                {editable && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="ml-auto"
                                        disabled={run.isPending}
                                        onClick={() => run.mutate(() => api(`crm/stages/${s.id}/restore`, { method: 'POST' }))}
                                    >
                                        Restore
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
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
                    <GroupSelect value={group} onChange={setGroup} label="Group" />
                    <Button type="submit" disabled={!name.trim() || run.isPending}>
                        <PlusIcon /> Add
                    </Button>
                </form>
            )}
        </div>
    );
}
