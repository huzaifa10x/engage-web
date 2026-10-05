'use client';

import { XIcon } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';

/** Chips input for tags. Enter or comma adds a tag; existing tags are suggested while typing. */
export function TagInput({
    id,
    value,
    onChange,
    suggestions = [],
    placeholder = 'Add a tag and press Enter',
}: {
    id?: string;
    value: string[];
    onChange: (tags: string[]) => void;
    suggestions?: string[];
    placeholder?: string;
}) {
    const [text, setText] = useState('');

    const add = (raw: string) => {
        const tag = raw.replace(/[,;|]/g, ' ').trim().slice(0, 40);
        if (tag && !value.some((t) => t.toLowerCase() === tag.toLowerCase())) onChange([...value, tag]);
        setText('');
    };
    const matches = text.trim()
        ? suggestions.filter((s) => s.toLowerCase().includes(text.trim().toLowerCase()) && !value.some((t) => t.toLowerCase() === s.toLowerCase())).slice(0, 6)
        : [];

    return (
        <div className="relative">
            <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1.5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20">
                {value.map((tag) => (
                    <Badge key={tag} tone="info" className="gap-1">
                        {tag}
                        <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))} aria-label={`Remove ${tag}`}>
                            <XIcon className="size-3" />
                        </button>
                    </Badge>
                ))}
                <input
                    id={id}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ',') && text.trim()) {
                            e.preventDefault();
                            add(text);
                        } else if (e.key === 'Backspace' && !text && value.length) {
                            onChange(value.slice(0, -1));
                        }
                    }}
                    onBlur={() => text.trim() && add(text)}
                    placeholder={value.length ? '' : placeholder}
                    className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
                    autoComplete="off"
                />
            </div>
            {matches.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-card py-1 shadow-md">
                    {matches.map((s) => (
                        <li key={s}>
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => add(s)}
                                className="w-full px-3 py-1.5 text-left text-[13px] hover:bg-muted"
                            >
                                {s}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
