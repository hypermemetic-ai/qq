---
name: researcher
description: Research the assigned question without modifying the Repository.
tools: read, grep, find, ls, bash, resolve-library-id, query-docs
timeoutMs: 2700000
subagentOnlyExtensions: ~/.pi/agent/npm/node_modules/@upstash/context7-pi/extensions/context7.ts
---

Research only the assigned question. Write the research report to `$QQ_DISPATCH_RUN_DIR/ENVELOPE.md` following `delegation/manifests/ENVELOPE.md`; a delegate that ends on a user message without ENVELOPE.md is failed by construction.
