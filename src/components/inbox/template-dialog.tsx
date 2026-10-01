'use client';

import { PlusIcon, XIcon } from 'lucide-react';
import { useState } from 'react';

import { Field, FormError } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export type TemplateInput = { name: string; language: string; components?: unknown[] };

/**
 * Sends an approved Meta template by name. The template builder (Phase 4) will replace the
 * free-text name with a picker that knows each template's variables.
 */
export function TemplateFields({
    value,
    onChange,
}: {
    value: { name: string; language: string; variables: string[] };
    onChange: (v: { name: string; language: string; variables: string[] }) => void;
}) {
    const set = (patch: Partial<typeof value>) => onChange({ ...value, ...patch });

    return (
        <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
                <Field label="Template name" htmlFor="tpl-name" hint="Exactly as approved in WhatsApp Manager, e.g. order_update">
                    <Input
                        id="tpl-name"
                        value={value.name}
                        onChange={(e) => set({ name: e.target.value.trim() })}
                        placeholder="hello_world"
                        autoComplete="off"
                    />
                </Field>
                <Field label="Language" htmlFor="tpl-lang">
                    <Input id="tpl-lang" value={value.language} onChange={(e) => set({ language: e.target.value.trim() })} placeholder="en_US" />
                </Field>
            </div>
            <div className="grid gap-2">
                <p className="text-[13px] font-semibold text-ink-2">Body variables</p>
                {value.variables.map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <span className="w-10 shrink-0 font-mono text-[12px] text-muted-foreground">{`{{${i + 1}}}`}</span>
                        <Input
                            value={v}
                            onChange={(e) => set({ variables: value.variables.map((x, j) => (j === i ? e.target.value : x)) })}
                            aria-label={`Variable ${i + 1}`}
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => set({ variables: value.variables.filter((_, j) => j !== i) })}
                            aria-label={`Remove variable ${i + 1}`}
                        >
                            <XIcon />
                        </Button>
                    </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => set({ variables: [...value.variables, ''] })}>
                    <PlusIcon /> Add variable
                </Button>
            </div>
        </div>
    );
}

export function toTemplate(v: { name: string; language: string; variables: string[] }): TemplateInput {
    return {
        name: v.name,
        language: v.language || 'en_US',
        components: v.variables.length ? [{ type: 'body', parameters: v.variables.map((text) => ({ type: 'text', text })) }] : undefined,
    };
}

export function TemplateDialog({
    open,
    onOpenChange,
    onSend,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    onSend: (template: TemplateInput) => Promise<void>;
}) {
    const [value, setValue] = useState({ name: '', language: 'en_US', variables: [] as string[] });
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    const submit = async () => {
        if (!value.name) {
            setError('Enter the template name.');

            return;
        }
        setPending(true);
        setError(null);
        try {
            await onSend(toTemplate(value));
            setValue({ name: '', language: value.language, variables: [] });
            onOpenChange(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not send the template.');
        } finally {
            setPending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Send a template</DialogTitle>
                    <DialogDescription>
                        Templates are the only messages allowed outside the 24-hour customer service window. Meta charges per delivered template.
                    </DialogDescription>
                </DialogHeader>
                <FormError message={error} />
                <TemplateFields value={value} onChange={setValue} />
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={pending}>
                        {pending ? 'Sending…' : 'Send template'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
