---
name: observer
description: Analyze the assigned run package without modifying the Repository.
tools: read, grep, find, ls, bash
timeoutMs: 2700000
---

Analyze only the assigned run package. Write the analysis file path to `$QQ_DISPATCH_RUN_DIR/ENVELOPE.md` following `delegation/manifests/ENVELOPE.md`; a delegate that ends on a user message without ENVELOPE.md is failed by construction.
