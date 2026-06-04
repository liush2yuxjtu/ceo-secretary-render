"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Auto-resizing textarea + send button. Submits on Enter (without shift).
 * Disabled while a stream is in flight.
 */
export function MessageInput({
  onSend,
  disabled,
  accentFrom,
  accentTo,
  placeholder,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
  accentFrom: string;
  accentTo: string;
  placeholder: string;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // auto-grow up to 8 lines
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 220) + "px";
  }, [text]);

  const submit = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText("");
  };

  return (
    <div
      className="relative rounded-2xl glass border border-white/10 focus-within:border-white/20 transition shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)]"
      style={{
        background: `linear-gradient(180deg, color-mix(in srgb, ${accentFrom} 8%, rgba(24,24,27,0.85)) 0%, rgba(24,24,27,0.85) 60%)`,
      }}
    >
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        rows={1}
        disabled={disabled}
        className="block w-full resize-none bg-transparent outline-none px-4 pt-3.5 pb-12 text-[15px] text-zinc-100 placeholder-zinc-500 leading-relaxed disabled:opacity-60"
      />
      <div className="absolute inset-x-0 bottom-0 px-3 pb-2.5 flex items-center justify-between">
        <div className="text-[11px] text-zinc-500 px-1.5 select-none">
          <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-zinc-400 text-[10px]">
            Enter
          </kbd>{" "}
          send ·{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-zinc-400 text-[10px]">
            Shift+Enter
          </kbd>{" "}
          newline
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !text.trim()}
          className="px-3.5 py-1.5 rounded-lg text-sm font-medium text-white shadow-lg shadow-black/30 transition disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: `linear-gradient(135deg, ${accentFrom}, ${accentTo})`,
          }}
        >
          {disabled ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-white/80 dot" />
              Streaming
            </span>
          ) : (
            "Send"
          )}
        </button>
      </div>
    </div>
  );
}
