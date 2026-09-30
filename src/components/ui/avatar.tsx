import { cn } from '@/lib/utils';

const COLORS = ['#4F46E5', '#0D9488', '#B45309', '#E11D48', '#8B5CF6', '#0EA5E9', '#DB2777', '#059669'];

function colorFor(seed: string): string {
    let h = 0;
    for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return COLORS[h % COLORS.length];
}

function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Initials avatar with a stable per-name colour (same palette as the prototype). */
function Avatar({ name, className }: { name: string; className?: string }) {
    return (
        <span
            aria-hidden
            className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white', className)}
            style={{ backgroundColor: colorFor(name) }}
        >
            {initials(name)}
        </span>
    );
}

export { Avatar };
