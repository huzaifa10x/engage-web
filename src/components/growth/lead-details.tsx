'use client';

import { useSession } from '@/components/app/session';
import { ChangeStageButton } from '@/components/contacts/change-stage-dialog';
import { StageBadge } from '@/components/contacts/stage-badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { dateTime, humanize } from '@/lib/format';
import { P } from '@/lib/permissions';
import { useLeadEvidence, useStageHistory } from '@/lib/queries';
import type { Acquisition, Contact, Lead, LeadEvidence, StageEvent } from '@/lib/types';
import { cn } from '@/lib/utils';

import { LeadActions } from './lead-actions';
import { SourceChip } from './source-chip';

/** The explanation shown under the chip for the statuses that need one (prototype wording). */
export const SOURCE_NOTE: Partial<Record<Acquisition['status'], string>> = {
    multi: 'This message came from a Meta ad and also carried a website reference. Both are kept; the ad counts as the message origin.',
    web: 'Came from the website, but the click was blocked before it reached us, so campaign details aren’t available.',
    before: 'Existing customer from before tracking. New ad taps or website visits are new touches, not new leads.',
};

/** Meta's referral source_type: "ad" (a click-to-WhatsApp ad) or "post" (a boosted/organic post). */
const SOURCE_TYPE: Record<string, string> = { ad: 'Click-to-WhatsApp ad', post: 'Facebook or Instagram post' };

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
    return (
        <dl className="grid grid-cols-[minmax(7.5rem,auto)_1fr] gap-x-4 gap-y-1.5 text-[13px]">
            {rows.map(([k, v]) => (
                <div key={k} className="contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="min-w-0 break-words">{v}</dd>
                </div>
            ))}
        </dl>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="grid gap-2.5 border-t pt-4">
            <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</h4>
            {children}
        </section>
    );
}

/**
 * Evidence (prototype "Lead details"): for a Meta ad the headline (or "Not sent by Meta"), the masked
 * ad ID, whether Meta sent an ad click ID (never its value) and the platform with its proof.
 */
function evidenceRows(a: Acquisition, e: LeadEvidence | undefined, contact: Contact): [string, React.ReactNode][] {
    const rows: [string, React.ReactNode][] = [];
    if (e?.type === 'meta_ctwa') {
        const d = e.details;
        rows.push(['How it started', 'Customer tapped the WhatsApp button on a Meta ad; Meta sent the ad referral with their first message']);
        rows.push(['Meta ad headline', d.headline ?? <span className="text-muted-foreground">Not sent by Meta</span>]);
        if (d.body) rows.push(['Ad text', d.body]);
        if (d.source_type) rows.push(['Ad type', SOURCE_TYPE[d.source_type] ?? humanize(d.source_type)]);
        if (d.ad_id)
            rows.push([
                'Meta ad ID',
                <span key="id" className="font-mono text-[12px]">
                    {d.ad_id}
                </span>,
            ]);
        rows.push(['Ad click ID', d.click_id_sent ? 'Present' : <span className="text-muted-foreground">Not sent by Meta</span>]);
        if (d.source_url)
            rows.push([
                'Ad link',
                <span key="url" className="font-mono text-[12px] break-all">
                    {d.source_url}
                </span>,
            ]);
        rows.push([
            'Platform',
            e.platform ? (
                <span>
                    <b>{humanize(e.platform)}</b>
                    {e.platform_proof ? ` · ${e.platform_proof}` : ''}
                </span>
            ) : (
                (e.platform_proof ?? <span className="text-muted-foreground">Not proven: shown as Meta ad</span>)
            ),
        ]);
        if (e.conflict) rows.push(['Multiple sources', 'The same message also carried a website reference; both are kept']);
    }
    if (a.status === 'web')
        rows.push(['Why limited', 'The code in the message is valid, but the website click never reached us. Campaign details are not available.']);
    if (a.status === 'unattributed') rows.push(['Why', 'No reference and no ad referral in the first message.']);
    if (a.status === 'before') rows.push(['Original source', `Before tracking${contact.created_at ? ` (created ${dateTime(contact.created_at)})` : ''}`]);

    return rows;
}

type Step = { at: string; title: string; detail: string; proof: boolean };

function journey(contact: Contact, a: Acquisition, evidence: LeadEvidence[], stages: StageEvent[]): Step[] {
    const steps: Step[] = [];
    if (a.status === 'before' && contact.created_at)
        steps.push({ at: contact.created_at, title: 'Contact created before tracking started', detail: dateTime(contact.created_at), proof: false });
    for (const e of evidence) {
        const when = dateTime(e.occurred_at);
        if (e.type === 'meta_ctwa') {
            const title = a.status === 'before' ? 'New touch: Meta ad (not counted as a new lead)' : 'Tapped a click-to-WhatsApp ad';
            steps.push({
                at: e.occurred_at,
                title,
                detail: [e.label === 'Meta ad' ? 'Meta' : e.label, e.details.headline && `“${e.details.headline}”`, when].filter(Boolean).join(' · '),
                proof: true,
            });
            if (e.conflict)
                steps.push({ at: e.occurred_at, title: 'Same message also carried a website reference', detail: 'Conflict flagged, both kept', proof: true });
        } else if (e.type === 'website_unregistered') {
            steps.push({
                at: e.occurred_at,
                title: 'Message had a valid website reference',
                detail: `Click was never registered (likely blocked) · ${when}`,
                proof: true,
            });
        } else {
            steps.push({ at: e.occurred_at, title: 'Sent first message, reference matched', detail: when, proof: true });
        }
    }
    for (const s of stages) {
        steps.push({
            at: s.changed_at,
            title: s.to ? `Stage → ${s.to.name}` : 'Stage cleared',
            detail: [dateTime(s.changed_at), s.changed_by].filter(Boolean).join(' · '),
            proof: false,
        });
    }

    return steps.sort((x, y) => x.at.localeCompare(y.at));
}

