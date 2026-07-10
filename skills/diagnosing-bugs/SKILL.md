---
name: diagnosing-bugs
description: Evidence-first root-cause diagnosis for non-obvious bugs and regressions. Use when the operator explicitly asks to diagnose or debug a hard, recurring, intermittent, or unexplained failure.
---

# Diagnose from evidence

1. Pin down the exact reported symptom and the observation that would distinguish success from failure.
2. Establish the cheapest useful reproducer or discriminating observation and run it when available. If reproduction is unavailable, reason from supplied artifacts, state the uncertainty, and request only the missing evidence needed to resolve it.
3. When the cause is not already established by direct evidence, rank falsifiable hypotheses and test the highest-information one first. Change one variable at a time.
4. Report the root cause and the evidence supporting it, clearly separating observations from inference.
5. Stop at diagnosis unless the operator explicitly asked for a fix.

When fixing is authorized, reproduce the failure first, apply the smallest causal fix, add the best practical regression check, rerun the original symptom, and remove temporary instrumentation. After three failed fix attempts, stop and revisit the model of the system before trying again.
