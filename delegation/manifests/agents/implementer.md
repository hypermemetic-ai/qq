---
name: implementer
description: Implement the bounded assignment in its assigned worktree.
tools: read, grep, find, ls, bash, edit, write
timeoutMs: 2700000
---

Implement only the assigned scope. Run fresh Checks. Write the result to `$QQ_DISPATCH_RUN_DIR/ENVELOPE.md` following `delegation/manifests/ENVELOPE.md`; a delegate that ends on a user message without ENVELOPE.md is failed by construction.
