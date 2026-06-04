"use client";

import type { Role } from "@/lib/roles";

/**
 * Read-only registry panel. Lists every plugin (CEO秘书 first, then general
 * business roles, then vendor-engineer roles) and shows whether each plugin
 * is installed. The user cannot pick one — CEO秘书 routes to them.
 */
export function RoleSidebar({ roles }: { roles: Role[] }) {
  const main = roles.find((r) => r.isMain);
  const general = roles.filter((r) => !r.isMain && !r.isEngineer);
  const engineers = roles.filter((r) => r.isEngineer);

  return (
    <aside className="hidden md:flex w-80 shrink-0 flex-col glass border-r border-[var(--border)]">
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <div
            className="h-8 w-8 rounded-lg grid place-items-center text-white text-base font-bold shadow-lg ring-1 ring-white/10"
            style={{
              background:
                main?.accent.from && main.accent.to
                  ? `linear-gradient(135deg, ${main.accent.from}, ${main.accent.to})`
                  : "linear-gradient(135deg, #f59e0b, #ef4444)",
            }}
            aria-hidden
          >
            🗂️
          </div>
          <div>
            <div className="text-[15px] font-semibold text-white leading-tight">
              CEO秘书
            </div>
            <div className="text-[11px] text-zinc-500 leading-tight">
              中文 CEO 一对一助理 · 单 main chat
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 mt-3 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
        Main thread
      </div>
      <div className="px-3 py-1.5">
        {main ? (
          <MainCard role={main} />
        ) : (
          <div className="text-zinc-500 text-xs px-3 py-2">加载中…</div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        <RoleGroup title="通用业务角色" count={general.length}>
          {general.map((r) => (
            <RoleRow key={r.id} role={r} />
          ))}
        </RoleGroup>
        <RoleGroup
          title="工程师 ONLY（vendor-engineer）"
          count={engineers.length}
          accent="engineer"
        >
          {engineers.map((r) => (
            <RoleRow key={r.id} role={r} />
          ))}
        </RoleGroup>
      </div>

      <div className="px-5 py-4 border-t border-[var(--border)]">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">
          Model
        </div>
        <div className="text-xs text-zinc-300 font-mono">MiniMax-M3</div>
        <div className="text-[10.5px] text-zinc-500 mt-2 leading-relaxed">
          你的所有消息都进 <code className="text-zinc-400">CEO秘书</code>。
          它通过 Task 工具按需 hot-load 下方任意 plugin。
        </div>
      </div>
    </aside>
  );
}

function MainCard({ role }: { role: Role }) {
  return (
    <div
      className="rounded-xl px-3 py-2.5 relative"
      style={
        {
          ["--role-from" as never]: role.accent.from,
          ["--role-to" as never]: role.accent.to,
          background: `linear-gradient(135deg, color-mix(in srgb, ${role.accent.from} 18%, transparent) 0%, color-mix(in srgb, ${role.accent.to} 10%, transparent) 100%)`,
          boxShadow: `0 0 0 1px color-mix(in srgb, ${role.accent.from} 45%, transparent), 0 8px 28px -12px color-mix(in srgb, ${role.accent.from} 50%, transparent)`,
        } as React.CSSProperties
      }
    >
      <div className="flex items-start gap-3">
        <div
          className={`h-9 w-9 rounded-full grid place-items-center text-base shrink-0 bg-gradient-to-br ${role.accent.avatar} ring-1 ring-white/10`}
          aria-hidden
        >
          {role.emoji}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">
              {role.name}
            </span>
            <span className={`text-[10px] ${role.accent.text} font-semibold`}>
              ACTIVE
            </span>
          </div>
          <p className="text-[11.5px] text-zinc-300/90 leading-snug mt-0.5 line-clamp-2">
            {role.tagline}
          </p>
        </div>
      </div>
    </div>
  );
}

function RoleGroup({
  title,
  count,
  accent,
  children,
}: {
  title: string;
  count: number;
  accent?: "engineer";
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between px-2 mb-1.5">
        <div
          className={`text-[10px] uppercase tracking-wider font-semibold ${
            accent === "engineer" ? "text-amber-300/80" : "text-zinc-500"
          }`}
        >
          {title}
        </div>
        <div className="text-[10px] text-zinc-600 font-mono">{count}</div>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function RoleRow({ role }: { role: Role }) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 hover:bg-white/[0.04] transition"
      title={role.description}
    >
      <div
        className={`h-7 w-7 rounded-full grid place-items-center text-[12px] shrink-0 bg-gradient-to-br ${role.accent.avatar} ring-1 ring-white/10`}
        aria-hidden
      >
        {role.emoji}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[12.5px] text-zinc-200 truncate">
            {role.name}
          </span>
          {!role.installed && (
            <span className="text-[9px] text-rose-300/90 font-semibold">✗</span>
          )}
        </div>
        <div className="text-[10px] text-zinc-500 truncate">{role.tagline}</div>
      </div>
    </div>
  );
}
