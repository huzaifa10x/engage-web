'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Field, FormError } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { errorMessage } from '@/lib/api';
import { newId } from '@/lib/id';
import { keys, startConversation, usePhoneNumbers } from '@/lib/queries';
import type { Contact } from '@/lib/types';

import { TemplateFields, toTemplate } from './template-dialog';

/**
 * Business-initiated conversation: always a template (WhatsApp rule outside the 24h window).
 * Opens with an existing contact (from Contacts) or any number in international format.
 */
export function NewConversationDialog({
    open,
    onOpenChange,
    contact,
    defaultNumberId,
    onStarted,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    contact?: Contact | null;
    defaultNumberId?: string | null;
    onStarted: (conversationId: string) => void;
}) {
    const qc = useQueryClient();
    const numbers = (usePhoneNumbers().data ?? []).filter((n) => n.status === 'connected');
    const [numberId, setNumberId] = useState<string | null>(defaultNumberId ?? null);
    const [to, setTo] = useState('');
    const [tpl, setTpl] = useState({ name: '', language: 'en_US', variables: [] as string[] });
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const fromId = numberId ?? numbers[0]?.id ?? null;

    const submit = async () => {
        setError(null);
        if (!fromId) return setError('Connect a WhatsApp number first.');
        if (!contact && !to.trim()) return setError('Enter the recipient’s WhatsApp number.');
        if (!tpl.name) return setError('Enter the template name.');

        setPending(true);
        try {
            const message = await startConversation(
                { phone_number_id: fromId, ...(contact ? { contact_id: contact.id } : { to: to.trim() }), type: 'template', template: toTemplate(tpl) },
                newId(),
            );
            void qc.invalidateQueries({ queryKey: keys.conversationsAll });
            onOpenChange(false);
            onStarted(message.conversation_id);
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setPending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{contact ? `Message ${contact.display_name}` : 'New conversation'}</DialogTitle>
                    <DialogDescription>
                        Business-initiated conversations start with an approved template. The customer’s reply opens a 24-hour window for free-form messages.
                    </DialogDescription>
                </DialogHeader>
                <FormError message={error} />
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="From" htmlFor="nc-from">
                        <Select value={fromId ?? undefined} onValueChange={setNumberId}>
                            <SelectTrigger id="nc-from">
                                <SelectValue placeholder="Choose a number" />
                            </SelectTrigger>
                            <SelectContent>
                                {numbers.map((n) => (
                                    <SelectItem key={n.id} value={n.id}>
                                        {n.verified_name ?? n.display_phone_number}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label="To" htmlFor="nc-to" hint={contact ? undefined : 'International format, e.g. +971501234567'}>
                        {contact ? (
                            <Input id="nc-to" value={contact.phone ?? contact.display_name} disabled />
                        ) : (
                            <Input
                                id="nc-to"
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                                placeholder="+971 50 123 4567"
                                inputMode="tel"
                                autoComplete="off"
                            />
                        )}
                    </Field>
                </div>
                <TemplateFields value={tpl} onChange={setTpl} />
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={pending || numbers.length === 0}>
                        {pending ? 'Sending…' : 'Send template'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
