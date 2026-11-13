'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Forbidden } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { Agency, Business, Keys, Snippets, TestEndpoints } from '@/components/chatbots/workspace-dialog';
import { P } from '@/lib/permissions';

const TABS = [
    ['business', 'Business details'],
    ['snippets', 'Saved replies'],
    ['keys', 'API keys'],
    ['testing', 'Test endpoints'],
    ['agency', 'Review & approvals'],
] as const;

/**
 * Bot settings (approved design): what every flow in the workspace shares. Each flow's own behaviour
 * (words that work anywhere, reminders, give-up time, languages, the 24-hour window) is in its Flow
 * settings, and a step can override those for itself.
 */
export default function BotSettingsPage() {
    const { can } = useSession();
    const allowed = can(P.ChatbotsView);
    const canManage = can(P.ChatbotsManage);
    const canPublish = can(P.ChatbotsPublish);
    const [tab, setTab] = useState<(typeof TABS)[number][0]>('business');
    if (!allowed) return <Forbidden />;

    return (
        <>
            <div className="cb-pagehead">
                <div>
                    <h1>Bot settings</h1>
                    <p>
                        What all your flows share. A flow sets its own behaviour in its Flow settings, and a step can override that for itself. Business hours
                        and CRM data live elsewhere in Engage and are only used here.
                    </p>
                </div>
            </div>
            <div className="cb-card" style={{ padding: 16 }}>
                <h3 style={{ marginBottom: 8 }}>How the layers work</h3>
                <table className="cb-t">
                    <thead>
                        <tr>
                            <th>Layer</th>
                            <th>Where</th>
                            <th>What it holds</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>
                                <b>Workspace</b>
                            </td>
                            <td>This page</td>
                            <td>Business details used as {'{{business.…}}'}, saved replies, API keys, test endpoints, the review rule</td>
                        </tr>
                        <tr>
                            <td>
                                <b>Flow setting</b>
                            </td>
                            <td>Builder › Flow settings</td>
                            <td>Words that work anywhere (talk to a person, menu, back), reminders, give-up time, languages, the 24-hour window</td>
                        </tr>
                        <tr>
                            <td>
                                <b>Step override</b>
                            </td>
                            <td>Builder › step settings</td>
                            <td>For example, the order-number question asks again once, with its own message</td>
                        </tr>
                    </tbody>
                </table>
                <p className="cb-small cb-muted" style={{ marginTop: 8 }}>
                    Opening hours: <Link href="/settings?tab=hours">Settings › Business hours</Link>. Company name and address:{' '}
                    <Link href="/settings?tab=company">Settings › Company</Link>.
                </p>
            </div>
            <div className="cb-tabs" role="tablist">
                {TABS.map(([k, l]) => (
                    <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : undefined} onClick={() => setTab(k)}>
                        {l}
                    </button>
                ))}
            </div>
            <div className="cb-card" style={{ padding: 16, maxWidth: 760 }}>
                {tab === 'business' && <Business canManage={canManage} />}
                {tab === 'snippets' && <Snippets canManage={canManage} />}
                {tab === 'keys' && <Keys canManage={canManage} />}
                {tab === 'agency' && <Agency canPublish={canPublish} />}
                {tab === 'testing' && <TestEndpoints />}
            </div>
        </>
    );
}
