'use client';

import { SmileIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

const GROUPS: [string, string][] = [
    ['Smileys', '😀 😃 😄 😁 😆 😅 😂 🤣 😊 🙂 😉 😍 🥰 😘 😎 🤩 🤗 🤔 😐 😴 😢 😭 😡 🥳 😇 🙃 😋 😜 🤝 🙏'],
    ['Gestures', '👍 👎 👌 ✌️ 🤞 👏 🙌 💪 👋 🤙 ✋ 👉 👈 👆 👇 ✍️ 🫶 🤲'],
    ['Hearts', '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 💖 💯 ✨ 🔥 ⭐ 🎉 🎊 🎁 🏆'],
    ['Business', '✅ ❌ ⚠️ ❓ ❗ 📌 📍 📞 📱 💬 📧 🕐 📅 🛒 💳 💰 🧾 📦 🚚 🏠 🏢 🔑 📄 🔗 🆕 🆓'],
    ['Food & travel', '☕ 🍕 🍔 🍰 🍎 🥗 ✈️ 🚗 🏖️ 🌍 ☀️ 🌙 🌧️ 🌹 🌱'],
];

/**
 * A small emoji palette for the message box (desktop keyboards have no emoji key). The text
 * itself is plain Unicode all the way to WhatsApp, so any emoji typed or pasted works as well.
 */
export function EmojiPicker({ onPick, disabled }: { onPick: (emoji: string) => void; disabled?: boolean }) {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
        const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', escape);

        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('keydown', escape);
        };
    }, [open]);

    return (
        <div ref={root} className="relative">
            <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setOpen((o) => !o)}
                disabled={disabled}
                aria-label="Insert an emoji"
                aria-expanded={open}
            >
                <SmileIcon />
            </Button>
            {open && (
                <div
                    role="dialog"
                    aria-label="Emoji"
                    className="absolute bottom-11 left-0 z-30 max-h-72 w-72 overflow-y-auto rounded-lg border bg-card p-2 shadow-lg"
                >
                    {GROUPS.map(([name, emojis]) => (
                        <div key={name} className="mb-1.5">
                            <p className="px-1 pb-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{name}</p>
                            <div className="grid grid-cols-8">
                                {emojis.split(' ').map((emoji) => (
                                    <button
                                        key={emoji}
                                        type="button"
                                        onClick={() => onPick(emoji)}
                                        className="rounded p-1 text-xl leading-none hover:bg-muted"
                                        aria-label={emoji}
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
