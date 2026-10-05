'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { Field, FormError } from '@/components/app/field';
import { emptySelection, selectionError, TemplatePicker, type TemplateSelection } from '@/components/templates/template-picker';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ApiError, errorMessage } from '@/lib/api';
import { keys, launchCampaign, saveCampaign, useCampaignAudience, usePhoneNumbers, useSegments, useTemplates } from '@/lib/queries';
import type { Campaign, CampaignForm } from '@/lib/types';

const ALL = '__all__';

/** Local date-time for <input type="datetime-local">, one hour from now. */
const inAnHour = () => {
    const d = new Date(Date.now() + 3_600_000 - new Date().getTimezoneOffset() * 60_000);

    return d.toISOString().slice(0, 16);
};

/**
 * Create or edit a campaign: an approved template sent to a segment. The audience line shows
 * both gates — who matches the segment, and who of those may be messaged (consent).
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
    const [loaded, setLoaded] = useState<string | null | undefined>(undefined);
    const [name, setName] = useState('');
    const [numberId, setNumberId] = useState<string | null>(null);
    const [segmentId, setSegmentId] = useState<string | null>(null);
    const [selection, setSelection] = useState<TemplateSelection>(emptySelection);
    const [restore, setRestore] = useState<Campaign | null>(null); // draft whose template still has to be looked up
    const [when, setWhen] = useState<'now' | 'later'>('now');
    const [at, setAt] = useState(inAnHour);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState<'save' | 'launch' | null>(null);

    if (open && loaded !== (campaign?.id ?? null)) {
        setLoaded(campaign?.id ?? null);
        setName(campaign?.name ?? '');
        setNumberId(campaign?.phone_number?.id ?? null);
        setSegmentId(campaign?.segment_id ?? null);
        setSelection(emptySelection);
        setRestore(campaign ?? null);
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

    const audience = useCampaignAudience(segmentId, selection.template?.id ?? null, open);
    const a = audience.data;
    const overLimit = a && a.reach_limit !== null && a.reach_used + a.eligible > a.reach_limit;
    const needsMedia = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(selection.template?.variables.header_format ?? '');

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
            media_id: selection.media?.id ?? campaign?.media_id ?? null,
            variables: {
                header: t.variables.header.map((_, i) => selection.header[i] ?? ''),
                body: t.variables.body.map((_, i) => selection.body[i] ?? ''),
                buttons: selection.buttons,
            },
        };

        setPending(launch ? 'launch' : 'save');
        try {
            const saved = await saveCampaign(campaign?.id ?? null, form);
            if (launch) {
                await launchCampaign(saved.id, when === 'later' ? new Date(at).toISOString() : null);
                toast.success(when === 'later' ? 'Campaign scheduled' : 'Campaign started');
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
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{campaign ? 'Edit campaign' : 'New campaign'}</DialogTitle>
                    <DialogDescription>
                        Send an approved template to a segment of your contacts. Messages are queued and sent at a safe speed.
                    </DialogDescription>
                </DialogHeader>
                <FormError message={error} />

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Campaign name" htmlFor="cp-name" className="sm:col-span-2" hint="Only your team sees this">
                        <Input id="cp-name" value={name} maxLength={120} placeholder="Summer offer – VIPs" onChange={(e) => setName(e.target.value)} />
                    </Field>
                    <Field label="Send from" htmlFor="cp-from">
                        <Select
                            value={from?.id}
                            onValueChange={(id) => {
                                setNumberId(id);
                                setSelection(emptySelection);
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
                    <Field label="Audience" htmlFor="cp-audience">
                        <Select value={segmentId ?? ALL} onValueChange={(v) => setSegmentId(v === ALL ? null : v)}>
                            <SelectTrigger id="cp-audience">
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
                </div>

                <TemplatePicker wabaAccountId={from?.waba_account_id ?? null} value={selection} onChange={setSelection} />
                {selection.template && selection.template.variables.body.length + selection.template.variables.header.length > 0 && (
                    <p className="-mt-2 rounded-md bg-muted px-3 py-2 text-[12.5px] text-muted-foreground">
                        Personalise a variable with a contact field: <code>{'{{first_name}}'}</code>, <code>{'{{name}}'}</code>, <code>{'{{phone}}'}</code>,{' '}
                        <code>{'{{email}}'}</code> or a custom field like <code>{'{{attr.city}}'}</code>. Add a fallback after a bar, e.g.{' '}
                        <code>{'{{first_name|there}}'}</code>. Contacts with an empty value and no fallback are skipped.
                    </p>
                )}
                {needsMedia && campaign?.media_id && !selection.media && (
                    <p className="-mt-2 text-[12.5px] text-muted-foreground">The header file saved with this draft will be used unless you choose a new one.</p>
                )}

                <div className={`rounded-md border px-3 py-2.5 text-[13px] ${overLimit ? 'border-bad/30 bg-bad-bg' : 'bg-muted'}`} aria-live="polite">
                    {!a ? (
                        <span className="text-muted-foreground">Working out the audience…</span>
                    ) : (
                        <>
                            <p>
                                <span className="font-semibold">{a.matched.toLocaleString()}</span> match ·{' '}
                                <span className="font-semibold">{a.eligible.toLocaleString()}</span> eligible
                                {a.matched > a.eligible && (
                                    <span className="text-muted-foreground">
                                        {' '}
                                        ({(a.matched - a.eligible).toLocaleString()} excluded:{' '}
                                        {a.category === 'MARKETING'
                                            ? 'no marketing opt-in, or opted out'
                                            : a.category
                                              ? 'opted out'
                                              : 'depends on the template'}
                                        )
                                    </span>
                                )}
                            </p>
                            {a.reach_limit !== null && (
                                <p className={`mt-0.5 ${overLimit ? 'font-medium text-bad' : 'text-muted-foreground'}`}>
                                    {overLimit
                                        ? `This would exceed your plan’s monthly campaign reach (${a.reach_used.toLocaleString()} of ${a.reach_limit.toLocaleString()} used). Choose a smaller segment or upgrade your plan.`
                                        : `Monthly campaign reach: ${a.reach_used.toLocaleString()} of ${a.reach_limit.toLocaleString()} used.`}
                                </p>
                            )}
                        </>
                    )}
                </div>

                {canSend && (
                    <div className="grid gap-3 sm:grid-cols-2">
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
                                <Input
                                    id="cp-at"
                                    type="datetime-local"
                                    value={at}
                                    min={inAnHour().slice(0, 11) + '00:00'}
                                    onChange={(e) => setAt(e.target.value)}
                                />
                            </Field>
                        )}
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button variant="outline" onClick={() => submit(false)} disabled={pending !== null}>
                        {pending === 'save' ? 'Saving…' : 'Save draft'}
                    </Button>
                    {canSend && (
                        <Button onClick={() => submit(true)} disabled={pending !== null || !selection.template || !a || a.eligible === 0 || Boolean(overLimit)}>
                            {pending === 'launch' ? 'Starting…' : when === 'later' ? 'Schedule' : `Send to ${a?.eligible.toLocaleString() ?? '…'}`}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
