'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { FormError } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { engageId, fmtPhone } from '@/lib/inbox';
import type { Contact } from '@/lib/types';

/**
 * Settings › Data (Owner): the legal deletion request for one person, the only way anything is deleted.
 * Find the contact, say why, type ERASE. Their chats, messages, timeline and enquiries are erased;
 * payments are kept without their details, and an opted-out number is kept only so they are never
 * messaged again.
 */
export function ContactErasureCard() {
    const qc = useQueryClient();
    const [q, setQ] = useState('');
    const [found, setFound] = useState<Contact[]>([]);
    const [picked, setPicked] = useState<Contact | null>(null);
    const [reason, setReason] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const term = q.trim();
        if (term.length < 2) return;
        const t = setTimeout(() => {
            void api<{ data: Contact[] }>('contacts', { query: { q: term, per_page: 5 } })
                .then((r) => setFound(r.data))
                .catch(() => setFound([]));
        }, 250);
        return () => clearTimeout(t);
    }, [q]);

    const close = () => {
        setPicked(null);
        setReason('');
        setConfirm('');
        setError(null);
    };

    return (
        <Card className="grid gap-3 p-5">
            <div>
                <p className="text-sm font-semibold">Erase a person’s data (legal deletion request)</p>
                <p className="text-[13px] text-muted-foreground">
                    The only way to delete a contact. Use it when someone asks you to delete their data. Their chats, messages, history and enquiries are erased
                    and cannot be recovered. Payments are kept without their details, and if they opted out their number is kept so they are never messaged
                    again.
                </p>
            </div>
            <Input
                value={q}
                onChange={(e) => {
                    setQ(e.target.value);
                    if (e.target.value.trim().length < 2) setFound([]);
                }}
                placeholder="Find the person: name, phone, email or ID"
                aria-label="Find the person to erase"
                className="max-w-md"
            />
            {found.length > 0 && (
                <ul className="grid max-w-md gap-1" aria-label="Matching contacts">
                    {found.map((c) => (
                        <li key={c.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-[13px]">
                            <span className="min-w-0 flex-1">
                                <b className="block truncate font-semibold" dir="auto">
                                    {c.display_name}
                                </b>
                                <small className="text-[12px] text-muted-foreground">
                                    {c.phone ? fmtPhone(c.phone) : (c.email ?? 'No number')} · {engageId(c.id)}
                                </small>
                            </span>
                            <Button size="sm" variant="outline" onClick={() => setPicked(c)}>
                                Erase…
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
            <Dialog open={picked !== null} onOpenChange={(o) => !o && close()}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Erase {picked?.display_name}?</DialogTitle>
                        <DialogDescription>
                            This deletes their chats, messages, history and enquiries for good. It is recorded in the Audit log with your reason.
                        </DialogDescription>
                    </DialogHeader>
                    <label className="grid gap-1.5 text-[13px] font-semibold">
                        Why are they being erased?
                        <Input
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g. They asked us to delete their data"
                            maxLength={300}
                        />
                    </label>
                    <label className="grid gap-1.5 text-[13px] font-semibold">
                        Type ERASE to confirm
                        <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
                    </label>
                    <FormError message={error} />
                    <DialogFooter>
                        <Button variant="outline" onClick={close}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={busy || confirm !== 'ERASE' || reason.trim().length < 5}
                            onClick={async () => {
                                if (!picked) return;
                                setBusy(true);
                                try {
                                    await api('data/contact-erasures', { method: 'POST', body: { contact_id: picked.id, reason: reason.trim(), confirm } });
                                    toast.success(`${picked.display_name} was erased`);
                                    setFound((f) => f.filter((x) => x.id !== picked.id));
                                    void qc.invalidateQueries({ queryKey: ['contacts'] });
                                    close();
                                } catch (e) {
                                    setError(errorMessage(e));
                                } finally {
                                    setBusy(false);
                                }
                            }}
                        >
                            {busy ? 'Erasing…' : 'Erase for good'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
