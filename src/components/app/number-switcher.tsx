'use client';

import { ChevronDownIcon, PhoneIcon } from 'lucide-react';
import { useCallback, useSyncExternalStore } from 'react';

import {
    DropdownMenu,
    DropdownMenuCheckItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePhoneNumbers } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { qualityTone } from '@/lib/whatsapp';

import { useSession } from './session';

const TONE_DOT: Record<string, string> = { good: 'bg-good', warn: 'bg-warn', bad: 'bg-bad', grey: 'bg-faint' };
const EVENT = 'engage:selected-number';

function subscribe(onChange: () => void) {
    window.addEventListener('storage', onChange);
    window.addEventListener(EVENT, onChange);

    return () => {
        window.removeEventListener('storage', onChange);
        window.removeEventListener(EVENT, onChange);
    };
}

/**
 * "All numbers" filter from the prototype topbar. Persisted per workspace in localStorage and
 * shared across components; it will drive the inbox / analytics filters.
 */
export function useSelectedNumber() {
    const { me } = useSession();
    const storageKey = `engage:number:${me.active_tenant_id}`;

    const selected = useSyncExternalStore(
        subscribe,
        () => window.localStorage.getItem(storageKey),
        () => null,
    );

    const update = useCallback(
        (id: string | null) => {
            if (id) window.localStorage.setItem(storageKey, id);
            else window.localStorage.removeItem(storageKey);
            window.dispatchEvent(new Event(EVENT));
        },
        [storageKey],
    );

    return [selected, update] as const;
}

export function NumberSwitcher() {
    const numbers = usePhoneNumbers();
    const [selected, setSelected] = useSelectedNumber();
    const connected = (numbers.data ?? []).filter((n) => n.status !== 'disconnected');
    const current = connected.find((n) => n.id === selected) ?? null;

    if (connected.length === 0) return null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-[13px] font-medium shadow-xs hover:bg-muted">
                <PhoneIcon className="size-3.5 text-muted-foreground" />
                <span className="max-w-[160px] truncate">{current ? (current.verified_name ?? current.display_phone_number) : 'All numbers'}</span>
                <ChevronDownIcon className="size-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
                <DropdownMenuLabel>Show activity for</DropdownMenuLabel>
                <DropdownMenuCheckItem checked={!current} onSelect={() => setSelected(null)}>
                    All numbers
                </DropdownMenuCheckItem>
                <DropdownMenuSeparator />
                {connected.map((n) => (
                    <DropdownMenuCheckItem key={n.id} checked={current?.id === n.id} onSelect={() => setSelected(n.id)}>
                        <span className={cn('size-2 rounded-full', TONE_DOT[qualityTone(n.quality_rating)] ?? 'bg-faint')} />
                        <span className="min-w-0">
                            <span className="block truncate">{n.verified_name ?? 'Unnamed number'}</span>
                            <span className="block font-mono text-[11.5px] text-muted-foreground">{n.display_phone_number}</span>
                        </span>
                    </DropdownMenuCheckItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
