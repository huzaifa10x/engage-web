import { Badge, type Tone } from '@/components/ui/badge';
import type { MessageTemplate } from '@/lib/types';

/** Meta's status names → what clients read in WhatsApp Manager. */
const STATUS: Record<string, { label: string; tone: Tone; help: string }> = {
    APPROVED: { label: 'Approved', tone: 'good', help: 'Ready to send.' },
    PENDING: { label: 'In review', tone: 'warn', help: 'Meta is reviewing this template. This usually takes a few minutes, sometimes up to 24 hours.' },
    REJECTED: { label: 'Rejected', tone: 'bad', help: 'Meta rejected this template. Create a corrected version or edit it in WhatsApp Manager.' },
    PAUSED: { label: 'Paused', tone: 'warn', help: 'Paused by Meta because of low quality. It cannot be sent until Meta unpauses it.' },
    DISABLED: { label: 'Disabled', tone: 'bad', help: 'Disabled by Meta because of low quality. Use another template.' },
    IN_APPEAL: { label: 'In appeal', tone: 'info', help: 'An appeal is being reviewed by Meta.' },
    PENDING_DELETION: { label: 'Being deleted', tone: 'grey', help: 'Meta is deleting this template.' },
    DELETED: { label: 'Deleted', tone: 'grey', help: 'Deleted on Meta.' },
    LIMIT_EXCEEDED: { label: 'Limit exceeded', tone: 'bad', help: 'The account has reached its template limit on Meta.' },
    ARCHIVED: { label: 'Archived', tone: 'grey', help: 'Archived by Meta after long inactivity.' },
};

const REASONS: Record<string, string> = {
    ABUSIVE_CONTENT: 'Meta considers the content abusive.',
    INVALID_FORMAT: 'The format is not valid: check the variables, placeholders and examples.',
    PROMOTIONAL: 'The content is promotional but the category is not Marketing.',
    TAG_CONTENT_MISMATCH: 'The content does not match the chosen category.',
    SCAM: 'Meta considers the content a scam.',
    INCORRECT_CATEGORY: 'The category does not match the content.',
};

export function templateStatus(status: string) {
    return STATUS[status] ?? { label: status.toLowerCase().replace(/_/g, ' '), tone: 'grey' as Tone, help: '' };
}

export function rejectionReason(reason: string | null): string | null {
    if (!reason) return null;

    return REASONS[reason] ?? reason.toLowerCase().replace(/_/g, ' ');
}

export function TemplateStatusBadge({ template }: { template: Pick<MessageTemplate, 'status'> }) {
    const s = templateStatus(template.status);

    return (
        <Badge tone={s.tone} dot title={s.help}>
            {s.label}
        </Badge>
    );
}

/** WhatsApp-style preview of a template, with variables replaced when values are given. */
export function TemplatePreview({
    template,
    header = [],
    body = [],
    mediaUrl,
}: {
    template: MessageTemplate;
    header?: string[];
    body?: string[];
    /** Local preview of a header image being attached; otherwise Meta's sample URL is used. */
    mediaUrl?: string | null;
}) {
    const fill = (text: string, names: string[], values: string[]) =>
        names.reduce((out, name, i) => out.replaceAll(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'g'), values[i]?.trim() ? values[i] : `{{${name}}}`), text);
    const part = (type: string) => template.components.find((c) => c.type?.toUpperCase() === type);
    const head = part('HEADER');
    const buttons = part('BUTTONS')?.buttons ?? [];
    const format = template.variables.header_format;
    const handle = head?.example?.header_handle?.[0];
    const sample = mediaUrl ?? (handle?.startsWith('https://') ? handle : null);

    return (
        <div className="rounded-lg bg-[#efeae2] p-3">
            <div className="max-w-sm rounded-lg rounded-tl-sm bg-card px-3 py-2 text-[13.5px] shadow-[0_1px_1px_rgba(15,23,42,.08)]">
                {head && format === 'TEXT' && <p className="mb-1 font-semibold">{fill(head.text ?? '', template.variables.header, header)}</p>}
                {head && format === 'IMAGE' && sample ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote sample from Meta / local object URL
                    <img src={sample} alt="Header image" className="mb-1.5 max-h-44 w-full rounded object-cover" />
                ) : (
                    head &&
                    format &&
                    format !== 'TEXT' && (
                        <p className="mb-1.5 rounded bg-muted px-2 py-5 text-center text-[12px] text-muted-foreground">{format.toLowerCase()} header</p>
                    )
                )}
                <p className="break-words whitespace-pre-wrap">{fill(part('BODY')?.text ?? '', template.variables.body, body)}</p>
                {part('FOOTER')?.text && <p className="mt-1 text-[12px] text-muted-foreground">{part('FOOTER')?.text}</p>}
                {buttons.length > 0 && (
                    <div className="mt-2 grid gap-1 border-t pt-2">
                        {buttons.map((b, i) => (
                            <span key={i} className="rounded bg-muted px-2 py-1 text-center text-[12.5px] font-medium text-info">
                                {b.text ?? b.type}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
