'use client';

import { useQueryClient } from '@tanstack/react-query';
import { LogOutIcon, MailIcon, SettingsIcon, ShieldCheckIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Avatar } from '@/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api';
import * as outbox from '@/lib/outbox';
import { disablePush } from '@/lib/push';
import { P } from '@/lib/permissions';

import { useSession } from './session';
import { confirmAction } from '@/components/ui/confirm';

export function UserMenu() {
    const { me, can } = useSession();
    const router = useRouter();
    const qc = useQueryClient();

    const logout = async () => {
        if (!me.impersonation) {
            // Unsent replies live only on this phone: say how many would be lost before going on.
            const unsent = outbox.countFor(me.user.id);
            if (
                unsent > 0 &&
                !(await confirmAction({
                    title: `${unsent} unsent ${unsent === 1 ? 'reply' : 'replies'} on this phone will be deleted. Sign out anyway?`,
                    destructive: true,
                    confirm: 'Sign out',
                }))
            )
                return;
            // This phone stops getting notifications for this account; drafts and unsent replies are removed.
            await disablePush();
            outbox.clearForSignOut(me.user.id);
        }
        await api(me.impersonation ? 'auth/impersonation' : 'auth/logout', { method: me.impersonation ? 'DELETE' : 'POST' }).catch(() => undefined);
        qc.clear();
        router.replace('/login');
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                className="rounded-full focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
                aria-label="Account menu"
            >
                <Avatar name={me.user.name} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="font-normal">
                    <span className="block truncate text-sm font-semibold text-foreground">{me.user.name}</span>
                    <span className="block truncate text-[12.5px]">{me.user.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {can(P.SettingsView) && (
                    <DropdownMenuItem onSelect={() => router.push('/settings')}>
                        <SettingsIcon /> Workspace settings
                    </DropdownMenuItem>
                )}
                {/* Everyone can reach their own emails and sign-in security (two-factor, remembered devices). */}
                <DropdownMenuItem onSelect={() => router.push('/settings?tab=notifications')}>
                    <MailIcon /> Email notifications
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push('/settings?tab=security')}>
                    <ShieldCheckIcon /> Sign-in & security
                </DropdownMenuItem>
                <DropdownMenuItem destructive onSelect={logout}>
                    <LogOutIcon className="!text-destructive" /> {me.impersonation ? 'End support session' : 'Sign out'}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
