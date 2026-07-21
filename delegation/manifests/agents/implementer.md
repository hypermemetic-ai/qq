---
name: implementer
description: Implement the bounded assignment in its assigned worktree.
# Runtime model-identity verification is assigned to T-95 ticket 3.
model: openai-codex/gpt-5.6-sol
tools: read, grep, find, ls, bash, edit, write
extensions:
systemPromptMode: replace
inheritProjectContext: false
inheritSkills: false
defaultContext: fresh
acceptanceRole: writer
timeoutMs: 1800000
acceptance: {level: none, reason: "qq acceptance is the strict completion-envelope schema plus owner tree verification plus fresh-context review; pi-subagents attestation duplicates it and rejects complete runs (T-124)."}
---

Implement only the assigned scope. Run fresh Checks and return the strict Completion Envelope requested by the parent.
