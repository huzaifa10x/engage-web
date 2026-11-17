'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { useSession } from '@/components/app/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { P } from '@/lib/permissions';

/** Contacts › Stages: when a returning customer's message starts a new enquiry. */
export function EnquirySettings() {
    const { can } = useSession();
    const qc = useQueryClient();
    const q = useQuery({
        queryKey: ['enquiry-settings'],
        queryFn: () => api<{ data: { quiet_days: number; default_quiet_days: number } }>('tenant/enquiry-settings').then((r) => r.data),
        enabled: can(P.SettingsView),
    });
    const [days, setDays] = useState<number | null>(null);
    if (!q.data) return null;
    const value = days ?? q.data.quiet_days;
    const save = async () => {
        try {
            qc.setQueryData(
                ['enquiry-settings'],
                (
                    await api<{ data: { quiet_days: number; default_quiet_days: number } }>('tenant/enquiry-settings', {
                        method: 'PUT',
                        body: { quiet_days: value },
                    })
                ).data,
            );
            setDays(null);
            toast.success('Saved');
        } catch (e) {
            toast.error(errorMessage(e));
        }
    };

    return (
        <div className="mt-4 grid gap-2 rounded-md border p-3 text-[13px]" role="region" aria-label="Enquiries">
            <p className="font-semibold">Enquiries</p>
            <p className="text-[12.5px] text-muted-foreground">
                An enquiry is one buying conversation. A new one starts when a customer writes after a quiet period, arrives from a new ad click, or when a
                teammate starts one.
            </p>
            <label className="flex flex-wrap items-center gap-2">
                New enquiry after
                <Input
                    type="number"
                    min={1}
                    max={365}
                    className="h-8 w-20"
                    value={value}
                    disabled={!can(P.SettingsManage)}
                    onChange={(e) => setDays(Math.min(365, Math.max(1, Number(e.target.value) || 1)))}
                    aria-label="Quiet period in days"
                />
                days without messages (default {q.data.default_quiet_days})
            </label>
            {days !== null && can(P.SettingsManage) && (
                <Button size="sm" className="w-fit" onClick={save}>
                    Save
                </Button>
            )}
        </div>
    );
}
