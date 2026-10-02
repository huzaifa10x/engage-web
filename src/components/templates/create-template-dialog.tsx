'use client';

import { useQueryClient } from '@tanstack/react-query';
import { PlusIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Field, FormError } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ApiError, errorMessage } from '@/lib/api';
import { createTemplate, keys } from '@/lib/queries';
import type { MessageTemplate, TemplateForm, WabaAccount } from '@/lib/types';

import { TemplatePreview } from './template-status';

const LANGUAGES: [string, string][] = [
    ['en', 'English'],
    ['en_US', 'English (US)'],
    ['en_GB', 'English (UK)'],
    ['ar', 'Arabic'],
    ['ur', 'Urdu'],
    ['hi', 'Hindi'],
    ['fr', 'French'],
    ['es', 'Spanish'],
    ['de', 'German'],
    ['ru', 'Russian'],
    ['tr', 'Turkish'],
    ['fa', 'Persian'],
    ['zh_CN', 'Chinese (Simplified)'],
    ['id', 'Indonesian'],
    ['pt_BR', 'Portuguese (Brazil)'],
];

type ButtonRow = { type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url: string; example: string; phone_number: string };

const placeholders = (text: string) => [...new Set([...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1]))];

const textarea =
    'field-sizing-content min-h-24 w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm leading-5 outline-none placeholder:text-faint focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20';

