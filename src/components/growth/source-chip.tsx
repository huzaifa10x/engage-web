import { Badge, type Tone } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Acquisition, AcquisitionStatus } from '@/lib/types';

/**
 * Growth Hub lead status colours, as in the R1 prototype: Reference matched green, Meta ad blue,
 * Multiple sources violet, Website · details unavailable teal, Unattributed grey ("before" is no longer sent: returning contacts show the ad that brought them back).
 */
export const SOURCE_TONE: Record<AcquisitionStatus, Tone> = {
    ref: 'good',
    meta: 'info',
    multi: 'violet',
    web: 'teal',
    unattributed: 'grey',
    before: 'warn',
};

/** Acquisition card › Confidence: the line under the chip (prototype wording). */
export const CONFIDENCE_TEXT: Record<AcquisitionStatus, string> = {
    ref: 'Confirmed · website reference',
    meta: 'Confirmed · Meta referral',
    multi: 'Confirmed · two sources (conflict kept)',
    web: 'Website, details unavailable',
    unattributed: 'Unknown',
    before: 'Before tracking',
};

/** The coloured source chip. Renders nothing when Growth Hub is off for the workspace. */
export function SourceChip({
    acquisition,
    label,
    compact = false,
    className,
}: {
    acquisition?: Acquisition | null;
    /** Overrides the chip text (the inbox shows returning contacts as "Before tracking · Latest: …"). */
    label?: string | null;
    compact?: boolean;
    className?: string;
}) {
    if (!acquisition) return null;
    const text = label || acquisition.label;

    return (
        <Badge
            tone={SOURCE_TONE[acquisition.status] ?? 'grey'}
            dot
            className={cn(compact && 'px-1.5 py-px text-[10.5px]', 'max-w-full truncate', className)}
            title={`Lead source: ${text}`}
        >
            <span className="truncate">{text}</span>
        </Badge>
    );
}

/** The match status names (Blueprint v1.4), for the Leads "Match" column and filter. */
export const STATUS_LABEL: Record<AcquisitionStatus, string> = {
    ref: 'Reference matched',
    meta: 'Meta ad',
    multi: 'Multiple sources',
    web: 'Website · details unavailable',
    unattributed: 'Unattributed',
    before: 'Before tracking',
};

/** The match-status chip (status name only, e.g. "Meta ad"), as in the Leads table. */
export function StatusChip({ status, className }: { status: AcquisitionStatus; className?: string }) {
    return (
        <Badge tone={SOURCE_TONE[status] ?? 'grey'} dot className={className}>
            {STATUS_LABEL[status]}
        </Badge>
    );
}
