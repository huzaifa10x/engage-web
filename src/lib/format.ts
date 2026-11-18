/**
 * Dates on screens follow the workspace's date format and time zone (batch 6, item 1): the
 * session sets them once it has loaded (SessionProvider). Times are stored in UTC and only
 * shown in the workspace's time zone. Until a session is known, DD/MM/YYYY and the browser's zone.
 */
export type DateFormat = 'dmy' | 'mdy' | 'ymd';

let workspace: { format: DateFormat; timezone: string | undefined } = { format: 'dmy', timezone: undefined };

export function setWorkspaceDates(dates: { format: DateFormat; timezone: string } | null | undefined): void {
    workspace = { format: dates?.format ?? 'dmy', timezone: dates?.timezone || undefined };
}

export function workspaceDates(): { format: DateFormat; timezone: string | undefined } {
    return workspace;
}

export const DATE_FORMAT_LABELS: Record<DateFormat, string> = { dmy: 'DD/MM/YYYY', mdy: 'MM/DD/YYYY', ymd: 'YYYY-MM-DD' };

/** Year, month and day of an instant in the workspace's time zone. */
function parts(d: Date): { y: string; m: string; d: string; hh: string; mm: string } {
    const p = Object.fromEntries(
        new Intl.DateTimeFormat('en-GB', {
            timeZone: workspace.timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        })
            .formatToParts(d)
            .map((x) => [x.type, x.value]),
    );

    return { y: p.year, m: p.month, d: p.day, hh: p.hour, mm: p.minute };
}

/** A calendar date (YYYY-MM-DD, no time zone) in the workspace's format: 18/11/2026. */
export function dayText(isoDay: string | null | undefined, format: DateFormat = workspace.format): string {
    if (!isoDay) return '—';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDay);
    if (!m) return isoDay;
    const [, y, mo, d] = m;

    return format === 'mdy' ? `${mo}/${d}/${y}` : format === 'ymd' ? `${y}-${mo}-${d}` : `${d}/${mo}/${y}`;
}

/**
 * A date typed on a screen, in the workspace's format → YYYY-MM-DD, or null when it isn't one
 * (impossible dates refused, never guessed). YYYY-MM-DD is accepted in every format.
 */
export function parseDayText(text: string, format: DateFormat = workspace.format): string | null {
    const t = text.trim();
    let y: number, mo: number, d: number;
    const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t);
    const short = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
    if (iso) [y, mo, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    else if (short && format !== 'ymd') {
        const [a, b] = [Number(short[1]), Number(short[2])];
        [d, mo] = format === 'mdy' ? [b, a] : [a, b];
        y = Number(short[3]);
    } else return null;
    const check = new Date(Date.UTC(y, mo - 1, d));
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;

    return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** A wall-clock time in the workspace's time zone ('YYYY-MM-DDTHH:mm') → the UTC instant (ISO). */
export function zonedToIso(local: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
    if (!m) return new Date(local).toISOString();
    const asUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
    // The zone's offset at that moment (twice, so a change of offset that day lands right).
    let guess = asUtc;
    for (let i = 0; i < 2; i++) {
        const p = parts(new Date(guess));
        const shown = Date.UTC(Number(p.y), Number(p.m) - 1, Number(p.d), Number(p.hh), Number(p.mm));
        guess = asUtc - (shown - guess);
    }

    return new Date(guess).toISOString();
}

/** A UTC instant → the wall-clock time in the workspace's time zone, 'YYYY-MM-DDTHH:mm' (for a DateTimeField). */
export function isoToZoned(iso: string | null | undefined): string {
    if (!iso) return '';
    const p = parts(new Date(iso));

    return `${p.y}-${p.m}-${p.d}T${p.hh}:${p.mm}`;
}

/** Today in the workspace's time zone, as YYYY-MM-DD. */
export function todayIso(): string {
    const p = parts(new Date());

    return `${p.y}-${p.m}-${p.d}`;
}

export function dateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const p = parts(d);

    return `${dayText(`${p.y}-${p.m}-${p.d}`)} ${p.hh}:${p.mm}`;
}

export function date(iso: string | null | undefined): string {
    if (!iso) return '—';
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return dayText(iso);
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const p = parts(d);

    return dayText(`${p.y}-${p.m}-${p.d}`);
}

export function relative(iso: string | null | undefined): string {
    if (!iso) return 'never';
    const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
    const units: [Intl.RelativeTimeFormatUnit, number][] = [
        ['year', 31536000],
        ['month', 2592000],
        ['week', 604800],
        ['day', 86400],
        ['hour', 3600],
        ['minute', 60],
    ];
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    for (const [unit, size] of units) {
        if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
    }

    return 'just now';
}

export function daysUntil(iso: string | null | undefined): number | null {
    if (!iso) return null;

    return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export function humanize(value: string | null | undefined): string {
    if (!value) return '—';
    const s = value.replace(/[._]/g, ' ').toLowerCase();

    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** How a contact was added: "Inbound", "Import", or "WhatsApp link · Shop window" for one of the workspace's links. */
export function contactSource(source: string | null | undefined, detail?: string | null): string {
    if (source === 'wa_link') return detail ? `WhatsApp link · ${detail}` : 'WhatsApp link or QR code';

    return humanize(source);
}

export function number(n: number | null | undefined): string {
    return n === null || n === undefined ? '—' : new Intl.NumberFormat().format(n);
}

/** 14:05 today, "Mon" this week, 12 Sep otherwise — for conversation lists (in the workspace's time zone). */
export function shortTime(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    const tz = workspace.timezone;
    const p = parts(d);
    if (`${p.y}-${p.m}-${p.d}` === todayIso()) return `${p.hh}:${p.mm}`;
    if (Date.now() - d.getTime() < 6 * 86_400_000) return new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: tz }).format(d);

    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: tz }).format(d);
}

export function clockTime(iso: string | null | undefined): string {
    if (!iso) return '';
    const p = parts(new Date(iso));

    return `${p.hh}:${p.mm}`;
}

export function dayLabel(iso: string): string {
    const p = parts(new Date(iso));
    const day = `${p.y}-${p.m}-${p.d}`;
    if (day === todayIso()) return 'Today';
    const y = parts(new Date(Date.now() - 86_400_000));
    if (day === `${y.y}-${y.m}-${y.d}`) return 'Yesterday';

    return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: workspace.timezone }).format(new Date(iso));
}

/** "3h 12m" until a timestamp (customer service window). */
export function timeLeft(iso: string | null | undefined): string {
    if (!iso) return '';
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return 'closed';
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);

    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function fileSize(bytes: number | null | undefined): string {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i++;
    }

    return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
