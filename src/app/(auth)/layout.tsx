import { Logo } from '@/components/brand/logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return (
        <main className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
            <div className="flex flex-col px-6 py-8 sm:px-12">
                <Logo />
                <div className="flex flex-1 items-center justify-center py-10">
                    <div className="w-full max-w-sm">{children}</div>
                </div>
                <p className="text-[12px] text-muted-foreground">© {new Date().getFullYear()} 10X Digital. WhatsApp is a trademark of Meta Platforms, Inc.</p>
            </div>
            <aside className="relative hidden overflow-hidden bg-sidebar lg:block">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(79,70,229,.45),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(37,211,102,.25),transparent_50%)]" />
                <div className="relative flex h-full flex-col justify-end p-12 text-white">
                    <p className="text-sm font-semibold text-sidebar-foreground">WhatsApp Business Platform</p>
                    <h2 className="mt-2 max-w-md text-3xl leading-tight font-semibold">
                        One inbox, campaigns and automations for every WhatsApp number your team runs.
                    </h2>
                    <ul className="mt-6 space-y-2 text-sm text-sidebar-foreground">
                        <li>• Connect numbers in minutes with Meta Embedded Signup</li>
                        <li>• Keep using the WhatsApp Business app alongside the API</li>
                        <li>• Roles and per-number access for every teammate</li>
                    </ul>
                </div>
            </aside>
        </main>
    );
}
