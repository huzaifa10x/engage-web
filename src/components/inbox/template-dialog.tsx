'use client';

import { useState } from 'react';

import { FormError } from '@/components/app/field';
import { emptySelection, selectionError, selectionPayload, TemplatePicker, type TemplateSelection } from '@/components/templates/template-picker';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { errorMessage } from '@/lib/api';
import type { SendPayload } from '@/lib/queries';

/**
 * Send an approved template inside an existing conversation — the only message WhatsApp allows
 * once the 24-hour customer service window has closed.
 */
export function TemplateDialog({
    open,
    onOpenChange,
    wabaAccountId,
    onSend,
    noMarketing = false,
    unknownConsent = false,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    wabaAccountId: string | null;
    onSend: (payload: SendPayload) => Promise<void>;
    /** The contact opted out (STOP) or stopped marketing: only utility and authentication templates. */
    noMarketing?: boolean;
    /** No consent record: marketing is allowed once the sender confirms the contact agreed. */
    unknownConsent?: boolean;
}) {
    const [selection, setSelection] = useState<TemplateSelection>(emptySelection);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const [agreed, setAgreed] = useState(false);
    const askAgreed = unknownConsent && !noMarketing && selection.template?.category === 'MARKETING';

    const submit = async () => {
        const problem = selectionError(selection);
        if (problem) return setError(problem);
        if (noMarketing && selection.template?.category === 'MARKETING')
            return setError('This contact does not receive marketing messages. Choose a utility or authentication template.');
        if (askAgreed && !agreed) return setError('Confirm the contact agreed to receive messages from your business.');

        setPending(true);
        setError(null);
        try {
            await onSend(selectionPayload(selection));
            setSelection(emptySelection);
            onOpenChange(false);
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
                    <DialogTitle>Send a template</DialogTitle>
                    <DialogDescription>
                        Approved templates are the only messages WhatsApp allows outside the 24-hour window. When the customer replies, the window opens and you
                        can send normal messages again.
                    </DialogDescription>
                </DialogHeader>
                {noMarketing && (
                    <p className="rounded-md border border-warn/30 bg-warn-bg px-3 py-2 text-[12.5px] text-ink-2">
                        This contact does not receive marketing messages. Utility and authentication templates (order updates, codes) can still be sent.
                    </p>
                )}
                <FormError message={error} />
                <TemplatePicker wabaAccountId={wabaAccountId} value={selection} onChange={setSelection} />
                {askAgreed && (
                    <div role="alert" className="grid gap-1.5 rounded-md border border-warn/30 bg-warn-bg px-3 py-2 text-[12.5px] text-ink-2">
                        <p>No consent record for this contact. Send marketing only if they agreed to hear from your business.</p>
                        <label className="flex items-start gap-2 font-semibold">
                            <input
                                type="checkbox"
                                className="mt-0.5 accent-[var(--brand-500)]"
                                checked={agreed}
                                onChange={(e) => setAgreed(e.target.checked)}
                            />
                            They agreed to receive messages from us
                        </label>
                    </div>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={pending || !selection.template}>
                        {pending ? 'Sending…' : 'Send template'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
