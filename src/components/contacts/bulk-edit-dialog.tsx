'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangleIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { useSession } from '@/components/app/session';
import { type AttributeValue, CustomFieldInput } from '@/components/contacts/contact-dialog';
import { TagInput } from '@/components/contacts/tag-input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, errorMessage } from '@/lib/api';
import { number } from '@/lib/format';
import { keys, useContactFields, useStages, useTags } from '@/lib/queries';
import type { Contact } from '@/lib/types';

const KEEP = '__keep__';
const NONE = '__none__';
const CLEAR = '__clear__';

type Result = { matched: number; updated: number; skipped: Record<string, number> };

/**
 * Contacts & CRM › select contacts › Edit: tags, one custom field, the stage (Owners and Admins)
 * and consent, applied to every selected contact after a review step that names each change and
 * the number of contacts. The server refuses if that number no longer matches.
 */
export function BulkEditDialog({
    open,
    onOpenChange,
    contacts,
    onDone,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    contacts: Contact[];
    onDone: () => void;
}) {
    const qc = useQueryClient();
    const { membership } = useSession();
    const role = membership.role?.is_system ? membership.role.key : null;
    const editsStage = role === 'owner' || role === 'admin';
    const tags = (useTags(open).data ?? []).map((t) => t.name);
    const fields = useContactFields(open).data ?? [];
    const stages = (useStages(open && editsStage).data ?? []).filter((s) => !s.archived);

    const [add, setAdd] = useState<string[]>([]);
    const [remove, setRemove] = useState<string[]>([]);
    const [fieldKey, setFieldKey] = useState<string>(KEEP);
    const [fieldMode, setFieldMode] = useState<'set' | 'clear'>('set');
    const [fieldValue, setFieldValue] = useState<AttributeValue>(undefined);
    const [stage, setStage] = useState<string>(KEEP);
    const [consent, setConsent] = useState<'keep' | 'opted_in' | 'opted_out'>('keep');
    const [note, setNote] = useState('');
    const [step, setStep] = useState<'edit' | 'review'>('edit');
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reset = () => {
        setAdd([]);
        setRemove([]);
        setFieldKey(KEEP);
        setFieldMode('set');
        setFieldValue(undefined);
        setStage(KEEP);
        setConsent('keep');
        setNote('');
        setStep('edit');
        setError(null);
    };
    const close = (o: boolean) => {
        if (!o) reset();
        onOpenChange(o);
    };

    const field = fields.find((f) => f.key === fieldKey);
    const n = contacts.length;
    const optedOut = contacts.filter((c) => c.consent_state === 'opted_out').length;
    const lower = (list: string[]) => list.map((t) => t.toLowerCase());
    const clash = lower(add).some((t) => lower(remove).includes(t));
    const fieldEmpty = fieldValue === undefined || fieldValue === '' || (Array.isArray(fieldValue) && fieldValue.length === 0);
    const fieldRequired = Boolean(field?.rules?.required);

    const problems = [
        clash && 'A tag cannot be added and removed at the same time.',
        field && fieldMode === 'set' && fieldEmpty && `Enter a value for ${field.label}, or choose “Clear the value”.`,
        field && fieldMode === 'clear' && fieldRequired && `${field.label} is required, so it cannot be cleared.`,
        consent === 'opted_in' && note.trim().length < 10 && 'Say where these contacts agreed to receive WhatsApp messages (at least 10 characters).',
    ].filter(Boolean) as string[];

    const summary = [
        add.length > 0 && `Add the tag${add.length > 1 ? 's' : ''} ${add.join(', ')}`,
        remove.length > 0 && `Remove the tag${remove.length > 1 ? 's' : ''} ${remove.join(', ')}`,
        field &&
            (fieldMode === 'clear'
                ? `Clear ${field.label}`
                : `Set ${field.label} to “${typeof fieldValue === 'boolean' ? (fieldValue ? 'Yes' : 'No') : Array.isArray(fieldValue) ? fieldValue.join(', ') : fieldValue}”`),
        stage !== KEEP && `Move to the stage ${stage === NONE ? '“No stage”' : `“${stages.find((s) => s.id === stage)?.name ?? ''}”`}`,
        consent === 'opted_out' && 'Opt out of all WhatsApp messages (recorded in the consent ledger; running chatbots stop)',
        consent === 'opted_in' &&
            `Record an opt-in: “${note.trim()}”${optedOut > 0 ? ` — ${number(optedOut)} who opted out stay opted out (only they can subscribe again)` : ''}`,
    ].filter(Boolean) as string[];

    async function apply() {
        setPending(true);
        setError(null);
        try {
            const body: Record<string, unknown> = { contact_ids: contacts.map((c) => c.id), confirm_count: n };
            if (add.length) body.tags_add = add;
            if (remove.length) body.tags_remove = remove;
            if (field) body.field = { key: field.key, value: fieldMode === 'clear' ? null : fieldValue };
            if (stage !== KEEP) body.stage = { id: stage === NONE ? null : stage };
            if (consent !== 'keep') body.consent = { state: consent, note: note.trim() || null };
            const r = await api<{ data: Result }>('contacts/bulk-edit', { method: 'POST', body });
            const skipped = r.data.skipped.opted_out ?? 0;
            toast.success(
                `${number(r.data.updated)} of ${number(r.data.matched)} contacts updated${r.data.updated < r.data.matched ? ' (the others already had these values)' : ''}.${skipped ? ` ${number(skipped)} opted-out contacts were not opted in.` : ''}`,
            );
            void qc.invalidateQueries({ queryKey: keys.contactsAll });
            onDone();
            close(false);
        } catch (e) {
            setError(errorMessage(e));
            setStep('edit');
        } finally {
            setPending(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        {step === 'edit' ? 'Edit' : 'Confirm changes to'} {number(n)} contact{n === 1 ? '' : 's'}
                    </DialogTitle>
                    <DialogDescription>
                        {step === 'edit'
                            ? 'Only what you change here is changed; everything else stays as it is on each contact.'
                            : 'Each contact is changed as if edited one by one: stage history, consent ledger and the audit log are kept.'}
                    </DialogDescription>
                </DialogHeader>

                {step === 'edit' ? (
                    <div className="grid gap-4 text-[13.5px]">
                        <div className="grid gap-1.5">
                            <Label htmlFor="bulk-add">Add tags</Label>
                            <TagInput id="bulk-add" value={add} onChange={setAdd} suggestions={tags} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="bulk-remove">Remove tags</Label>
                            <TagInput id="bulk-remove" value={remove} onChange={setRemove} suggestions={tags} placeholder="Tag to remove, press Enter" />
                        </div>

                        {fields.length > 0 && (
                            <div className="grid gap-1.5">
                                <Label htmlFor="bulk-field">Custom field</Label>
                                <Select
                                    value={fieldKey}
                                    onValueChange={(v) => {
                                        setFieldKey(v);
                                        setFieldValue(undefined);
                                        setFieldMode('set');
                                    }}
                                >
                                    <SelectTrigger id="bulk-field">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={KEEP}>Don’t change custom fields</SelectItem>
                                        {fields.map((f) => (
                                            <SelectItem key={f.key} value={f.key}>
                                                {f.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {field && (
                                    <div className="grid gap-2 rounded-md border bg-muted/40 p-2.5">
                                        <Select
                                            value={fieldMode === 'clear' ? CLEAR : 'set'}
                                            onValueChange={(v) => setFieldMode(v === CLEAR ? 'clear' : 'set')}
                                        >
                                            <SelectTrigger aria-label="What to do with the field" className="bg-card">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="set">Set the value</SelectItem>
                                                <SelectItem value={CLEAR} disabled={fieldRequired}>
                                                    Clear the value{fieldRequired ? ' (required field)' : ''}
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                        {fieldMode === 'set' && <CustomFieldInput field={field} value={fieldValue} onChange={setFieldValue} />}
                                    </div>
                                )}
                            </div>
                        )}

                        {editsStage && stages.length > 0 && (
                            <div className="grid gap-1.5">
                                <Label htmlFor="bulk-stage">Stage</Label>
                                <Select value={stage} onValueChange={setStage}>
                                    <SelectTrigger id="bulk-stage">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={KEEP}>Don’t change the stage</SelectItem>
                                        <SelectItem value={NONE}>No stage</SelectItem>
                                        {stages.map((s) => (
                                            <SelectItem key={s.id} value={s.id}>
                                                {s.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <div className="grid gap-1.5">
                            <Label htmlFor="bulk-consent">Consent</Label>
                            <Select value={consent} onValueChange={(v) => setConsent(v as typeof consent)}>
                                <SelectTrigger id="bulk-consent">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="keep">Don’t change consent</SelectItem>
                                    <SelectItem value="opted_in">Record an opt-in</SelectItem>
                                    <SelectItem value="opted_out">Opt out</SelectItem>
                                </SelectContent>
                            </Select>
                            {consent === 'opted_in' && (
                                <div className="grid gap-1.5 rounded-md border border-warn/30 bg-warn-bg p-2.5 text-[12.5px] text-ink-2">
                                    <p>
                                        Only record an opt-in for people who agreed to receive WhatsApp messages from your business. Nothing is sent to them.
                                        {optedOut > 0 && ` ${number(optedOut)} selected contacts opted out and stay opted out.`}
                                    </p>
                                    <Label htmlFor="bulk-consent-note" className="text-[12.5px] font-medium">
                                        Where did they agree?
                                    </Label>
                                    <Input
                                        id="bulk-consent-note"
                                        value={note}
                                        maxLength={190}
                                        onChange={(e) => setNote(e.target.value)}
                                        placeholder="e.g. Signed the opt-in form at the open day"
                                        className="bg-card"
                                    />
                                </div>
                            )}
                            {consent === 'opted_out' && (
                                <p className="text-[12.5px] text-muted-foreground">
                                    They won’t receive campaigns or other messages until they reply START. Nothing is sent to them now.
                                </p>
                            )}
                        </div>

                        {(problems.length > 0 || error) && (
                            <div role="alert" className="grid gap-1 rounded-md border border-bad/30 bg-bad-bg px-3 py-2 text-[12.5px] text-bad">
                                {error && <p>{error}</p>}
                                {problems.map((p) => (
                                    <p key={p}>{p}</p>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="grid gap-3 text-[13.5px]">
                        <ul className="grid list-disc gap-1 pl-5">
                            {summary.map((s) => (
                                <li key={s}>{s}</li>
                            ))}
                        </ul>
                        <p className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn-bg px-3 py-2 text-[12.5px] text-ink-2">
                            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-warn" />
                            This changes {number(n)} contact{n === 1 ? '' : 's'} at once and cannot be undone in one step.
                        </p>
                    </div>
                )}

                <DialogFooter>
                    {step === 'edit' ? (
                        <>
                            <Button variant="outline" onClick={() => close(false)}>
                                Cancel
                            </Button>
                            <Button onClick={() => setStep('review')} disabled={summary.length === 0 || problems.length > 0}>
                                Review changes
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="outline" onClick={() => setStep('edit')} disabled={pending}>
                                Back
                            </Button>
                            <Button onClick={apply} disabled={pending}>
                                {pending ? 'Applying…' : `Apply to ${number(n)} contact${n === 1 ? '' : 's'}`}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
