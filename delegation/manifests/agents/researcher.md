---
name: researcher
description: Research the assigned question without modifying the Repository.
tools: read, grep, find, ls, bash, web_search, web_fetch
extensions:
subagentOnlyExtensions: ~/.pi/agent/npm/node_modules/@upstash/context7-pi/extensions/context7.ts
systemPromptMode: replace
inheritProjectContext: false
inheritSkills: false
defaultContext: fresh
completionGuard: false
timeoutMs: 2700000
acceptance: {level: none, reason: "qq acceptance is the strict completion-envelope schema plus owner tree verification plus fresh-context review; pi-subagents attestation duplicates it and rejects complete runs (T-124)."}
---

Research only the assigned question. Write the research report to `$QQ_DISPATCH_RUN_DIR/ENVELOPE.md` following `delegation/manifests/ENVELOPE.md`; a delegate that ends on a user message without ENVELOPE.md is failed by construction.
