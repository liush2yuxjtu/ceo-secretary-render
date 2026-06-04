"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Role } from "@/lib/roles";
import { RoleSidebar } from "./RoleSidebar";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { EmptyState } from "./EmptyState";
import { RoleAvatar } from "./RoleAvatar";
import type {
  ChatMessage,
  ChatStreamEvent,
  DelegationEvent,
  RoleSummary,
} from "@/lib/types";

/**
 * Top-level client component (v0.2.0).
 *
 * Architecture:
 *  - Exactly ONE main chat, always owned by `CEO秘书` (the main-role plugin).
 *  - The sidebar is read-only: it lists every available subagent plugin.
 *  - When CEO秘书 hot-loads a subagent via the Task tool, the server emits
 *    a `hotload` event, and when the subagent replies a `hotload_done` event.
 *  - Each assistant message accumulates its own list of DelegationEvent
 *    chips that render above the message bubble.
 */
export function ChatApp() {
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [mainRoleId, setMainRoleId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  /** id of the subagent CEO秘书 is currently talking to, if any. */
  const [activeSubagent, setActiveSubagent] = useState<string | null>(null);
  /** Counters shown in the sidebar / header. */
  const [totalDelegations, setTotalDelegations] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch role catalog once. v0.2.0: the user cannot switch roles, but the
  // sidebar still needs the full list to render.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/roles")
      .then((r) => r.json())
      .then((data: { mainRoleId: string; roles: RoleSummary[] }) => {
        if (cancelled) return;
        setRoles(data.roles);
        setMainRoleId(data.mainRoleId);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load roles from /api/roles");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Smoothly auto-scroll to the latest message while streaming.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: streaming ? "auto" : "smooth" });
  }, [messages, streaming]);

  // Materialize a Role object for the main role + a lookup for subagents.
  const mainRole: Role | undefined = useMemo(() => {
    const s = roles.find((r) => r.id === mainRoleId);
    return s as unknown as Role | undefined;
  }, [roles, mainRoleId]);
  const subagentLookup = useMemo(() => {
    const out: Record<string, Role> = {};
    for (const r of roles) {
      if (r.id !== mainRoleId) out[r.id] = r as unknown as Role;
    }
    return out;
  }, [roles, mainRoleId]);

  /**
   * Stream a chat turn. Each `data:` line is a JSON-encoded ChatStreamEvent.
   * The state machine here mirrors the backend's event types.
   */
  const streamChat = useCallback(
    async (text: string) => {
      if (!mainRoleId) return;
      setError(null);
      setDurationMs(null);
      setActiveSubagent(null);

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
      };
      const assistantId = crypto.randomUUID();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        delegations: [],
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, sessionId }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const detail = await res.text().catch(() => "");
          throw new Error(detail || `Chat API returned ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const line = frame
              .split("\n")
              .find((l) => l.startsWith("data:"));
            if (!line) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            let evt: ChatStreamEvent;
            try {
              evt = JSON.parse(payload) as ChatStreamEvent;
            } catch {
              continue;
            }
            handleEvent(evt);
          }
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Chat failed");
        setMessages((prev) =>
          prev.filter((m) => m.id !== assistantId || m.content.length > 0),
        );
      } finally {
        setStreaming(false);
        setActiveSubagent(null);
        abortRef.current = null;
      }

      function handleEvent(evt: ChatStreamEvent) {
        if (evt.type === "start") {
          if (evt.sessionId) setSessionId(evt.sessionId);
          return;
        }
        if (evt.type === "delta") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + evt.text } : m,
            ),
          );
          return;
        }
        if (evt.type === "hotload") {
          setActiveSubagent(evt.subagentId);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    delegations: [
                      ...(m.delegations ?? []),
                      {
                        subagentId: evt.subagentId,
                        prompt: evt.prompt,
                        startedAt: evt.startedAt,
                      } satisfies DelegationEvent,
                    ],
                  }
                : m,
            ),
          );
          setTotalDelegations((n) => n + 1);
          return;
        }
        if (evt.type === "hotload_done") {
          setActiveSubagent((cur) => (cur === evt.subagentId ? null : cur));
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    delegations: (m.delegations ?? []).map((d) =>
                      d.subagentId === evt.subagentId && !d.resultPreview
                        ? {
                            ...d,
                            resultPreview: evt.resultPreview,
                            durationMs: evt.durationMs,
                          }
                        : d,
                    ),
                  }
                : m,
            ),
          );
          return;
        }
        if (evt.type === "message") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: evt.content } : m,
            ),
          );
          return;
        }
        if (evt.type === "error") {
          setError(evt.message);
          return;
        }
        if (evt.type === "done") {
          if (evt.sessionId) setSessionId(evt.sessionId);
          setDurationMs(evt.durationMs);
        }
      }
    },
    [mainRoleId, sessionId],
  );

  // Wire up the empty-state starter buttons.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest<HTMLButtonElement>("button.starter");
      if (!btn) return;
      const text = btn.dataset.starter;
      if (text) streamChat(text);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [streamChat]);

  // ?demo=1 — auto-fire the first starter once the page settles. Used by
  // the screenshot harness to capture live hot-load delegation chips
  // without needing an interactive click. Safe in production: it just
  // pretends the user clicked the first starter.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") !== "1") return;
    if (!mainRoleId || streaming) return;
    if (messages.length > 0) return;
    const t = setTimeout(() => {
      const first = document.querySelector<HTMLButtonElement>("button.starter");
      first?.click();
    }, 400);
    return () => clearTimeout(t);
  }, [mainRoleId, streaming, messages.length]);

  const stop = () => {
    abortRef.current?.abort();
  };

  const newSession = () => {
    setMessages([]);
    setSessionId(undefined);
    setError(null);
    setDurationMs(null);
    setActiveSubagent(null);
    setTotalDelegations(0);
  };

  if (!mainRole) {
    return (
      <div className="min-h-screen grid place-items-center text-zinc-400">
        {error ? `Error: ${error}` : "Loading CEO秘书…"}
      </div>
    );
  }

  return (
    <div
      className="flex h-screen w-full overflow-hidden"
      style={
        {
          ["--role-from" as never]: mainRole.accent.from,
          ["--role-to" as never]: mainRole.accent.to,
        } as React.CSSProperties
      }
    >
      <RoleSidebar roles={roles as unknown as Role[]} />

      <main className="relative flex-1 flex flex-col min-w-0">
        <div className="aurora" aria-hidden />

        {/* Chat header */}
        <header className="relative z-10 px-5 md:px-8 pt-5 pb-4 border-b border-[var(--border)] flex items-center gap-4">
          <RoleAvatar role={mainRole} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold text-white tracking-tight">
                {mainRole.name}
              </h1>
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${mainRole.accent.text} bg-white/5 border border-white/10`}
              >
                MAIN
              </span>
              <span className="text-[10px] font-mono text-zinc-500">
                单 main chat · {roles.length - 1} subagents
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5 truncate">
              {activeSubagent
                ? `正在 hot-load：${subagentLookup[activeSubagent]?.name ?? activeSubagent}…`
                : "把你的诉求告诉我，我来判断要不要 hot-load 别的角色。"}
            </p>
          </div>
          <div className="hidden sm:flex flex-col items-end text-[11px] text-zinc-500 font-mono gap-0.5">
            <div>MiniMax-M3</div>
            {durationMs != null && (
              <div className="text-zinc-600">
                上次回复：{(durationMs / 1000).toFixed(1)}s
              </div>
            )}
            {totalDelegations > 0 && (
              <div className="text-zinc-600">
                本会话 hot-load：{totalDelegations} 次
              </div>
            )}
          </div>
        </header>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="relative z-10 flex-1 overflow-y-auto px-5 md:px-8 py-6"
        >
          {messages.length === 0 ? (
            <EmptyState role={mainRole} />
          ) : (
            <div className="max-w-3xl mx-auto space-y-5">
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  mainRole={mainRole}
                  subagentLookup={subagentLookup}
                  streaming={
                    streaming &&
                    m.role === "assistant" &&
                    m === messages[messages.length - 1]
                  }
                />
              ))}
              {error && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-200 text-sm px-4 py-3">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="relative z-10 px-5 md:px-8 pb-6 pt-2">
          <div className="max-w-3xl mx-auto">
            <MessageInput
              onSend={streamChat}
              disabled={streaming}
              accentFrom={mainRole.accent.from}
              accentTo={mainRole.accent.to}
              placeholder={
                streaming ? "CEO秘书 正在处理…" : "给 CEO秘书 留言…"
              }
            />
            <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500 px-1">
              <div className="flex items-center gap-2">
                {streaming ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 dot" />
                    CEO秘书 streaming
                    {activeSubagent && (
                      <span className="text-zinc-400">
                        · hot-loading{" "}
                        <span className="text-amber-300">
                          {subagentLookup[activeSubagent]?.name ??
                            activeSubagent}
                        </span>
                      </span>
                    )}
                    <button
                      onClick={stop}
                      className="ml-2 text-zinc-400 hover:text-zinc-200 underline-offset-2 hover:underline"
                    >
                      Stop
                    </button>
                  </>
                ) : (
                  <span>
                    模型：<span className="text-zinc-400">MiniMax-M3</span>
                    {" · "}plugin 目录：
                    <span className="text-zinc-400">plugins/ceo-secretary/</span>
                  </span>
                )}
              </div>
              <button
                onClick={newSession}
                disabled={streaming}
                className="text-zinc-500 hover:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                新会话
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
