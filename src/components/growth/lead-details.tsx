'use client';

import { ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';

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
};

/** Meta's referral source_type: "ad" (a click-to-WhatsApp ad) or "post" (a boosted/organic post). */
const SOURCE_TYPE: Record<string, string> = { ad: 'Click-to-WhatsApp ad', post: 'Boosted post' };

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
function evidenceRows(e: LeadEvidence | undefined): [string, React.ReactNode][] {
    const rows: [string, React.ReactNode][] = [];
    if (e?.type === 'meta_ctwa') {
        const d = e.details;
        rows.push([
            'What happened',
            `Customer tapped the WhatsApp button on a ${d.source_type === 'post' ? 'boosted post' : 'Click-to-WhatsApp ad'} and sent a message; Meta attached the ad details to it`,
        ]);
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
        if (d.media_type || d.creative_url || d.video_url)
            rows.push([
                'Ad creative',
                <span key="cr" className="flex flex-wrap items-center gap-2">
                    {d.media_type ? humanize(d.media_type) : 'Creative'}
                    {(d.video_url ?? d.creative_url) && (
                        <a href={d.video_url ?? d.creative_url} target="_blank" rel="noreferrer noopener" className="text-info underline underline-offset-2">
                            View
                        </a>
                    )}
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
    if (e?.type === 'website_reference') {
        const d = e.details;
        rows.push(['What happened', 'Tapped WhatsApp on your website and sent the message with its reference; matched to the registered tap']);
        rows.push(['Source', e.label]);
        if (d.site) rows.push(['Website', d.site]);
        if (d.page_path)
            rows.push([
                'Tapped on',
                <span key="p" className="font-mono text-[12px]">
                    {d.page_path}
                </span>,
            ]);
        if (d.landing_path && d.landing_path !== d.page_path)
            rows.push([
                'Landing page',
                <span key="l" className="font-mono text-[12px]">
                    {d.landing_path}
                </span>,
            ]);
        if (d.campaign)
            rows.push([
                'Campaign details',
                <span key="c" className="font-mono text-[12px] break-all">
                    {Object.entries(d.campaign)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(' · ')}
                </span>,
            ]);
        rows.push([
            'Ad click ID',
            d.click_ids_sent?.length ? `Present (${d.click_ids_sent.join(', ')})` : <span className="text-muted-foreground">None on the visit</span>,
        ]);
        if (d.referrer_host) rows.push(['Came from', d.referrer_host]);
        if (d.campaign_params_origin === 'session_landing') rows.push(['Campaign memory', 'From the landing page earlier in the same browser tab']);
        if (d.reference)
            rows.push([
                'Reference',
                <span key="r" className="font-mono text-[12px]">
                    {d.reference}
                </span>,
            ]);
        if (e.platform) rows.push(['Platform', `${humanize(e.platform)} · ${e.platform_proof ?? 'proof stored'}`]);
        if (e.conflict) rows.push(['Multiple sources', 'The same message also came from a Meta ad; the ad counts as the message origin']);
    }
    if (e?.type === 'website_unregistered') {
        const d = e.details;
        rows.push([
            'What happened',
            d.note ?? 'The message had a valid website reference, but the website click never reached us. Campaign details are not available.',
        ]);
        rows.push(['Source', 'Website · details unavailable']);
        if (d.site) rows.push(['Website', d.site]);
        rows.push([
            'Campaign details',
            <span key="n" className="text-muted-foreground">
                Not available — nothing is guessed
            </span>,
        ]);
    }
    if (e) rows.push(['When', dateTime(e.occurred_at)]);

    return rows;
}

/** The status rows that explain an original source with no evidence row of its own. */
function originalNote(a: Acquisition, contact: Contact): [string, React.ReactNode][] {
    if (a.returning)
        return [
            ['Before this ad', `${a.original?.label ?? 'Existing contact'}${contact.created_at ? ` · contact since ${dateTime(contact.created_at)}` : ''}`],
        ];
    return [];
}

type Step = { at: string; title: string; detail: string; proof: boolean; evidence?: LeadEvidence };

function journey(contact: Contact, a: Acquisition, evidence: LeadEvidence[], stages: StageEvent[]): Step[] {
    const steps: Step[] = [];
    const shownId = a.returning ? a.latest?.evidence_id : a.original?.evidence_id;
    if (a.returning && contact.created_at)
        steps.push({ at: contact.created_at, title: 'Became a contact (no paid ad yet)', detail: dateTime(contact.created_at), proof: false });
    for (const e of evidence) {
        const when = dateTime(e.occurred_at);
        // Every touch other than the one the lead is shown with is a new touch, never a new lead.
        const later = shownId !== undefined && shownId !== e.id;
        if (e.type === 'meta_ctwa') {
            const title = later ? 'New touch: Meta ad (not counted as a new lead)' : 'Tapped a click-to-WhatsApp ad';
            steps.push({
                at: e.occurred_at,
                title,
                detail: [e.label === 'Meta ad' ? 'Meta' : e.label, e.details.headline && `“${e.details.headline}”`, when].filter(Boolean).join(' · '),
                proof: true,
                evidence: e,
            });
            if (e.conflict)
                steps.push({ at: e.occurred_at, title: 'Same message also carried a website reference', detail: 'Conflict flagged, both kept', proof: true });
        } else if (e.type === 'website_unregistered') {
            steps.push({
                at: e.occurred_at,
                title: e.details.note ? 'Website message without its reference' : 'Message had a valid website reference',
                detail: `${e.details.note ? 'Website · details unavailable' : 'Click was never registered (likely blocked)'} · ${when}`,
                proof: true,
                evidence: e,
            });
        } else if (e.confidence === 'reused_other_sender') {
            steps.push({
                at: e.occurred_at,
                title: 'Sent a website reference already used by someone else',
                detail: `Not counted · ${when}`,
                proof: false,
                evidence: e,
            });
        } else {
            steps.push({
                at: e.occurred_at,
                title: later ? 'New touch: website tap (not counted as a new lead)' : 'Tapped WhatsApp on the website, reference matched',
                detail: [e.label, e.details.campaign?.utm_campaign, e.details.page_path, when].filter(Boolean).join(' · '),
                proof: true,
                evidence: e,
            });
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

/** One journey row; a row with evidence opens its own details (its own campaign, click IDs and reference). */
function JourneyRow({ step: s }: { step: Step }) {
    const [open, setOpen] = useState(false);
    const dot = <span className={cn('absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-card', s.proof ? 'bg-good' : 'bg-grey')} />;
    if (!s.evidence)
        return (
            <li className="relative text-[13px]">
                {dot}
                <p className="font-medium">{s.title}</p>
                <p className="text-[12px] text-muted-foreground">{s.detail}</p>
            </li>
        );

    return (
        <li className="relative text-[13px]">
            {dot}
            <button type="button" className="group flex w-full items-start justify-between gap-2 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
                <span>
                    <span className="block font-medium group-hover:underline">{s.title}</span>
                    <span className="block text-[12px] text-muted-foreground">{s.detail}</span>
                </span>
                <ChevronDownIcon className={cn('mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
            </button>
            {open && (
                <div className="mt-2 rounded-md border bg-muted/40 p-2.5">
                    <Rows rows={evidenceRows(s.evidence)} />
                </div>
            )}
        </li>
    );
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
    // The evidence of the touch the lead is shown with: the original ad, or for a returning contact the ad that brought it back.
    const shownId = a.returning ? a.latest?.evidence_id : a.original?.evidence_id;
    const originalEvidence = list.find((e) => e.id === shownId) ?? (a.returning ? list[list.length - 1] : list[0]);
    const latestEvidence = a.returning ? undefined : list.find((e) => e.id === a.latest?.evidence_id && e.id !== originalEvidence?.id);
    const steps = journey(contact, a, list, stages.data ?? []);
    const na = <span className="text-muted-foreground">Not available</span>;
    const name = a.source?.name ?? a.label;
    const latest = a.source?.latest;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={cn(
                    'top-0 right-0 left-auto h-dvh max-h-dvh w-full max-w-full translate-x-0 translate-y-0 content-start overflow-y-auto rounded-none border-y-0 border-r-0 sm:max-w-md',
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
                        {!a.label.startsWith(name) && <span className="text-[15px] font-semibold">{name}</span>}
                    </div>
                    <Rows
                        rows={[
                            [a.returning ? 'Came back through' : 'Original source', name],
                            [
                                'Campaign',
                                <span key="c">
                                    {a.source?.campaign ?? (latest ? '—' : na)}
                                    {latest && <span className="block text-[12px] text-muted-foreground">{latest.line}</span>}
                                </span>,
                            ],
                            ['Landing page', a.source?.landing_page ? <span className="font-mono text-[12px] break-all">{a.source.landing_page}</span> : na],
                            ['First contact', contact.created_at ? dateTime(contact.created_at) : na],
                        ]}
                    />
                    {SOURCE_NOTE[a.status] && <p className="rounded-md bg-muted px-3 py-2 text-[12.5px] leading-snug">{SOURCE_NOTE[a.status]}</p>}
                    {a.returning && (
                        <p className="rounded-md bg-muted px-3 py-2 text-[12.5px] leading-snug">
                            Returning contact, shown with the paid touch that brought them back. Marketing keeps crediting the original source, so this is not a
                            new lead.
                        </p>
                    )}
                    {latest && !a.returning && (
                        <p className="rounded-md bg-muted px-3 py-2 text-[12.5px] leading-snug">
                            Returning contact. Marketing keeps crediting the original source; the latest touch is shown for context only.
                        </p>
                    )}
                </section>

                {proof && (
                    <Section title={a.returning ? 'Evidence · the touch that brought them back' : 'Evidence · original source'}>
                        {evidence.isLoading ? (
                            <Skeleton className="h-24 w-full" />
                        ) : evidence.isError ? (
                            <p className="text-[13px] text-bad">The evidence could not be loaded.</p>
                        ) : (
                            <Rows rows={[...originalNote(a, contact), ...evidenceRows(originalEvidence)]} />
                        )}
                    </Section>
                )}

                {proof && latestEvidence && (
                    <Section title="Latest touch · not counted as a new lead">
                        <Rows rows={evidenceRows(latestEvidence)} />
                    </Section>
                )}

                <Section title="Journey">
                    {steps.length === 0 ? (
                        <p className="text-[13px] text-muted-foreground">No tracked touches yet.</p>
                    ) : (
                        <ol className="grid gap-2.5 border-l pl-4">
                            {steps.map((s, i) => (
                                <JourneyRow key={i} step={s} />
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
