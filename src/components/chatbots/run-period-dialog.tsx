'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { DateTimeField } from '@/components/app/date-field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, errorMessage } from '@/lib/api';
import { saveChatbot, type ChatbotFlowDetail } from '@/lib/chatbots';
import { dateTime, isoToZoned, workspaceDates, zonedToIso } from '@/lib/format';
import { cn } from '@/lib/utils';

type Flow = { id: string; name: string; is_active: boolean; published_version: number | null; activate_at: string | null; deactivate_at: string | null };

const local = (iso: string | null) => isoToZoned(iso);

const when = (iso: string) => dateTime(iso);

/** One line for badges and the top bar: "Runs until 30 Nov, 18:00", "Starts 1 Dec, 09:00 · ends …", or null when it runs indefinitely. */
export function runPeriodLabel(flow: Pick<Flow, 'activate_at' | 'deactivate_at'>): string | null {
    if (flow.activate_at && flow.deactivate_at) return `Runs ${when(flow.activate_at)} – ${when(flow.deactivate_at)}`;
    if (flow.activate_at) return `Starts ${when(flow.activate_at)}`;
    if (flow.deactivate_at) return `Runs until ${when(flow.deactivate_at)}`;

    return null;
}

/**
 * When the published bot runs: until someone switches it off (the default), or only during a
 * period — a start (optional when it is live already) and an end. The server switches it on and
 * off at those times (every minute) and stops conversations still running at the end.
 */
export function RunPeriodDialog({ flow, onClose, onSaved }: { flow: Flow | null; onClose: () => void; onSaved: (detail: ChatbotFlowDetail) => void }) {
    const [mode, setMode] = useState<'always' | 'period'>('always');
    const [on, setOn] = useState('');
    const [off, setOff] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [for_, setFor] = useState<string | null>(null);
    if (flow && flow.id !== for_) {
        setFor(flow.id);
        setMode(flow.activate_at || flow.deactivate_at ? 'period' : 'always');
        setOn(local(flow.activate_at));
        setOff(local(flow.deactivate_at));
        setError(null);
    }
    if (!flow && for_ !== null) setFor(null);

    const zone = workspaceDates().timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const live = flow?.is_active ?? false;

    const save = async () => {
        if (!flow) return;
        setError(null);
        let body: { activate_at: string | null; deactivate_at: string | null } = { activate_at: null, deactivate_at: null };
        if (mode === 'period') {
            if (!off) return setError('Choose when the bot stops. To keep it running, pick “Keep running until I switch it off”.');
            if (!live && !on) return setError('Choose when the bot starts, or switch it on now and set only the end.');
            if (on && off && off <= on) return setError('The end must be after the start.');
            body = { activate_at: on && !live ? zonedToIso(on) : null, deactivate_at: zonedToIso(off) };
        }
        setSaving(true);
        try {
            onSaved(await saveChatbot(flow.id, body));
            toast.success(mode === 'always' ? 'The bot runs until you switch it off.' : 'Run period saved.');
            onClose();
        } catch (e) {
            setError(e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? e.message) : errorMessage(e));
        } finally {
            setSaving(false);
        }
    };

    const choice = (key: 'always' | 'period', title: string, body: string) => (
        <button
            type="button"
            onClick={() => setMode(key)}
            aria-pressed={mode === key}
            className={cn(
                'rounded-lg border px-3 py-2.5 text-left transition-colors',
                mode === key ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'hover:bg-muted/60',
            )}
        >
            <span className="block text-[13px] font-semibold">{title}</span>
            <span className="block text-[12px] leading-snug text-muted-foreground">{body}</span>
        </button>
    );

    return (
        <Dialog open={flow !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>When “{flow?.name}” runs</DialogTitle>
                    <DialogDescription>
                        {flow?.published_version === null
                            ? 'Publish the bot first; the run period applies to the published version.'
                            : 'Applies to the published version on its WhatsApp number.'}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-2">
                    {choice('always', 'Keep running until I switch it off', 'The usual choice for a main menu or FAQ bot.')}
                    {choice('period', 'Run only during a period', 'For a promotion, Ramadan, an event or a seasonal offer: it switches itself on and off.')}
                </div>
                {mode === 'period' && (
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label htmlFor="rp-on">Starts</Label>
                            <DateTimeField id="rp-on" aria-label="Starts" value={live ? '' : on} onChange={setOn} disabled={live} />
                            <p className="text-[11.5px] text-muted-foreground">{live ? 'It is live already.' : 'Leave empty and switch it on yourself.'}</p>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="rp-off">Ends</Label>
                            <DateTimeField id="rp-off" aria-label="Ends" value={off} onChange={setOff} />
                            <p className="text-[11.5px] text-muted-foreground">Conversations still running then are stopped.</p>
                        </div>
                    </div>
                )}
                <p className="text-[11.5px] text-muted-foreground">Times are in the workspace’s time zone ({zone.replace(/_/g, ' ')}).</p>
                {error && <p className="rounded-md bg-bad-bg px-3 py-2 text-[12.5px] text-bad">{error}</p>}
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={() => void save()} disabled={saving || flow?.published_version === null}>
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
