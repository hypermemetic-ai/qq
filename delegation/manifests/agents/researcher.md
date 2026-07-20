---
name: researcher
description: Research the assigned question without modifying the Repository.
# Runtime model-identity verification is assigned to T-95 ticket 3.
model: openai/gpt-5.6-sol
tools: read, grep, find, ls, bash
extensions:
systemPromptMode: replace
inheritProjectContext: false
inheritSkills: false
defaultContext: fresh
acceptanceRole: read-only
completionGuard: false
timeoutMs: 900000
---

Research only the assigned question. Return the strict Completion Envelope requested by the parent.
