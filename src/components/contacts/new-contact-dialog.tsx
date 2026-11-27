'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { useSession } from '@/components/app/session';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, ApiError, errorMessage } from '@/lib/api';
import { engageId } from '@/lib/inbox';
import type { Contact } from '@/lib/types';

import { useOpenContact } from './contact-sheet';
import { useTeamOwners } from './crm-fields';

const SOURCES = ['Walk-in / phone call', 'Referral', 'Event', 'Website form', 'CSV import', 'Unattributed'];
const label = 'flex flex-col gap-1.5 text-[13px] font-semibold';
const select =
    'h-9 rounded-md border border-input bg-card px-2 text-[13px] font-normal outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20';

/**
 * New contact (Contacts & CRM 3.5). Matched by phone and email first, so nobody already in Engage is
 * created twice: a match offers to open that contact instead.
 */
export function NewContactDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
    const qc = useQueryClient();
    const { membership } = useSession();
    const owners = useTeamOwners();
    const openContact = useOpenContact();
    const [f, setF] = useState({ first: '', last: '', phone: '', email: '', company: '', source: SOURCES[0], owner: membership.id });
    const [error, setError] = useState<React.ReactNode>(null);
    const [busy, setBusy] = useState(false);
    const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

    const save = async () => {
        const p = f.phone.trim();
        const e = f.email.trim().toLowerCase();
        const digits = p.replace(/\D/g, '');
        if (!p && !e) return setError('Add a WhatsApp phone or an email');
        if (p && (!p.startsWith('+') || digits.length < 8 || digits.length > 15)) return setError('Phone must be in international format, starting with +');
        if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return setError('Enter a valid email');
        setBusy(true);
        try {
            const r = await api<{ data: Contact }>('contacts', {
                method: 'POST',
                body: {
                    name: [f.first.trim(), f.last.trim()].filter(Boolean).join(' ') || null,
                    phone: p || null,
                    email: e || null,
                    company: f.company.trim() || null,
                    source_detail: f.source,
                    owner_membership_id: f.owner || null,
                },
            });
            void qc.invalidateQueries({ queryKey: ['contacts'] });
            onOpenChange(false);
            setF({ first: '', last: '', phone: '', email: '', company: '', source: SOURCES[0], owner: membership.id });
            toast.success('Contact created · they’ll join the inbox when a WhatsApp chat starts');
            openContact(r.data);
        } catch (err) {
            if (err instanceof ApiError && err.status === 422 && /Already in engageX/.test(errorMessage(err))) {
                const found = await api<{ data: Contact[] }>('contacts', { query: { q: p || e, per_page: 1 } }).catch(() => null);
                const m = found?.data[0];
                setError(
                    m ? (
                        <>
                            Already in engageX as <b>{m.display_name}</b> ({engageId(m.id)}).{' '}
                            <button
                                type="button"
                                className="font-semibold text-brand-600 hover:underline"
                                onClick={() => {
                                    onOpenChange(false);
                                    openContact(m);
                                }}
                            >
                                Open contact
                            </button>
                        </>
                    ) : (
                        errorMessage(err)
                    ),
                );
            } else setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>New contact</DialogTitle>
                    <DialogDescription>Matched by phone and email first, so you won’t create a duplicate of someone already in engageX.</DialogDescription>
                </DialogHeader>
                <form
                    className="grid grid-cols-2 gap-x-3 gap-y-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void save();
                    }}
                    onChange={() => setError(null)}
                >
                    <label className={label}>
                        First name
                        <Input value={f.first} onChange={set('first')} dir="auto" autoFocus />
                    </label>
                    <label className={label}>
                        Last name
                        <Input value={f.last} onChange={set('last')} dir="auto" />
                    </label>
                    <label className={label}>
                        WhatsApp phone
                        <Input value={f.phone} onChange={set('phone')} placeholder="+971 50 123 4567" inputMode="tel" />
                    </label>
                    <label className={label}>
                        Email
                        <Input value={f.email} onChange={set('email')} placeholder="name@company.com" type="email" />
                    </label>
                    <label className={label}>
                        Company
                        <Input value={f.company} onChange={set('company')} />
                    </label>
                    <label className={label}>
                        Source
                        <select className={select} value={f.source} onChange={set('source')}>
                            {SOURCES.map((s) => (
                                <option key={s}>{s}</option>
                            ))}
                        </select>
                    </label>
                    <label className={label}>
                        Contact owner
                        <select className={select} value={f.owner} onChange={set('owner')}>
                            {owners.map((o) => (
                                <option key={o.id} value={o.id}>
                                    {o.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    {error && (
                        <p role="alert" className="col-span-2 text-[13px] text-bad">
                            {error}
                        </p>
                    )}
                    <button type="submit" hidden />
                </form>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button disabled={busy} onClick={() => void save()}>
                        {busy ? 'Creating…' : 'Create contact'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
