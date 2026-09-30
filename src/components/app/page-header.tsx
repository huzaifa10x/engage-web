import { cn } from '@/lib/utils';

export function PageHeader({
    title,
    description,
    actions,
    className,
}: {
    title: string;
    description?: React.ReactNode;
    actions?: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn('mb-6 flex flex-wrap items-end justify-between gap-4', className)}>
            <div className="min-w-0">
                <h1 className="text-[22px] leading-tight font-semibold tracking-tight">{title}</h1>
                {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}

export function EmptyState({
    icon,
    title,
    description,
    action,
}: {
    icon?: React.ReactNode;
    title: string;
    description?: React.ReactNode;
    action?: React.ReactNode;
}) {
    return (
        <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            {icon && <div className="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-brand-50 text-primary">{icon}</div>}
            <p className="text-[15px] font-semibold">{title}</p>
            {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}

export function Forbidden() {
    return <EmptyState title="You do not have access to this page" description="Ask a workspace owner or admin to update your role." />;
}
