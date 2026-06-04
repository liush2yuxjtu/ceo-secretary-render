---
name: routing
description: 怎么把 CEO 的需求路由到正确的 subagent。涉及多领域调度前必读。
---

# Routing — 把 CEO 的诉求分给对的 subagent

## 决策树

1. **这个问题属于哪一类？**
   - 纯闲聊 / 一句话查证 → 你自己答，**不调**。
   - 单一领域（只是产品 OR 只是工程）→ 调那一个对应的 subagent。
   - 跨领域 → 列 2–3 个 subagent 串行 / 并行（按依赖关系）。

2. **是否需要 vendor-engineer？**
   - 看到"部署到 Vercel"、"Supabase Row Level Security"、"Stripe webhook"等具体厂商动作 → **强制**派给对应 `<vendor>-engineer`，不要让通用 cto-advisor 自己写代码。
   - vendor-engineer 只处理它对应的厂商；遇到跨厂商（Vercel + Supabase）就让两个 engineer 各自处理自己的部分。

3. **派活指令怎么写？**
   - **目标**：1 句，最终要交付什么。
   - **输入**：需要的上下文（用户原始诉求、已知约束）。
   - **期望产出**：格式（"3 条 bullet"、"一段中文简报"、"一段代码 + 解释"）。
   - **限制**：不能做 / 不要碰的事（"不要改 schema"、"不要引新依赖"）。

## 反模式
- **没事找事**：用户问"今天星期几"就调 researcher 查资料 — 浪费 token。
- **串行依赖变并行**：A 的结论是 B 的输入，不要把 A 和 B 并行派。
- **让通用角色写厂商代码**：cto-advisor 给"具体 Vercel 配置"一定不如 vercel-engineer 准。
- **汇总丢失**：subagent 返回后不汇总就发给 CEO，等于把内部协调暴露给老板。

## 工具调用格式
使用内置 `Task` 工具：
- `subagent_type`：上面 22 个 key 之一
- `prompt`：上述 4 段（目标/输入/期望产出/限制）
- `description`：3–6 字的简短标签，例如"评估架构权衡"
