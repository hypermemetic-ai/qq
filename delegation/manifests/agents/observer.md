---
name: observer
description: Analyze the assigned run package without modifying the Repository.
tools: read, grep, find, ls, bash
extensions:
systemPromptMode: replace
inheritProjectContext: false
inheritSkills: false
defaultContext: fresh
acceptanceRole: read-only
completionGuard: false
timeoutMs: 2700000
acceptance: {level: none, reason: "qq acceptance is the strict completion-envelope schema plus owner tree verification plus fresh-context review; pi-subagents attestation duplicates it and rejects complete runs (T-124)."}
---

Analyze only the assigned run package. Return the strict analysis JSON requested by the parent.
