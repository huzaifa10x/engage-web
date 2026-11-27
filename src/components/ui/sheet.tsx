'use client';

import { XIcon } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import * as React from 'react';

import { cn } from '@/lib/utils';

import { HANDLE, useSwipeToClose } from './swipe-to-close';

function Sheet(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
    return <DialogPrimitive.Root data-slot="sheet" {...props} />;
}

/**
 * A panel that slides in from the right over the current page (which stays visible, lightly dimmed,
 * behind it). Escape, the close button or a click outside closes it and returns to the page as it was.
 */
function SheetContent({
    className,
    children,
    closeLabel = 'Close',
    hideClose = false,
    ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { closeLabel?: string; /** The content draws its own close button. */ hideClose?: boolean }) {
    const [node, setNode] = React.useState<HTMLDivElement | null>(null);
    const closer = React.useRef<HTMLButtonElement>(null);
    const close = React.useCallback(() => closer.current?.click(), []);
    useSwipeToClose(node, close);

    return (
        <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay
                data-slot="sheet-overlay"
                className="fixed inset-0 z-50 bg-slate-900/20 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 max-sm:bg-slate-900/40"
            />
            <DialogPrimitive.Content
                ref={setNode}
                data-slot="sheet-content"
                className={cn(
                    'fixed inset-y-0 right-0 z-50 flex h-dvh w-full max-w-2xl flex-col border-l bg-background shadow-[-12px_0_34px_rgba(15,23,42,.16)] outline-none',
                    'data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:duration-300 data-[state=open]:slide-in-from-right',
                    className,
                    // Phones: a tall sheet from the bottom with a grab handle, like a native app.
                    'max-sm:top-auto! max-sm:h-[94dvh]! max-sm:max-w-none! max-sm:overflow-hidden max-sm:rounded-t-[20px] max-sm:border-l-0 max-sm:pt-3 max-sm:pb-[env(safe-area-inset-bottom)] max-sm:shadow-[0_-12px_34px_rgba(13,17,9,.18)]',
                    'max-sm:[--tw-enter-translate-x:0] max-sm:[--tw-enter-translate-y:100%] max-sm:[--tw-exit-translate-x:0] max-sm:[--tw-exit-translate-y:100%]',
                )}
                {...props}
            >
                <span aria-hidden className={HANDLE} />
                {children}
                <DialogPrimitive.Close
                    ref={closer}
                    className={
                        hideClose
                            ? 'hidden'
                            : 'absolute top-3 right-3 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 max-sm:top-4'
                    }
                    tabIndex={hideClose ? -1 : undefined}
                >
                    <XIcon className="size-4" />
                    <span className="sr-only">{closeLabel}</span>
                </DialogPrimitive.Close>
            </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
    );
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="sheet-header" className={cn('flex shrink-0 flex-col gap-1 border-b bg-card px-5 py-4 pr-14', className)} {...props} />;
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
    return <DialogPrimitive.Title data-slot="sheet-title" className={cn('text-[16px] leading-tight font-semibold', className)} {...props} />;
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
    return <DialogPrimitive.Description data-slot="sheet-description" className={cn('text-[13px] text-muted-foreground', className)} {...props} />;
}

export { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle };
