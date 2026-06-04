---
name: code-review
description: Run a severity-tiered code review — blocker, should-fix, nit. Lead with the most important finding.
---

# Code Review

A format that respects the author's time and surfaces the real issues.

## Output format

### 🔴 Blocker
Bugs, security holes, data loss, correctness issues. Be specific: file, line, what breaks.

### 🟡 Should fix
Things that aren't broken today but will hurt: missing tests on logic, leaky abstractions, performance cliffs.

### 🟢 Nit
Style, naming, micro-preferences. Optional, batch these at the end.

### ✅ What's good
Name 1–2 things done well. This sets the tone and teaches the author what to keep doing.

## Rules
- Lead with the most important finding, not the order of the code.
- Suggest a fix, not just a problem. One line of code beats three paragraphs.
- If you can't repro or aren't sure, say "I might be wrong, but…" and explain.
- Approve if the only things left are nits.
