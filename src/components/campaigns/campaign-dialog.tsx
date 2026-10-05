'use client';

import { useQueryClient } from '@tanstack/react-query';
import { EyeIcon, Loader2Icon, UploadIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { Field, FormError } from '@/components/app/field';
import { emptySelection, selectionError, TemplatePicker, type TemplateSelection } from '@/components/templates/template-picker';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ApiError, errorMessage } from '@/lib/api';
import {
    importContacts,
    keys,
    launchCampaign,
    previewCampaign,
    saveCampaign,
    useCampaignAudience,
    usePhoneNumbers,
    useSegments,
    useTags,
    useTemplates,
} from '@/lib/queries';
import type { Campaign, CampaignForm, CampaignObjective, CampaignPreview } from '@/lib/types';

const ALL = '__all__';

const OBJECTIVES: [CampaignObjective, string][] = [
    ['promo', 'Promotion / offer'],
    ['announcement', 'Announcement'],
    ['re_engagement', 'Re-engagement'],
    ['reminder', 'Reminder'],
    ['update', 'Update / notice'],
    ['other', 'Other'],
];

const CATEGORIES: [string, string, string][] = [
    ['MARKETING', 'Marketing', 'Offers, news, re-engagement. Needs marketing opt-in.'],
    ['UTILITY', 'Utility', 'Order updates, reminders, account notices about something the customer did.'],
    ['AUTHENTICATION', 'Authentication', 'One-time passcodes only.'],
];

const textarea =
    'field-sizing-content min-h-16 w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm leading-5 outline-none placeholder:text-faint focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20';

