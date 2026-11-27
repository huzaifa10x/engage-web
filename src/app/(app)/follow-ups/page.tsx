'use client';

import { ClockIcon } from 'lucide-react';
import Link from 'next/link';

import { Forbidden, PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { AutoReplyCard } from '@/components/settings/auto-reply-card';
import { FeedbackCard } from '@/components/settings/feedback-card';
import { FollowUpsCard } from '@/components/settings/followups-card';
import { Button } from '@/components/ui/button';
import { P } from '@/lib/permissions';

/**
 * Automate › Follow-ups & Alerts (CN-02): the after-hours auto reply per number and the follow-up
 * rules, moved here from Settings. Opening hours stay in Settings › Business hours.
 */
export default function FollowUpsPage() {
    const { can } = useSession();
    if (!can(P.SettingsView)) return <Forbidden />;
    const canManage = can(P.SettingsManage);

    return (
        <>
            <PageHeader
                title="Alerts & automation"
                description="Settings for what answers when you are closed, who is alerted when a chat waits, the nudges sent when a customer goes quiet, and ratings and feedback. Your task list is in Follow-ups."
                actions={
                    <Button asChild variant="outline">
                        <Link href="/settings?tab=hours">
                            <ClockIcon /> Business hours
                        </Link>
                    </Button>
                }
            />
            <div className="grid gap-4">
                <AutoReplyCard canManage={canManage} />
                <FollowUpsCard canManage={canManage} />
                <FeedbackCard canManage={canManage} />
            </div>
        </>
    );
}
