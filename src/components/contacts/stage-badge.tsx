import { Badge } from '@/components/ui/badge';
import type { StageRef } from '@/lib/types';
import { cn } from '@/lib/utils';

/** A CRM stage, read-only. Stages change only through "Change stage" on the contact record. */
export function StageBadge({ stage, className }: { stage?: StageRef | null; className?: string }) {
    if (!stage) return <span className={cn('text-muted-foreground', className)}>No stage</span>;

    return (
        <Badge tone={stage.color} dot className={className}>
            {stage.name}
            {stage.archived && <span className="font-normal opacity-70"> (archived)</span>}
        </Badge>
    );
}
