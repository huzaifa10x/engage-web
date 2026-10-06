import { cva, type VariantProps } from 'class-variance-authority';
import { Slot as SlotPrimitive } from 'radix-ui';
import * as React from 'react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-[background-color,box-shadow,transform,border-color] duration-150 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    {
        variants: {
            variant: {
                default: 'bg-primary text-primary-foreground shadow-[inset_0_-1px_0_rgba(16,26,2,.12),0_1px_2px_rgba(16,26,2,.14)] hover:bg-primary-hover',
                destructive: 'bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/30',
                outline: 'border border-input bg-card shadow-xs hover:border-brand-500/60 hover:bg-muted',
                secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
                ghost: 'hover:bg-muted',
                link: 'text-brand-600 underline-offset-4 hover:underline',
                whatsapp: 'bg-whatsapp text-white shadow-xs hover:brightness-95',
            },
            size: {
                default: 'h-9 px-4 py-2 has-[>svg]:px-3',
                sm: 'h-8 gap-1.5 rounded-md px-3 text-[13px] has-[>svg]:px-2.5',
                lg: 'h-10 rounded-lg px-6 has-[>svg]:px-4',
                icon: 'size-9',
                'icon-sm': 'size-8',
            },
        },
        defaultVariants: { variant: 'default', size: 'default' },
    },
);

function Button({
    className,
    variant,
    size,
    asChild = false,
    ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
    const Comp = asChild ? SlotPrimitive.Slot : 'button';

    return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
