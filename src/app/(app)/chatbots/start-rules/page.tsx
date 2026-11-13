'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownIcon, ArrowUpIcon, PencilIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import { Forbidden } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ApiError, errorMessage } from '@/lib/api';
import { activateChatbot, orderStartRules, type StartRule, type StartRuleKind, testStartRules, useStartRules } from '@/lib/chatbots';
import { P } from '@/lib/permissions';
import { cn } from '@/lib/utils';

const KIND: Record<StartRuleKind, string> = {
    campaign: 'Campaign button',
    qr: 'QR code',
    ad: 'Click-to-WhatsApp ad',
    keyword: 'Keywords',
    greeting: 'First message (greeting)',
    default: 'Any message (default)',
    after_hours: 'Outside business hours',
};
const MATCH = { exact: 'is exactly', starts: 'starts with', contains: 'contains' } as const;
const REENTRY = { always: 'every time it matches', once: 'once per customer', cooldown: 'not again within' } as const;

function describe(r: StartRule): string[] {
    const out: string[] = [];
    if (r.campaign_buttons.length) out.push(`Reply to the campaign button ${r.campaign_buttons.map((b) => `“${b}”`).join(', ')}`);
    if (r.qr_code) out.push(`Message contains the QR code text “${r.qr_code}”`);
    if (r.kinds.includes('ad')) out.push('Message from a Click-to-WhatsApp ad');
    if (r.keywords.length) out.push(`Message ${MATCH[r.keyword_match ?? 'starts']} ${r.keywords.map((k) => `“${k}”`).join(' or ')}`);
    if (r.pattern) out.push(`Message matches the pattern ${r.pattern}`);
    if (r.kinds.includes('greeting')) out.push('A customer’s first message');
    if (r.kinds.includes('default')) out.push('Any message no other flow takes');
    if (r.after_hours) out.push('Outside business hours (checked before the rest)');

    return out.length ? out : ['Only when started on purpose (webhook, tag, field change, campaign)'];
}

/**
 * Start rules: on each number, what starts which flow, in the order routing checks them. Routing
 * looks at the kind of trigger first (campaign button, QR code, ad, keywords, then greeting, then
 * the default flow) and, within a kind, at this list. Triggers are edited in each flow's Start step.
 */
