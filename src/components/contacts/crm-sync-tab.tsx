'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CheckIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { useSession } from '@/components/app/session';
import { errorMessage } from '@/lib/api';
import { P } from '@/lib/permissions';
import { saveCrmStageMap, useCrmSync } from '@/lib/queries';
import { cn } from '@/lib/utils';

import { CRM_FIELDS, DEAL_FIELDS, DIR_LABEL, Kv, RBox, TASK_FIELDS } from './crm-fields';
import { Seg } from './enquiry-board';

const code = 'rounded bg-muted px-1.5 py-px font-mono text-[11px]';
const th = 'border-b bg-[#f5f5f4] px-3 py-2.5 text-left text-[11px] font-semibold tracking-[0.06em] whitespace-nowrap text-muted-foreground uppercase';
const td = 'border-b border-line-2 px-3 py-2.5 align-middle text-[13px]';

/**
 * Contacts & CRM › Fields & sync (3.5): which CRM is connected, how records are matched, who wins when
 * both sides change, Meta's policy guardrails, and the field and stage mapping a HubSpot
 * connection will use. Connecting is not available yet, so every contact shows "Not connected".
 */
export function CrmSyncTab() {
    const { can } = useSession();
    const qc = useQueryClient();
    const sync = useCrmSync();
    const [obj, setObj] = useState<'contact' | 'deal' | 'task'>('contact');
    const provider = sync.data?.provider ?? 'none';
    const rows =
        obj === 'contact'
            ? CRM_FIELDS.map((f) => [f.label, f.group, f.hubspot, f.dir, f.note] as const)
            : (obj === 'deal' ? DEAL_FIELDS : TASK_FIELDS).map((f) => [f[0], '', f[1], f[3], f[4]] as const);
    const save = async (stageId: string, value: string) => {
        const map = Object.fromEntries((sync.data?.stage_map ?? []).map((m) => [m.stage.id, { hubspot: m.hubspot }]));
        map[stageId] = { hubspot: value };
        try {
            await saveCrmStageMap(map);
            void qc.invalidateQueries({ queryKey: ['crm', 'sync'] });
            toast.success(`${sync.data?.stage_map.find((m) => m.stage.id === stageId)?.stage.name} → ${value}`);
        } catch (e) {
            toast.error(errorMessage(e));
        }
    };

    return (
        <div className="grid items-start gap-3 min-[1100px]:grid-cols-3">
            <RBox title="Connected CRM">
                {(
                    [
                        ['hubspot', 'HubSpot', 'One contact with a lifecycle stage; deals as separate records.'],
                        ['none', 'Not connected', 'engageX is the only CRM.'],
                    ] as const
                ).map(([k, l, d]) => {
                    const on = provider === k;
                    const available = k === 'none' || (sync.data?.providers_available ?? []).includes(k);

                    return (
                        <button
                            key={k}
                            type="button"
                            disabled={!available || on}
                            aria-pressed={on}
                            className={cn(
                                'mb-2 flex w-full items-start gap-2.5 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors duration-150 disabled:cursor-default motion-reduce:transition-none',
                                on ? 'border-brand-500 bg-brand-50' : available && 'hover:bg-muted',
                            )}
                        >
                            <span className="flex-1">
                                <b className="block text-[13px] font-semibold">{l}</b>
                                <small className="text-[13px] text-muted-foreground">{d}</small>
                                {!available && <small className="mt-0.5 block text-[12px] text-faint">Connecting {l} isn’t available yet.</small>}
                            </span>
                            {on && <CheckIcon className="mt-0.5 size-4 text-brand-600" />}
                        </button>
                    );
                })}
            </RBox>
            <RBox title="How contacts are matched">
                <ol className="mt-1 mb-2 list-decimal pl-[18px] text-[13px] leading-[1.8]">
                    <li>
                        <b className="font-semibold">WhatsApp user ID</b> (always present on WhatsApp messages)
                    </li>
                    <li>
                        <b className="font-semibold">Phone</b> in international format, so <code className={code}>+971 55 204 8891</code> ={' '}
                        <code className={code}>+971552048891</code> = <code className={code}>055 204 8891</code>
                    </li>
                    <li>
                        <b className="font-semibold">Email</b>, lower-cased
                    </li>
                </ol>
                <p className="text-[12px] text-muted-foreground">
                    No match creates a new contact. Two existing records that match are flagged as possible duplicates for a person to merge; nothing merges
                    automatically.
                </p>
                <h4 className="mt-3.5 mb-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Who wins when both sides change</h4>
                <Kv k="WhatsApp identity, consent, conversations, source" v={<b className="font-semibold">engageX</b>} />
                <Kv k="Name, company, email, job title, city" v={<b className="font-semibold">Newest edit</b>} />
                <Kv k="Owner, deal stage, value, close date" v={<b className="font-semibold">Newest edit</b>} />
                <Kv k="Lifecycle stage" v={<b className="font-semibold">engageX (forward only)</b>} />
                <Kv k="Marketing opt-out" v={<b className="font-semibold">Either side · opt-out wins</b>} />
            </RBox>
            <RBox title="Meta policy guardrails">
                {[
                    [
                        'Meta-supplied data stays for messaging.',
                        'WhatsApp user ID, username and profile name are used only to match and route chats, not synced to other systems. Read receipts aren’t synced.',
                    ],
                    [
                        'Opt-outs are honoured from anywhere.',
                        'An unsubscribe in HubSpot blocks WhatsApp marketing in engageX. Opt-ins only come from the customer.',
                    ],
                    ['No sensitive IDs.', 'There are no fields for card, bank account, passport or Emirates ID numbers.'],
                    ['Chats stay private.', 'Merging joins one person’s records; nothing from one customer’s chat is shown to another.'],
                ].map(([b, t]) => (
                    <p key={b} className="border-b border-line-2 py-1.5 text-[13px] leading-snug text-ink-2 last:border-b-0">
                        <b className="font-semibold">{b}</b> {t}
                    </p>
                ))}
            </RBox>
            <RBox title="Sync log">
                <p className="text-[12px] text-muted-foreground">No sync run yet. The log fills once HubSpot is connected.</p>
            </RBox>
            <RBox
                className="min-[1100px]:col-span-3"
                title="Field mapping"
                action={
                    <Seg
                        value={obj}
                        onChange={setObj}
                        options={[
                            ['contact', 'Contact'],
                            ['deal', 'Deal'],
                            ['task', 'Task'],
                        ]}
                    />
                }
            >
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr>
                                <th className={th}>engageX field</th>
                                {obj === 'contact' && <th className={th}>Group</th>}
                                <th className={th}>HubSpot property</th>
                                <th className={th}>Direction</th>
                                <th className={th}>Notes</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r[0]}>
                                    <td className={td}>
                                        <b className="font-semibold">{r[0]}</b>
                                    </td>
                                    {obj === 'contact' && <td className={cn(td, 'text-[12px] text-muted-foreground')}>{r[1]}</td>}
                                    <td className={td}>
                                        <code className={code}>{r[2]}</code>
                                    </td>
                                    <td className={cn(td, 'text-[12px] whitespace-nowrap')}>{DIR_LABEL[r[3]]}</td>
                                    <td className={cn(td, 'text-[12px] text-muted-foreground')}>{r[4]}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="mt-2 text-[12px] text-muted-foreground">
                    Property names are the defaults in new HubSpot accounts. Custom ones are created when the CRM is connected. Your developer should confirm
                    names in each customer’s account settings.
                </p>
            </RBox>
            <RBox className="min-[1100px]:col-span-3" title="Deal stage mapping">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr>
                                <th className={th}>engageX stage</th>
                                <th className={th}>HubSpot dealstage</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(sync.data?.stage_map ?? []).map((m) => (
                                <tr key={m.stage.id}>
                                    <td className={td}>
                                        <b className="font-semibold">{m.stage.name}</b>
                                    </td>
                                    <td className={td}>
                                        <select
                                            value={m.hubspot}
                                            disabled={!can(P.SettingsManage)}
                                            onChange={(e) => void save(m.stage.id, e.target.value)}
                                            aria-label={`${m.stage.name} in HubSpot`}
                                            className="h-8 rounded-md border border-input bg-card px-2 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:opacity-60"
                                        >
                                            {sync.data?.hubspot_stages.map((x) => (
                                                <option key={x}>{x}</option>
                                            ))}
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="mt-1.5 text-[12px] text-muted-foreground">
                    engageX reads HubSpot’s real pipeline stages on connect. These are the default pipeline’s stages.
                </p>
            </RBox>
        </div>
    );
}
