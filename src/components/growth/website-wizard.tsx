'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2Icon, CircleIcon, CopyIcon, ExternalLinkIcon, Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import { keys, usePhoneNumbers, useSiteTest } from '@/lib/queries';
import type { GrowthSite } from '@/lib/types';
import { cn } from '@/lib/utils';

const STEPS = ['Website', 'WhatsApp number', 'Install', 'Mode', 'Check and test'] as const;

type Install = 'snippet' | 'gtm' | 'wordpress' | 'shopify';

export async function copyText(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        toast.success('Copied');
    } catch {
        toast.error('Copy failed. Select the text and copy it.');
    }
}

function Code({ text, label }: { text: string; label: string }) {
    return (
        <div className="flex items-start gap-2">
            <pre className="flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-[12px] break-all whitespace-pre-wrap">{text}</pre>
            <Button variant="outline" size="sm" onClick={() => copyText(text)} aria-label={`Copy ${label}`}>
                <CopyIcon />
            </Button>
        </div>
    );
}

function Stage({ done, active, label, hint }: { done: boolean; active: boolean; label: string; hint: string }) {
    return (
        <li className="flex items-start gap-2.5">
            {done ? (
                <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-good" />
            ) : active ? (
                <Loader2Icon className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
                <CircleIcon className="mt-0.5 size-4 shrink-0 text-faint" />
            )}
            <div>
                <p className={cn('text-[13.5px] font-medium', !done && 'text-muted-foreground')}>{label}</p>
                <p className="text-[12.5px] text-muted-foreground">{hint}</p>
            </div>
        </li>
    );
}

/**
 * Tracking Setup › Add website (Developer Handover §I.4): 1 domain and name · 2 connected WhatsApp
 * number · 3 install (snippet, Google Tag Manager, WordPress / Shopify theme) · 4 mode (click-only
 * default, consent option, multi-page memory on) · 5 "Open my site" check and the live test:
 * tracker seen → tap received → message received → reference matched. Every stage comes from the
 * server's records, never from the browser. Opening an existing site starts at step 3.
 */
