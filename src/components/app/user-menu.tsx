'use client';

import { useQueryClient } from '@tanstack/react-query';
import { LogOutIcon, SettingsIcon } from 'lucide-react';
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
import { P } from '@/lib/permissions';

import { useSession } from './session';

export function UserMenu() {
    const { me, can } = useSession();
    const router = useRouter();
    const qc = useQueryClient();

    const logout = async () => {
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
                <DropdownMenuItem destructive onSelect={logout}>
                    <LogOutIcon className="!text-destructive" /> {me.impersonation ? 'End support session' : 'Sign out'}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
