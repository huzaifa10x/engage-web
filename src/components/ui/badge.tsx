import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
    'inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] leading-4 font-semibold whitespace-nowrap [&>svg]:size-3',
    {
        variants: {
            tone: {
                good: 'bg-good-bg text-good',
                warn: 'bg-warn-bg text-warn',
                bad: 'bg-bad-bg text-bad',
                info: 'bg-info-bg text-info',
                grey: 'bg-grey-bg text-grey',
                brand: 'bg-brand-100 text-brand-600',
                outline: 'border text-muted-foreground',
            },
        },
        defaultVariants: { tone: 'grey' },
    },
);

export type Tone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

function Badge({ className, tone, dot = false, children, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { dot?: boolean }) {
    return (
        <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props}>
            {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
            {children}
        </span>
    );
}

export { Badge, badgeVariants };