/**
 * Lead details (Developer Handover §I.4): source and match status, campaign, landing page, first
 * contact; evidence (masked, never for Agents); journey timeline; CRM block with owner and stage.
 *  - from Growth Hub › Leads (`lead`): the CRM actions Open chat, Assign, Change stage, Add note, Follow-up;
 *  - from the chat sidebar (`stageVia="chat"`): Change stage;
 *  - from Contacts & CRM ("See lead journey"): read-only — the contact record only shows the stage.
 */
export function LeadDetails({
    contact,
    lead,
    stageVia,
    open,
    onOpenChange,
}: {
    contact: Contact;
    lead?: Lead;
    stageVia?: 'chat';
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const { can } = useSession();
    const proof = can(P.GrowthView); // evidence: Owner and Admin only
    const evidence = useLeadEvidence(contact.id, open && proof);
    const stages = useStageHistory(contact.id, open);
    const a = contact.acquisition;
    if (!a) return null;

    const list = evidence.data ?? [];
    const shown = list.find((e) => e.id === (a.status === 'before' ? a.latest?.evidence_id : a.original?.evidence_id)) ?? list[list.length - 1];
    const steps = journey(contact, a, list, stages.data ?? []);
    const na = <span className="text-muted-foreground">Not available</span>;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={cn(
                    'top-0 right-0 left-auto h-dvh max-h-dvh w-full max-w-full translate-x-0 translate-y-0 content-start rounded-none border-y-0 border-r-0 sm:max-w-md',
                    'data-[state=closed]:zoom-out-100 data-[state=closed]:slide-out-to-right data-[state=open]:zoom-in-100 data-[state=open]:slide-in-from-right',
                )}
            >
                <DialogHeader>
                    <DialogTitle>{contact.display_name}</DialogTitle>
                    <DialogDescription className="font-mono">{contact.phone}</DialogDescription>
                </DialogHeader>

                <section className="grid gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <SourceChip acquisition={a} />
                        <span className="text-[15px] font-semibold">{a.source?.name ?? a.label}</span>
                    </div>
                    <Rows
                        rows={[
                            ['Campaign', a.source?.campaign ?? na],
                            ['Landing page', a.source?.landing_page ? <span className="font-mono text-[12px] break-all">{a.source.landing_page}</span> : na],
                            ['First contact', contact.created_at ? dateTime(contact.created_at) : na],
                        ]}
                    />
                    {SOURCE_NOTE[a.status] && <p className="rounded-md bg-muted px-3 py-2 text-[12.5px] leading-snug">{SOURCE_NOTE[a.status]}</p>}
                </section>

                {proof && (
                    <Section title="Evidence">
                        {evidence.isLoading ? (
                            <Skeleton className="h-24 w-full" />
                        ) : evidence.isError ? (
                            <p className="text-[13px] text-bad">The evidence could not be loaded.</p>
                        ) : (
                            <Rows rows={evidenceRows(a, shown, contact)} />
                        )}
                    </Section>
                )}

                <Section title="Journey">
                    {steps.length === 0 ? (
                        <p className="text-[13px] text-muted-foreground">No tracked touches yet.</p>
                    ) : (
                        <ol className="grid gap-2.5 border-l pl-4">
                            {steps.map((s, i) => (
                                <li key={i} className="relative text-[13px]">
                                    <span
                                        className={cn(
                                            'absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-card',
                                            s.proof ? 'bg-good' : 'bg-grey',
                                        )}
                                    />
                                    <p className="font-medium">{s.title}</p>
                                    <p className="text-[12px] text-muted-foreground">{s.detail}</p>
                                </li>
                            ))}
                        </ol>
                    )}
                </Section>

                <Section title="CRM · updates the same contact record">
                    <Rows
                        rows={[
                            ...(lead ? ([['Owner', lead.assigned?.name ?? 'Unassigned']] as [string, React.ReactNode][]) : []),
                            ['Stage', <StageBadge key="s" stage={contact.stage} />],
                        ]}
                    />
                    {lead ? <LeadActions lead={lead} /> : stageVia ? <ChangeStageButton contact={contact} via={stageVia} className="w-fit" /> : null}
                </Section>
            </DialogContent>
        </Dialog>
    );
}
