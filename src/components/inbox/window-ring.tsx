'use client';

import { Avatar } from '@/components/ui/avatar';
import { RING, tagColor, windowState } from '@/lib/inbox';
import { cn } from '@/lib/utils';

/**
 * The contact's avatar with the WhatsApp window around it: a solid brand ring with more than 6 hours
 * left, amber for 2–6 hours, red under 2 hours, a grey dashed ring once it closed. No ring before the
 * customer ever wrote. Hover says how long is left.
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
    /** false: no chat yet, so no ring. */
    hasChat?: boolean;
    className?: string;
    now?: number;
}) {
    const w = windowState(expiresAt, now);
    const tone = !hasChat ? 'none' : expiresAt ? w.tone : 'closed';

    return (
        <span className={cn('inline-flex h-fit shrink-0 self-start rounded-full', RING[tone])} title={hasChat ? w.label : 'No chat yet'}>
            <Avatar name={name} className={className} />
            <span className="sr-only">{hasChat ? w.label : 'No chat yet'}</span>
        </span>
    );
}

/** Tags as small coloured dots with their names; the colour comes from the tag's name. */
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