export function WebsiteWizard({ open, onOpenChange, site: initial }: { open: boolean; onOpenChange: (o: boolean) => void; site?: GrowthSite }) {
    const qc = useQueryClient();
    const numbers = (usePhoneNumbers().data ?? []).filter((n) => n.status === 'connected');
    const [site, setSite] = useState<GrowthSite | undefined>(initial);
    const [step, setStep] = useState(initial ? 2 : 0);
    const [domain, setDomain] = useState(initial?.domain ?? '');
    const [name, setName] = useState(initial?.display_name ?? '');
    const [picked, setPicked] = useState<string[]>(initial?.numbers.map((n) => n.phone_number_id) ?? []);
    const [install, setInstall] = useState<Install>('snippet');
    const [testing, setTesting] = useState(false);
    const test = useSiteTest(site?.id, open && testing);
    const t = test.data;

    const refresh = (s: GrowthSite) => {
        setSite(s);
        void qc.invalidateQueries({ queryKey: keys.sites });
        void qc.invalidateQueries({ queryKey: keys.leadSummary });
    };

    const create = useMutation({
        mutationFn: () =>
            api<{ data: GrowthSite }>('growth/sites', { method: 'POST', body: { domain, display_name: name || null, connected_phone_ids: picked } }),
        onSuccess: (r) => {
            refresh(r.data);
            setStep(2);
        },
        onError: (e) => toast.error(errorMessage(e)),
    });
    const patch = useMutation({
        mutationFn: (body: Record<string, unknown>) => api<{ data: GrowthSite }>(`growth/sites/${site?.id}`, { method: 'PATCH', body }),
        onSuccess: (r) => refresh(r.data),
        onError: (e) => toast.error(errorMessage(e)),
    });
    const startTest = useMutation({
        mutationFn: () => api<{ data: { url: string } }>(`growth/sites/${site?.id}/test-session`, { method: 'POST' }),
        onSuccess: (r) => {
            setTesting(true);
            void qc.invalidateQueries({ queryKey: keys.siteTest(site?.id ?? '') });
            window.open(r.data.url, '_blank', 'noopener');
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    const next = () => {
        if (step === 0) {
            if (!domain.trim()) return toast.error('Enter the website address.');
            setStep(1);
        } else if (step === 1) {
            if (picked.length === 0) return toast.error('Choose at least one WhatsApp number.');
            if (site) patch.mutate({ connected_phone_ids: picked }, { onSuccess: () => setStep(2) });
            else create.mutate();
        } else {
            setStep(Math.min(step + 1, 4));
        }
    };

    const pending = create.isPending || patch.isPending;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{site ? site.domain : 'Add website'}</DialogTitle>
                    <DialogDescription>Match WhatsApp taps on your website to the chats they start, with campaign and landing page.</DialogDescription>
                </DialogHeader>

                <ol className="flex flex-wrap gap-1.5 text-[12px]" aria-label="Steps">
                    {STEPS.map((label, i) => (
                        <li key={label}>
                            <button
                                type="button"
                                disabled={!site && i > step}
                                onClick={() => setStep(i)}
                                className={cn(
                                    'rounded-full border px-2.5 py-1 font-medium text-muted-foreground disabled:opacity-50',
                                    i === step && 'border-primary bg-primary/10 text-foreground',
                                )}
                            >
                                {i + 1} · {label}
                            </button>
                        </li>
                    ))}
                </ol>

                <div className="min-h-56 py-1">
                    {step === 0 && (
                        <div className="grid gap-3">
                            <div className="grid gap-1.5">
                                <Label htmlFor="site-domain">Website address</Label>
                                <Input
                                    id="site-domain"
                                    value={domain}
                                    onChange={(e) => setDomain(e.target.value)}
                                    placeholder="www.example.ae"
                                    disabled={!!site}
                                />
                                <p className="text-[12.5px] text-muted-foreground">HTTPS only. The www. and plain address both work.</p>
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="site-name">Name (optional)</Label>
                                <Input
                                    id="site-name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Main website"
                                    onBlur={() => site && name !== (site.display_name ?? '') && patch.mutate({ display_name: name || null })}
                                />
                            </div>
                        </div>
                    )}

                    {step === 1 && (
                        <div className="grid gap-2">
                            <p className="text-[13px] text-muted-foreground">
                                Which WhatsApp number do the buttons on this website open? Only buttons for these numbers are tracked.
                            </p>
                            {numbers.length === 0 && <p className="text-[13px] text-warn">Connect a WhatsApp number in Channels first.</p>}
                            {numbers.map((n) => (
                                <label key={n.id} className="flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2">
                                    <Checkbox
                                        checked={picked.includes(n.id)}
                                        onCheckedChange={(c) => setPicked((p) => (c ? [...p, n.id] : p.filter((x) => x !== n.id)))}
                                    />
                                    <span className="font-mono text-[13px]">{n.display_phone_number}</span>
                                    <span className="text-[12.5px] text-muted-foreground">{n.verified_name}</span>
                                </label>
                            ))}
                        </div>
                    )}

                    {step === 2 && site && (
                        <div className="grid gap-3">
                            <div className="flex flex-wrap gap-1">
                                {(
                                    [
                                        ['snippet', 'Snippet'],
                                        ['gtm', 'Google Tag Manager'],
                                        ['wordpress', 'WordPress / Elementor'],
                                        ['shopify', 'Shopify theme'],
                                    ] as [Install, string][]
                                ).map(([k, l]) => (
                                    <Button key={k} size="sm" variant={install === k ? 'default' : 'outline'} onClick={() => setInstall(k)}>
                                        {l}
                                    </Button>
                                ))}
                            </div>
                            {install === 'snippet' && (
                                <>
                                    <p className="text-[13px] text-muted-foreground">
                                        Paste this before <code>&lt;/head&gt;</code> on every page of {site.domain}.
                                    </p>
                                    <Code text={site.snippet} label="snippet" />
                                </>
                            )}
                            {install === 'gtm' && (
                                <>
                                    <ol className="grid list-decimal gap-1 pl-5 text-[13px] text-muted-foreground">
                                        <li>In Google Tag Manager, open the container for {site.domain}.</li>
                                        <li>
                                            Tags › New › <b>Custom HTML</b>. Paste the code below.
                                        </li>
                                        <li>
                                            Triggering: <b>All Pages</b> (or Initialization – All Pages). Save, then <b>Submit</b> and publish the container.
                                        </li>
                                    </ol>
                                    <Code text={site.gtm_snippet} label="Tag Manager code" />
                                </>
                            )}
                            {install === 'wordpress' && (
                                <>
                                    <ol className="grid list-decimal gap-1 pl-5 text-[13px] text-muted-foreground">
                                        <li>
                                            Use a header-code plugin (for example WPCode) or Elementor › Custom Code, location <b>&lt;head&gt;</b>, all pages.
                                        </li>
                                        <li>Paste the snippet and publish. Clear any page cache.</li>
                                    </ol>
                                    <Code text={site.snippet} label="snippet" />
                                </>
                            )}
                            {install === 'shopify' && (
                                <>
                                    <ol className="grid list-decimal gap-1 pl-5 text-[13px] text-muted-foreground">
                                        <li>Online Store › Themes › ⋯ › Edit code › layout/theme.liquid.</li>
                                        <li>
                                            Paste the snippet just before <code>&lt;/head&gt;</code> and save.
                                        </li>
                                    </ol>
                                    <Code text={site.snippet} label="snippet" />
                                </>
                            )}
                            <div className="rounded-md bg-muted px-3 py-2 text-[12.5px]">
                                <p className="font-medium">Add this line to your privacy notice</p>
                                <p className="mt-1 text-muted-foreground">{site.privacy_line}</p>
                                <Button variant="link" size="sm" className="h-auto p-0 text-[12.5px]" onClick={() => copyText(site.privacy_line)}>
                                    Copy the line
                                </Button>
                            </div>
                            <p className="text-[12.5px] text-muted-foreground">
                                Works with wa.me, api.whatsapp.com and whatsapp:// links. For a chat widget that opens WhatsApp from code, call{' '}
                                <code>XG.link(url)</code> in its click handler. If your site has a Content Security Policy, allow <code>e.10xengage.com</code>{' '}
                                in script-src and connect-src.
                            </p>
                        </div>
                    )}

                    {step === 3 && site && (
                        <div className="grid gap-3">
                            <label className="flex items-start justify-between gap-4 rounded-md border px-3 py-2.5">
                                <span>
                                    <span className="block text-[13.5px] font-medium">Remember the campaign for the browser tab</span>
                                    <span className="block text-[12.5px] text-muted-foreground">
                                        A visitor who lands from an ad on one page and taps WhatsApp on another is still credited. Kept for the tab only, never
                                        a cookie.
                                        {!site.session_landing_mode && ' Off: only campaign details still on the page when WhatsApp is tapped are recorded.'}
                                    </span>
                                </span>
                                <Switch
                                    checked={site.session_landing_mode}
                                    onCheckedChange={(v) => patch.mutate({ session_landing_mode: v })}
                                    aria-label="Multi-page memory"
                                />
                            </label>
                            <label className="flex items-start justify-between gap-4 rounded-md border px-3 py-2.5">
                                <span>
                                    <span className="block text-[13.5px] font-medium">Wait for cookie consent</span>
                                    <span className="block text-[12.5px] text-muted-foreground">
                                        Off (recommended): click-only tracking, no cookies, no visitor IDs. On: taps are measured only after your cookie banner
                                        calls <code>XG.consent(true)</code> when the visitor accepts.
                                    </span>
                                </span>
                                <Switch
                                    checked={site.consent_mode === 'consent'}
                                    onCheckedChange={(v) => patch.mutate({ consent_mode: v ? 'consent' : 'click_only' })}
                                    aria-label="Consent mode"
                                />
                            </label>
                            <label className="flex items-start justify-between gap-4 rounded-md border px-3 py-2.5">
                                <span>
                                    <span className="block text-[13.5px] font-medium">Tracking on</span>
                                    <span className="block text-[12.5px] text-muted-foreground">Off: WhatsApp buttons open as usual, without a reference.</span>
                                </span>
                                <Switch checked={site.enabled} onCheckedChange={(v) => patch.mutate({ enabled: v })} aria-label="Tracking on" />
                            </label>
                        </div>
                    )}

                    {step === 4 && site && (
                        <div className="grid gap-3">
                            <p className="text-[13px] text-muted-foreground">
                                <b className="text-foreground">Open my site</b> opens {site.domain} with a one-time check. Then tap a WhatsApp button there and
                                press Send on your phone.
                            </p>
                            <div>
                                <Button onClick={() => startTest.mutate()} disabled={startTest.isPending}>
                                    <ExternalLinkIcon /> Open my site
                                </Button>
                            </div>
                            <ul className="grid gap-2.5">
                                <Stage
                                    done={!!t?.tracker_seen || !!site.verified_at}
                                    active={testing}
                                    label="Tracker seen on your site"
                                    hint={
                                        site.verified_at ? 'Domain verified.' : 'If this doesn’t tick, check the snippet or publish the Tag Manager container.'
                                    }
                                />
                                <Stage
                                    done={!!t?.tap_received}
                                    active={testing && !!t?.tracker_seen}
                                    label="Tap received"
                                    hint="Tap a WhatsApp button on the site. If it doesn’t tick, an ad blocker, network or Content Security Policy blocked it; WhatsApp still opens."
                                />
                                <Stage
                                    done={!!t?.message_received}
                                    active={testing && !!t?.tap_received}
                                    label="Message received"
                                    hint="Press Send in WhatsApp. The message must be sent for a match."
                                />
                                <Stage
                                    done={!!t?.matched}
                                    active={testing && !!t?.message_received}
                                    label="Reference matched"
                                    hint="The chat now shows “Reference matched” with the page and campaign."
                                />
                            </ul>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    {step > 0 && (
                        <Button variant="ghost" onClick={() => setStep(step - 1)}>
                            Back
                        </Button>
                    )}
                    {step < 4 ? (
                        <Button onClick={next} disabled={pending}>
                            {pending ? 'Saving…' : step === 1 && !site ? 'Create and continue' : 'Next'}
                        </Button>
                    ) : (
                        <Button onClick={() => onOpenChange(false)}>Done</Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
