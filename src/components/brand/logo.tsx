import { cn } from '@/lib/utils';

import { BRAND_LIME, MARK, WORDMARK } from './artwork';

type Props = { className?: string; dark?: boolean };

/**
 * The full Engage logo (wordmark + mark). Use it wherever the brand is introduced: sidebar,
 * sign-in pages, public pages. `dark` = placed on a dark surface (white ink).
 * Size it with a height class (`h-7` by default); the width follows the artwork.
 */
export function Logo({ className, dark = false }: Props) {
    return (
        <svg
            viewBox={WORDMARK.viewBox}
            role="img"
            aria-label="10X Engage"
            className={cn('h-7 w-auto shrink-0', dark ? 'text-white' : 'text-[#0A0D08]', className)}
        >
            <path fill="currentColor" d={WORDMARK.ink} />
            <circle fill={BRAND_LIME} {...WORDMARK.dot} />
        </svg>
    );
}

/** The mark alone (icon). Use it where the full logo does not fit: avatars, compact headers. */
export function LogoMark({ className, dark = false }: Props) {
    return (
        <svg viewBox={MARK.viewBox} role="img" aria-label="10X Engage" className={cn('size-7 shrink-0', dark ? 'text-white' : 'text-[#0A0D08]', className)}>
            <path fill="currentColor" d={MARK.ink} />
            <circle fill={BRAND_LIME} {...MARK.dot} />
        </svg>
    );
}
