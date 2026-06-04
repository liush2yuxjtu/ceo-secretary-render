"use client";

import type { Role } from "@/lib/roles";
import type { DelegationEvent } from "@/lib/types";

/**
 * Inline pill rendered above (or inside) an assistant message. Each chip
 * represents one subagent that CEO秘书 hot-loaded to deliver the response.
 *
 *  ┌─ 🎨 资深设计师 ─ 3.2s ────────────┐
 *  │ 输出：评级 pass + 2 条 fix        │   ← result preview (when present)
 *  └───────────────────────────────────┘
 */
export function DelegationChip({
  role,
  event,
}: {
  role: Role;
  event: DelegationEvent;
}) {
  const inFlight = !event.resultPreview;
  const truncated =
    event.resultPreview && event.resultPreview.length > 200
      ? event.resultPreview.slice(0, 200) + "…"
      : event.resultPreview;
  return (
    <div
      className={`chip-in flex items-start gap-2.5 rounded-xl px-3 py-2 text-[12.5px] leading-relaxed ${inFlight ? "hl-pulse" : ""}`}
      style={
        {
          ["--role-from" as never]: role.accent.from,
          ["--role-to" as never]: role.accent.to,
          ["--hl-color" as never]: role.accent.from,
          background: `linear-gradient(135deg, color-mix(in srgb, ${role.accent.from} 12%, rgba(24,24,27,0.7)) 0%, color-mix(in srgb, ${role.accent.to} 8%, rgba(24,24,27,0.7)) 100%)`,
          border: "1px solid color-mix(in srgb, " + role.accent.from + " 30%, rgba(255,255,255,0.06))",
        } as React.CSSProperties
      }
    >
      <div
        className={`h-7 w-7 rounded-full grid place-items-center text-sm shrink-0 bg-gradient-to-br ${role.accent.avatar} ring-1 ring-white/10`}
        aria-hidden
      >
        {role.emoji}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-zinc-100 font-semibold">{role.name}</span>
          <span className={`text-[10px] font-mono ${role.accent.text}`}>
            hot-loaded
          </span>
          {event.durationMs != null && (
            <span className="text-[10px] text-zinc-500 font-mono">
              {(event.durationMs / 1000).toFixed(1)}s
            </span>
          )}
          {inFlight && (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 dot" />
              调度中
            </span>
          )}
        </div>
        {truncated && (
          <div className="mt-1 text-zinc-400 text-[11.5px] line-clamp-3">
            {truncated}
          </div>
        )}
      </div>
    </div>
  );
}
