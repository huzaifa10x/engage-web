import * as React from 'react';

import { cn } from '@/lib/utils';

function Card({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="card"
            className={cn('flex flex-col rounded-lg border bg-card text-card-foreground shadow-[0_1px_2px_rgba(15,23,42,.06)]', className)}
            {...props}
        />
    );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="card-header"
            className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-line-2 px-5 py-4', className)}
            {...props}
        />
    );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="card-title" className={cn('text-[15px] leading-tight font-semibold', className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="card-description" className={cn('mt-1 text-[13px] text-muted-foreground', className)} {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="card-content" className={cn('px-5 py-4', className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="card-footer" className={cn('flex items-center gap-2 border-t border-line-2 px-5 py-3', className)} {...props} />;
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
