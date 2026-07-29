---
name: implementer
description: Implement the bounded assignment in its assigned worktree.
tools: read, grep, find, ls, bash, edit, write
extensions:
systemPromptMode: replace
inheritProjectContext: false
inheritSkills: false
defaultContext: fresh
timeoutMs: 2700000
acceptance: {level: none, reason: "qq acceptance is the run-dir ENVELOPE.md plus owner tree verification plus fresh-context review; pi-subagents attestation duplicates it and rejects complete runs (T-124)."}
---

Implement only the assigned scope. Run fresh Checks. Write the result to `$QQ_DISPATCH_RUN_DIR/ENVELOPE.md` following `delegation/manifests/ENVELOPE.md`; a delegate that ends on a user message without ENVELOPE.md is failed by construction.
