import { Badge } from '@/components/ui/badge';
import { dateTime } from '@/lib/format';
import type { WebhookDelivery } from '@/lib/types';

/** Every attempt at one delivery, oldest first: when, what the server answered and how long it took. */
export function DeliveryAttempts({ attempts }: { attempts: WebhookDelivery['attempt_log'] }) {
    if (!attempts || attempts.length === 0) return null;

    return (
        <div>
            <p className="text-sm font-medium">Attempts</p>
            <ol className="mt-2 grid gap-1.5 text-[13px]">
                {attempts.map((a, i) => {
                    const ok = a.status !== null && a.status >= 200 && a.status < 300;

                    return (
                        <li key={a.at + i} className="flex flex-wrap items-center gap-2">
                            <span className="w-5 text-right text-muted-foreground">{i + 1}.</span>
                            <span>{dateTime(a.at)}</span>
                            <Badge tone={ok ? 'good' : 'bad'}>{a.status ?? 'No answer'}</Badge>
                            <span className="text-muted-foreground">{a.ms} ms</span>
                            {a.error && <span className="truncate text-muted-foreground">{a.error}</span>}
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
