'use client';

import { Loader2Icon, PaperclipIcon } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';

import { Field } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { errorMessage, upload } from '@/lib/api';
import { useSession } from '@/components/app/session';
import { useTemplatesRealtime } from '@/hooks/use-templates-realtime';
import { type SendPayload, useTemplates } from '@/lib/queries';
import type { MessageTemplate, UploadedMedia } from '@/lib/types';

import { TemplatePreview } from './template-status';

export type TemplateSelection = {
    template: MessageTemplate | null;
    header: string[];
    body: string[];
    buttons: Record<string, string>;
    media: UploadedMedia | null;
};

export const emptySelection: TemplateSelection = { template: null, header: [], body: [], buttons: {}, media: null };

const MEDIA_HEADERS = ['IMAGE', 'VIDEO', 'DOCUMENT'];

/** What is still missing before this template can be sent, or null when it is ready. */
export function selectionError(s: TemplateSelection): string | null {
    const t = s.template;
    if (!t) return 'Choose an approved template.';
    const v = t.variables;
    if (v.header.some((_, i) => !s.header[i]?.trim())) return 'Fill in the header variable.';
    if (v.body.some((_, i) => !s.body[i]?.trim())) return 'Fill in every variable of the message.';
    if (v.header_format && MEDIA_HEADERS.includes(v.header_format) && !s.media) return `Attach the ${v.header_format.toLowerCase()} for the header.`;
    const missing = v.buttons.find((b) => b.variable && b.type === 'URL' && !s.buttons[String(b.index)]?.trim());
    if (missing) return `Fill in the link value for the "${missing.text}" button.`;

    return null;
}

/** The API payload for a ready selection (the server builds Meta's components and validates again). */
export function selectionPayload(s: TemplateSelection): SendPayload {
    const t = s.template as MessageTemplate;

    return {
        type: 'template',
        media_id: s.media?.id ?? null,
        template: {
            name: t.name,
            language: t.language,
            variables: {
                header: t.variables.header.map((_, i) => s.header[i] ?? ''),
                body: t.variables.body.map((_, i) => s.body[i] ?? ''),
                buttons: s.buttons,
            },
        },
    };
}

/**
 * Pick one of the APPROVED templates of a WhatsApp Business Account and fill in its variables.
 * Templates that are in review, rejected or paused are not offered: Meta would refuse them.
 */
