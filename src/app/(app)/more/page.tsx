'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ChevronRightIcon, LogOutIcon, MailIcon, ShieldCheckIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { TABS } from '@/components/app/mobile-tab-bar';
import { isVisible, NAV, type NavItem, roleAllows } from '@/components/app/nav';
import { useSession } from '@/components/app/session';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useStored } from '@/hooks/use-stored';
import { api } from '@/lib/api';
import { setReduceMotion } from '@/lib/mobile';

const ROOTS = new Set<string>(TABS.map((t) => t.href));

function Row({ href, icon: Icon, label, hint }: { href: string; icon: NavItem['icon']; label: string; hint?: string }) {
    return (
        <Link href={href} className="flex min-h-13 items-center gap-3 px-4 py-2.5 active:bg-muted/60">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                <Icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{label}</span>
                {hint && <span className="block truncate text-[12.5px] text-muted-foreground">{hint}</span>}
            </span>
            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
    );
}

/**
 * The phone's More tab (brief M4): profile, then everything that is not one of the four main tabs,
 * grouped as in the sidebar, then sign-in security, reduce motion and sign out. On a computer the
 * sidebar shows the same.
 */
export default function MorePage() {
    const { me, can, membership } = useSession();
    const router = useRouter();
    const qc = useQueryClient();
    const [calm, setCalm] = useStored<boolean>('engage.reduce-motion', false);

    const roleKey = membership.role?.key;
    const growth = me.growth?.tier === 'full';
    const growthAny = growth || me.growth?.tier === 'chip';
    const sections = NAV.map((s) => ({
        title: s.title,
        items: s.items.filter(
            (i) =>
                i.href &&
                !i.heading &&
                !ROOTS.has(i.href.split('?')[0]!) &&
                isVisible(i) &&
                (!i.permission || can(i.permission)) &&
                (!i.growth || growth) &&
                (!i.growthAny || growthAny) &&
                roleAllows(i, roleKey),
        ),
    })).filter((s) => s.items.length > 0);

    const signOut = async () => {
        await api(me.impersonation ? 'auth/impersonation' : 'auth/logout', { method: me.impersonation ? 'DELETE' : 'POST' }).catch(() => undefined);
        qc.clear();
        router.replace('/login');
    };

    return (
        <div className="mx-auto grid max-w-xl gap-5">
            <Card className="flex-row items-center gap-3 p-4">
                <Avatar name={me.user.name} className="size-12 text-base" />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[17px] font-semibold">{me.user.name}</p>
                    <p className="truncate text-[13px] text-muted-foreground">
                        {membership.role?.name ?? 'Member'} · {membership.tenant?.name}
                    </p>
                </div>
            </Card>

            {sections.map((s) => (
                <section key={s.title}>
                    <h2 className="px-1 pb-1.5 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">{s.title}</h2>
                    <Card className="divide-y overflow-hidden p-0">
                        {s.items.map((i) => (
                            <Row key={i.href} href={i.href!} icon={i.icon} label={i.label} />
                        ))}
                    </Card>
                </section>
            ))}

            <section>
                <h2 className="px-1 pb-1.5 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">You</h2>
                <Card className="divide-y overflow-hidden p-0">
                    <Row
                        href="/settings?tab=notifications"
                        icon={MailIcon}
                        label="Email notifications"
                        hint="Reply-time alerts are off unless you turn them on"
                    />
                    <Row href="/settings?tab=security" icon={ShieldCheckIcon} label="Sign-in & security" />
                    <label className="flex min-h-13 items-center gap-3 px-4 py-2.5">
                        <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-semibold">Reduce motion</span>
                            <span className="block text-[12.5px] text-muted-foreground">Screens change without sliding or bouncing</span>
                        </span>
                        <Switch
                            checked={calm}
                            onCheckedChange={(on) => {
                                setCalm(on);
                                setReduceMotion(on);
                            }}
                            aria-label="Reduce motion"
                        />
                    </label>
                </Card>
            </section>

            <button
                type="button"
                onClick={signOut}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl border bg-card text-[15px] font-semibold text-destructive active:scale-[.98]"
            >
                <LogOutIcon className="size-4" aria-hidden /> {me.impersonation ? 'End support session' : 'Sign out of this device'}
            </button>
            <p className="pb-2 text-center text-[12px] text-muted-foreground">engageX · by 10X Digital</p>
        </div>
    );
}
