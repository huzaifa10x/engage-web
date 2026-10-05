'use client';

import { LockIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { FormError } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { errorMessage } from '@/lib/api';
import { createSetupIntent } from '@/lib/queries';
import { getStripe, type StripeCardElement, type StripeInstance } from '@/lib/stripe';

/**
 * Add a card without leaving the platform. The card number is typed into a field served by
 * Stripe inside this dialog, so it goes straight to Stripe and never reaches our servers.
 */
export function AddCardDialog({
    open,
    onOpenChange,
    publishableKey,
    onAdded,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    publishableKey: string;
    onAdded: (paymentMethodId: string | null) => void;
}) {
    const mount = useRef<HTMLDivElement>(null);
    const stripe = useRef<StripeInstance | null>(null);
    const card = useRef<StripeCardElement | null>(null);
    const [ready, setReady] = useState(false);
    const [complete, setComplete] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;

        void getStripe(publishableKey)
            .then((instance) => {
                if (cancelled || !mount.current) return;
                stripe.current = instance;
                const element = instance.elements().create('card', {
                    hidePostalCode: true,
                    style: { base: { fontSize: '15px', color: '#0f172a', '::placeholder': { color: '#94a3b8' } }, invalid: { color: '#dc2626' } },
                });
                element.mount(mount.current);
                element.on('change', (e) => {
                    setComplete(e.complete);
                    setError(e.error?.message ?? null);
                });
                card.current = element;
                setReady(true);
            })
            .catch((e: unknown) => !cancelled && setError(errorMessage(e)));

        return () => {
            cancelled = true;
            card.current?.destroy();
            card.current = null;
            setReady(false);
            setComplete(false);
            setError(null);
        };
    }, [open, publishableKey]);

    const save = async () => {
        if (!stripe.current || !card.current) return;
        setSaving(true);
        setError(null);
        try {
            const secret = await createSetupIntent();
            // Stripe shows the bank's verification step (3-D Secure) here if the card needs it.
            const result = await stripe.current.confirmCardSetup(secret, { payment_method: { card: card.current } });
            if (result.error) {
                setError(result.error.message ?? 'The card could not be saved.');
            } else {
                onAdded(result.setupIntent?.payment_method ?? null);
                onOpenChange(false);
            }
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Add a card</DialogTitle>
                    <DialogDescription>Used for your subscription. You can change or remove it at any time.</DialogDescription>
                </DialogHeader>
                <FormError message={error} />
                <div className="rounded-md border border-input bg-card px-3 py-3">
                    <div ref={mount} aria-label="Card details" />
                    {!ready && !error && <p className="text-[13px] text-muted-foreground">Loading the secure card form…</p>}
                </div>
                <p className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                    <LockIcon className="size-3.5" /> Card details are encrypted and handled by Stripe. We never see or store your card number.
                </p>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={save} disabled={!ready || !complete || saving}>
                        {saving ? 'Saving…' : 'Save card'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
