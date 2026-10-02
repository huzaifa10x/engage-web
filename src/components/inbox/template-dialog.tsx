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
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    wabaAccountId: string | null;
    onSend: (payload: SendPayload) => Promise<void>;
}) {
    const [selection, setSelection] = useState<TemplateSelection>(emptySelection);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    const submit = async () => {
        const problem = selectionError(selection);
        if (problem) return setError(problem);

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
                <FormError message={error} />
                <TemplatePicker wabaAccountId={wabaAccountId} value={selection} onChange={setSelection} />
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