export default function StartRulesPage() {
    const { can } = useSession();
    const allowed = can(P.ChatbotsView);
    const canOrder = can(P.ChatbotsPublish);
    const canManage = can(P.ChatbotsManage);
    const qc = useQueryClient();
    const rules = useStartRules(allowed);
    const [number, setNumber] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    if (!allowed) return <Forbidden />;
    const numbers = rules.data ?? [];
    const current = numbers.find((n) => n.phone_number_id === number) ?? numbers[0];
    const label = (n: (typeof numbers)[number]) => n.verified_name ?? n.display_phone_number ?? n.phone_number_id;

    const move = async (index: number, delta: -1 | 1) => {
        if (!current) return;
        const ids = current.rules.map((r) => r.flow_id);
        const [moved] = ids.splice(index, 1);
        ids.splice(index + delta, 0, moved);
        setBusy(true);
        try {
            qc.setQueryData(['chatbots', 'start-rules'], await orderStartRules(current.phone_number_id, ids));
            toast.success(`“${current.rules[index].name}” moved ${delta < 0 ? 'up' : 'down'}`);
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };
    const toggle = async (r: StartRule, on: boolean) => {
        setBusy(true);
        try {
            await activateChatbot(r.flow_id, on);
            toast.success(on ? `“${r.name}” is on` : `“${r.name}” is off`);
            await qc.invalidateQueries({ queryKey: ['chatbots'] });
        } catch (e) {
            toast.error(
                e instanceof ApiError && e.status === 409
                    ? 'Another flow already has this role on the number. Switch it on from My Flows to replace it.'
                    : errorMessage(e),
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <div className="cb-pagehead">
                <div>
                    <h1>Start rules</h1>
                    <p>
                        One list per number. A new message is checked against the rules for its number, top to bottom; the first that matches starts its flow
                        and the rest are skipped. Rules on different numbers never compete, and a flow never starts while a person is handling the chat.
                    </p>
                </div>
                {canManage && (
                    <Link href="/chatbots?create=1" className="cb-btn pri cb-spacer" title="A rule belongs to a flow: create the flow, then set what starts it">
                        + New rule
                    </Link>
                )}
            </div>
            {rules.isLoading ? (
                <Skeleton className="h-64 w-full" />
            ) : numbers.length === 0 ? (
                <div className="cb-card cb-empty">Choose a WhatsApp number for a flow and its start rule shows up here.</div>
            ) : (
                <>
                    {current && current.overlaps.length > 0 && (
                        <div className="cb-banner warn cb-col" style={{ gap: 4 }} data-testid="overlaps">
                            <b>Rules that can match the same message</b>
                            {current.overlaps.map((o, i) => (
                                <span key={i} className="cb-small">
                                    {o.text}
                                </span>
                            ))}
                        </div>
                    )}
                    <div className="cb-row">
                        <span className="cb-small cb-muted">Number:</span>
                        <div className="cb-seg" role="tablist" aria-label="Number">
                            {numbers.map((n) => (
                                <button
                                    key={n.phone_number_id}
                                    type="button"
                                    role="tab"
                                    aria-selected={current?.phone_number_id === n.phone_number_id}
                                    className={current?.phone_number_id === n.phone_number_id ? 'on' : undefined}
                                    onClick={() => setNumber(n.phone_number_id)}
                                >
                                    {label(n)}
                                    {n.overlaps.length > 0 && ' ⚠'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <p className="cb-small cb-muted">
                        Checked in this order: campaign button replies, QR codes, ads and keywords (by this list), then the greeting rule, then the rule that
                        takes any message. Within a kind, the higher rule wins.
                    </p>
                    {current && (
                        <div className="cb-card" data-testid="start-rules">
                            {current.rules.map((r, i) => {
                                const when = describe(r).filter((d) => !d.startsWith('Outside business hours'));
                                const off = r.status !== 'live';

                                return (
                                    <div
                                        key={r.flow_id}
                                        className="cb-row"
                                        style={{
                                            padding: 16,
                                            alignItems: 'flex-start',
                                            flexWrap: 'nowrap',
                                            borderTop: i ? '1px solid var(--cb-line-2)' : undefined,
                                            opacity: off ? 0.75 : 1,
                                        }}
                                    >
                                        <div className="cb-col" style={{ gap: 2, alignItems: 'center', flex: 'none' }}>
                                            <button
                                                type="button"
                                                className="cb-btn xs"
                                                aria-label={`Move ${r.name} up`}
                                                disabled={!canOrder || busy || i === 0}
                                                onClick={() => void move(i, -1)}
                                            >
                                                <ArrowUpIcon className="size-3.5" />
                                            </button>
                                            <b className="cb-num">{i + 1}</b>
                                            <button
                                                type="button"
                                                className="cb-btn xs"
                                                aria-label={`Move ${r.name} down`}
                                                disabled={!canOrder || busy || i === current.rules.length - 1}
                                                onClick={() => void move(i, 1)}
                                            >
                                                <ArrowDownIcon className="size-3.5" />
                                            </button>
                                        </div>
                                        <div className="cb-col cb-grow" style={{ gap: 8 }}>
                                            <div className="cb-row">
                                                <b>{r.name}</b>
                                                <span className={cn('cb-chip', r.status === 'live' ? 'live' : 'off')}>
                                                    {r.status === 'live' ? 'Live' : r.status === 'paused' ? 'Off' : 'Draft'}
                                                </span>
                                                {r.kinds.map((k) => (
                                                    <span key={k} className="cb-chip">
                                                        {KIND[k]}
                                                    </span>
                                                ))}
                                                {off && <span className="cb-small cb-muted">Waits until the flow is live</span>}
                                            </div>
                                            <div className="grid gap-2 md:grid-cols-3">
                                                <div className="cb-fig" style={{ display: 'block', padding: '8px 10px' }}>
                                                    <div className="cb-tiny cb-muted" style={{ fontWeight: 600 }}>
                                                        WHEN
                                                    </div>
                                                    {when.map((d) => (
                                                        <div key={d}>{d}</div>
                                                    ))}
                                                    <div className="cb-muted">on {label(current)}</div>
                                                </div>
                                                <div className="cb-fig" style={{ display: 'block', padding: '8px 10px' }}>
                                                    <div className="cb-tiny cb-muted" style={{ fontWeight: 600 }}>
                                                        IF
                                                    </div>
                                                    {r.after_hours ? 'Outside business hours' : 'Any time'}
                                                </div>
                                                <div className="cb-fig" style={{ display: 'block', padding: '8px 10px' }}>
                                                    <div className="cb-tiny cb-muted" style={{ fontWeight: 600 }}>
                                                        THEN
                                                    </div>
                                                    Start {r.name}
                                                    <div className="cb-muted">
                                                        Starts again: {REENTRY[r.reentry]}
                                                        {r.reentry === 'cooldown' ? ` ${r.cooldown_hours} hours` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="cb-col" style={{ gap: 6, alignItems: 'flex-end', flex: 'none' }}>
                                            {canOrder && r.published && (
                                                <label className="cb-row cb-small">
                                                    <Switch
                                                        checked={r.status === 'live'}
                                                        disabled={busy}
                                                        onCheckedChange={(v) => void toggle(r, v)}
                                                        aria-label={`${r.name} on`}
                                                    />
                                                    {r.status === 'live' ? 'On' : 'Off'}
                                                </label>
                                            )}
                                            <Link href={`/chatbots/builder?id=${r.flow_id}&step=start`} className="cb-btn xs">
                                                <PencilIcon className="size-3" /> Edit
                                            </Link>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {!canOrder && <p className="cb-small cb-muted">Only people who can publish flows can change the order or switch rules on and off.</p>}
                    {current && <Tester numberId={current.phone_number_id} />}
                </>
            )}
        </>
    );
}

/** Which flow would answer a message on this number right now — asked of routing itself; nothing is sent. */
function Tester({ numberId }: { numberId: string }) {
    const [text, setText] = useState('');
    const [button, setButton] = useState(false);
    const [fromAd, setFromAd] = useState(false);
    const [first, setFirst] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    return (
        <div className="cb-card cb-col" style={{ padding: 16, gap: 10 }}>
            <h3>Which flow would answer?</h3>
            <div className="flex flex-wrap gap-2">
                <Input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Type what a customer sends"
                    className="max-w-sm"
                    aria-label="Test message"
                />
                <Button
                    disabled={!text.trim() || busy}
                    onClick={async () => {
                        setBusy(true);
                        try {
                            setResult(
                                (await testStartRules({ phone_number_id: numberId, text: text.trim(), button, from_ad: fromAd, first_message: first })).text,
                            );
                        } catch (e) {
                            setResult(errorMessage(e));
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    Check
                </Button>
            </div>
            <div className="flex flex-wrap gap-4 text-[12.5px]">
                {(
                    [
                        ['tester-button', 'It’s a button reply', button, setButton],
                        ['tester-ad', 'From a Click-to-WhatsApp ad', fromAd, setFromAd],
                        ['tester-first', 'The customer’s first message', first, setFirst],
                    ] as const
                ).map(([id, label, value, set]) => (
                    <div key={id} className="flex items-center gap-1.5">
                        <Checkbox id={id} checked={value} onCheckedChange={(v) => set(v === true)} />
                        <Label htmlFor={id} className="text-[12.5px] font-normal">
                            {label}
                        </Label>
                    </div>
                ))}
            </div>
            {result && (
                <p className="cb-banner sample" data-testid="tester-result">
                    {result}
                </p>
            )}
            <p className="text-[11.5px] text-muted-foreground">Uses your business hours as they are right now. Nothing is sent or saved.</p>
        </div>
    );
}
