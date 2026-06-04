// Shared types between the API routes and the frontend.

/** Role id — open string now that we have many roles. */
export type RoleId = string;

/** Stripped-down role summary sent to the client (no plugin path). */
export interface RoleSummary {
  id: RoleId;
  name: string;
  english: string;
  tagline: string;
  description: string;
  emoji: string;
  isMain: boolean;
  isEngineer: boolean;
  vendor?: string;
  group: 'main' | 'general' | 'engineer';
  installed: boolean;
  accent: {
    from: string;
    to: string;
    text: string;
    ring: string;
    avatar: string;
  };
}

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  /**
   * Delegation chips rendered inline above / inside the assistant bubble
   * for any subagent that CEO秘书 hot-loaded to deliver this message.
   */
  delegations?: DelegationEvent[];
}

export interface DelegationEvent {
  /** Subagent role id that was hot-loaded (e.g. "cto-advisor"). */
  subagentId: RoleId;
  /** The exact prompt CEO秘书 sent into the subagent. */
  prompt: string;
  /** Truncated preview / first line of the subagent's reply, for the chip. */
  resultPreview?: string;
  /** Time the subagent finished, in ms from session start. */
  startedAt?: number;
  durationMs?: number;
}

/**
 * Server-sent events emitted by the chat API. The frontend parses `data:`
 * lines and dispatches on `type`.
 */
export type ChatStreamEvent =
  | { type: 'start'; roleId: RoleId; sessionId?: string }
  | { type: 'delta'; text: string }
  /** CEO秘书 just hot-loaded a subagent. UI should show a chip. */
  | {
      type: 'hotload';
      subagentId: RoleId;
      prompt: string;
      startedAt: number;
    }
  /** The hot-loaded subagent finished and returned text. */
  | {
      type: 'hotload_done';
      subagentId: RoleId;
      resultPreview: string;
      durationMs: number;
    }
  | { type: 'message'; content: string; sessionId?: string }
  | { type: 'error'; message: string }
  | { type: 'done'; sessionId?: string; durationMs: number };
