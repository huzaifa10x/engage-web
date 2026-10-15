'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { Forbidden } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { FlowBuilder } from '@/components/chatbots/flow-builder';
import { P } from '@/lib/permissions';

function Builder() {
    const { can } = useSession();
    const id = useSearchParams().get('id');

    if (!can(P.ChatbotsView)) return <Forbidden />;
    if (!id) return <Forbidden />;

    return <FlowBuilder key={id} flowId={id} />;
}

/** Full-screen flow builder (/chatbots/builder?id=…). */
export default function ChatbotBuilderPage() {
    return (
        <div className="flex h-full min-h-0 w-full min-w-0 flex-1">
            <Suspense>
                <Builder />
            </Suspense>
        </div>
    );
}
