// Role registry — describes every plugin directory the app can hot-load.
//
// v0.2.0 (CEO秘书 router): there is exactly ONE main-thread role
// (`ceo-secretary`). All other roles are *subagents* that CEO秘书 can dispatch
// to on demand. The frontend shows a single chat owned by CEO秘书; subagents
// are surfaced in the sidebar as "available on hot-load" and rendered inline
// as delegation chips whenever CEO秘书 calls one.
//
// To add a new role: drop a directory under /plugins with a plugin.json + an
// agent, then list it here.

import { promises as fs } from 'node:fs';
import path from 'node:path';

export type RoleId = string;

export interface Role {
  id: RoleId;
  /** Chinese display name used in the UI. */
  name: string;
  /** English label, used in tooltips and logs. */
  english: string;
  tagline: string;
  description: string;
  emoji: string;
  /**
   * Name of the agent inside the plugin that should run as the subagent.
   * Must match the `name` frontmatter in `plugins/<id>/agents/*.md`.
   */
  agentName: string;
  /** True for the single main-thread role. */
  isMain: boolean;
  /** True for vendor-specific implementation roles (vercel-engineer, ...). */
  isEngineer: boolean;
  /** Vendor key for engineer roles (e.g. "vercel", "supabase"). */
  vendor?: string;
  /** Group label used to bucket the sidebar ("通用角色" / "工程师 ONLY"). */
  group: 'main' | 'general' | 'engineer';
  /** Whether the plugin directory is present on disk. Filled at runtime
   *  by `resolveRolePaths` — optional in the static catalog so new roles
   *  can be added without listing every field. */
  installed?: boolean;
  /** Tailwind color tokens that drive the role's accent throughout the UI. */
  accent: {
    from: string;
    to: string;
    text: string;
    ring: string;
    avatar: string;
  };
  pluginPath: string; // resolved at runtime by resolveRolePaths()
}

/** The single main-thread role id. Everything in the app pivots on this. */
export const MAIN_ROLE_ID = 'ceo-secretary';

/**
 * The full role catalog. Order matters: main role first, then general
 * business roles, then vendor-engineer roles. The sidebar renders in this
 * order so the main role is always at the top.
 */