/** Create a template and submit it to Meta for review. It becomes sendable once Meta approves it. */
export function CreateTemplateDialog({ open, onOpenChange, accounts }: { open: boolean; onOpenChange: (o: boolean) => void; accounts: WabaAccount[] }) {
    const qc = useQueryClient();
    const [accountId, setAccountId] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [language, setLanguage] = useState('en');
    const [category, setCategory] = useState<'MARKETING' | 'UTILITY'>('UTILITY');
    const [header, setHeader] = useState('');
    const [headerExample, setHeaderExample] = useState('');
    const [body, setBody] = useState('');
    const [examples, setExamples] = useState<string[]>([]);
    const [footer, setFooter] = useState('');
    const [buttons, setButtons] = useState<ButtonRow[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    const account = accounts.find((a) => a.id === accountId) ?? accounts[0] ?? null;
    const vars = placeholders(body);
    const headerVars = placeholders(header);

    const reset = () => {
        setName('');
        setHeader('');
        setHeaderExample('');
        setBody('');
        setExamples([]);
        setFooter('');
        setButtons([]);
        setError(null);
    };

    const submit = async () => {
        setError(null);
        if (!account) return setError('Connect a WhatsApp number first.');
        if (!/^[a-z0-9_]+$/.test(name)) return setError('Give the template a name using lowercase letters, numbers and underscores, e.g. order_update.');
        if (!body.trim()) return setError('Write the message text.');
        if (vars.some((_, i) => !examples[i]?.trim())) return setError('Add an example value for every variable so Meta can review the template.');

        const form: TemplateForm = {
            waba_account_id: account.id,
            name,
            language,
            category,
            header: header.trim() ? { text: header.trim(), example: headerExample.trim() || undefined } : null,
            body: body.trim(),
            body_examples: vars.map((_, i) => examples[i].trim()),
            footer: footer.trim() || null,
            buttons: buttons.map((b) => ({
                type: b.type,
                text: b.text.trim(),
                ...(b.type === 'URL' ? { url: b.url.trim(), example: b.example.trim() || undefined } : {}),
                ...(b.type === 'PHONE_NUMBER' ? { phone_number: b.phone_number.trim() } : {}),
            })),
        };

        setPending(true);
        try {
            const created = await createTemplate(form);
            void qc.invalidateQueries({ queryKey: keys.templatesAll });
            toast.success(created.status === 'APPROVED' ? 'Template approved by Meta' : 'Template submitted to Meta for review');
            reset();
            onOpenChange(false);
        } catch (e) {
            const first = e instanceof ApiError ? Object.values(e.fields)[0]?.[0] : undefined;
            setError(first ?? errorMessage(e));
        } finally {
            setPending(false);
        }
    };

    const preview = {
        components: [
            ...(header.trim() ? [{ type: 'HEADER', format: 'TEXT', text: header }] : []),
            { type: 'BODY', text: body || 'Your message text appears here.' },
            ...(footer.trim() ? [{ type: 'FOOTER', text: footer }] : []),
            ...(buttons.length ? [{ type: 'BUTTONS', buttons: buttons.map((b) => ({ type: b.type, text: b.text || 'Button' })) }] : []),
        ],
        variables: { header: headerVars, header_format: header.trim() ? 'TEXT' : null, body: vars, buttons: [] },
    } as unknown as MessageTemplate;

    const setButton = (i: number, patch: Partial<ButtonRow>) => setButtons(buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>New template</DialogTitle>
                    <DialogDescription>
                        The template is submitted to Meta for review. You can send it as soon as its status changes to Approved — usually within minutes.
                    </DialogDescription>
                </DialogHeader>
                <FormError message={error} />

                <div className="grid gap-4 sm:grid-cols-2">
                    {accounts.length > 1 && (
                        <Field label="WhatsApp account" htmlFor="ct-account" className="sm:col-span-2">
                            <Select value={account?.id} onValueChange={setAccountId}>
                                <SelectTrigger id="ct-account">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {accounts.map((a) => (
                                        <SelectItem key={a.id} value={a.id}>
                                            {a.name ?? a.business_name ?? a.waba_id}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                    )}
                    <Field label="Name" htmlFor="ct-name" hint="Lowercase letters, numbers and underscores" className="sm:col-span-2">
                        <Input
                            id="ct-name"
                            value={name}
                            placeholder="order_update"
                            autoComplete="off"
                            maxLength={512}
                            onChange={(e) =>
                                setName(
                                    e.target.value
                                        .toLowerCase()
                                        .replace(/[\s-]+/g, '_')
                                        .replace(/[^a-z0-9_]/g, ''),
                                )
                            }
                        />
                    </Field>
                    <Field
                        label="Category"
                        htmlFor="ct-category"
                        hint={category === 'UTILITY' ? 'Order updates, reminders, account notices' : 'Offers, announcements, promotions'}
                    >
                        <Select value={category} onValueChange={(v) => setCategory(v as 'MARKETING' | 'UTILITY')}>
                            <SelectTrigger id="ct-category">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="UTILITY">Utility</SelectItem>
                                <SelectItem value="MARKETING">Marketing</SelectItem>
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label="Language" htmlFor="ct-language">
                        <Select value={language} onValueChange={setLanguage}>
                            <SelectTrigger id="ct-language">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {LANGUAGES.map(([code, label]) => (
                                    <SelectItem key={code} value={code}>
                                        {label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                </div>

                <Field label="Header (optional)" htmlFor="ct-header" hint="A short title, up to 60 characters. May contain one variable: {{1}}">
                    <Input id="ct-header" value={header} maxLength={60} onChange={(e) => setHeader(e.target.value)} />
                </Field>
                {headerVars.length > 0 && (
                    <Field label="Example for the header variable" htmlFor="ct-header-ex">
                        <Input id="ct-header-ex" value={headerExample} maxLength={60} onChange={(e) => setHeaderExample(e.target.value)} />
                    </Field>
                )}

                <Field label="Message" htmlFor="ct-body" hint="Up to 1024 characters. Variables cannot be the first or last thing in the message.">
                    <textarea
                        id="ct-body"
                        value={body}
                        maxLength={1024}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder="Hi {{1}}, your order {{2}} is on its way."
                        className={textarea}
                    />
                    <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setBody(`${body}{{${vars.length + 1}}}`)}>
                        <PlusIcon /> Add variable
                    </Button>
                </Field>
                {vars.length > 0 && (
                    <div className="grid gap-2">
                        <p className="text-[13px] font-semibold text-ink-2">Example values (required by Meta for review)</p>
                        {vars.map((v, i) => (
                            <div key={v} className="flex items-center gap-2">
                                <span className="w-12 shrink-0 font-mono text-[12px] text-muted-foreground">{`{{${v}}}`}</span>
                                <Input
                                    value={examples[i] ?? ''}
                                    aria-label={`Example for variable ${v}`}
                                    maxLength={200}
                                    onChange={(e) => setExamples(vars.map((_, j) => (j === i ? e.target.value : (examples[j] ?? ''))))}
                                />
                            </div>
                        ))}
                    </div>
                )}

                <Field label="Footer (optional)" htmlFor="ct-footer" hint="Small grey text under the message, up to 60 characters">
                    <Input id="ct-footer" value={footer} maxLength={60} onChange={(e) => setFooter(e.target.value)} />
                </Field>

                <div className="grid gap-2">
                    <p className="text-[13px] font-semibold text-ink-2">Buttons (optional)</p>
                    {buttons.map((b, i) => (
                        <div key={i} className="grid gap-2 rounded-md border p-2.5 sm:grid-cols-[9rem_1fr_auto]">
                            <Select value={b.type} onValueChange={(v) => setButton(i, { type: v as ButtonRow['type'] })}>
                                <SelectTrigger aria-label="Button type">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="QUICK_REPLY">Quick reply</SelectItem>
                                    <SelectItem value="URL">Visit website</SelectItem>
                                    <SelectItem value="PHONE_NUMBER">Call number</SelectItem>
                                </SelectContent>
                            </Select>
                            <div className="grid gap-2">
                                <Input
                                    value={b.text}
                                    maxLength={25}
                                    placeholder="Button text"
                                    aria-label="Button text"
                                    onChange={(e) => setButton(i, { text: e.target.value })}
                                />
                                {b.type === 'URL' && (
                                    <>
                                        <Input
                                            value={b.url}
                                            placeholder="https://example.com/orders/{{1}}"
                                            aria-label="Link"
                                            onChange={(e) => setButton(i, { url: e.target.value })}
                                        />
                                        {b.url.includes('{{1}}') && (
                                            <Input
                                                value={b.example}
                                                placeholder="Full example link, e.g. https://example.com/orders/1042"
                                                aria-label="Example link"
                                                onChange={(e) => setButton(i, { example: e.target.value })}
                                            />
                                        )}
                                    </>
                                )}
                                {b.type === 'PHONE_NUMBER' && (
                                    <Input
                                        value={b.phone_number}
                                        placeholder="+971501234567"
                                        aria-label="Phone number"
                                        inputMode="tel"
                                        onChange={(e) => setButton(i, { phone_number: e.target.value })}
                                    />
                                )}
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setButtons(buttons.filter((_, j) => j !== i))}
                                aria-label="Remove button"
                            >
                                <XIcon />
                            </Button>
                        </div>
                    ))}
                    {buttons.length < 10 && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-fit"
                            onClick={() => setButtons([...buttons, { type: 'QUICK_REPLY', text: '', url: '', example: '', phone_number: '' }])}
                        >
                            <PlusIcon /> Add button
                        </Button>
                    )}
                </div>

                <div className="grid gap-1.5">
                    <p className="text-[13px] font-semibold text-ink-2">Preview</p>
                    <TemplatePreview template={preview} header={[headerExample]} body={examples} />
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={pending || !account}>
                        {pending ? 'Submitting…' : 'Submit to Meta'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
