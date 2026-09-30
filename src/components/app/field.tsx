import * as React from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** Label + control + hint/error, with aria wiring. */
export function Field({
    label,
    htmlFor,
    error,
    hint,
    className,
    children,
}: {
    label: string;
    htmlFor: string;
    error?: string;
    hint?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <div className={cn('grid gap-1.5', className)}>
            <Label htmlFor={htmlFor}>{label}</Label>
            {children}
            {error ? (
                <p id={`${htmlFor}-error`} className="text-[12.5px] text-destructive">
                    {error}
                </p>
            ) : hint ? (
                <p className="text-[12.5px] text-muted-foreground">{hint}</p>
            ) : null}
        </div>
    );
}

export function FormError({ message }: { message: string | null | undefined }) {
    if (!message) return null;

    return (
        <div role="alert" className="rounded-md border border-bad/20 bg-bad-bg px-3 py-2 text-[13px] text-bad">
            {message}
        </div>
    );
}