export const ROLES: Role[] = [
  // ── Main thread (only one) ───────────────────────────────────────────
  {
    id: 'ceo-secretary',
    name: 'CEO秘书',
    english: 'CEO Secretary',
    tagline: '你的中文 CEO 一对一助理',
    description:
      '唯一主线程。听懂业务诉求 → 拆解 → 通过 Task 工具 hot-load 最合适的子角色 → 汇总成简报。轻问题直接答，跨领域才调度。',
    emoji: '🗂️',
    agentName: 'ceo-secretary',
    isMain: true,
    isEngineer: false,
    group: 'main',
    accent: {
      from: '#f59e0b',
      to: '#ef4444',
      text: 'text-amber-300',
      ring: 'ring-amber-500/40',
      avatar: 'from-amber-500 to-rose-500',
    },
    pluginPath: '',
  },

  // ── General business roles ───────────────────────────────────────────
  {
    id: 'cto-advisor',
    name: 'CTO 顾问',
    english: 'Strategic CTO Advisor',
    tagline: '架构权衡、技术选型、工程领导力',
    description:
      '战略 CTO — 直接、opinionated、concise。给推荐 + 数字 + 回退。',
    emoji: '🧠',
    agentName: 'cto-advisor',
    isMain: false,
    isEngineer: false,
    group: 'general',
    accent: {
      from: '#7c3aed',
      to: '#2563eb',
      text: 'text-violet-300',
      ring: 'ring-violet-500/40',
      avatar: 'from-violet-500 to-blue-500',
    },
    pluginPath: '',
  },
  {
    id: 'designer',
    name: '资深设计师',
    english: 'Senior Designer',
    tagline: 'UI/UX 评审、视觉规范、可访问性',
    description:
      'Quiet, legible, respects the user’s time. 每屏只让用户做 1 件事。',
    emoji: '🎨',
    agentName: 'designer',
    isMain: false,
    isEngineer: false,
    group: 'general',
    accent: {
      from: '#ec4899',
      to: '#f97316',
      text: 'text-pink-300',
      ring: 'ring-pink-500/40',
      avatar: 'from-pink-500 to-orange-400',
    },
    pluginPath: '',
  },
  {
    id: 'reviewer',
    name: '代码评审',
    english: 'Code Reviewer',
    tagline: '正确性 / 安全 / 性能 — 严重度分级',
    description:
      'Severity-tiered findings：blocker / should-fix / nit。',
    emoji: '🔍',
    agentName: 'reviewer',
    isMain: false,
    isEngineer: false,
    group: 'general',
    accent: {
      from: '#10b981',
      to: '#0ea5e9',
      text: 'text-emerald-300',
      ring: 'ring-emerald-500/40',
      avatar: 'from-emerald-500 to-sky-500',
    },
    pluginPath: '',
  },
  {
    id: 'researcher',
    name: '研究员',
    english: 'Researcher',
    tagline: '多源调研、引用、置信度校准',
    description:
      'Top-down 综合报告。每条事实带来源 + 置信度。',
    emoji: '🔬',
    agentName: 'researcher',
    isMain: false,
    isEngineer: false,
    group: 'general',
    accent: {
      from: '#f59e0b',
      to: '#ef4444',
      text: 'text-amber-300',
      ring: 'ring-amber-500/40',
      avatar: 'from-amber-500 to-rose-500',
    },
    pluginPath: '',
  },
  {
    id: 'product-manager',
    name: '产品经理',
    english: 'Product Manager',
    tagline: 'PRD、用户故事、优先级',
    description:
      '把模糊诉求拆成可执行需求；RICE 排序；切到 MVP 最小范围。',
    emoji: '📋',
    agentName: 'product-manager',
    isMain: false,
    isEngineer: false,
    group: 'general',
    accent: {
      from: '#3b82f6',
      to: '#06b6d4',
      text: 'text-sky-300',
      ring: 'ring-sky-500/40',
      avatar: 'from-blue-500 to-cyan-500',
    },
    pluginPath: '',
  },
  {
    id: 'marketing-strategist',
    name: '市场策略',
    english: 'Marketing Strategist',
    tagline: '定位、GTM、增长实验',
    description:
      'Positioning → GTM motion → growth loops。少用营销黑话。',
    emoji: '📣',
    agentName: 'marketing-strategist',
    isMain: false,
    isEngineer: false,
    group: 'general',
    accent: {
      from: '#f43f5e',
      to: '#d946ef',
      text: 'text-rose-300',
      ring: 'ring-rose-500/40',
      avatar: 'from-rose-500 to-fuchsia-500',
    },
    pluginPath: '',
  },
  {
    id: 'sales-lead',
    name: '销售负责人',
    english: 'Sales Lead',
    tagline: 'Pipeline、话术、转化率',
    description:
      'MEDDIC / BANT 强制 qualification；不靠"加强培训"。',
    emoji: '💼',
    agentName: 'sales-lead',
    isMain: false,
    isEngineer: false,
    group: 'general',
    accent: {
      from: '#0ea5e9',
      to: '#6366f1',
      text: 'text-sky-300',
      ring: 'ring-sky-500/40',
      avatar: 'from-sky-500 to-indigo-500',
    },
    pluginPath: '',
  },
  {
    id: 'hr-partner',
    name: 'HR 伙伴',
    english: 'HR Partner',
    tagline: '招聘、绩效、组织设计',
    description:
      'Org scorecard + comp bands + 调岗 / 开人可解释。',
    emoji: '🧑‍🤝‍🧑',
    agentName: 'hr-partner',
    isMain: false,
    isEngineer: false,
    group: 'general',
    accent: {
      from: '#14b8a6',
      to: '#84cc16',
      text: 'text-teal-300',
      ring: 'ring-teal-500/40',
      avatar: 'from-teal-500 to-lime-500',
    },
    pluginPath: '',
  },
  {
    id: 'finance-controller',
    name: '财务主管',
    english: 'Finance Controller',
    tagline: '预算、单价、现金流',
    description:
      'Unit economics + burn multiple + runway。数字带单位。',
    emoji: '💰',
    agentName: 'finance-controller',
    isMain: false,
    isEngineer: false,
    group: 'general',
    accent: {
      from: '#22c55e',
      to: '#eab308',
      text: 'text-emerald-300',
      ring: 'ring-emerald-500/40',
      avatar: 'from-green-500 to-yellow-500',
    },
    pluginPath: '',
  },
  {
    id: 'legal-counsel',
    name: '法务顾问',
    english: 'Legal Counsel',
    tagline: '合规、合同、隐私',
    description:
      'PIPL / 合同法 / 劳动法 / 竞业。给具体条款 + 升级触发条件。',
    emoji: '⚖️',
    agentName: 'legal-counsel',
    isMain: false,
    isEngineer: false,
    group: 'general',
    accent: {
      from: '#64748b',
      to: '#475569',
      text: 'text-slate-300',
      ring: 'ring-slate-500/40',
      avatar: 'from-slate-500 to-slate-700',
    },
    pluginPath: '',
  },
  {
    id: 'data-analyst',
    name: '数据分析师',
    english: 'Data Analyst',
    tagline: '指标、SQL、看板、A/B',
    description:
      '指标层级 + funnel + cohort。区分"相关"和"因果"。',
    emoji: '📊',
    agentName: 'data-analyst',
    isMain: false,
    isEngineer: false,
    group: 'general',
    accent: {
      from: '#0d9488',
      to: '#0891b2',
      text: 'text-teal-300',
      ring: 'ring-teal-500/40',
      avatar: 'from-teal-600 to-cyan-600',
    },
    pluginPath: '',
  },
  {
    id: 'copywriter',
    name: '文案',
    english: 'Copywriter',
    tagline: '品牌话术、对外文案、转化文案',
    description:
      'Hook → Problem → Promise → Proof → CTA。每段问"能删吗"。',
    emoji: '✍️',
    agentName: 'copywriter',
    isMain: false,
    isEngineer: false,
    group: 'general',
    accent: {
      from: '#fb7185',
      to: '#fbbf24',
      text: 'text-rose-300',
      ring: 'ring-rose-500/40',
      avatar: 'from-rose-400 to-amber-400',
    },
    pluginPath: '',
  },
  {
    id: 'customer-success',
    name: '客户成功',
    english: 'Customer Success',
    tagline: '客户旅程、续费、流失预警',
    description:
      '健康度量化 + QBR + 续费预测分桶。',
    emoji: '🤝',
    agentName: 'customer-success',
    isMain: false,
    isEngineer: false,
    group: 'general',
    accent: {
      from: '#a855f7',
      to: '#ec4899',
      text: 'text-purple-300',
      ring: 'ring-purple-500/40',
      avatar: 'from-purple-500 to-pink-500',
    },
    pluginPath: '',
  },
  {
    id: 'operations-lead',
    name: '运营负责人',
    english: 'Ops Lead',
    tagline: '内部流程、工具、效率、SOP',
    description:
      '找最慢的一环（不是最吵的）；流程要 owner + 衡量。',
    emoji: '🛠️',
    agentName: 'operations-lead',
    isMain: false,
    isEngineer: false,
    group: 'general',
    accent: {
      from: '#6366f1',
      to: '#8b5cf6',
      text: 'text-indigo-300',
      ring: 'ring-indigo-500/40',
      avatar: 'from-indigo-500 to-violet-500',
    },
    pluginPath: '',
  },

  // ── Vendor engineers (实施 ONLY) ─────────────────────────────────────
  {
    id: 'vercel-engineer',
    name: 'Vercel 工程师',
    english: 'Vercel Engineer',
    tagline: 'ONLY Vercel / Next.js 实施',
    description:
      'Next.js 部署、Functions、Fluid Compute、AI Gateway、vercel.ts。',
    emoji: '▲',
    agentName: 'vercel-engineer',
    isMain: false,
    isEngineer: true,
    vendor: 'vercel',
    group: 'engineer',
    accent: {
      from: '#52525b',
      to: '#27272a',
      text: 'text-zinc-200',
      ring: 'ring-zinc-500/40',
      avatar: 'from-zinc-500 to-zinc-800',
    },
    pluginPath: '',
  },
  {
    id: 'supabase-engineer',
    name: 'Supabase 工程师',
    english: 'Supabase Engineer',
    tagline: 'ONLY Supabase 实施',
    description:
      'Postgres / Auth / RLS / Realtime / Storage / Edge Functions (Deno)。',
    emoji: '⚡',
    agentName: 'supabase-engineer',
    isMain: false,
    isEngineer: true,
    vendor: 'supabase',
    group: 'engineer',
    accent: {
      from: '#3ecf8e',
      to: '#22c55e',
      text: 'text-emerald-300',
      ring: 'ring-emerald-500/40',
      avatar: 'from-emerald-500 to-green-600',
    },
    pluginPath: '',
  },
  {
    id: 'stripe-engineer',
    name: 'Stripe 工程师',
    english: 'Stripe Engineer',
    tagline: 'ONLY Stripe 支付实施',
    description:
      'Checkout / Subscription / Connect / Webhooks / Tax / Invoices。',
    emoji: '💳',
    agentName: 'stripe-engineer',
    isMain: false,
    isEngineer: true,
    vendor: 'stripe',
    group: 'engineer',
    accent: {
      from: '#635bff',
      to: '#a78bfa',
      text: 'text-indigo-300',
      ring: 'ring-indigo-500/40',
      avatar: 'from-indigo-500 to-violet-400',
    },
    pluginPath: '',
  },
  {
    id: 'github-engineer',
    name: 'GitHub 工程师',
    english: 'GitHub Engineer',
    tagline: 'ONLY GitHub 平台实施',
    description:
      'Actions / API / Releases / Apps / Dependabot。pin SHA、OIDC。',
    emoji: '🐙',
    agentName: 'github-engineer',
    isMain: false,
    isEngineer: true,
    vendor: 'github',
    group: 'engineer',
    accent: {
      from: '#1f2328',
      to: '#6e7681',
      text: 'text-zinc-300',
      ring: 'ring-zinc-500/40',
      avatar: 'from-zinc-800 to-zinc-500',
    },
    pluginPath: '',
  },
  {
    id: 'notion-engineer',
    name: 'Notion 工程师',
    english: 'Notion Engineer',
    tagline: 'ONLY Notion 工作流',
    description:
      'Database / Page / Block / API / Template / Permission。',
    emoji: '📝',
    agentName: 'notion-engineer',
    isMain: false,
    isEngineer: true,
    vendor: 'notion',
    group: 'engineer',
    accent: {
      from: '#000000',
      to: '#737373',
      text: 'text-zinc-300',
      ring: 'ring-zinc-500/40',
      avatar: 'from-zinc-800 to-zinc-500',
    },
    pluginPath: '',
  },
  {
    id: 'figma-engineer',
    name: 'Figma 工程师',
    english: 'Figma Engineer',
    tagline: 'ONLY Figma 协作',
    description:
      'Plugin API / Variables / Design Tokens / REST API / Dev Mode。',
    emoji: '🎯',
    agentName: 'figma-engineer',
    isMain: false,
    isEngineer: true,
    vendor: 'figma',
    group: 'engineer',
    accent: {
      from: '#f24e1e',
      to: '#a259ff',
      text: 'text-orange-300',
      ring: 'ring-orange-500/40',
      avatar: 'from-orange-500 to-purple-500',
    },
    pluginPath: '',
  },
  {
    id: 'linear-engineer',
    name: 'Linear 工程师',
    english: 'Linear Engineer',
    tagline: 'ONLY Linear 研发管理',
    description:
      'Issues / Projects / Cycle / Roadmap / GraphQL API / GitHub Sync。',
    emoji: '⬛',
    agentName: 'linear-engineer',
    isMain: false,
    isEngineer: true,
    vendor: 'linear',
    group: 'engineer',
    accent: {
      from: '#5e6ad2',
      to: '#4654a8',
      text: 'text-indigo-300',
      ring: 'ring-indigo-500/40',
      avatar: 'from-indigo-500 to-indigo-700',
    },
    pluginPath: '',
  },
  {
    id: 'slack-engineer',
    name: 'Slack 工程师',
    english: 'Slack Engineer',
    tagline: 'ONLY Slack 工作流',
    description:
      'Bolt / Slash Command / Events / Web API / Block Kit / Workflow Builder。',
    emoji: '💬',
    agentName: 'slack-engineer',
    isMain: false,
    isEngineer: true,
    vendor: 'slack',
    group: 'engineer',
    accent: {
      from: '#4a154b',
      to: '#ecb22e',
      text: 'text-purple-300',
      ring: 'ring-purple-500/40',
      avatar: 'from-purple-700 to-yellow-500',
    },
    pluginPath: '',
  },
];

