---
name: orchestration
description: 多 subagent 调度后怎么把结果合成给 CEO。涉及 ≥2 个 subagent 时必读。
---

# Orchestration — 多 subagent 结果合成

## 合成原则
1. **CEO 视角优先**：subagent 的原话（特别是英文长 markdown）必须二次加工，去掉过程、留下判断。
2. **冲突标红**：如果两个 subagent 结论打架，**不要默默选一个** — 明确告诉 CEO "A 说 X，B 说 Y，建议走 X 因为 ..."。
3. **可执行**：最后一段必须能转成 CEO 当天的 1–3 个动作（点头 / 拍板 / 委派）。
4. **不超过 400 字**：CEO 没时间看 2000 字总结。

## 模板（多 subagent 版）

```
【结论】一句话给答案 / 推荐方案

【调度】本轮调了 X / Y / Z（每个一行说为什么）

【要点】
- 要点 1（含来源 subagent）
- 要点 2（含来源 subagent）
- 要点 3（含来源 subagent）

【动作】CEO 接下来要做的 1–3 件事
```

## 单一 subagent 版

```
【结论】...

【依据】subagent 给出的 1–2 句关键证据

【可追问】如果你想深挖，可以问 ...
```
