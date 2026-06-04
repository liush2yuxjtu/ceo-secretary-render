"use client";

import type { Role } from "@/lib/roles";
import { RoleAvatar } from "./RoleAvatar";

/**
 * Landing view shown when the conversation is empty. Since v0.2.0 the main
 * role is fixed (CEO秘书); we just surface a few starter prompts and a
 * one-line explanation of how the hot-load router works.
 */
export function EmptyState({ role }: { role: Role }) {
  return (
    <div className="h-full grid place-items-center px-6">
      <div className="max-w-xl w-full text-center">
        <div className="flex justify-center mb-5">
          <div className="relative">
            <div
              className="absolute -inset-6 rounded-full blur-2xl opacity-60"
              style={{
                background: `radial-gradient(circle, ${role.accent.from} 0%, transparent 70%)`,
              }}
              aria-hidden
            />
            <RoleAvatar role={role} size="lg" />
          </div>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          {role.name}
        </h1>
        <p className={`mt-1 text-sm ${role.accent.text}`}>{role.tagline}</p>
        <p className="mt-5 text-zinc-400 text-sm leading-relaxed">
          {role.description}
        </p>

        <div className="mt-7 grid gap-2 text-left">
          {STARTERS.map((s, i) => (
            <button
              key={s}
              type="button"
              data-starter={s}
              className="starter group rounded-xl px-4 py-3 text-sm text-zinc-200 glass hover:bg-white/[0.05] transition flex items-start gap-3"
            >
              <span
                className={`shrink-0 mt-0.5 inline-flex h-5 w-5 rounded-md ${role.accent.text} bg-white/5 border border-white/10 items-center justify-center text-[10px] font-mono font-semibold`}
              >
                {i + 1}
              </span>
              <span className="text-left">{s}</span>
            </button>
          ))}
        </div>

        <p className="mt-7 text-[12px] text-zinc-400 leading-relaxed">
          主 chat 永远是你的 <code className="text-zinc-200 bg-white/5 px-1 py-0.5 rounded font-mono text-[11.5px]">CEO秘书</code>。
          它通过内置 <code className="text-zinc-200 bg-white/5 px-1 py-0.5 rounded font-mono text-[11.5px]">Task</code> 工具
          按需 hot-load <code className="text-zinc-200 bg-white/5 px-1 py-0.5 rounded font-mono text-[11.5px]">plugins/&lt;role&gt;</code>。
        </p>
      </div>
    </div>
  );
}

const STARTERS: string[] = [
  "把 supabase + vercel + stripe 串起来给我一个最小可上线架构。",
  "我们想做一款给中文中小电商老板用的 AI 助理产品，先给我一个产品定位 + GTM 动作。",
  "把这段登录代码评审一下，重点看安全和并发。",
  "调查一下 2026 年 AI agent framework 的格局，给 3 个候选 + 证据。",
];
