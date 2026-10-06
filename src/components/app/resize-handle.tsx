'use client';

import { useRef } from 'react';

import { cn } from '@/lib/utils';

/**
 * A thin vertical bar between two panels. Drag it to resize, double-click to reset; with the
 * keyboard, focus it and use the left and right arrow keys.
 *
 * `direction` says which way growing goes: 'right' when dragging right makes the panel wider
 * (a panel on the left), 'left' when dragging left makes it wider (a panel on the right).
 */
export function ResizeHandle({
    width,
    min,
    max,
    direction,
    onResize,
    onReset,
    label,
    className,
}: {
    width: number;
    min: number;
    max: number;
    direction: 'left' | 'right';
    onResize: (width: number) => void;
    onReset: () => void;
    label: string;
    className?: string;
}) {
    const drag = useRef<{ x: number; width: number } | null>(null);
    const clamp = (value: number) => Math.round(Math.min(max, Math.max(min, value)));
    const sign = direction === 'right' ? 1 : -1;

    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label={label}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={width}
            tabIndex={0}
            title="Drag to resize. Double-click to reset."
            onPointerDown={(e) => {
                drag.current = { x: e.clientX, width };
                e.currentTarget.setPointerCapture(e.pointerId);
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
            }}
            onPointerMove={(e) => {
                if (drag.current) onResize(clamp(drag.current.width + sign * (e.clientX - drag.current.x)));
            }}
            onPointerUp={(e) => {
                drag.current = null;
                e.currentTarget.releasePointerCapture(e.pointerId);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }}
            onPointerCancel={() => {
                drag.current = null;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }}
            onDoubleClick={onReset}
            onKeyDown={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    onResize(clamp(width + sign * (e.key === 'ArrowRight' ? 16 : -16)));
                }
            }}
            className={cn(
                'group relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize touch-none outline-none',
                'after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent after:transition-colors',
                'hover:after:w-0.5 hover:after:bg-brand-500 focus-visible:after:w-0.5 focus-visible:after:bg-brand-500 active:after:w-0.5 active:after:bg-brand-500',
                className,
            )}
        />
    );
}
