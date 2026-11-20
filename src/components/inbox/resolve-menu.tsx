'use client';

import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, ChevronDownIcon, RotateCcwIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { errorMessage } from '@/lib/api';
import { REASONS, RESOLUTION_DESC } from '@/lib/inbox';
import { keys, reopenConversation, resolveConversation, undoResolve } from '@/lib/queries';
import type { Conversation, ResolutionReason } from '@/lib/types';

function refresh(qc: QueryClient, id: string) {
    void qc.invalidateQueries({ queryKey: keys.conversation(id) });
    void qc.invalidateQueries({ queryKey: keys.conversationsAll });
    void qc.invalidateQueries({ queryKey: ['inbox', 'resolutions'] });
    void qc.invalidateQueries({ queryKey: ['inbox', 'events', id] });
}

/**
 * Resolve a chat (3.5). The toast names the chat and the reason, says where it went, and offers Undo
 * (the closure is then removed, as if it never happened). Also used by the E shortcut.
 */
export async function resolveChat(qc: QueryClient, c: Conversation, reason: ResolutionReason, onResolved?: () => void): Promise<void> {
    const name = c.contact?.display_name ?? 'This chat';
    try {
        await resolveConversation(c.id, reason);
        refresh(qc, c.id);
        onResolved?.();
        const label = REASONS.find((r) => r.id === reason)?.label ?? 'Resolved';
        toast.success(`${name} · ${label} · moved to the Resolved tab`, {
            duration: 8000,
            action: {
                label: 'Undo',
                onClick: async () => {
                    try {
                        await undoResolve(c.id);
                        refresh(qc, c.id);
                        toast.message(`${name} is open again`);
                    } catch (e) {
                        toast.error(errorMessage(e));
                    }
                },
            },
        });
    } catch (e) {
        toast.error(errorMessage(e));
    }
}

export async function reopenChat(qc: QueryClient, c: Conversation): Promise<void> {
    try {
        await reopenConversation(c.id);
        refresh(qc, c.id);
        toast.success('Reopened · the earlier closure stays in Resolution history');
    } catch (e) {
        toast.error(errorMessage(e));
    }
}

/** Resolve ▾ (asks why) or, for a resolved chat, Reopen. */
export function ResolveMenu({ conversation, onResolved }: { conversation: Conversation; onResolved?: () => void }) {
    const qc = useQueryClient();
    const [busy, setBusy] = useState(false);

    if (conversation.status === 'closed') {
        return (
            <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={async () => {
                    setBusy(true);
                    await reopenChat(qc, conversation);
                    setBusy(false);
                }}
            >
                <RotateCcwIcon /> Reopen
            </Button>
        );
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button size="sm" disabled={busy} aria-label="Resolve this chat">
                    <CheckIcon /> Resolve <ChevronDownIcon className="-mr-0.5 opacity-70" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Resolve as</DropdownMenuLabel>
                {REASONS.map((r) => (
                    <DropdownMenuItem
                        key={r.id}
                        onSelect={async () => {
                            setBusy(true);
                            await resolveChat(qc, conversation, r.id, onResolved);
                            setBusy(false);
                        }}
                        className="flex flex-col items-start gap-0"
                    >
                        <span className="text-[13px] font-semibold">{r.label}</span>
                        <span className="text-[11px] text-muted-foreground">{RESOLUTION_DESC[r.id] ?? r.hint}</span>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
