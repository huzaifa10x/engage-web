'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/lib/api';
import { deleteInboxTeam, type InboxTeam, saveInboxTeam, useInboxTeams } from '@/lib/queries';

type Member = { id: string; name: string };

/**
 * Inbox teams (Team & Roles → Inbox teams): groups like “Leasing” or “Sales”. A conversation, or a
 * chatbot's handover step, can be given to a team; its least busy member who can reply on that
 * number gets it.
 */
export function InboxTeams({ members, canManage }: { members: Member[]; canManage: boolean }) {
    const qc = useQueryClient();
    const teams = useInboxTeams();
    const [editing, setEditing] = useState<Partial<InboxTeam> | null>(null);
    const names = new Map(members.map((m) => [m.id, m.name]));

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <p className="max-w-2xl text-[13px] text-muted-foreground">
                    Give conversations to a team instead of one person. Chatbot handover steps can hand a customer to a team; its least busy member who can
                    reply on that number gets the chat. The inbox can be filtered by team.
                </p>
                {canManage && (
                    <Button size="sm" onClick={() => setEditing({ name: '', member_ids: [] })}>
                        <PlusIcon /> New team
                    </Button>
                )}
            </div>
            {(teams.data ?? []).length === 0 ? (
                <Card className="p-6 text-center text-[13px] text-muted-foreground">No inbox teams yet.</Card>
            ) : (
                <div className="grid gap-3 md:grid-cols-2" data-testid="inbox-teams">
                    {(teams.data ?? []).map((t) => (
                        <Card key={t.id} className="space-y-2 p-4">
                            <div className="flex items-center gap-2">
                                <p className="font-semibold">{t.name}</p>
                                <Badge tone="grey">{t.open_conversations} open</Badge>
                                {canManage && (
                                    <div className="ml-auto flex gap-1">
                                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}>
                                            <PencilIcon />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label={`Delete ${t.name}`}
                                            onClick={async () => {
                                                try {
                                                    await deleteInboxTeam(t.id);
                                                    void qc.invalidateQueries({ queryKey: ['inbox', 'teams'] });
                                                    toast.success(`${t.name} deleted. Its conversations keep their assignee.`);
                                                } catch (e) {
                                                    toast.error(errorMessage(e));
                                                }
                                            }}
                                        >
                                            <Trash2Icon />
                                        </Button>
                                    </div>
                                )}
                            </div>
                            <p className="text-[12.5px] text-muted-foreground">
                                {t.member_ids.length === 0 ? 'No members yet' : t.member_ids.map((id) => names.get(id) ?? 'Former member').join(', ')}
                            </p>
                        </Card>
                    ))}
                </div>
            )}
            <TeamDialog team={editing} members={members} onClose={() => setEditing(null)} />
        </div>
    );
}

function TeamDialog({ team, members, onClose }: { team: Partial<InboxTeam> | null; members: Member[]; onClose: () => void }) {
    const qc = useQueryClient();
    const [form, setForm] = useState<{ name: string; member_ids: string[] } | null>(null);
    const [busy, setBusy] = useState(false);
    const current = form ?? (team ? { name: team.name ?? '', member_ids: team.member_ids ?? [] } : null);

    return (
        <Dialog
            open={team !== null}
            onOpenChange={(o) => {
                if (!o) {
                    setForm(null);
                    onClose();
                }
            }}
        >
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{team?.id ? 'Edit team' : 'New inbox team'}</DialogTitle>
                    <DialogDescription>Members only get a team’s chats on the numbers they have access to.</DialogDescription>
                </DialogHeader>
                {current && (
                    <div className="space-y-3">
                        <div className="grid gap-1.5">
                            <Label htmlFor="team-name">Name</Label>
                            <Input
                                id="team-name"
                                value={current.name}
                                maxLength={60}
                                onChange={(e) => setForm({ ...current, name: e.target.value })}
                                placeholder="Leasing"
                            />
                        </div>
                        <div className="grid max-h-64 gap-1.5 overflow-y-auto">
                            {members.map((m) => (
                                <div key={m.id} className="flex items-center gap-2">
                                    <Checkbox
                                        id={`tm-${m.id}`}
                                        checked={current.member_ids.includes(m.id)}
                                        onCheckedChange={(v) =>
                                            setForm({
                                                ...current,
                                                member_ids: v === true ? [...current.member_ids, m.id] : current.member_ids.filter((x) => x !== m.id),
                                            })
                                        }
                                    />
                                    <Label htmlFor={`tm-${m.id}`} className="font-normal">
                                        {m.name}
                                    </Label>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <DialogFooter>
                    <Button
                        disabled={busy || !current?.name.trim()}
                        onClick={async () => {
                            if (!current) return;
                            setBusy(true);
                            try {
                                qc.setQueryData(
                                    ['inbox', 'teams'],
                                    await saveInboxTeam({ id: team?.id, name: current.name.trim(), member_ids: current.member_ids }),
                                );
                                toast.success('Team saved');
                                setForm(null);
                                onClose();
                            } catch (e) {
                                toast.error(errorMessage(e));
                            } finally {
                                setBusy(false);
                            }
                        }}
                    >
                        {busy && <Loader2Icon className="animate-spin" />} Save team
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
