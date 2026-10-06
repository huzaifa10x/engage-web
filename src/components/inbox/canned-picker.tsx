'use client';

import { ZapIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useCannedResponses } from '@/lib/queries';

/** Saved replies: pick one to drop its text into the message box. Managed in Settings. */
export function CannedPicker({ onPick, disabled }: { onPick: (body: string) => void; disabled?: boolean }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const root = useRef<HTMLDivElement>(null);
    const responses = useCannedResponses(open);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
        const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', escape);

        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('keydown', escape);
        };
    }, [open]);

    const term = q.trim().toLowerCase();
    const list = (responses.data ?? []).filter((r) => !term || r.shortcut.includes(term) || r.body.toLowerCase().includes(term));

    return (
        <div ref={root} className="relative">
            <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setOpen((o) => !o)}
                disabled={disabled}
                aria-label="Insert a canned response"
                aria-expanded={open}
            >
                <ZapIcon />
            </Button>
            {open && (
                <div role="dialog" aria-label="Canned responses" className="absolute bottom-11 left-0 z-30 w-80 rounded-lg border bg-card p-2 shadow-lg">
                    <input
                        autoFocus
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search saved replies"
                        aria-label="Search saved replies"
                        className="mb-1.5 h-8 w-full rounded-md border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring"
                    />
                    <div className="max-h-64 overflow-y-auto">
                        {list.map((r) => (
                            <button
                                key={r.id}
                                type="button"
                                onClick={() => {
                                    onPick(r.body);
                                    setOpen(false);
                                    setQ('');
                                }}
                                className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-muted"
                            >
                                <span className="block font-mono text-[12px] font-semibold text-brand-600">/{r.shortcut}</span>
                                <span className="line-clamp-2 text-[13px] text-muted-foreground">{r.body}</span>
                            </button>
                        ))}
                        {list.length === 0 && (
                            <p className="px-2 py-3 text-[13px] text-muted-foreground">
                                {responses.isLoading
                                    ? 'Loading…'
                                    : (responses.data ?? []).length === 0
                                      ? 'No saved replies yet. Add them in Settings → Canned responses.'
                                      : 'Nothing matches.'}
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