/** Local date-time for <input type="datetime-local">, one hour from now. */
const inAnHour = () => new Date(Date.now() + 3_600_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

function Section({ step, title, children }: { step: string; title: string; children: React.ReactNode }) {
    return (
        <section className="grid gap-4 border-t pt-4 first:border-t-0 first:pt-0">
            <h3 className="text-[13px] font-semibold tracking-wide text-ink-2 uppercase">
                <span className="mr-2 text-muted-foreground">{step}</span>
                {title}
            </h3>
            {children}
        </section>
    );
}

/**
 * Create or edit a campaign: setup → audience → message → timing. The audience box shows both
 * gates (who matches, who may be messaged) and every limit that could hold the send back.
 */
export function CampaignDialog({
    open,
    onOpenChange,
    campaign,
    canSend,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    campaign?: Campaign | null;
    canSend: boolean;
}) {
    const qc = useQueryClient();
    const numbers = (usePhoneNumbers().data ?? []).filter((n) => n.status === 'connected');
    const segments = useSegments(open);
    const tags = useTags(open);
    const csvRef = useRef<HTMLInputElement>(null);

    const [loaded, setLoaded] = useState<string | null | undefined>(undefined);
    const [name, setName] = useState('');
    const [notes, setNotes] = useState('');
    const [objective, setObjective] = useState<CampaignObjective | null>(null);
    const [category, setCategory] = useState('MARKETING');
    const [numberId, setNumberId] = useState<string | null>(null);
    const [segmentId, setSegmentId] = useState<string | null>(null);
    const [tag, setTag] = useState<string | null>(null);
    const [csvConsent, setCsvConsent] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadNote, setUploadNote] = useState<string | null>(null);
    const [selection, setSelection] = useState<TemplateSelection>(emptySelection);
    const [restore, setRestore] = useState<Campaign | null>(null); // draft whose template still has to be looked up
    const [previews, setPreviews] = useState<CampaignPreview[] | null>(null);
    const [previewing, setPreviewing] = useState(false);
    const [when, setWhen] = useState<'now' | 'later'>('now');
    const [at, setAt] = useState(inAnHour);
    const [drip, setDrip] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState<'save' | 'launch' | null>(null);

    if (open && loaded !== (campaign?.id ?? null)) {
        setLoaded(campaign?.id ?? null);
        setName(campaign?.name ?? '');
        setNotes(campaign?.notes ?? '');
        setObjective(campaign?.objective ?? null);
        setCategory(campaign?.template.category ?? 'MARKETING');
        setNumberId(campaign?.phone_number?.id ?? null);
        setSegmentId(campaign?.segment_id ?? null);
        setTag(campaign?.audience_tag ?? null);
        setDrip(campaign?.batch_per_hour ?? null);
        setSelection(emptySelection);
        setRestore(campaign ?? null);
        setPreviews(null);
        setUploadNote(null);
        setCsvConsent(false);
        setWhen('now');
        setError(null);
    }
    if (!open && loaded !== undefined) setLoaded(undefined);

    const from = numbers.find((n) => n.id === numberId) ?? numbers[0] ?? null;
    const templates = useTemplates({ waba_account_id: from?.waba_account_id ?? null }, open && from !== null);

    // Editing a draft: put its template and values back once the template list has loaded.
    if (restore && templates.data) {
        const template = templates.data.data.find((t) => t.id === restore.template.id) ?? null;
        setSelection(
            template
                ? { template, header: restore.variables.header, body: restore.variables.body, buttons: restore.variables.buttons ?? {}, media: null }
                : emptySelection,
        );
        setRestore(null);
    }

    const audience = useCampaignAudience(
        { segment_id: segmentId, audience_tag: tag, template_id: selection.template?.id ?? null, phone_number_id: from?.id ?? null },
        open,
    );
    const a = audience.data;
    const marketing = category === 'MARKETING';
    const overPlan = Boolean(a && a.reach_limit !== null && a.reach_used + a.eligible > a.reach_limit);
    const overTier = Boolean(a && a.messaging_limit !== null && a.eligible > a.messaging_limit);
    const redQuality = marketing && a?.quality_rating === 'RED';
    const needsMedia = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(selection.template?.variables.header_format ?? '');
    const variables = () => ({
        header: (selection.template?.variables.header ?? []).map((_, i) => selection.header[i] ?? ''),
        body: (selection.template?.variables.body ?? []).map((_, i) => selection.body[i] ?? ''),
        buttons: selection.buttons,
    });

    const uploadCsv = async (file: File | undefined) => {
        if (!file) return;
        setUploading(true);
        setError(null);
        try {
            const label = `Upload ${new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '.')}`;
            const result = await importContacts(file, [label], csvConsent);
            setTag(label);
            setSegmentId(null);
            setUploadNote(`${file.name}: ${result.created} added, ${result.updated} already existed, ${result.skipped} skipped. They are tagged “${label}”.`);
            void qc.invalidateQueries({ queryKey: keys.tags });
            void qc.invalidateQueries({ queryKey: keys.contactsAll });
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setUploading(false);
            if (csvRef.current) csvRef.current.value = '';
        }
    };

    const preview = async () => {
        if (!selection.template) return;
        setPreviewing(true);
        try {
            const v = variables();
            setPreviews(
                await previewCampaign({
                    template_id: selection.template.id,
                    segment_id: segmentId,
                    audience_tag: tag,
                    variables: { header: v.header, body: v.body },
                }),
            );
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setPreviewing(false);
        }
    };

    const submit = async (launch: boolean) => {
        setError(null);
        if (!name.trim()) return setError('Give the campaign a name.');
        if (!from) return setError('Connect a WhatsApp number first.');
        // An edited draft keeps its stored header file unless a new one is attached.
        const problem = selectionError(
            needsMedia && campaign?.media_id && !selection.media ? { ...selection, media: { id: campaign.media_id } as never } : selection,
        );
        if (problem) return setError(problem);
        const t = selection.template;
        if (!t) return;

        const form: CampaignForm = {
            name: name.trim(),
            phone_number_id: from.id,
            template_id: t.id,
            segment_id: segmentId,
            audience_tag: tag,
            notes: notes.trim() || null,
            objective,
            batch_per_hour: drip,
            media_id: selection.media?.id ?? campaign?.media_id ?? null,
            variables: variables(),
        };

        setPending(launch ? 'launch' : 'save');
        try {
            const saved = await saveCampaign(campaign?.id ?? null, form);
            if (launch) {
                await launchCampaign(saved.id, when === 'later' ? new Date(at).toISOString() : null);
                toast.success(
                    when === 'later' ? 'Campaign scheduled' : a?.quiet_until ? 'Campaign queued; it starts when quiet hours end' : 'Campaign started',
                );
            } else {
                toast.success('Draft saved');
            }
            void qc.invalidateQueries({ queryKey: keys.campaigns });
            onOpenChange(false);
        } catch (e) {
            void qc.invalidateQueries({ queryKey: keys.campaigns }); // the draft may have been saved before launch failed
            const first = e instanceof ApiError ? Object.values(e.fields)[0]?.[0] : undefined;
            setError(first ?? errorMessage(e));
        } finally {
            setPending(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{campaign ? 'Edit campaign' : 'New campaign'}</DialogTitle>
                    <DialogDescription>
                        Send an approved template to a segment of your contacts. Messages are queued and sent at a safe speed.
                    </DialogDescription>
                </DialogHeader>
                <FormError message={error} />

                <Section step="A" title="Setup">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Campaign name" htmlFor="cp-name" hint="Only your team sees this">
                            <Input id="cp-name" value={name} maxLength={120} placeholder="Summer offer – VIPs" onChange={(e) => setName(e.target.value)} />
                        </Field>
                        <Field label="Objective" htmlFor="cp-objective" hint="For your reports">
                            <Select value={objective ?? ALL} onValueChange={(v) => setObjective(v === ALL ? null : (v as CampaignObjective))}>
                                <SelectTrigger id="cp-objective">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL}>Not set</SelectItem>
                                    {OBJECTIVES.map(([key, label]) => (
                                        <SelectItem key={key} value={key}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field
                            label="Send from"
                            htmlFor="cp-from"
                            hint={
                                a?.max_mps
                                    ? `Up to ${a.max_mps} messages per second${a.quality_rating ? ` · quality ${a.quality_rating.toLowerCase()}` : ''}`
                                    : undefined
                            }
                        >
                            <Select
                                value={from?.id}
                                onValueChange={(id) => {
                                    setNumberId(id);
                                    setSelection(emptySelection);
                                    setPreviews(null);
                                }}
                            >
                                <SelectTrigger id="cp-from">
                                    <SelectValue placeholder="Choose a number" />
                                </SelectTrigger>
                                <SelectContent>
                                    {numbers.map((n) => (
                                        <SelectItem key={n.id} value={n.id}>
                                            {n.verified_name ?? n.display_phone_number}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Category" htmlFor="cp-category" hint={CATEGORIES.find(([key]) => key === category)?.[2]}>
                            <Select
                                value={category}
                                onValueChange={(v) => {
                                    setCategory(v);
                                    setSelection(emptySelection);
                                    setPreviews(null);
                                }}
                            >
                                <SelectTrigger id="cp-category">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {CATEGORIES.map(([key, label]) => (
                                        <SelectItem key={key} value={key}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                    </div>
                    {!marketing && (
                        <p className="-mt-2 rounded-md border border-warn/30 bg-warn-bg px-3 py-2 text-[12.5px]">
                            Only use a {category.toLowerCase()} template for its real purpose. Sending promotional content on a non-marketing template breaks
                            WhatsApp’s policy and lowers your number’s quality rating. Meta decides each template’s category when it approves it.
                        </p>
                    )}
                    <Field label="Internal notes (optional)" htmlFor="cp-notes">
                        <textarea id="cp-notes" className={textarea} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
                    </Field>
                </Section>

                <Section step="B" title="Audience">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Segment" htmlFor="cp-segment">
                            <Select value={segmentId ?? ALL} onValueChange={(v) => setSegmentId(v === ALL ? null : v)}>
                                <SelectTrigger id="cp-segment">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL}>All contacts</SelectItem>
                                    {(segments.data ?? []).map((s) => (
                                        <SelectItem key={s.id} value={s.id}>
                                            {s.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Only contacts tagged" htmlFor="cp-tag" hint="Combined with the segment (both must match)">
                            <Select value={tag ?? ALL} onValueChange={(v) => setTag(v === ALL ? null : v)}>
                                <SelectTrigger id="cp-tag">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL}>Any tag</SelectItem>
                                    {tag && !(tags.data ?? []).some((t) => t.name === tag) && <SelectItem value={tag}>{tag}</SelectItem>}
                                    {(tags.data ?? []).map((t) => (
                                        <SelectItem key={t.id} value={t.name}>
                                            {t.name} ({t.contacts})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                    </div>
                    <div className="rounded-md border border-dashed p-3">
                        <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => uploadCsv(e.target.files?.[0])} />
                        <div className="flex flex-wrap items-center gap-3">
                            <Button type="button" variant="outline" size="sm" onClick={() => csvRef.current?.click()} disabled={uploading}>
                                {uploading ? <Loader2Icon className="animate-spin" /> : <UploadIcon />} Upload a CSV list
                            </Button>
                            <div className="flex items-start gap-2">
                                <Checkbox id="cp-csv-consent" checked={csvConsent} onCheckedChange={(v) => setCsvConsent(v === true)} className="mt-0.5" />
                                <Label htmlFor="cp-csv-consent" className="text-[12.5px] leading-snug font-normal text-muted-foreground">
                                    Everyone in the file agreed to receive marketing from us on WhatsApp
                                </Label>
                            </div>
                        </div>
                        <p className="mt-2 text-[12.5px] text-muted-foreground">
                            {uploadNote ??
                                'Needs a “phone” column; name, email and tags are optional. Existing contacts are matched by number, never duplicated.'}
                        </p>
                    </div>

                    <div
                        className={`rounded-md border px-3 py-2.5 text-[13px] ${overPlan || redQuality ? 'border-bad/30 bg-bad-bg' : overTier ? 'border-warn/30 bg-warn-bg' : 'bg-muted'}`}
                        aria-live="polite"
                    >
                        {!a ? (
                            <span className="text-muted-foreground">Working out the audience…</span>
                        ) : (
                            <div className="grid gap-1">
                                <p>
                                    <span className="font-semibold">{a.matched.toLocaleString()}</span> match ·{' '}
                                    <span className="font-semibold">{a.eligible.toLocaleString()}</span> eligible
                                    {a.matched > a.eligible && (
                                        <span className="text-muted-foreground">
                                            {' '}
                                            ({(a.matched - a.eligible).toLocaleString()} excluded:{' '}
                                            {a.category === 'MARKETING'
                                                ? `no marketing opt-in, opted out${a.frequency_cap ? ', or already at the weekly limit' : ''}`
                                                : a.category
                                                  ? 'opted out'
                                                  : 'depends on the template'}
                                            )
                                        </span>
                                    )}
                                </p>
                                {a.frequency_cap > 0 && (
                                    <p className="text-muted-foreground">
                                        Frequency cap: at most {a.frequency_cap} marketing message{a.frequency_cap === 1 ? '' : 's'} per contact per 7 days.
                                    </p>
                                )}
                                {a.reach_limit !== null && (
                                    <p className={overPlan ? 'font-medium text-bad' : 'text-muted-foreground'}>
                                        {overPlan
                                            ? `This would exceed your plan’s monthly campaign reach (${a.reach_used.toLocaleString()} of ${a.reach_limit.toLocaleString()} used). Choose a smaller audience or upgrade.`
                                            : `Plan reach this month: ${a.reach_used.toLocaleString()} of ${a.reach_limit.toLocaleString()} used.`}
                                    </p>
                                )}
                                {a.messaging_limit !== null && (
                                    <p className={overTier ? 'font-medium' : 'text-muted-foreground'}>
                                        {overTier
                                            ? `This number can start ${a.messaging_limit.toLocaleString()} conversations per 24 hours (Meta’s limit). Messages beyond that will fail — send in smaller parts or use drip sending below.`
                                            : `Meta’s limit for this number: ${a.messaging_limit.toLocaleString()} new conversations per 24 hours.`}
                                    </p>
                                )}
                                {marketing && a.quality_rating === 'YELLOW' && (
                                    <p className="font-medium">This number’s quality rating is Yellow. Send to your most engaged contacts only.</p>
                                )}
                                {redQuality && (
                                    <p className="font-medium text-bad">
                                        This number’s quality rating is Red. Marketing campaigns cannot be sent until Meta raises it.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </Section>

                <Section step="C" title="Message">
                    <TemplatePicker
                        wabaAccountId={from?.waba_account_id ?? null}
                        value={selection}
                        category={category}
                        onChange={(v) => {
                            setSelection(v);
                            setPreviews(null);
                        }}
                    />
                    {selection.template && selection.template.variables.body.length + selection.template.variables.header.length > 0 && (
                        <p className="-mt-2 rounded-md bg-muted px-3 py-2 text-[12.5px] text-muted-foreground">
                            Personalise a variable with a contact field: <code>{'{{first_name}}'}</code>, <code>{'{{name}}'}</code>, <code>{'{{phone}}'}</code>,{' '}
                            <code>{'{{email}}'}</code> or a custom field like <code>{'{{attr.city}}'}</code>. Add a fallback after a bar, e.g.{' '}
                            <code>{'{{first_name|there}}'}</code>. A contact with an empty value and no fallback is skipped — nobody ever receives a raw
                            placeholder.
                        </p>
                    )}
                    {needsMedia && campaign?.media_id && !selection.media && (
                        <p className="-mt-2 text-[12.5px] text-muted-foreground">
                            The header file saved with this draft will be used unless you choose a new one.
                        </p>
                    )}
                    {selection.template && (
                        <div className="grid gap-2">
                            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={preview} disabled={previewing}>
                                {previewing ? <Loader2Icon className="animate-spin" /> : <EyeIcon />} Preview with real recipients
                            </Button>
                            {previews !== null &&
                                (previews.length === 0 ? (
                                    <p className="text-[12.5px] text-muted-foreground">Nobody in this audience is eligible yet.</p>
                                ) : (
                                    <div className="grid gap-2 sm:grid-cols-3">
                                        {previews.map((p) => (
                                            <div key={p.contact.id} className={`rounded-lg p-2.5 ${p.skipped ? 'bg-warn-bg' : 'bg-[#efeae2]'}`}>
                                                <p className="mb-1.5 truncate text-[12px] font-medium text-ink-2">
                                                    {p.contact.display_name} {p.skipped && '· would be skipped'}
                                                </p>
                                                <div className="rounded-lg rounded-tl-sm bg-card px-2.5 py-2 text-[13px] shadow-[0_1px_1px_rgba(15,23,42,.08)]">
                                                    {p.header && <p className="mb-1 font-semibold">{p.header}</p>}
                                                    <p className="break-words whitespace-pre-wrap">{p.body}</p>
                                                    {p.footer && <p className="mt-1 text-[11.5px] text-muted-foreground">{p.footer}</p>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                        </div>
                    )}
                </Section>

                {canSend && (
                    <Section step="D" title="Timing and pacing">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="When" htmlFor="cp-when">
                                <Select value={when} onValueChange={(v) => setWhen(v as 'now' | 'later')}>
                                    <SelectTrigger id="cp-when">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="now">Send now</SelectItem>
                                        <SelectItem value="later">Schedule for later</SelectItem>
                                    </SelectContent>
                                </Select>
                            </Field>
                            {when === 'later' && (
                                <Field label="Date and time" htmlFor="cp-at" hint="In your local time">
                                    <Input id="cp-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
                                </Field>
                            )}
                            <Field label="Sending speed" htmlFor="cp-drip" hint="Slower sending is gentler on your number’s quality rating">
                                <Select value={drip === null ? ALL : String(drip)} onValueChange={(v) => setDrip(v === ALL ? null : Number(v))}>
                                    <SelectTrigger id="cp-drip">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={ALL}>As fast as the number allows</SelectItem>
                                        {[100, 250, 500, 1000, 5000, 10000].map((n) => (
                                            <SelectItem key={n} value={String(n)}>
                                                {n.toLocaleString()} per hour
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                        </div>
                        {marketing && a?.quiet_hours && (
                            <p className="-mt-1 text-[12.5px] text-muted-foreground">
                                Quiet hours: marketing is not sent between {a.quiet_hours.start} and {a.quiet_hours.end} ({a.quiet_hours.timezone}).
                                {a.quiet_until && when === 'now'
                                    ? ` It is quiet time now, so sending starts at ${new Date(a.quiet_until).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}.`
                                    : ''}{' '}
                                Change this in Compliance.
                            </p>
                        )}
                    </Section>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button variant="outline" onClick={() => submit(false)} disabled={pending !== null}>
                        {pending === 'save' ? 'Saving…' : 'Save draft'}
                    </Button>
                    {canSend && (
                        <Button
                            onClick={() => submit(true)}
                            disabled={pending !== null || !selection.template || !a || a.eligible === 0 || overPlan || redQuality}
                        >
                            {pending === 'launch' ? 'Starting…' : when === 'later' ? 'Schedule' : `Send to ${a?.eligible.toLocaleString() ?? '…'}`}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