export function TemplatePicker({
    wabaAccountId,
    value,
    onChange,
    category = null,
}: {
    wabaAccountId: string | null;
    value: TemplateSelection;
    onChange: (v: TemplateSelection) => void;
    /** Only offer templates Meta approved in this category (MARKETING | UTILITY | AUTHENTICATION). */
    category?: string | null;
}) {
    const { me } = useSession();
    // Statuses follow Meta automatically: live updates, with a slow poll as a safety net.
    const live = useTemplatesRealtime(me.active_tenant_id, wabaAccountId !== null);
    const templates = useTemplates({ waba_account_id: wabaAccountId }, wabaAccountId !== null, live ? 60_000 : 15_000);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const all = templates.data?.data ?? [];
    const approved = all.filter((t) => t.sendable && (!category || t.category === category));
    const t = value.template;
    const set = (patch: Partial<TemplateSelection>) => onChange({ ...value, ...patch });

    const pickFile = async (file: File | undefined) => {
        if (!file) return;
        setUploading(true);
        setUploadError(null);
        try {
            const form = new FormData();
            form.append('file', file);
            const res = await upload<{ data: UploadedMedia }>('media', form);
            if (res.data.type !== t?.variables.header_format?.toLowerCase()) {
                setUploadError(`This template needs ${t?.variables.header_format?.toLowerCase()} in the header; that file is ${res.data.type}.`);
            } else {
                set({ media: res.data });
            }
        } catch (e) {
            setUploadError(errorMessage(e));
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    if (!wabaAccountId) return <p className="text-[13px] text-muted-foreground">Choose a WhatsApp number first.</p>;

    return (
        <div className="grid gap-4">
            <Field
                label="Template"
                htmlFor="tpl-pick"
                hint={
                    templates.isLoading
                        ? 'Loading templates…'
                        : approved.length === 0
                          ? all.length > 0
                              ? 'None of your templates is approved yet. Templates in review appear here once Meta approves them.'
                              : 'No templates yet. Create one on the Templates page; templates made in WhatsApp Manager appear here automatically.'
                          : `${approved.length} approved template${approved.length === 1 ? '' : 's'}`
                }
            >
                <div className="flex gap-2">
                    <Select
                        value={t?.id}
                        onValueChange={(id) => onChange({ ...emptySelection, template: approved.find((x) => x.id === id) ?? null })}
                        disabled={approved.length === 0}
                    >
                        <SelectTrigger id="tpl-pick" className="min-w-0 flex-1">
                            <SelectValue placeholder={approved.length === 0 ? 'No approved templates' : 'Choose an approved template'} />
                        </SelectTrigger>
                        <SelectContent>
                            {approved.map((x) => (
                                <SelectItem key={x.id} value={x.id}>
                                    {x.name} · {x.language}
                                    {category ? '' : ` · ${(x.category ?? '').toLowerCase()}`}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </Field>
            {approved.length === 0 && !templates.isLoading && (
                <Button asChild variant="outline" size="sm" className="w-fit">
                    <Link href="/templates">Open Templates</Link>
                </Button>
            )}

            {t && (
                <>
                    {t.variables.header.map((name, i) => (
                        <Field key={`h${name}`} label={`Header variable {{${name}}}`} htmlFor={`tpl-h-${i}`}>
                            <Input
                                id={`tpl-h-${i}`}
                                value={value.header[i] ?? ''}
                                maxLength={60}
                                onChange={(e) => set({ header: t.variables.header.map((_, j) => (j === i ? e.target.value : (value.header[j] ?? ''))) })}
                            />
                        </Field>
                    ))}
                    {t.variables.header_format && MEDIA_HEADERS.includes(t.variables.header_format) && (
                        <Field label={`Header ${t.variables.header_format.toLowerCase()}`} htmlFor="tpl-media" error={uploadError ?? undefined}>
                            <div className="flex items-center gap-2">
                                <input id="tpl-media" ref={fileRef} type="file" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
                                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                                    {uploading ? <Loader2Icon className="animate-spin" /> : <PaperclipIcon />} {value.media ? 'Replace file' : 'Choose file'}
                                </Button>
                                {value.media && <span className="min-w-0 truncate text-[12.5px] text-muted-foreground">{value.media.filename}</span>}
                            </div>
                        </Field>
                    )}
                    {t.variables.body.length > 0 && (
                        <div className="grid gap-2">
                            <p className="text-[13px] font-semibold text-ink-2">Message variables</p>
                            {t.variables.body.map((name, i) => (
                                <div key={name} className="flex items-center gap-2">
                                    <span className="w-16 shrink-0 truncate font-mono text-[12px] text-muted-foreground">{`{{${name}}}`}</span>
                                    <Input
                                        value={value.body[i] ?? ''}
                                        aria-label={`Variable ${name}`}
                                        maxLength={1024}
                                        onChange={(e) => set({ body: t.variables.body.map((_, j) => (j === i ? e.target.value : (value.body[j] ?? ''))) })}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                    {t.variables.buttons
                        .filter((b) => b.variable && b.type === 'URL')
                        .map((b) => (
                            <Field
                                key={b.index}
                                label={`Link value for "${b.text}"`}
                                htmlFor={`tpl-b-${b.index}`}
                                hint="The part that replaces {{1}} at the end of the link."
                            >
                                <Input
                                    id={`tpl-b-${b.index}`}
                                    value={value.buttons[String(b.index)] ?? ''}
                                    onChange={(e) => set({ buttons: { ...value.buttons, [String(b.index)]: e.target.value } })}
                                />
                            </Field>
                        ))}
                    <div className="grid gap-1.5">
                        <p className="text-[13px] font-semibold text-ink-2">Preview</p>
                        <TemplatePreview template={t} header={value.header} body={value.body} />
                    </div>
                </>
            )}
            {!t && uploadError && <p className="text-[12.5px] text-destructive">{uploadError}</p>}
        </div>
    );
}
