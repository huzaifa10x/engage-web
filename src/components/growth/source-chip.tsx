import { Badge, type Tone } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Acquisition, AcquisitionStatus } from '@/lib/types';

/** Growth Hub lead status colours (Blueprint v1.4): one look in the inbox, CRM and Leads. */
export const SOURCE_TONE: Record<AcquisitionStatus, Tone> = {
    meta: 'info',
    ref: 'good',
    multi: 'brand',
    web: 'warn',
    unattributed: 'grey',
    before: 'grey',
};

/** The coloured source chip. Renders nothing when Growth Hub is off for the workspace. */
export function SourceChip({ acquisition, compact = false, className }: { acquisition?: Acquisition | null; compact?: boolean; className?: string }) {
    if (!acquisition) return null;

    return (
        <Badge
            tone={SOURCE_TONE[acquisition.status] ?? 'grey'}
            dot
            className={cn(compact && 'px-1.5 py-px text-[10.5px]', 'max-w-full truncate', className)}
            title={`Lead source: ${acquisition.label}`}
        >
            <span className="truncate">{acquisition.label}</span>
        </Badge>
    );
}
