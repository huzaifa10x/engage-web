'use client';

import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DATE_FORMAT_LABELS, dayText, parseDayText, todayIso, workspaceDates } from '@/lib/format';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * A date picker that follows the workspace's date format (batch 6, item 1), instead of the
 * browser's own date input (which shows the computer's locale, e.g. mm/dd/yyyy). The value is
 * always YYYY-MM-DD, or '' when empty. Type it, or pick it from the calendar.
 */
export function DateField({
    value,
    onChange,
    min,
    max,
    id,
    disabled,
    className,
    'aria-label': ariaLabel,
}: {
    value: string;
    onChange: (iso: string) => void;
    min?: string;
    max?: string;
    id?: string;
    disabled?: boolean;
    className?: string;
    'aria-label'?: string;
}) {
    const format = workspaceDates().format;
    const [text, setText] = useState<string | null>(null); // what is being typed, until it is a date
    const [open, setOpen] = useState(false);
    const shown = value ? dayText(value, format) : '';
    const [month, setMonth] = useState(() => (value || todayIso()).slice(0, 7));
    const outOfRange = (iso: string) => (min !== undefined && min !== '' && iso < min) || (max !== undefined && max !== '' && iso > max);

    // A typed date is passed on even outside min/max, so the screen can say what is wrong with the
    // range; the calendar only offers dates inside it.
    const commit = (raw: string) => {
        if (raw.trim() === '') return (setText(null), onChange(''));
        const iso = parseDayText(raw, format);
        if (iso) {
            setText(null);
            onChange(iso);
        }
    };
    const invalid = text !== null && text.trim() !== '' && parseDayText(text, format) === null;

    const [y, m] = month.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const lead = (first.getUTCDay() + 6) % 7; // Monday first
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const shift = (n: number) => {
        const d = new Date(Date.UTC(y, m - 1 + n, 1));
        setMonth(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
    };
    const today = todayIso();

    return (
        <div className={cn('relative flex items-center', className)}>
            <Input
                id={id}
                value={text ?? shown}
                placeholder={DATE_FORMAT_LABELS[format]}
                aria-label={ariaLabel}
                aria-invalid={invalid || undefined}
                disabled={disabled}
                inputMode="numeric"
                className="pr-9"
                onChange={(e) => {
                    setText(e.target.value);
                    const iso = parseDayText(e.target.value, format);
                    if (iso) onChange(iso);
                    else if (e.target.value.trim() === '') onChange('');
                }}
                onBlur={() => {
                    if (text !== null) commit(text);
                    setText(null);
                }}
            />
            <Popover
                open={open}
                onOpenChange={(o) => {
                    if (o) setMonth((value || today).slice(0, 7));
                    setOpen(o);
                }}
            >
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={disabled}
                        className="absolute right-1"
                        aria-label={`Choose ${ariaLabel ? ariaLabel.toLowerCase() : 'a date'} from a calendar`}
                    >
                        <CalendarIcon />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" aria-label="Calendar">
                    <div className="mb-1 flex items-center justify-between">
                        <Button type="button" size="icon-sm" variant="ghost" onClick={() => shift(-1)} aria-label="Previous month">
                            <ChevronLeftIcon />
                        </Button>
                        <span className="text-[13px] font-semibold">
                            {MONTHS[m - 1]} {y}
                        </span>
                        <Button type="button" size="icon-sm" variant="ghost" onClick={() => shift(1)} aria-label="Next month">
                            <ChevronRightIcon />
                        </Button>
                    </div>
                    <div className="grid grid-cols-7 gap-0.5 text-center text-[11.5px]" role="grid">
                        {WEEKDAYS.map((w) => (
                            <span key={w} className="py-1 font-medium text-muted-foreground">
                                {w}
                            </span>
                        ))}
                        {Array.from({ length: lead }, (_, i) => (
                            <span key={`x${i}`} />
                        ))}
                        {Array.from({ length: days }, (_, i) => {
                            const iso = `${y}-${pad(m)}-${pad(i + 1)}`;
                            const off = outOfRange(iso);

                            return (
                                <button
                                    key={iso}
                                    type="button"
                                    disabled={off}
                                    aria-label={dayText(iso, format)}
                                    aria-pressed={iso === value}
                                    className={cn(
                                        'rounded-md py-1.5 hover:bg-muted disabled:opacity-30',
                                        iso === today && 'font-semibold',
                                        iso === value && 'bg-primary text-primary-foreground hover:bg-primary',
                                    )}
                                    onClick={() => {
                                        onChange(iso);
                                        setText(null);
                                        setOpen(false);
                                    }}
                                >
                                    {i + 1}
                                </button>
                            );
                        })}
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
}

/** A date and time (value 'YYYY-MM-DDTHH:mm', in the workspace's time zone, as the old datetime-local fields). */
export function DateTimeField({
    value,
    onChange,
    id,
    disabled,
    min,
    'aria-label': ariaLabel,
}: {
    value: string;
    onChange: (value: string) => void;
    id?: string;
    disabled?: boolean;
    min?: string;
    'aria-label'?: string;
}) {
    const [day, time] = value ? [value.slice(0, 10), value.slice(11, 16)] : ['', ''];

    return (
        <div className="flex gap-2">
            <DateField
                id={id}
                value={day}
                min={min?.slice(0, 10)}
                disabled={disabled}
                aria-label={ariaLabel ? `${ariaLabel} date` : 'Date'}
                className="flex-1"
                onChange={(d) => onChange(d ? `${d}T${time || '09:00'}` : '')}
            />
            <Input
                type="time"
                step={60}
                className="w-28"
                value={time}
                disabled={disabled || !day}
                aria-label={ariaLabel ? `${ariaLabel} time` : 'Time'}
                onChange={(e) => onChange(day ? `${day}T${e.target.value}` : '')}
            />
        </div>
    );
}
