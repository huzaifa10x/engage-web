'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CheckIcon, UserIcon, XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Field, FormError } from '@/components/app/field';
import { emptySelection, selectionError, selectionPayload, TemplatePicker, type TemplateSelection } from '@/components/templates/template-picker';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { errorMessage } from '@/lib/api';
import { newId } from '@/lib/id';
import { keys, startConversation, useContacts, usePhoneNumbers } from '@/lib/queries';
import type { Contact } from '@/lib/types';

const looksLikePhone = (value: string) => value.replace(/\D/g, '').length >= 7 && /^[+\d\s()-]+$/.test(value.trim());

/**
 * Business-initiated conversation: choose an existing contact (or type a new number), then an
 * approved template — the only message WhatsApp allows before the customer has written. An
 * existing contact and its conversation are always reused, never duplicated.
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
    const [search, setSearch] = useState('');
    const [picked, setPicked] = useState<Contact | null>(null);
    const [selection, setSelection] = useState<TemplateSelection>(emptySelection);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    const from = numbers.find((n) => n.id === numberId) ?? numbers[0] ?? null;
    const recipient = contact ?? picked;

    // Debounced lookup of existing contacts while typing a name or number.
    useEffect(() => {
        const timer = setTimeout(() => setSearch(to.trim()), 250);

        return () => clearTimeout(timer);
    }, [to]);
    const matches = useContacts(search.length >= 2 && !recipient ? { q: search } : {});
    const suggestions = search.length >= 2 && !recipient ? (matches.data?.pages[0]?.data ?? []).slice(0, 6) : [];

    const submit = async () => {
        setError(null);
        if (!from) return setError('Connect a WhatsApp number first.');
        if (!recipient && !looksLikePhone(to)) return setError('Choose a contact, or enter a WhatsApp number in international format, e.g. +971501234567.');
        if (recipient?.consent_state === 'opted_out') return setError('This contact opted out of messages and cannot be messaged.');
        const problem = selectionError(selection);
        if (problem) return setError(problem);

        setPending(true);
        try {
            const message = await startConversation(
                { phone_number_id: from.id, ...(recipient ? { contact_id: recipient.id } : { to: to.trim() }), ...selectionPayload(selection) },
                newId(),
            );
            void qc.invalidateQueries({ queryKey: keys.conversationsAll });
            void qc.invalidateQueries({ queryKey: keys.contactsAll });
            setSelection(emptySelection);
            setTo('');
            setPicked(null);
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
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{contact ? `Message ${contact.display_name}` : 'New conversation'}</DialogTitle>
                    <DialogDescription>
                        Conversations you start begin with an approved template. The customer’s reply opens a 24-hour window for normal messages.
                    </DialogDescription>
                </DialogHeader>
                <FormError message={error} />
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="From" htmlFor="nc-from">
                        <Select
                            value={from?.id}
                            onValueChange={(id) => {
                                setNumberId(id);
                                setSelection(emptySelection); // templates belong to the number's WhatsApp account
                            }}
                        >
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
                    <Field label="To" htmlFor="nc-to" hint={recipient ? undefined : 'Search your contacts, or type a new number with country code'}>
                        {recipient ? (
                            <div className="flex h-9 items-center gap-2 rounded-md border bg-muted px-3 text-sm">
                                <UserIcon className="size-4 shrink-0 text-muted-foreground" />
                                <span className="min-w-0 flex-1 truncate">
                                    {recipient.display_name}
                                    {recipient.phone ? ` · ${recipient.phone}` : ''}
                                </span>
                                {!contact && (
                                    <button
                                        onClick={() => setPicked(null)}
                                        aria-label="Choose someone else"
                                        className="text-muted-foreground hover:text-foreground"
                                    >
                                        <XIcon className="size-4" />
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="relative">
                                <Input
                                    id="nc-to"
                                    value={to}
                                    onChange={(e) => setTo(e.target.value)}
                                    placeholder="Name or +971 50 123 4567"
                                    autoComplete="off"
                                />
                                {suggestions.length > 0 && (
                                    <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-card py-1 shadow-md">
                                        {suggestions.map((c) => (
                                            <li key={c.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setPicked(c);
                                                        setTo('');
                                                    }}
                                                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted"
                                                >
                                                    <CheckIcon className="size-3.5 shrink-0 opacity-0" />
                                                    <span className="min-w-0 flex-1 truncate">{c.display_name}</span>
                                                    <span className="shrink-0 text-muted-foreground">{c.phone ?? ''}</span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </Field>
                </div>
                <TemplatePicker wabaAccountId={from?.waba_account_id ?? null} value={selection} onChange={setSelection} />
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={pending || numbers.length === 0 || !selection.template}>
                        {pending ? 'Sending…' : 'Send template'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
