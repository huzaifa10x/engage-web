'use client';

import { useQueryClient } from '@tanstack/react-query';
import { PlusIcon, XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Field, FormError } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { errorMessage } from '@/lib/api';
import { keys, previewSegment, saveSegment, useContactFields, useTags } from '@/lib/queries';
import type { Segment, SegmentCounts, SegmentRule } from '@/lib/types';

type Kind = 'tag' | 'choice' | 'text' | 'date' | 'attr';

const BUILT_IN: { field: string; label: string; kind: Kind }[] = [
    { field: 'tags', label: 'Tag', kind: 'tag' },
    { field: 'consent_state', label: 'Consent', kind: 'choice' },
    { field: 'last_inbound_at', label: 'Last message from contact', kind: 'date' },
    { field: 'created_at', label: 'Added', kind: 'date' },
    { field: 'name', label: 'Name', kind: 'text' },
    { field: 'email', label: 'Email', kind: 'text' },
];

const OPS: Record<Kind, [string, string][]> = {
    tag: [
        ['has', 'has'],
        ['not_has', 'does not have'],
    ],
    choice: [
        ['is', 'is'],
        ['is_not', 'is not'],
    ],
    text: [
        ['contains', 'contains'],
        ['is_empty', 'is empty'],
        ['is_not_empty', 'is not empty'],
    ],
    date: [
        ['within_days', 'in the last (days)'],
        ['older_than_days', 'more than (days) ago'],
        ['is_empty', 'never'],
    ],
    attr: [
        ['equals', 'is'],
        ['not_equals', 'is not'],
        ['contains', 'contains'],
        ['gt', 'is greater than'],
        ['lt', 'is less than'],
        ['is_empty', 'is empty'],
        ['is_not_empty', 'is not empty'],
    ],
};

const NO_VALUE = ['is_empty', 'is_not_empty'];

