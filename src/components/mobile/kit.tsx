'use client';

import { ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';

import { useSwipeToClose } from '@/components/ui/swipe-to-close';
import { useMediaQuery } from '@/hooks/use-media-query';
import { liveClock, waitTier } from '@/lib/promise';
import { dur } from '@/lib/inbox';
import type { Conversation } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * The phone screens' building blocks, laid out as in the mobile prototype (large title, segmented
 * control, grouped cards of rows, KPI tiles) in the app's own colours.
 */

/** Phones and small tablets: the width where the bottom tab bar shows. */
export const usePhone = () => useMediaQuery('(max-width: 1023px)');

export function LargeTitle({ title, actions, children }: { title: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
    return (
        <div className="-mx-4 -mt-6 mb-1 border-b bg-card px-4 pt-2 pb-3">
            <div className="flex min-h-10 items-center gap-1">
                <h1 className="min-w-0 flex-1 truncate text-[28px] leading-tight font-extrabold tracking-[-0.6px]">{title}</h1>
                {actions}
            </div>
            {children && <div className="mt-2">{children}</div>}
        </div>
    );
}

export function Segmented<T extends string>({
    value,
    onChange,
    options,
    label,
}: {
    value: T;
    onChange: (v: T) => void;
    options: [T, string][];
    label: string;
}) {
    return (
        <div role="tablist" aria-label={label} className="flex gap-[3px] rounded-[11px] bg-muted p-[3px]">
            {options.map(([v, l]) => (
                <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={value === v}
                    onClick={() => onChange(v)}
                    className={cn(
                        'h-[34px] flex-1 rounded-[9px] text-[13.5px] font-bold transition-colors duration-200 motion-reduce:transition-none',
                        value === v ? 'bg-card text-foreground shadow-[0_1px_3px_rgba(13,17,9,.12)]' : 'text-muted-foreground',
                    )}
                >
                    {l}
                </button>
            ))}
        </div>
    );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
    return <h2 className="px-1 pt-4 pb-1.5 text-[12px] font-bold tracking-[0.06em] text-muted-foreground uppercase">{children}</h2>;
}

export function RowCard({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={cn('overflow-hidden rounded-2xl bg-card shadow-[0_1px_2px_rgba(13,17,9,.05)] [&>*+*]:border-t [&>*+*]:border-line-2', className)}>
            {children}
        </div>
    );
}

type RowProps = { children: React.ReactNode; className?: string; chevron?: boolean; href?: string; onClick?: () => void; label?: string };

/** One tappable line: 56px tall, avatar or icon, two lines of text, a badge or chevron. */
export function Row({ children, className, chevron = false, href, onClick, label }: RowProps) {
    const cls = cn('flex min-h-14 w-full items-center gap-3 px-3.5 py-2 text-left transition-colors active:bg-muted/70', className);
    const inner = (
        <>
            {children}
            {chevron && <ChevronRightIcon className="size-4 shrink-0 text-faint" aria-hidden />}
        </>
    );
    if (href)
        return (
            <Link href={href} className={cls} aria-label={label}>
                {inner}
            </Link>
        );
    if (onClick)
        return (
            <button type="button" onClick={onClick} className={cls} aria-label={label}>
                {inner}
            </button>
        );

    return <div className={cls}>{inner}</div>;
}

export function RowText({ title, sub }: { title: React.ReactNode; sub?: React.ReactNode }) {
    return (
        <span className="min-w-0 flex-1">
            <b className="block truncate text-[15px] font-semibold">{title}</b>
            {sub && <span className="mt-px block truncate text-[13px] text-muted-foreground">{sub}</span>}
        </span>
    );
}

export function Kpi({ label, value, children, className }: { label: string; value: React.ReactNode; children?: React.ReactNode; className?: string }) {
    return (
        <div className={cn('min-w-0 rounded-2xl bg-card p-3.5 shadow-[0_1px_2px_rgba(13,17,9,.05)]', className)}>
            <small className="block truncate text-[12.5px] text-muted-foreground">{label}</small>
            <b className="block text-[26px] font-extrabold tracking-[-0.5px] tabular-nums">{value}</b>
            {children}
        </div>
    );
}

/** A 7-point line (null points are skipped). */
export function Spark({ points }: { points: (number | null)[] }) {
    const vals = points.map((p) => p ?? 0);
    const max = Math.max(1, ...vals);
    const w = 120;
    const h = 36;
    const step = w / Math.max(1, points.length - 1);
    const d = points
        .map((p, i) => (p === null ? null : `${(i * step).toFixed(1)} ${(h - (p / max) * (h - 4) - 2).toFixed(1)}`))
        .filter(Boolean)
        .map((pt, i) => `${i ? 'L' : 'M'}${pt}`)
        .join(' ');

    return (
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-1.5 h-9 w-full" aria-hidden>
            {d && (
                <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            )}
        </svg>
    );
}

export function Meter({ pct, tone = 'dark' }: { pct: number; tone?: 'dark' | 'good' | 'warn' | 'bad' }) {
    return (
        <div className="h-2 overflow-hidden rounded-full bg-line-2">
            <i
                className={cn(
                    'block h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none',
                    { dark: 'bg-foreground', good: 'bg-good', warn: 'bg-warn', bad: 'bg-bad' }[tone],
                )}
                style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
            />
        </div>
    );
}

export function Pill({ tone = 'grey', children }: { tone?: 'grey' | 'good' | 'warn' | 'bad'; children: React.ReactNode }) {
    return (
        <span
            className={cn(
                'inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full px-2 text-[11.5px] font-bold whitespace-nowrap tabular-nums',
                { grey: 'bg-muted text-ink-2', good: 'bg-good-bg text-good', warn: 'bg-warn-bg text-warn', bad: 'bg-bad-bg text-bad' }[tone],
            )}
        >
            {children}
        </span>
    );
}

/** How long the customer has waited: grey, amber from the first alert step, red from the second. */
export function WaitPill({ conversation: c, fetchedAt, now }: { conversation: Conversation; fetchedAt: number; now: number }) {
    if (c.status === 'closed' || c.state !== 'needs_reply') return null;
    const p = c.promise ? liveClock(c.promise, fetchedAt, now) : null;
    const waited = p ? p.waited_seconds * 1000 : c.needs_reply_since ? now - new Date(c.needs_reply_since).getTime() : null;
    if (waited === null) return null;
    const tier = p ? waitTier(p) : 'ok';

    return <Pill tone={tier === 'over' ? 'bad' : tier === 'soon' ? 'warn' : 'grey'}>{dur(Math.max(0, waited))}</Pill>;
}

/** "6 min", "1 h 5 min", "—" */
export function mins(seconds: number | null | undefined): string {
    if (seconds === null || seconds === undefined) return '—';
    const m = Math.max(0, Math.round(seconds / 60));
    if (m < 60) return `${m} min`;

    return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

/** A sheet that rises from the bottom of the phone (prototype "Move to", pickers). Swipe down or tap outside to close. */
export function BottomSheet({
    open,
    onOpenChange,
    title,
    children,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    children: React.ReactNode;
}) {
    const [node, setNode] = useState<HTMLDivElement | null>(null);
    const close = useCallback(() => onOpenChange(false), [onOpenChange]);
    useSwipeToClose(node, close);

    return (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
                <DialogPrimitive.Content
                    ref={setNode}
                    aria-describedby={undefined}
                    className="fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-y-auto rounded-t-[20px] bg-card pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-12px_34px_rgba(13,17,9,.18)] outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom"
                >
                    <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-line-2" aria-hidden />
                    <DialogPrimitive.Title className="px-4 pt-3 pb-2 text-[17px] font-bold">{title}</DialogPrimitive.Title>
                    <div className="[&>*+*]:border-t [&>*+*]:border-line-2">{children}</div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
