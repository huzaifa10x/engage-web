'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { api, errorMessage } from '@/lib/api';
import { keys, useGrants, usePhoneNumbers } from '@/lib/queries';
import type { Membership } from '@/lib/types';

/** Per-number access: the role decides WHAT a member can do, grants decide on WHICH numbers. */
export function NumberAccessDialog({ member, onOpenChange }: { member: Membership | null; onOpenChange: (o: boolean) => void }) {
    return (
        <Dialog open={member !== null} onOpenChange={onOpenChange}>
            {member && <AccessEditor key={member.id} member={member} onDone={() => onOpenChange(false)} />}
        </Dialog>
    );
}

function AccessEditor({ member, onDone }: { member: Membership; onDone: () => void }) {
    const qc = useQueryClient();
    const grants = useGrants(member.id);
    const numbers = usePhoneNumbers();
    const [draft, setDraft] = useState<string[] | null>(null); // null = untouched, show server state
    const selected = draft ?? grants.data?.phone_number_ids ?? [];

    const save = useMutation({
        mutationFn: () => api(`team/members/${member.id}/numbers`, { method: 'PUT', body: { phone_number_ids: selected } }),
        onSuccess: () => {
            toast.success('Number access updated');
            void qc.invalidateQueries({ queryKey: keys.grants(member.id) });
            onDone();
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    const list = (numbers.data ?? []).filter((n) => n.status !== 'disconnected');
    const toggle = (id: string, on: boolean) => setDraft(on ? [...new Set([...selected, id])] : selected.filter((x) => x !== id));

    return (
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Number access · {member.user?.name}</DialogTitle>
                <DialogDescription>Choose which WhatsApp numbers this member can see in the inbox, contacts and reports.</DialogDescription>
            </DialogHeader>

            {grants.isLoading || numbers.isLoading ? (
                <Skeleton className="h-24" />
            ) : grants.data?.all_numbers ? (
                <p className="rounded-md bg-brand-50 px-3 py-2.5 text-sm text-brand-600">
                    The <span className="font-semibold">{member.role?.name}</span> role has access to every number automatically. Change the role to restrict
                    access.
                </p>
            ) : list.length === 0 ? (
                <p className="text-sm text-muted-foreground">No numbers are connected yet.</p>
            ) : (
                <ul className="grid max-h-80 gap-1 overflow-y-auto">
                    {list.map((n) => {
                        const id = `grant-${n.id}`;

                        return (
                            <li key={n.id}>
                                <label htmlFor={id} className="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-muted/50">
                                    <Checkbox id={id} checked={selected.includes(n.id)} onCheckedChange={(v) => toggle(n.id, v === true)} />
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-semibold">{n.verified_name ?? 'Unnamed number'}</span>
                                        <span className="block font-mono text-[12px] text-muted-foreground">{n.display_phone_number}</span>
                                    </span>
                                </label>
                            </li>
                        );
                    })}
                </ul>
            )}

            <DialogFooter>
                <Button variant="outline" onClick={onDone}>
                    {grants.data?.all_numbers ? 'Close' : 'Cancel'}
                </Button>
                {!grants.data?.all_numbers && list.length > 0 && (
                    <Button onClick={() => save.mutate()} disabled={save.isPending}>
                        {save.isPending ? 'Saving…' : 'Save access'}
                    </Button>
                )}
            </DialogFooter>
        </DialogContent>
    );
}
