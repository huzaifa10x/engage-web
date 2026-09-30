import { Logo } from '@/components/brand/logo';
import { Card } from '@/components/ui/card';

/** Standalone pages outside the app shell (workspace selection, invitations, support sessions). */
export function CenteredCard({ children }: { children: React.ReactNode }) {
    return (
        <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
            <Logo />
            <Card className="w-full max-w-md p-6">{children}</Card>
        </main>
    );
}
