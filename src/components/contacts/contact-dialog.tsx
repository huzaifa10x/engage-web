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
import { api } from '@/lib/api';
import { applyServerErrors } from '@/lib/form';
import { keys } from '@/lib/queries';
import type { Contact } from '@/lib/types';

const schema = z.object({
    phone: z.string().trim(),
    name: z.string().trim().max(190),
    email: z.union([z.literal(''), z.string().trim().email('Enter a valid email address.')]),
    opted_in: z.boolean(),
});
type Values = z.infer<typeof schema>;

/** Create (phone required) or edit (phone is the identity and cannot change) a contact. */
export function ContactDialog({ open, onOpenChange, contact }: { open: boolean; onOpenChange: (o: boolean) => void; contact?: Contact | null }) {
    const qc = useQueryClient();
    const editing = !!contact;
    const [formError, setFormError] = useState<string | null>(null);
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
        try {
            if (editing) {
                await api(`contacts/${contact.id}`, { method: 'PATCH', body: { name: v.name || null, email: v.email || null } });
            } else {
                await api('contacts', { method: 'POST', body: { phone: v.phone, name: v.name || null, email: v.email || null, opted_in: v.opted_in } });
            }
            toast.success(editing ? 'Contact updated' : 'Contact added');
            void qc.invalidateQueries({ queryKey: keys.contactsAll });
            void qc.invalidateQueries({ queryKey: keys.conversationsAll });
            reset();
            onOpenChange(false);
        } catch (e) {
            setFormError(applyServerErrors(e, setError, ['phone', 'name', 'email']));
        }
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
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
