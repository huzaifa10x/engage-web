'use client';

import { FilterIcon, PlusIcon, XIcon } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ContactField, ContactFieldType, SegmentRule } from '@/lib/types';

/** Conditions on custom fields, in the segment rule format the server understands ("attr:<key>"). */
export type FieldFilterValue = { match: 'all' | 'any'; rules: SegmentRule[] };

const OP_LABEL: Record<string, string> = {
    equals: 'is',
    not_equals: 'is not',
    contains: 'contains',
    gt: 'is more than',
    lt: 'is less than',
    before: 'is before',
    after: 'is after',
    includes: 'includes',
    is_empty: 'is empty',
    is_not_empty: 'has a value',
};

const NO_VALUE = ['is_empty', 'is_not_empty'];

export function opsFor(type: ContactFieldType): string[] {
    switch (type) {
        case 'number':
            return ['equals', 'gt', 'lt', 'is_empty', 'is_not_empty'];
        case 'date':
            return ['equals', 'before', 'after', 'is_empty', 'is_not_empty'];
        case 'boolean':
            return ['equals', 'is_empty'];
        case 'select':
            return ['equals', 'not_equals', 'is_empty', 'is_not_empty'];
        case 'multi_select':
            return ['includes', 'is_empty', 'is_not_empty'];
        default:
            return ['equals', 'not_equals', 'contains', 'is_empty', 'is_not_empty'];
    }
}

/** "City is Dubai" — for chips and summaries. */
export function describeRule(rule: SegmentRule, fields: ContactField[]): string {
    const field = fields.find((f) => `attr:${f.key}` === rule.field);
    const label = field?.label ?? rule.field.replace(/^attr:/, '');
    const value = field?.type === 'boolean' ? (rule.value === 'true' ? 'Yes' : 'No') : rule.value;

    return NO_VALUE.includes(rule.op) ? `${label} ${OP_LABEL[rule.op]}` : `${label} ${OP_LABEL[rule.op] ?? rule.op} ${value ?? ''}`;
}

/** A custom-field value for a table cell: lists joined, yes / no, dates readable. */
export function formatFieldValue(value: unknown, type: ContactFieldType | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    if (Array.isArray(value)) return value.join(', ');
    if (type === 'boolean' || typeof value === 'boolean') return value === true || value === 'true' ? 'Yes' : 'No';
    if (type === 'date' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { dateStyle: 'medium' });
    }

    return String(value);
}

/**
 * A "Fields" button that opens a small editor of conditions on custom fields. The draft is applied
 * only on "Apply", so a list does not reload on every keystroke.
 */
export function FieldFilter({
    fields,
    value,
    onChange,
    label = 'Custom fields',
}: {
    fields: ContactField[];
    value: FieldFilterValue | null;
    onChange: (v: FieldFilterValue | null) => void;
    label?: string;
}) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<FieldFilterValue>({ match: 'all', rules: [] });
    const count = value?.rules.length ?? 0;

    const fieldOf = (rule: SegmentRule) => fields.find((f) => `attr:${f.key}` === rule.field);
    const blank = (f: ContactField): SegmentRule => ({ field: `attr:${f.key}`, op: opsFor(f.type)[0], value: f.type === 'boolean' ? 'true' : '' });
    const setRule = (i: number, rule: SegmentRule) => setDraft((d) => ({ ...d, rules: d.rules.map((r, j) => (j === i ? rule : r)) }));
    const complete = draft.rules.every((r) => NO_VALUE.includes(r.op) || String(r.value ?? '').trim() !== '');

    if (fields.length === 0) return null;

    return (
        <Popover
            open={open}
            onOpenChange={(o) => {
                setOpen(o);
                if (o) setDraft(value ?? { match: 'all', rules: [blank(fields[0])] });
            }}
        >
            <PopoverTrigger asChild>
                <Button variant="outline" className={count > 0 ? 'border-brand-500 text-brand-600' : undefined} aria-label={`${label} filter`}>
                    <FilterIcon /> {label}
                    {count > 0 && (
                        <Badge tone="brand" className="ml-0.5 px-1.5 py-0">
                            {count}
                        </Badge>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(36rem,calc(100vw-2rem))] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold">Contacts whose custom fields match</p>
                    {draft.rules.length > 1 && (
                        <Select value={draft.match} onValueChange={(m) => setDraft((d) => ({ ...d, match: m as 'all' | 'any' }))}>
                            <SelectTrigger size="sm" className="w-44" aria-label="Match">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All conditions</SelectItem>
                                <SelectItem value="any">Any condition</SelectItem>
                            </SelectContent>
                        </Select>
                    )}
                </div>
                <div className="grid gap-2">
                    {draft.rules.map((rule, i) => {
                        const f = fieldOf(rule);
                        const type = f?.type ?? 'text';

                        return (
                            <div key={i} className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] items-center gap-1.5">
                                <Select
                                    value={rule.field}
                                    onValueChange={(field) => {
                                        const next = fields.find((x) => `attr:${x.key}` === field);
                                        if (next) setRule(i, blank(next));
                                    }}
                                >
                                    <SelectTrigger size="sm" aria-label="Field">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {fields.map((x) => (
                                            <SelectItem key={x.key} value={`attr:${x.key}`}>
                                                {x.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Select value={rule.op} onValueChange={(op) => setRule(i, { ...rule, op })}>
                                    <SelectTrigger size="sm" aria-label="Condition">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {opsFor(type).map((op) => (
                                            <SelectItem key={op} value={op}>
                                                {OP_LABEL[op]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {NO_VALUE.includes(rule.op) ? (
                                    <span />
                                ) : type === 'boolean' ? (
                                    <Select value={String(rule.value ?? 'true')} onValueChange={(v) => setRule(i, { ...rule, value: v })}>
                                        <SelectTrigger size="sm" aria-label="Value">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="true">Yes</SelectItem>
                                            <SelectItem value="false">No</SelectItem>
                                        </SelectContent>
                                    </Select>
                                ) : (type === 'select' || type === 'multi_select') && (f?.options ?? []).length > 0 ? (
                                    <Select value={String(rule.value ?? '')} onValueChange={(v) => setRule(i, { ...rule, value: v })}>
                                        <SelectTrigger size="sm" aria-label="Value">
                                            <SelectValue placeholder="Choose…" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {(f?.options ?? []).map((o) => (
                                                <SelectItem key={o} value={o}>
                                                    {o}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <Input
                                        className="h-8 text-[13px]"
                                        type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
                                        value={String(rule.value ?? '')}
                                        onChange={(e) => setRule(i, { ...rule, value: e.target.value })}
                                        aria-label="Value"
                                        placeholder="Value"
                                    />
                                )}
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="Remove condition"
                                    onClick={() => setDraft((d) => ({ ...d, rules: d.rules.filter((_, j) => j !== i) }))}
                                >
                                    <XIcon />
                                </Button>
                            </div>
                        );
                    })}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDraft((d) => ({ ...d, rules: [...d.rules, blank(fields[0])] }))}
                        disabled={draft.rules.length >= 20}
                    >
                        <PlusIcon /> Add condition
                    </Button>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                onChange(null);
                                setOpen(false);
                            }}
                        >
                            Clear
                        </Button>
                        <Button
                            size="sm"
                            disabled={!complete}
                            onClick={() => {
                                const rules = draft.rules.map((r) =>
                                    NO_VALUE.includes(r.op) ? { field: r.field, op: r.op } : { ...r, value: String(r.value).trim() },
                                );
                                onChange(rules.length > 0 ? { match: draft.match, rules } : null);
                                setOpen(false);
                            }}
                        >
                            Apply
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
