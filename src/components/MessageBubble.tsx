"use client";

import { RoleAvatar } from "./RoleAvatar";
import { DelegationChip } from "./DelegationChip";
import { Markdown } from "./Markdown";
import type { Role } from "@/lib/roles";
import type { ChatMessage } from "@/lib/types";

/**
 * One chat message. User messages are right-aligned with a plain surface;
 * assistant messages are left-aligned with the *main role*'s avatar + glow,
 * and show a stack of DelegationChips above the bubble for every subagent
 * CEO秘书 hot-loaded to deliver the response.
 */
export function MessageBubble({
  message,
  mainRole,
  subagentLookup,
  streaming,
}: {
  message: ChatMessage;
  mainRole: Role;
  /** Map from subagent id → Role, used to render chips. */
  subagentLookup: Record<string, Role>;
  streaming?: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end rise">
        <div className="max-w-[78%] rounded-2xl rounded-tr-md px-4 py-2.5 bg-white/[0.06] border border-white/10 text-zinc-100 leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  const delegations = message.delegations ?? [];
  return (
    <div className="rise">
      {delegations.length > 0 && (
        <div className="ml-12 mb-2 flex flex-col gap-1.5 max-w-[82%]">
          {delegations.map((d, i) => {
            const role = subagentLookup[d.subagentId];
            if (!role) return null;
            return <DelegationChip key={i} role={role} event={d} />;
          })}
        </div>
      )}
      <div className="flex gap-3 items-start">
        <RoleAvatar role={mainRole} />
        <div
          className="max-w-[82%] rounded-2xl rounded-tl-md px-4 py-3 bg-white/[0.03] border border-white/[0.07] text-zinc-100 leading-relaxed shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]"
          style={
            {
              ["--role-from" as never]: mainRole.accent.from,
              ["--role-to" as never]: mainRole.accent.to,
            } as React.CSSProperties
          }
        >
          <Markdown>{message.content || ""}</Markdown>
          {streaming && <span className="caret text-zinc-300" aria-hidden />}
        </div>
      </div>
    </div>
  );
}
