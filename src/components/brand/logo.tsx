import { cn } from '@/lib/utils';

export function Logo({ className, dark = false }: { className?: string; dark?: boolean }) {
    return (
        <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', dark ? 'text-white' : 'text-foreground', className)}>
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary text-[13px] font-extrabold tracking-tight text-primary-foreground shadow-[inset_0_-1px_0_rgba(16,26,2,.15)]">
                10X
            </span>
            <span className="text-[15px]">Engage</span>
        </span>
    );
}
