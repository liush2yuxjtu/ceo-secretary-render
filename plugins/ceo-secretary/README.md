# CEO秘书

中文 CEO 的一对一助理，也是这个 app 的**唯一主线程**。所有用户请求都先到 CEO秘书，再由它按需 hot-load 其他角色（plugin / subagent）来交付。

## 它做什么
- 听懂 CEO 的业务诉求
- 拆解为 1–5 个有清晰产出的子任务
- 通过 `Task` 工具 hot-load 最合适的 subagent
- 把所有子任务的结论合成为 CEO 视角的中文简报

## 它不做什么
- 涉及具体厂商平台的实施细节（Vercel / Supabase / Stripe / ...）→ 让对应的 `<vendor>-engineer` 处理
- 闲聊 / 一句话查证 → 直接答，不调 subagent

## Subagent 清单
详见 `agents/ceo-secretary.md` 中的角色清单（共 22 个：14 个通用角色 + 8 个 vendor-engineer）。
