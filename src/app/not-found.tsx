import Link from 'next/link';

import { Button } from '@/components/ui/button';

export default function NotFound() {
    return (
        <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm font-semibold text-brand-600">404</p>
            <h1 className="text-2xl font-semibold">Page not found</h1>
            <p className="text-muted-foreground">The page you are looking for does not exist or was moved.</p>
            <Button asChild className="mt-2">
                <Link href="/dashboard">Back to dashboard</Link>
            </Button>
        </main>
    );
}
