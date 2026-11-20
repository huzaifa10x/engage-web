'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Field, FormError } from '@/components/app/field';
import { ContactTimeline } from '@/components/contacts/contact-timeline';
import { AcquisitionCard } from '@/components/growth/acquisition-card';
import { ConsentHistory } from '@/components/contacts/consent-history';
import { stageRequirement, useCurrentEnquiry } from './change-stage-dialog';
import { StageHistory } from './stage-history';
import { StageBadge } from './stage-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent } from '@/components/ui/sheet';

import { ContactSheetHeader } from './contact-sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, ApiError } from '@/lib/api';
import { applyServerErrors } from '@/lib/form';
import { useSession } from '@/components/app/session';
import { P } from '@/lib/permissions';
import { keys, useContactFields, useStages, useTags } from '@/lib/queries';
import type { Contact, ContactField } from '@/lib/types';

import { TagInput } from './tag-input';

const schema = z.object({
    phone: z.string().trim(),
    name: z.string().trim().max(190),
    email: z.union([z.literal(''), z.string().trim().email('Enter a valid email address.')]),
    opted_in: z.boolean(),
});
type Values = z.infer<typeof schema>;

const NO_STAGE = '__none__';

export type AttributeValue = string | boolean | string[] | undefined;

const toFormValue = (v: unknown): AttributeValue => (typeof v === 'boolean' ? v : Array.isArray(v) ? v.map(String) : v == null ? '' : String(v));
const isEmpty = (v: AttributeValue) => v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

