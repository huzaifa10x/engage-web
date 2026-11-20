'use client';

import { Avatar } from '@/components/ui/avatar';
import { ringTitle, tagColor, windowLeft, windowTier } from '@/lib/inbox';
import { cn } from '@/lib/utils';

const RING_COLOR = { open: 'var(--brand-500)', soon: 'var(--warn)', critical: 'var(--bad)', closed: 'var(--faint)', none: 'transparent' } as const;

/**
 * The contact's avatar with the 24-hour WhatsApp window drawn round it (3.5). The ring empties as time
 * passes: brand over 6 hours left, amber 2–6 hours, red under 2 hours; grey dashed once it closed; no ring
 * if the customer never wrote. Hover says how long is left. Window = latest customer message + 24 h.
 */
export function RingAvatar({
    name,
    expiresAt,
    hasChat = true,
    className,
    now,
}: {
    name: string;
    expiresAt: string | null | undefined;
    /** false: the customer never wrote, so no ring. */
    hasChat?: boolean;
    className?: string;
    now: number;
}) {
    const at = now;
    const tier = windowTier(expiresAt, at, hasChat);
    const title = ringTitle(expiresAt, at, hasChat);
    const fill = tier === 'closed' || tier === 'none' ? 100 : Math.max(2, Math.min(100, (windowLeft(expiresAt, at) / 86_400_000) * 100));

    return (
        <span className="relative inline-flex h-fit shrink-0 self-start rounded-full" title={title || undefined}>
            <Avatar name={name} className={className} />
            {tier !== 'none' && (
                <svg aria-hidden viewBox="0 0 40 40" className="pointer-events-none absolute -inset-[3px] size-[calc(100%+6px)] -rotate-90">
                    {tier === 'closed' ? (
                        <circle cx="20" cy="20" r="19" fill="none" stroke={RING_COLOR.closed} strokeWidth="1.5" strokeDasharray="3 3" />
                    ) : (
                        <>
                            <circle cx="20" cy="20" r="19" fill="none" stroke="var(--line-2)" strokeWidth="2" />
                            <circle
                                cx="20"
                                cy="20"
                                r="19"
                                fill="none"
                                stroke={RING_COLOR[tier]}
                                strokeWidth="2"
                                strokeLinecap="round"
                                pathLength={100}
                                strokeDasharray={`${fill.toFixed(1)} 100`}
                                className="transition-[stroke-dasharray,stroke] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none"
                            />
                        </>
                    )}
                </svg>
            )}
            {title && <span className="sr-only">{title}</span>}
        </span>
    );
}

/** A tag: neutral chip with a dot whose colour comes from the tag's name, so it is the same everywhere. */
export function TagChip({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
    return (
        <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full border bg-card px-2 text-[11px] font-semibold text-ink-2">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tagColor(tag) }} aria-hidden />
            {tag}
            {onRemove && (
                <button type="button" onClick={onRemove} aria-label={`Remove ${tag}`} className="-mr-1 rounded-full px-1 text-faint hover:text-foreground">
                    ×
                </button>
            )}
        </span>
    );
}

/** Tags as small coloured dots with their names. */
export function TagDots({ tags, max = 3, className }: { tags: string[]; max?: number; className?: string }) {
    if (tags.length === 0) return null;
    const shown = tags.slice(0, max);

    return (
        <span className={cn('inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground', className)}>
            {shown.map((t) => (
                <span key={t} className="inline-flex min-w-0 items-center gap-1">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tagColor(t) }} aria-hidden />
                    <span className="truncate">{t}</span>
                </span>
            ))}
            {tags.length > max && <span title={tags.slice(max).join(', ')}>+{tags.length - max}</span>}
        </span>
    );
}

/** An owner's small avatar, or a dashed "?" when nobody owns it. */
export function OwnerAvatar({ name, className }: { name: string | null | undefined; className?: string }) {
    if (!name)
        return (
            <span
                title="Unassigned"
                className={cn('inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed text-[11px] text-faint', className)}
            >
                ?
            </span>
        );

    return (
        <span title={name} className="inline-flex shrink-0">
            <Avatar name={name} className={cn('size-6 text-[10px]', className)} />
        </span>
    );
}
