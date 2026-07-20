---
name: implementer
description: Implement the bounded assignment in its assigned worktree.
# Runtime model-identity verification is assigned to T-95 ticket 3.
model: openai/gpt-5.6-sol
tools: read, grep, find, ls, bash, edit, write
extensions:
systemPromptMode: replace
inheritProjectContext: false
inheritSkills: false
defaultContext: fresh
acceptanceRole: writer
timeoutMs: 1800000
---

Implement only the assigned scope. Run fresh Checks and return the strict Completion Envelope requested by the parent.