const ROLES_BY_ID: Record<RoleId, Role> = ROLES.reduce(
  (acc, r) => {
    acc[r.id] = r;
    return acc;
  },
  {} as Record<RoleId, Role>,
);

export function getRole(id: string): Role | undefined {
  return ROLES_BY_ID[id];
}

export function listRoles(): Role[] {
  return ROLES;
}

export function getMainRole(): Role {
  const main = ROLES.find((r) => r.isMain);
  if (!main) throw new Error('No main role registered in ROLES');
  return main;
}

export function listSubagents(): Role[] {
  return ROLES.filter((r) => !r.isMain);
}

export function listEngineers(): Role[] {
  return ROLES.filter((r) => r.isEngineer);
}

/**
 * Resolve plugin paths relative to the project root and report which roles
 * have a usable plugin directory installed.
 */
export async function resolveRolePaths(): Promise<Role[]> {
  const root = process.cwd();
  return Promise.all(
    ROLES.map(async (r) => {
      const p = path.resolve(root, 'plugins', r.id);
      try {
        await fs.access(path.join(p, '.claude-plugin', 'plugin.json'));
        return { ...r, pluginPath: p };
      } catch {
        // Plugin dir not installed — leave the path empty so the API can 404
        return { ...r, pluginPath: '' };
      }
    }),
  );
}
