'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, TriangleAlertIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import { EmptyState, Forbidden, PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { ChatbotsTabs } from '@/components/chatbots/chatbots-tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { orderStartRules, type StartRule, type StartRuleKind, testStartRules, useStartRules } from '@/lib/chatbots';
import { P } from '@/lib/permissions';

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
    const qc = useQueryClient();
    const rules = useStartRules(allowed);
    const [number, setNumber] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    if (!allowed) return <Forbidden />;
    const numbers = rules.data ?? [];
    const current = numbers.find((n) => n.phone_number_id === number) ?? numbers[0];

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

    return (
        <>
            <ChatbotsTabs />
            <PageHeader
                title="Start rules"
                description="What starts each flow on each number, in the order a new message is checked. Rules on different numbers never compete, and no flow starts while a person is handling the chat."
            />
            {rules.isLoading ? (
                <Skeleton className="h-64 w-full" />
            ) : numbers.length === 0 ? (
                <Card>
                    <EmptyState title="No flows on a number yet" description="Choose a WhatsApp number for a flow and its start rules show up here." />
                </Card>
            ) : (
                <div className="space-y-4">
                    {numbers.length > 1 && (
                        <Select value={current?.phone_number_id} onValueChange={setNumber}>
                            <SelectTrigger className="w-72" aria-label="Number">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {numbers.map((n) => (
                                    <SelectItem key={n.phone_number_id} value={n.phone_number_id}>
                                        {n.display_phone_number ?? n.phone_number_id} {n.verified_name ? `· ${n.verified_name}` : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    <p className="text-[12.5px] text-muted-foreground">
                        Order of checking: campaign button replies, QR codes, ads and keywords (by this list), then the greeting flow, then the default flow.
                        The first match starts its flow.
                    </p>
                    {current && current.overlaps.length > 0 && (
                        <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px]" data-testid="overlaps">
                            <p className="flex items-center gap-1.5 font-semibold">
                                <TriangleAlertIcon className="size-4" /> Flows that can match the same message
                            </p>
                            {current.overlaps.map((o, i) => (
                                <p key={i}>{o.text}</p>
                            ))}
                        </div>
                    )}
                    {current && (
                        <Card className="divide-y" data-testid="start-rules">
                            {current.rules.map((r, i) => (
                                <div key={r.flow_id} className="flex items-start gap-3 px-4 py-3">
                                    <div className="flex w-9 flex-col items-center gap-0.5">
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label={`Move ${r.name} up`}
                                            disabled={!canOrder || busy || i === 0}
                                            onClick={() => void move(i, -1)}
                                        >
                                            <ArrowUpIcon />
                                        </Button>
                                        <span className="text-[13px] font-bold tabular-nums">{i + 1}</span>
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label={`Move ${r.name} down`}
                                            disabled={!canOrder || busy || i === current.rules.length - 1}
                                            onClick={() => void move(i, 1)}
                                        >
                                            <ArrowDownIcon />
                                        </Button>
                                    </div>
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="font-semibold">{r.name}</p>
                                            <Badge tone={r.status === 'live' ? 'good' : 'grey'}>
                                                {r.status === 'live' ? 'Live' : r.status === 'paused' ? 'Published, off' : 'Draft'}
                                            </Badge>
                                            {r.kinds.map((k) => (
                                                <Badge key={k} tone="outline">
                                                    {KIND[k]}
                                                </Badge>
                                            ))}
                                        </div>
                                        <ul className="text-[12.5px] text-muted-foreground">
                                            {describe(r).map((d) => (
                                                <li key={d}>When: {d}</li>
                                            ))}
                                            <li>
                                                Starts again: {REENTRY[r.reentry]}
                                                {r.reentry === 'cooldown' ? ` ${r.cooldown_hours} hours` : ''}
                                            </li>
                                            {r.status !== 'live' && <li>Waits until the flow is live.</li>}
                                        </ul>
                                    </div>
                                    <Button asChild size="sm" variant="outline">
                                        <Link href={`/chatbots/builder?id=${r.flow_id}`}>
                                            <PencilIcon /> Edit triggers
                                        </Link>
                                    </Button>
                                </div>
                            ))}
                        </Card>
                    )}
                    {!canOrder && <p className="text-[12px] text-muted-foreground">Only people who can publish flows can change the order.</p>}
                    {current && <Tester numberId={current.phone_number_id} />}
                </div>
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
        <Card className="space-y-3 p-4">
            <p className="font-semibold">Test a message</p>
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
                <p className="rounded-md bg-muted px-3 py-2 text-[13px]" data-testid="tester-result">
                    {result}
                </p>
            )}
            <p className="text-[11.5px] text-muted-foreground">Uses your business hours as they are right now. Nothing is sent or saved.</p>
        </Card>
    );
}
