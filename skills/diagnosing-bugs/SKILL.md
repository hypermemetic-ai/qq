---
name: diagnosing-bugs
description: Evidence-first causal diagnosis for concrete significant uncertainty. Use when a failure remains causally uncertain after ordinary local inspection, recurs or is intermittent, or an apparently causal fix failed. Routine compiler/test feedback, expected reconsideration, and evident simple errors do not trigger it.
---

# Diagnose significant failures from evidence

Trigger only for a concrete significant failure whose cause is still uncertain after ordinary local inspection, a recurring/intermittent symptom, or an apparently causal fix that failed. Do not turn routine compiler or test feedback, expected correction during implementation, or an evident simple error into diagnostic ceremony.

1. Pin down the exact symptom, stakes, and observation that distinguishes success from failure.
2. Establish the cheapest useful reproducer or discriminating observation and run it when available. If reproduction is unavailable, reason from supplied artifacts, expose uncertainty, and request only evidence needed to resolve it.
3. When direct evidence does not establish cause, rank falsifiable hypotheses and test the highest-information one first. Change one variable at a time and keep observation separate from inference.
4. State the root cause only to the strength of evidence. Report what was ruled out, what remains unknown, and whether recurrence or intermittence limits confidence.
5. Stop at diagnosis unless the role and assignment authorize an in-scope fix.

An authorized Implementer may apply the smallest in-scope causal fix, add the best practical regression Check, rerun the original symptom, and remove temporary instrumentation. A scope, stakes, authority, or acceptance crossing returns to the owner; diagnosis never supplies alignment. After three failed fix attempts, stop and revisit the causal model before changing anything else.