/** Build a segment: a saved rule. Contacts move in and out automatically as their data changes. */
export function SegmentDialog({ open, onOpenChange, segment }: { open: boolean; onOpenChange: (o: boolean) => void; segment?: Segment | null }) {
    const qc = useQueryClient();
    const tags = useTags(open);
    const fields = useContactFields(open);
    const [loaded, setLoaded] = useState<string | null | undefined>(undefined);
    const [name, setName] = useState('');
    const [match, setMatch] = useState<'all' | 'any'>('all');
    const [rules, setRules] = useState<SegmentRule[]>([]);
    const [counts, setCounts] = useState<SegmentCounts | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    if (open && loaded !== (segment?.id ?? null)) {
        setLoaded(segment?.id ?? null);
        setName(segment?.name ?? '');
        setMatch(segment?.match ?? 'all');
        setRules(segment?.rules ?? [{ field: 'tags', op: 'has', value: '' }]);
        setCounts(segment?.counts ?? null);
        setError(null);
    }
    if (!open && loaded !== undefined) setLoaded(undefined);

    const options = [...BUILT_IN, ...(fields.data ?? []).map((f) => ({ field: `attr:${f.key}`, label: f.label, kind: 'attr' as Kind }))];
    const kindOf = (field: string): Kind => options.find((o) => o.field === field)?.kind ?? 'attr';
    const complete = rules.length > 0 && rules.every((r) => NO_VALUE.includes(r.op) || String(r.value ?? '').trim() !== '');
    const signature = JSON.stringify([match, rules]);

    // Live "who fits" count while the rule is being edited.
    useEffect(() => {
        if (!open || !complete) return;
        const timer = setTimeout(() => {
            previewSegment({ match, rules })
                .then(setCounts)
                .catch(() => setCounts(null));
        }, 400);

        return () => clearTimeout(timer);
    }, [signature, open, complete]); // eslint-disable-line react-hooks/exhaustive-deps -- signature covers match + rules

    const setRule = (i: number, patch: Partial<SegmentRule>) => setRules(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));

    const submit = async () => {
        if (!name.trim()) return setError('Give the segment a name.');
        if (!complete) return setError('Complete every condition.');
        setPending(true);
        setError(null);
        try {
            await saveSegment(segment?.id ?? null, { name: name.trim(), match, rules });
            void qc.invalidateQueries({ queryKey: keys.segments });
            toast.success(segment ? 'Segment updated' : 'Segment saved');
            onOpenChange(false);
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setPending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{segment ? 'Edit segment' : 'New segment'}</DialogTitle>
                    <DialogDescription>
                        A segment is a saved rule, not a fixed list. Contacts join or leave it automatically when their tags, fields or activity change.
                    </DialogDescription>
                </DialogHeader>
                <FormError message={error} />

                <Field label="Name" htmlFor="seg-name">
                    <Input id="seg-name" value={name} maxLength={80} placeholder="VIP members" onChange={(e) => setName(e.target.value)} />
                </Field>

                <div className="grid gap-2">
                    <div className="flex items-center gap-2 text-[13px] text-ink-2">
                        Contacts who match
                        <Select value={match} onValueChange={(v) => setMatch(v as 'all' | 'any')}>
                            <SelectTrigger className="h-8 w-24" aria-label="Match">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">all</SelectItem>
                                <SelectItem value="any">any</SelectItem>
                            </SelectContent>
                        </Select>
                        of these conditions:
                    </div>

                    {rules.map((rule, i) => {
                        const kind = kindOf(rule.field);

                        return (
                            <div key={i} className="grid gap-2 rounded-md border p-2.5 sm:grid-cols-[1fr_1fr_1fr_auto]">
                                <Select
                                    value={rule.field}
                                    onValueChange={(field) =>
                                        setRule(i, { field, op: OPS[kindOf(field)][0][0], value: kindOf(field) === 'choice' ? 'opted_in' : '' })
                                    }
                                >
                                    <SelectTrigger aria-label="Field">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {options.map((o) => (
                                            <SelectItem key={o.field} value={o.field}>
                                                {o.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Select value={rule.op} onValueChange={(op) => setRule(i, { op })}>
                                    <SelectTrigger aria-label="Condition">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {OPS[kind].map(([op, label]) => (
                                            <SelectItem key={op} value={op}>
                                                {label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {NO_VALUE.includes(rule.op) ? (
                                    <span />
                                ) : kind === 'tag' ? (
                                    <Select value={String(rule.value ?? '')} onValueChange={(value) => setRule(i, { value })}>
                                        <SelectTrigger aria-label="Tag">
                                            <SelectValue placeholder={(tags.data ?? []).length ? 'Choose a tag' : 'No tags yet'} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {(tags.data ?? []).map((t) => (
                                                <SelectItem key={t.id} value={t.name}>
                                                    {t.name} ({t.contacts})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : kind === 'choice' ? (
                                    <Select value={String(rule.value ?? 'opted_in')} onValueChange={(value) => setRule(i, { value })}>
                                        <SelectTrigger aria-label="Consent">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="opted_in">Opted in</SelectItem>
                                            <SelectItem value="unknown">Unknown</SelectItem>
                                            <SelectItem value="opted_out">Opted out</SelectItem>
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <Input
                                        value={String(rule.value ?? '')}
                                        aria-label="Value"
                                        type={kind === 'date' || ['gt', 'lt'].includes(rule.op) ? 'number' : 'text'}
                                        min={0}
                                        placeholder={kind === 'date' ? 'Days' : 'Value'}
                                        onChange={(e) => setRule(i, { value: e.target.value })}
                                    />
                                )}
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => setRules(rules.filter((_, j) => j !== i))}
                                    disabled={rules.length === 1}
                                    aria-label="Remove condition"
                                >
                                    <XIcon />
                                </Button>
                            </div>
                        );
                    })}
                    {rules.length < 20 && (
                        <Button variant="outline" size="sm" className="w-fit" onClick={() => setRules([...rules, { field: 'tags', op: 'has', value: '' }])}>
                            <PlusIcon /> Add condition
                        </Button>
                    )}
                </div>

                <div className="rounded-md bg-muted px-3 py-2.5 text-[13px]" aria-live="polite">
                    {complete && counts ? (
                        <>
                            <span className="font-semibold">{counts.matched.toLocaleString()}</span> contact{counts.matched === 1 ? '' : 's'} match right now ·{' '}
                            <span className="font-semibold">{counts.eligible_marketing.toLocaleString()}</span> can receive marketing ·{' '}
                            <span className="font-semibold">{counts.eligible_utility.toLocaleString()}</span> can receive utility messages
                        </>
                    ) : (
                        <span className="text-muted-foreground">Complete the conditions to see how many contacts match.</span>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={pending}>
                        {pending ? 'Saving…' : 'Save segment'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
