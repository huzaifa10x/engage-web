'use client';

import { PhoneIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';

import { EmptyState, Forbidden, PageHeader } from '@/components/app/page-header';
import { useSession } from '@/components/app/session';
import { ConnectWhatsappDialog } from '@/components/channels/connect-whatsapp-dialog';
import { WabaCard } from '@/components/channels/waba-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { P } from '@/lib/permissions';
import { useEntitlements, useWabaAccounts } from '@/lib/queries';

export default function ChannelsPage() {
    const { can } = useSession();
    const [open, setOpen] = useState(false);
    const canView = can(P.ChannelsView);
    const canManage = can(P.ChannelsManage);
    const accounts = useWabaAccounts(canView);
    const entitlements = useEntitlements();

    if (!canView) return <Forbidden />;

    const usage = entitlements.data?.features.whatsapp_numbers;
    const connected = (accounts.data ?? []).filter((w) => w.status === 'connected');
    const disconnected = (accounts.data ?? []).filter((w) => w.status !== 'connected');

    const connectButton = canManage ? (
        <Button variant="whatsapp" onClick={() => setOpen(true)}>
            <PlusIcon /> Connect WhatsApp
        </Button>
    ) : null;

    return (
        <>
            <PageHeader
                title="Channels"
                description={
                    <>
                        WhatsApp Business Accounts and numbers connected to this workspace.
                        {usage && (
                            <span className="ml-1 font-medium text-foreground">
                                {usage.used ?? 0} of {usage.unlimited ? 'unlimited' : usage.limit} number slots used.
                            </span>
                        )}
                    </>
                }
                actions={connected.length > 0 ? connectButton : null}
            />

            {accounts.isLoading ? (
                <div className="grid gap-4">
                    <Skeleton className="h-48" />
                </div>
            ) : accounts.error ? (
                <Card className="p-6 text-sm text-destructive">{errorMessage(accounts.error)}</Card>
            ) : connected.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={<PhoneIcon className="size-5" />}
                        title="Connect your first WhatsApp number"
                        description="Link a number through Meta's secure signup. It takes about two minutes. You can use a new number or keep using your WhatsApp Business app number."
                        action={connectButton ?? <p className="text-sm text-muted-foreground">Ask a workspace admin to connect a number.</p>}
                    />
                </Card>
            ) : (
                <div className="grid gap-4">
                    {connected.map((w) => (
                        <WabaCard key={w.id} waba={w} canManage={canManage} />
                    ))}
                </div>
            )}

            {disconnected.length > 0 && (
                <div className="mt-8">
                    <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Disconnected</h2>
                    <div className="grid gap-4">
                        {disconnected.map((w) => (
                            <WabaCard key={w.id} waba={w} canManage={false} />
                        ))}
                    </div>
                </div>
            )}

            <ConnectWhatsappDialog open={open} onOpenChange={setOpen} />
        </>
    );
}
