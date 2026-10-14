'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Field, FormError } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, ApiError } from '@/lib/api';
import { applyServerErrors } from '@/lib/form';
import { keys, useContactFields, useTags } from '@/lib/queries';
import type { Contact, ContactField } from '@/lib/types';

import { TagInput } from './tag-input';

const schema = z.object({
    phone: z.string().trim(),
    name: z.string().trim().max(190),
    email: z.union([z.literal(''), z.string().trim().email('Enter a valid email address.')]),
    opted_in: z.boolean(),
});
type Values = z.infer<typeof schema>;

type AttributeValue = string | boolean | string[] | undefined;

const toFormValue = (v: unknown): AttributeValue => (typeof v === 'boolean' ? v : Array.isArray(v) ? v.map(String) : v == null ? '' : String(v));
const isEmpty = (v: AttributeValue) => v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

/** The right control for each custom field type. */
function CustomFieldInput({ field, value, onChange }: { field: ContactField; value: AttributeValue; onChange: (v: AttributeValue) => void }) {
    const id = `c-f-${field.key}`;
    if (field.type === 'boolean') {
        return (
            <Select
                value={value === true ? 'yes' : value === false ? 'no' : ''}
                onValueChange={(v) => onChange(v === 'yes' ? true : v === 'no' ? false : undefined)}
            >
                <SelectTrigger id={id}>
                    <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                </SelectContent>
            </Select>
        );
    }
    if (field.type === 'select') {
        return (
            <Select value={typeof value === 'string' ? value : ''} onValueChange={onChange}>
                <SelectTrigger id={id}>
                    <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                    {(field.options ?? []).map((o) => (
                        <SelectItem key={o} value={o}>
                            {o}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        );
    }
    if (field.type === 'multi_select') {
        const picked = Array.isArray(value) ? value : [];
        return (
            <div id={id} className="flex flex-wrap gap-x-4 gap-y-2 rounded-md border px-3 py-2">
                {(field.options ?? []).map((o) => (
                    <label key={o} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={picked.includes(o)} onCheckedChange={(v) => onChange(v === true ? [...picked, o] : picked.filter((p) => p !== o))} />
                        {o}
                    </label>
                ))}
            </div>
        );
    }
    const type = { number: 'number', date: 'date', email: 'email', url: 'url', phone: 'tel' }[field.type as string] ?? 'text';
    const r = field.rules ?? {};

    return (
        <Input
            id={id}
            type={type}
            inputMode={field.type === 'phone' ? 'tel' : undefined}
            min={r.min}
            max={r.max}
            maxLength={r.max_length}
            placeholder={field.type === 'url' ? 'https://' : undefined}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
        />
    );
}

/** Create (phone required) or edit (phone is the identity and cannot change) a contact. */
export function ContactDialog({ open, onOpenChange, contact }: { open: boolean; onOpenChange: (o: boolean) => void; contact?: Contact | null }) {
    const qc = useQueryClient();
    const editing = !!contact;
    const [formError, setFormError] = useState<string | null>(null);
    const tagList = useTags(open);
    const fields = useContactFields(open);
    // Tags and custom fields live outside the form schema; they reset whenever another contact is opened.
    const [loaded, setLoaded] = useState<string | null | undefined>(undefined);
    const [tags, setTags] = useState<string[]>([]);
    const [attributes, setAttributes] = useState<Record<string, AttributeValue>>({});
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    if (open && loaded !== (contact?.id ?? null)) {
        setLoaded(contact?.id ?? null);
        setTags(contact?.tags ?? []);
        setAttributes(Object.fromEntries(Object.entries(contact?.attributes ?? {}).map(([k, v]) => [k, toFormValue(v)])));
        setFieldErrors({});
    }
    if (!open && loaded !== undefined) setLoaded(undefined);
    const { register, control, handleSubmit, setError, reset, formState } = useForm<Values>({
        resolver: zodResolver(schema),
        values: { phone: contact?.phone ?? '', name: contact?.name ?? '', email: contact?.email ?? '', opted_in: false },
    });

    const onSubmit = handleSubmit(async (v) => {
        setFormError(null);
        if (!editing && !v.phone) {
            setError('phone', { message: 'Enter a WhatsApp number in international format.' });

            return;
        }
        // Keep values the form does not show (set through the API), replace the fields it does show, drop emptied ones.
        const defined = new Set((fields.data ?? []).map((f) => f.key));
        const extra: Record<string, unknown> = Object.fromEntries(Object.entries(contact?.attributes ?? {}).filter(([k]) => !defined.has(k)));
        for (const f of fields.data ?? []) {
            const value = attributes[f.key];
            if (!isEmpty(value)) extra[f.key] = value;
        }
        setFieldErrors({});
        try {
            if (editing) {
                await api(`contacts/${contact.id}`, { method: 'PATCH', body: { name: v.name || null, email: v.email || null, tags, attributes: extra } });
            } else {
                await api('contacts', {
                    method: 'POST',
                    body: { phone: v.phone, name: v.name || null, email: v.email || null, opted_in: v.opted_in, tags, attributes: extra },
                });
            }
            toast.success(editing ? 'Contact updated' : 'Contact added');
            void qc.invalidateQueries({ queryKey: keys.contactsAll });
            void qc.invalidateQueries({ queryKey: keys.conversationsAll });
            void qc.invalidateQueries({ queryKey: keys.tags });
            void qc.invalidateQueries({ queryKey: keys.segments });
            reset();
            onOpenChange(false);
        } catch (e) {
            // Custom field problems come back as "attributes.<key>" and are shown under that field.
            if (e instanceof ApiError) {
                setFieldErrors(
                    Object.fromEntries(
                        Object.entries(e.fields)
                            .filter(([k]) => k.startsWith('attributes.'))
                            .map(([k, m]) => [k.slice('attributes.'.length), m[0]]),
                    ),
                );
            }
            const message = applyServerErrors(e, setError, ['phone', 'name', 'email']);
            setFormError(
                message && e instanceof ApiError && Object.keys(e.fields).every((k) => k.startsWith('attributes.')) ? 'Check the highlighted fields.' : message,
            );
        }
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{editing ? 'Edit contact' : 'Add contact'}</DialogTitle>
                    <DialogDescription>
                        {editing ? 'The WhatsApp number identifies the contact and cannot be changed.' : 'Contacts who message you are added automatically.'}
                    </DialogDescription>
                </DialogHeader>
                <form id="contact-form" onSubmit={onSubmit} className="grid gap-4" noValidate>
                    <FormError message={formError} />
                    <Field
                        label="WhatsApp number"
                        htmlFor="c-phone"
                        error={formState.errors.phone?.message}
                        hint={editing ? undefined : 'International format, e.g. +971501234567'}
                    >
                        <Input id="c-phone" inputMode="tel" disabled={editing} aria-invalid={!!formState.errors.phone} {...register('phone')} />
                    </Field>
                    <Field label="Name" htmlFor="c-name" error={formState.errors.name?.message}>
                        <Input id="c-name" {...register('name')} />
                    </Field>
                    <Field label="Email" htmlFor="c-email" error={formState.errors.email?.message}>
                        <Input id="c-email" type="email" aria-invalid={!!formState.errors.email} {...register('email')} />
                    </Field>
                    <Field label="Tags" htmlFor="c-tags" hint="Used to build segments and campaign audiences">
                        <TagInput id="c-tags" value={tags} onChange={setTags} suggestions={(tagList.data ?? []).map((t) => t.name)} />
                    </Field>
                    {fields.data && fields.data.length === 0 && (
                        <p className="text-[12.5px] text-muted-foreground">
                            Need more details on contacts? Add custom fields under Contacts → Segments, tags & fields.
                        </p>
                    )}
                    {(fields.data ?? []).length > 0 && (
                        <div className="grid gap-3 sm:grid-cols-2">
                            {(fields.data ?? []).map((f) => (
                                <Field
                                    key={f.id}
                                    label={f.rules?.required ? `${f.label} *` : f.label}
                                    htmlFor={`c-f-${f.key}`}
                                    error={fieldErrors[f.key]}
                                    className={f.type === 'multi_select' ? 'sm:col-span-2' : undefined}
                                >
                                    <CustomFieldInput field={f} value={attributes[f.key]} onChange={(v) => setAttributes({ ...attributes, [f.key]: v })} />
                                </Field>
                            ))}
                        </div>
                    )}
                    {!editing && (
                        <div className="flex items-start gap-2">
                            <Controller
                                control={control}
                                name="opted_in"
                                render={({ field }) => (
                                    <Checkbox id="c-optin" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} className="mt-0.5" />
                                )}
                            />
                            <Label htmlFor="c-optin" className="leading-snug font-normal text-muted-foreground">
                                This person agreed to receive WhatsApp messages from us (recorded in their consent history).
                            </Label>
                        </div>
                    )}
                </form>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="submit" form="contact-form" disabled={formState.isSubmitting}>
                        {formState.isSubmitting ? 'Saving…' : editing ? 'Save' : 'Add contact'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
