'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Field, FormError } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, ApiError } from '@/lib/api';
import { applyServerErrors } from '@/lib/form';
import { keys } from '@/lib/queries';
import type { Role } from '@/lib/types';

const schema = z.object({
    email: z.string().trim().email('Enter a valid email address.'),
    role_id: z.string().min(1, 'Choose a role.'),
});
type Values = z.infer<typeof schema>;

export function InviteDialog({ open, onOpenChange, roles }: { open: boolean; onOpenChange: (o: boolean) => void; roles: Role[] }) {
    const qc = useQueryClient();
    const [formError, setFormError] = useState<string | null>(null);
    const defaultRole = roles.find((r) => r.key === 'agent')?.id ?? roles[0]?.id ?? '';
    const { register, control, handleSubmit, setError, reset, formState } = useForm<Values>({
        resolver: zodResolver(schema),
        values: { email: '', role_id: defaultRole },
    });

    const onSubmit = handleSubmit(async (values) => {
        setFormError(null);
        try {
            await api('team/invitations', { method: 'POST', body: values });
            toast.success(`Invitation sent to ${values.email}`);
            void qc.invalidateQueries({ queryKey: keys.invitations });
            reset();
            onOpenChange(false);
        } catch (e) {
            setFormError(
                e instanceof ApiError && e.code === 'plan_limit_reached'
                    ? 'All team seats on your plan are in use. Remove a member or revoke an invitation, or upgrade your plan.'
                    : applyServerErrors(e, setError, ['email', 'role_id']),
            );
        }
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Invite a teammate</DialogTitle>
                    <DialogDescription>They get an email with a link that is valid for 7 days. A pending invitation uses a team seat.</DialogDescription>
                </DialogHeader>
                <form id="invite-form" onSubmit={onSubmit} className="grid gap-4" noValidate>
                    <FormError message={formError} />
                    <Field label="Email" htmlFor="invite-email" error={formState.errors.email?.message}>
                        <Input
                            id="invite-email"
                            type="email"
                            autoFocus
                            placeholder="name@company.com"
                            aria-invalid={!!formState.errors.email}
                            {...register('email')}
                        />
                    </Field>
                    <Field label="Role" htmlFor="invite-role" error={formState.errors.role_id?.message}>
                        <Controller
                            control={control}
                            name="role_id"
                            render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <SelectTrigger id="invite-role">
                                        <SelectValue placeholder="Choose a role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {roles.map((r) => (
                                            <SelectItem key={r.id} value={r.id}>
                                                {r.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        />
                    </Field>
                </form>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="submit" form="invite-form" disabled={formState.isSubmitting}>
                        {formState.isSubmitting ? 'Sending…' : 'Send invitation'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
