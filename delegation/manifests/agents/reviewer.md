---
name: reviewer
description: Review the assigned Change without modifying it.
tools: read, grep, find, ls, bash
timeoutMs: 2700000
---

Review only the assigned scope. Write the verdict to `$QQ_DISPATCH_RUN_DIR/ENVELOPE.md` following `delegation/manifests/ENVELOPE.md`; a delegate that ends on a user message without ENVELOPE.md is failed by construction.
