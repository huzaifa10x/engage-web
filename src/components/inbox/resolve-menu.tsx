'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CheckIcon, ChevronDownIcon, RotateCcwIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { api, errorMessage } from '@/lib/api';
import { REASONS } from '@/lib/inbox';
import { keys, resolveConversation, undoResolve } from '@/lib/queries';
import type { Conversation, ResolutionReason } from '@/lib/types';

/**
 * Resolve ▾ (3.5): resolving asks why. The toast names the chat and the reason, says where it went, and
 * offers Undo (the closure is then removed, as if it never happened). A closed chat shows Reopen.
 */
export function ResolveMenu({ conversation, size = 'sm' }: { conversation: Conversation; size?: 'sm' | 'default' }) {
    const qc = useQueryClient();
    const [busy, setBusy] = useState(false);
    const name = conversation.contact?.display_name ?? 'This chat';
    const refresh = () => {
        void qc.invalidateQueries({ queryKey: keys.conversation(conversation.id) });
        void qc.invalidateQueries({ queryKey: keys.conversationsAll });
        void qc.invalidateQueries({ queryKey: ['inbox', 'resolutions'] });
    };

    const resolve = async (reason: ResolutionReason) => {
        setBusy(true);
        try {
            await resolveConversation(conversation.id, reason);
            refresh();
            const label = REASONS.find((r) => r.id === reason)?.label ?? 'Resolved';
            toast.success(`${name} · ${label} · moved to the Resolved tab`, {
                duration: 8000,
                action: {
                    label: 'Undo',
                    onClick: async () => {
                        try {
                            await undoResolve(conversation.id);
                            refresh();
                            toast.message(`${name} is open again`);
                        } catch (e) {
                            toast.error(errorMessage(e));
                        }
                    },
                },
            });
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    if (conversation.status === 'closed') {
        return (
            <Button
                variant="outline"
                size={size}
                disabled={busy}
                onClick={async () => {
                    setBusy(true);
                    try {
                        await api(`conversations/${conversation.id}`, { method: 'PATCH', body: { status: 'open' } });
                        refresh();
                        toast.success(`${name} reopened`);
                    } catch (e) {
                        toast.error(errorMessage(e));
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                <RotateCcwIcon /> Reopen
            </Button>
        );
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button size={size} disabled={busy} aria-label="Resolve this chat">
                    <CheckIcon /> Resolve <ChevronDownIcon className="-mr-0.5 opacity-70" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Why is it done?</DropdownMenuLabel>
                {REASONS.map((r) => (
                    <DropdownMenuItem key={r.id} onSelect={() => void resolve(r.id)} className="flex flex-col items-start gap-0">
                        <span className="text-[13px] font-semibold">{r.label}</span>
                        <span className="text-[11px] text-muted-foreground">{r.hint}</span>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
