'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveIcon, CopyIcon, DownloadIcon, PlusIcon, QrCodeIcon } from 'lucide-react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { Field, FormError } from '@/components/app/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError, errorMessage } from '@/lib/api';
import { relative } from '@/lib/format';

export type WaLink = {
    id: string;
    kind: 'link' | 'website_button';
    name: string;
    code: string;
    message: string;
    asks_consent: boolean;
    button: { position: 'bottom_right' | 'bottom_left'; label: string } | null;
    phone_number: { id: string; display: string | null; display_phone_number: string | null } | null;
    prefilled_text: string;
    url: string | null;
    snippet: string | null;
    chats: number;
    chats_30d: number;
    new_contacts: number;
    last_chat_at: string | null;
    created_at: string | null;
};

const textarea =
    'field-sizing-content min-h-16 w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm leading-5 outline-none placeholder:text-faint focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20';

const fileName = (name: string) =>
    name
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase() || 'link';

const copy = async (text: string, what: string) => {
    try {
        await navigator.clipboard.writeText(text);
        toast.success(`${what} copied`);
    } catch {
        toast.error('Could not copy. Select the text and copy it yourself.');
    }
};

function download(href: string, name: string) {
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

/** The QR code of one link, with PNG and SVG downloads. */
function LinkQr({ link }: { link: WaLink }) {
    const svgRef = useRef<SVGSVGElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    if (!link.url) return <p className="text-[12.5px] text-muted-foreground">This number has no phone number yet, so no QR code.</p>;

    const svg = () => {
        if (!svgRef.current) return;
        const xml = new XMLSerializer().serializeToString(svgRef.current);
        download(URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' })), `${fileName(link.name)}-qr.svg`);
    };
    const png = () => {
        if (canvasRef.current) download(canvasRef.current.toDataURL('image/png'), `${fileName(link.name)}-qr.png`);
    };

    return (
        <div className="flex flex-wrap items-center gap-4" role="region" aria-label={`QR code for ${link.name}`}>
            <div className="rounded-md border bg-white p-3">
                <QRCodeSVG ref={svgRef} value={link.url} size={152} level="M" marginSize={2} title={`QR code: ${link.name}`} />
                <QRCodeCanvas ref={canvasRef} value={link.url} size={1024} level="M" marginSize={2} className="hidden" aria-hidden />
            </div>
            <div className="grid gap-2">
                <Button size="sm" variant="outline" onClick={png}>
                    <DownloadIcon /> PNG
                </Button>
                <Button size="sm" variant="outline" onClick={svg}>
                    <DownloadIcon /> SVG
                </Button>
                <p className="max-w-56 text-[12px] text-muted-foreground">Print it at least 2 cm wide. Test it with a phone before printing many.</p>
            </div>
        </div>
    );
}

/** The floating WhatsApp button for the client's website: settings, a preview and the snippet to paste. */
function WebsiteButton({ numberId, link, canManage }: { numberId: string; link: WaLink | null; canManage: boolean }) {
    const qc = useQueryClient();
    const [label, setLabel] = useState(link?.button?.label ?? 'Chat with us');
    const [position, setPosition] = useState<'bottom_right' | 'bottom_left'>(link?.button?.position ?? 'bottom_right');
    const [message, setMessage] = useState(link?.message ?? 'Hi, I have a question');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const changed = !link || label !== link.button?.label || position !== link.button?.position || message !== link.message;

    const save = async () => {
        setBusy(true);
        setError(null);
        try {
            const body = { phone_number_id: numberId, kind: 'website_button', message, button: { label, position } };
            await api(link ? `wa-links/${link.id}` : 'wa-links', { method: link ? 'PATCH' : 'POST', body });
            toast.success(link ? 'Website button updated. Paste the new snippet on your website.' : 'Website button created');
            void qc.invalidateQueries({ queryKey: ['wa-links'] });
        } catch (e) {
            setError(e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? errorMessage(e)) : errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="grid gap-3 rounded-md border p-3" role="region" aria-label="Website button">
            <div>
                <p className="text-[13px] font-semibold">Website button</p>
                <p className="text-[12.5px] text-muted-foreground">
                    A floating WhatsApp button for your website. Chats from it are tagged “Website button” in contacts and Growth Hub.
                </p>
            </div>
            <FormError message={error} />
            {canManage && (
                <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Button label" htmlFor={`wb-label-${numberId}`}>
                        <Input id={`wb-label-${numberId}`} maxLength={30} value={label} onChange={(e) => setLabel(e.target.value)} />
                    </Field>
                    <Field label="Position" htmlFor={`wb-pos-${numberId}`}>
                        <Select value={position} onValueChange={(v) => setPosition(v as 'bottom_right' | 'bottom_left')}>
                            <SelectTrigger id={`wb-pos-${numberId}`} aria-label="Position">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="bottom_right">Bottom right</SelectItem>
                                <SelectItem value="bottom_left">Bottom left</SelectItem>
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label="Pre-filled message" htmlFor={`wb-msg-${numberId}`}>
                        <Input id={`wb-msg-${numberId}`} maxLength={400} value={message} onChange={(e) => setMessage(e.target.value)} />
                    </Field>
                </div>
            )}
            {canManage && changed && (
                <Button size="sm" className="w-fit" onClick={save} disabled={busy}>
                    {busy ? 'Saving…' : link ? 'Save button' : 'Create website button'}
                </Button>
            )}
            {link?.snippet && (
                <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-[12.5px] font-medium">Paste this before &lt;/body&gt; on every page of your website:</p>
                        <Button size="sm" variant="outline" onClick={() => copy(link.snippet!, 'Snippet')}>
                            <CopyIcon /> Copy snippet
                        </Button>
                    </div>
                    <pre className="max-h-32 overflow-auto rounded-md bg-muted px-3 py-2 text-[11.5px] break-all whitespace-pre-wrap" aria-label="Snippet">
                        {link.snippet}
                    </pre>
                    <p className="text-[12px] text-muted-foreground">
                        Number it opens: {link.phone_number?.display ?? '—'} · {link.chats.toLocaleString()} chats from the button
                        {link.last_chat_at ? `, last ${relative(link.last_chat_at)}` : ''}. After changing the settings, paste the new snippet.
                    </p>
                </div>
            )}
        </div>
    );
}

/** Channels › one number's wa.me links and QR codes with a source, and its website button. */
export function LinksPanel({ numberId, canManage }: { numberId: string; canManage: boolean }) {
    const qc = useQueryClient();
    const q = useQuery({
        queryKey: ['wa-links', numberId],
        queryFn: () => api<{ data: WaLink[] }>('wa-links', { query: { phone_number_id: numberId } }).then((r) => r.data),
    });
    const [adding, setAdding] = useState(false);
    const [name, setName] = useState('');
    const [message, setMessage] = useState('');
    const [asksConsent, setAsksConsent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [qrFor, setQrFor] = useState<string | null>(null);

    if (!q.data) return <Skeleton className="h-32" />;
    const links = q.data.filter((l) => l.kind === 'link');
    const button = q.data.find((l) => l.kind === 'website_button') ?? null;

    const create = async () => {
        setBusy(true);
        setError(null);
        try {
            await api('wa-links', { method: 'POST', body: { phone_number_id: numberId, name, message, asks_consent: asksConsent } });
            toast.success('Link created');
            setAdding(false);
            setName('');
            setMessage('');
            setAsksConsent(false);
            void qc.invalidateQueries({ queryKey: ['wa-links'] });
        } catch (e) {
            setError(e instanceof ApiError ? (Object.values(e.fields)[0]?.[0] ?? errorMessage(e)) : errorMessage(e));
        } finally {
            setBusy(false);
        }
    };
    const archive = async (link: WaLink) => {
        try {
            await api(`wa-links/${link.id}`, { method: 'DELETE' });
            toast.success('Link archived. Chats from printed codes still count.');
            void qc.invalidateQueries({ queryKey: ['wa-links'] });
        } catch (e) {
            toast.error(errorMessage(e));
        }
    };

    return (
        <div className="grid gap-4" role="region" aria-label="Links and QR codes">
            <p className="text-[12.5px] text-muted-foreground">
                Each link opens a chat with this number and a pre-filled message. A short code at the end (e.g. “Ref: EX-7PK9M2”) tells engageX where the chat
                came from; your team never sees it.
            </p>
            {links.length > 0 && (
                <ul className="grid gap-2" aria-label="Links">
                    {links.map((l) => (
                        <li key={l.id} className="grid gap-2 rounded-md border px-3 py-2.5">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="text-[13px] font-semibold">{l.name}</p>
                                    <p className="truncate text-[12.5px] text-muted-foreground">“{l.prefilled_text}”</p>
                                    <p className="text-[12px] text-muted-foreground">
                                        <span className="font-medium text-foreground">{l.chats.toLocaleString()} chats</span> · {l.chats_30d.toLocaleString()}{' '}
                                        in the last 30 days · {l.new_contacts.toLocaleString()} new contacts
                                        {l.asks_consent ? ' · records an opt-in' : ''}
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {l.url && (
                                        <Button size="sm" variant="outline" onClick={() => copy(l.url!, 'Link')}>
                                            <CopyIcon /> Copy link
                                        </Button>
                                    )}
                                    <Button size="sm" variant="outline" aria-expanded={qrFor === l.id} onClick={() => setQrFor(qrFor === l.id ? null : l.id)}>
                                        <QrCodeIcon /> QR code
                                    </Button>
                                    {canManage && (
                                        <Button size="sm" variant="ghost" onClick={() => archive(l)} aria-label={`Archive ${l.name}`}>
                                            <ArchiveIcon />
                                        </Button>
                                    )}
                                </div>
                            </div>
                            {qrFor === l.id && <LinkQr link={l} />}
                        </li>
                    ))}
                </ul>
            )}
            {links.length === 0 && !adding && <p className="text-[13px] text-muted-foreground">No links yet.</p>}

            {canManage &&
                (adding ? (
                    <div className="grid gap-3 rounded-md border p-3">
                        <FormError message={error} />
                        <Field label="Source name" htmlFor={`ln-name-${numberId}`} hint="Where people find it, e.g. Shop window, Instagram bio, Flyer Nov.">
                            <Input id={`ln-name-${numberId}`} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
                        </Field>
                        <Field label="Pre-filled message" htmlFor={`ln-msg-${numberId}`}>
                            <textarea
                                id={`ln-msg-${numberId}`}
                                className={textarea}
                                maxLength={400}
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="Hi! I’d like to know more."
                            />
                        </Field>
                        <label className="flex items-start gap-2 text-[13px]">
                            <input type="checkbox" className="mt-0.5" checked={asksConsent} onChange={(e) => setAsksConsent(e.target.checked)} />
                            <span>
                                This message asks for marketing messages
                                <span className="block text-[12px] text-muted-foreground">
                                    e.g. “Yes, send me offers on WhatsApp”. When the customer sends it unchanged, engageX records an opt-in with this link as
                                    the source.
                                </span>
                            </span>
                        </label>
                        <div className="flex gap-2">
                            <Button size="sm" onClick={create} disabled={busy}>
                                {busy ? 'Creating…' : 'Create link'}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setAdding(false)}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                ) : (
                    <Button size="sm" variant="outline" className="w-fit" onClick={() => setAdding(true)}>
                        <PlusIcon /> New link
                    </Button>
                ))}

            <WebsiteButton key={button?.id ?? 'new'} numberId={numberId} link={button} canManage={canManage} />
        </div>
    );
}
