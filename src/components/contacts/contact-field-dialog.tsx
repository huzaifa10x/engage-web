'use client';

import { LockIcon } from 'lucide-react';
import { useState } from 'react';

import { Field, FormError } from '@/components/app/field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ApiError, errorMessage } from '@/lib/api';
import { createContactField, updateContactField } from '@/lib/queries';
import type { ContactField, ContactFieldRules, ContactFieldsAllowance, ContactFieldType } from '@/lib/types';

export const FIELD_TYPES: { value: ContactFieldType; label: string; advanced: boolean }[] = [
    { value: 'text', label: 'Text', advanced: false },
    { value: 'number', label: 'Number', advanced: false },
    { value: 'date', label: 'Date', advanced: false },
    { value: 'email', label: 'Email', advanced: true },
    { value: 'url', label: 'Web address', advanced: true },
    { value: 'phone', label: 'Phone', advanced: true },
    { value: 'boolean', label: 'Yes / No', advanced: true },
    { value: 'select', label: 'Single choice', advanced: true },
    { value: 'multi_select', label: 'Multiple choice', advanced: true },
];

const typeLabel = (t: ContactFieldType) => FIELD_TYPES.find((x) => x.value === t)?.label ?? t;
const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

/** Create a custom field, or rename one and change its choices and rules (the type never changes). */
export function ContactFieldDialog({
    open,
    onOpenChange,
    field,
    allowance,
    onSaved,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    field: ContactField | null;
    allowance: ContactFieldsAllowance | undefined;
    onSaved: () => void;
}) {
    const editing = field !== null;
    const advanced = allowance?.advanced ?? false;
    const [loaded, setLoaded] = useState<string | null | undefined>(undefined);
    const [label, setLabel] = useState('');
    const [type, setType] = useState<ContactFieldType>('text');
    const [options, setOptions] = useState('');
    const [rules, setRules] = useState<Record<string, string | boolean>>({});
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    if (open && loaded !== (field?.id ?? null)) {
        setLoaded(field?.id ?? null);
        setLabel(field?.label ?? '');
        setType(field?.type ?? 'text');
        setOptions((field?.options ?? []).join('\n'));
        const r = field?.rules ?? {};
        setRules({
            required: r.required ?? false,
            min: r.min?.toString() ?? '',
            max: r.max?.toString() ?? '',
            min_length: r.min_length?.toString() ?? '',
            max_length: r.max_length?.toString() ?? '',
            pattern: r.pattern ?? '',
        });
        setError(null);
    }
    if (!open && loaded !== undefined) setLoaded(undefined);

    const hasChoices = type === 'select' || type === 'multi_select';
    const text = (k: string) => (typeof rules[k] === 'string' ? (rules[k] as string) : '');

    const save = async () => {
        setSaving(true);
        setError(null);
        const r: ContactFieldRules = advanced
            ? {
                  required: rules.required === true || undefined,
                  ...(type === 'number' ? { min: num(text('min')), max: num(text('max')) } : {}),
                  ...(type === 'text'
                      ? { min_length: num(text('min_length')), max_length: num(text('max_length')), pattern: text('pattern').trim() || undefined }
                      : {}),
              }
            : {};
        const body = {
            label: label.trim(),
            options: hasChoices
                ? options
                      .split('\n')
                      .map((o) => o.trim())
                      .filter(Boolean)
                : null,
            rules: advanced ? r : null,
        };
        try {
            if (editing) await updateContactField(field.id, body);
            else await createContactField({ ...body, type });
            onSaved();
            onOpenChange(false);
        } catch (e) {
            setError(e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? e.message) : errorMessage(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{editing ? 'Edit custom field' : 'New custom field'}</DialogTitle>
                    <DialogDescription>
                        {editing
                            ? 'Renaming keeps every value already saved on contacts.'
                            : 'Shown on every contact, usable in segments, imports and campaign personalisation.'}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4">
                    <FormError message={error} />
                    <Field label="Name" htmlFor="cf-label">
                        <Input
                            id="cf-label"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            maxLength={60}
                            placeholder="e.g. Membership tier"
                            autoFocus
                        />
                    </Field>
                    <Field
                        label="Type"
                        htmlFor="cf-type"
                        hint={
                            editing
                                ? 'The type cannot change once values are stored.'
                                : !advanced
                                  ? 'More types and validation rules come with the Enterprise plan.'
                                  : undefined
                        }
                    >
                        <Select value={type} onValueChange={(v) => setType(v as ContactFieldType)} disabled={editing}>
                            <SelectTrigger id="cf-type">
                                <SelectValue>{typeLabel(type)}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {FIELD_TYPES.map((t) => (
                                    <SelectItem key={t.value} value={t.value} disabled={t.advanced && !advanced}>
                                        <span className="flex items-center gap-2">
                                            {t.label}
                                            {t.advanced && !advanced && (
                                                <Badge tone="grey" className="gap-1">
                                                    <LockIcon className="size-3" /> Enterprise
                                                </Badge>
                                            )}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    {hasChoices && (
                        <Field label="Choices" htmlFor="cf-options" hint="One per line, 2 to 50.">
                            <textarea
                                id="cf-options"
                                rows={4}
                                value={options}
                                onChange={(e) => setOptions(e.target.value)}
                                className="rounded-md border bg-transparent px-3 py-2 text-sm"
                                placeholder={'Gold\nSilver\nBronze'}
                            />
                        </Field>
                    )}
                    {advanced && (
                        <div className="grid gap-3 rounded-lg border p-3">
                            <p className="text-[12.5px] font-semibold tracking-wide text-muted-foreground uppercase">Validation</p>
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="cf-required"
                                    checked={rules.required === true}
                                    onCheckedChange={(v) => setRules({ ...rules, required: v === true })}
                                />
                                <Label htmlFor="cf-required" className="font-normal">
                                    Required on every contact
                                </Label>
                            </div>
                            {type === 'number' && (
                                <div className="grid grid-cols-2 gap-2">
                                    <Field label="Minimum" htmlFor="cf-min">
                                        <Input id="cf-min" type="number" value={text('min')} onChange={(e) => setRules({ ...rules, min: e.target.value })} />
                                    </Field>
                                    <Field label="Maximum" htmlFor="cf-max">
                                        <Input id="cf-max" type="number" value={text('max')} onChange={(e) => setRules({ ...rules, max: e.target.value })} />
                                    </Field>
                                </div>
                            )}
                            {type === 'text' && (
                                <>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Field label="Min. characters" htmlFor="cf-minl">
                                            <Input
                                                id="cf-minl"
                                                type="number"
                                                min={0}
                                                value={text('min_length')}
                                                onChange={(e) => setRules({ ...rules, min_length: e.target.value })}
                                            />
                                        </Field>
                                        <Field label="Max. characters" htmlFor="cf-maxl">
                                            <Input
                                                id="cf-maxl"
                                                type="number"
                                                min={1}
                                                value={text('max_length')}
                                                onChange={(e) => setRules({ ...rules, max_length: e.target.value })}
                                            />
                                        </Field>
                                    </div>
                                    <Field label="Pattern (regular expression)" htmlFor="cf-pattern" hint="The whole value must match, e.g. M-[0-9]{4}">
                                        <Input
                                            id="cf-pattern"
                                            className="font-mono"
                                            value={text('pattern')}
                                            onChange={(e) => setRules({ ...rules, pattern: e.target.value })}
                                        />
                                    </Field>
                                </>
                            )}
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={save} disabled={saving || !label.trim()}>
                        {saving ? 'Saving…' : editing ? 'Save' : 'Create field'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export { typeLabel };