/** The right control for each custom field type. */
export function CustomFieldInput({ field, value, onChange }: { field: ContactField; value: AttributeValue; onChange: (v: AttributeValue) => void }) {
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
export function ContactDialog({
    open,
    onOpenChange,
    contact,
    variant = 'dialog',
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    contact?: Contact | null;
    /** "sheet": the record slides in over the current page (opening a contact anywhere). */
    variant?: 'dialog' | 'sheet';
}) {
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
    // Contacts & CRM only shows the stage. Owners and Admins may set it here as part of editing the
    // contact; everyone else changes it from the chat or Growth Hub › Leads.
    const { membership } = useSession();
    const role = membership.role?.is_system ? membership.role.key : null;
    const editsStage = editing && (role === 'owner' || role === 'admin');
    const stages = (useStages(open && editsStage).data ?? []).filter((s) => !s.archived);
    const [stageId, setStageId] = useState<string>(NO_STAGE);
    const [stageReason, setStageReason] = useState('');
    // The stage belongs to the current enquiry; its version is sent back so nobody is overwritten (item 4).
    const enquiry = useCurrentEnquiry(contact?.id ?? '', open && editsStage && !!contact);
    const { can } = useSession();
    const stageNeed = stageRequirement(
        stages.find((s) => s.id === stageId),
        enquiry.data,
        can(P.InboxReply) || can(P.StagesApproveWon),
    );
    if (open && loaded !== (contact?.id ?? null)) {
        setLoaded(contact?.id ?? null);
        setStageId(contact?.stage?.id ?? NO_STAGE);
        setStageReason('');
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
                const nextStage = stageId === NO_STAGE ? null : stageId;
                if (editsStage && nextStage !== (contact.stage?.id ?? null)) {
                    await api(`contacts/${contact.id}/stage`, {
                        method: 'POST',
                        body: { stage_id: nextStage, version: enquiry.data?.stage_version ?? 0, reason: stageReason.trim() || null, via: 'contact' },
                    });
                    void qc.invalidateQueries({ queryKey: ['contacts', contact.id] });
                    void qc.invalidateQueries({ queryKey: keys.stageHistory(contact.id) });
                    void qc.invalidateQueries({ queryKey: keys.stages });
                    void qc.invalidateQueries({ queryKey: keys.leadsAll });
                }
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

    const sections = (
        <>
            {editing && contact && (
                <section className="grid gap-2 rounded-lg border p-3.5" aria-label="Stage">
                    <div className="flex items-center gap-2">
                        <h3 className="text-[13.5px] font-semibold">Stage</h3>
                        <StageBadge stage={contact.stage} />
                    </div>
                    <StageHistory contactId={contact.id} />
                </section>
            )}
            {editing && contact && (
                <section className="grid gap-2 rounded-lg border p-3.5" aria-label="Consent">
                    <h3 className="text-[13.5px] font-semibold">Consent history</h3>
                    <ConsentHistory contactId={contact.id} />
                </section>
            )}
            {editing && contact && <AcquisitionCard contact={contact} />}
        </>
    );
    const form = (
        <form id="contact-form" onSubmit={onSubmit} className="grid gap-4" noValidate>
            <FormError message={formError} />
            <Field
                label="WhatsApp number"
                htmlFor="c-phone"
                error={formState.errors.phone?.message}
                hint={
                    editing
                        ? undefined
                        : 'With the country code, e.g. +971 50 123 4567. A number starting with 0 is read in your workspace country (Settings › Company).'
                }
            >
                <Input id="c-phone" inputMode="tel" disabled={editing} aria-invalid={!!formState.errors.phone} {...register('phone')} />
            </Field>
            <Field label="Name" htmlFor="c-name" error={formState.errors.name?.message}>
                <Input id="c-name" {...register('name')} />
            </Field>
            <Field label="Email" htmlFor="c-email" error={formState.errors.email?.message}>
                <Input id="c-email" type="email" aria-invalid={!!formState.errors.email} {...register('email')} />
            </Field>
            {editsStage && stages.length > 0 && (
                <Field label="Stage" htmlFor="c-stage" hint="Saved with the contact and kept in the stage history">
                    <Select value={stageId} onValueChange={setStageId}>
                        <SelectTrigger id="c-stage">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NO_STAGE}>No stage</SelectItem>
                            {stages.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                    {s.name}
                                </SelectItem>
                            ))}
                            {contact?.stage?.archived && (
                                <SelectItem value={contact.stage.id} disabled>
                                    {contact.stage.name} (archived)
                                </SelectItem>
                            )}
                        </SelectContent>
                    </Select>
                </Field>
            )}
            {editsStage &&
                stageNeed &&
                stageId !== (contact?.stage?.id ?? NO_STAGE) &&
                (stageNeed.kind === 'blocked' ? (
                    <p role="alert" className="rounded-md bg-warn-bg px-3 py-2 text-[12.5px] text-warn">
                        {stageNeed.hint}
                    </p>
                ) : (
                    <Field label={stageNeed.label} htmlFor="c-stage-reason" hint={stageNeed.hint}>
                        <Input id="c-stage-reason" value={stageReason} maxLength={200} onChange={(e) => setStageReason(e.target.value)} />
                    </Field>
                ))}
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
    );
    const footer = (
        <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
                {variant === 'sheet' ? 'Close' : 'Cancel'}
            </Button>
            <Button type="submit" form="contact-form" disabled={formState.isSubmitting}>
                {formState.isSubmitting ? 'Saving…' : editing ? 'Save' : 'Add contact'}
            </Button>
        </>
    );

    // Opening an existing contact slides the record in over the current page (3.3): view and edit it
    // there, then close to be back where you were. Adding a contact stays a dialog.
    if (variant === 'sheet' && contact) {
        return (
            <Sheet open={open} onOpenChange={onOpenChange}>
                <SheetContent aria-describedby={undefined} closeLabel="Close contact">
                    <ContactSheetHeader contact={contact} />
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <div className="grid gap-4 p-5">
                            <section className="rounded-lg border bg-card p-3.5" aria-label="Enquiries and history">
                                <ContactTimeline contactId={contact.id} />
                            </section>
                            <section className="grid gap-3 rounded-lg border bg-card p-3.5" aria-label="Details">
                                <h3 className="text-[13.5px] font-semibold">Details</h3>
                                {form}
                            </section>
                            {sections}
                        </div>
                    </div>
                    <div className="flex shrink-0 justify-end gap-2 border-t bg-card px-5 py-3">{footer}</div>
                </SheetContent>
            </Sheet>
        );
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{editing ? 'Edit contact' : 'Add contact'}</DialogTitle>
                    <DialogDescription>
                        {editing ? 'The WhatsApp number identifies the contact and cannot be changed.' : 'Contacts who message you are added automatically.'}
                    </DialogDescription>
                </DialogHeader>
                {sections}
                {editing && contact && (
                    <section className="rounded-lg border p-3.5" aria-label="Enquiries and history">
                        <ContactTimeline contactId={contact.id} />
                    </section>
                )}
                {form}
                <DialogFooter>{footer}</DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
