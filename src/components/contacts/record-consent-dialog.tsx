'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, ApiError, errorMessage } from '@/lib/api';
import { keys } from '@/lib/queries';
import type { Contact } from '@/lib/types';
import { cn } from '@/lib/utils';

export const CONSENT_METHODS = [
    ['phone_call', 'Phone call'],
    ['in_person', 'In person / in the shop'],
    ['form', 'Website or paper form'],
    ['email', 'Email'],
    ['other', 'Other'],
] as const;

type Method = (typeof CONSENT_METHODS)[number][0];

/**
 * A teammate records marketing consent (3.3): opted in or out, and how it was obtained, which is
 * required (our consent rules depend on it). "Other" needs a description. A customer who opted out
 * themselves can only opt back in themselves (START or Subscribe). Nothing is sent to the customer.
 */
export function RecordConsentDialog({
    contact,
    open,
    onOpenChange,
    initialState = 'opted_in',
    conversationId,
}: {
    contact: Contact;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialState?: 'opted_in' | 'opted_out';
    conversationId?: string;
}) {
    const qc = useQueryClient();
    const [state, setState] = useState<'opted_in' | 'opted_out'>(initialState);
    const [method, setMethod] = useState<Method | ''>('');
    const [note, setNote] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loadedFor, setLoadedFor] = useState<string | null>(null);
    if (open && loadedFor !== `${contact.id}:${initialState}`) {
        setLoadedFor(`${contact.id}:${initialState}`);
        setState(initialState);
        setMethod('');
        setNote('');
        setError(null);
    }
    if (!open && loadedFor !== null) setLoadedFor(null);

    const save = useMutation({
        mutationFn: () =>
            api<{ data: Contact }>(`contacts/${contact.id}/consent`, {
                method: 'POST',
                body: { state, method, note: note.trim() || null, notify: false, conversation_id: conversationId ?? null },
            }),
        onSuccess: () => {
            toast.success(
                `Consent saved · ${state === 'opted_in' ? 'Opted in' : 'Opted out'} · ${CONSENT_METHODS.find(([k]) => k === method)?.[1]}. Nothing was sent to the customer.`,
            );
            void qc.invalidateQueries({ queryKey: keys.contactsAll });
            void qc.invalidateQueries({ queryKey: keys.conversationsAll });
            void qc.invalidateQueries({ queryKey: ['inbox', 'conversation'] });
            void qc.invalidateQueries({ queryKey: ['contacts', contact.id] });
            onOpenChange(false);
        },
        onError: (e) => setError(e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? e.message) : errorMessage(e)),
    });

    const submit = () => {
        if (!method) return setError('Say how the consent was obtained.');
        if (method === 'other' && note.trim().length < 5) return setError('Describe how the consent was obtained.');
        setError(null);
        save.mutate();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Record consent</DialogTitle>
                    <DialogDescription>
                        Marketing consent for {contact.display_name}. Saved with who recorded it, when and how it was obtained. Nothing is sent to the customer.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-3">
                    <div className="inline-flex w-fit rounded-md border p-0.5" role="radiogroup" aria-label="Consent">
                        {(['opted_in', 'opted_out'] as const).map((s) => (
                            <button
                                key={s}
                                type="button"
                                role="radio"
                                aria-checked={state === s}
                                onClick={() => setState(s)}
                                className={cn(
                                    'rounded px-3 py-1 text-[13px] font-medium',
                                    state === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                                )}
                            >
                                {s === 'opted_in' ? 'Opted in' : 'Opted out'}
                            </button>
                        ))}
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="consent-method">
                            How was it obtained? <span className="font-normal text-muted-foreground">· required</span>
                        </Label>
                        <Select value={method} onValueChange={(v) => setMethod(v as Method)}>
                            <SelectTrigger id="consent-method" aria-invalid={!!error && !method}>
                                <SelectValue placeholder="Choose…" />
                            </SelectTrigger>
                            <SelectContent>
                                {CONSENT_METHODS.map(([k, l]) => (
                                    <SelectItem key={k} value={k}>
                                        {l}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Input
                            value={note}
                            maxLength={150}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder={method === 'other' ? 'Describe how they agreed' : 'Details, e.g. “Asked on the call on 18 Nov, agreed to offers”'}
                            aria-label="Details"
                        />
                    </div>
                    {error && (
                        <p role="alert" className="text-[12.5px] text-bad">
                            {error}
                        </p>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={save.isPending}>
                        {save.isPending ? 'Saving…' : 'Save consent'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
