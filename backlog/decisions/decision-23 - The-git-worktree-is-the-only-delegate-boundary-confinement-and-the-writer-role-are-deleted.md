---
id: decision-23
title: >-
  The git worktree is the only delegate boundary; confinement and the writer
  role are deleted
date: '2026-07-28 15:03'
status: proposed
---
Every qq delegate runs as a plain headless Pi child in the assigned Change worktree. The git worktree is the only boundary: Landlock/Landstrip confinement, the confined writer role, and the structured-output schema pipeline are deleted. One durable run directory per delegate owns lifecycle state from ticket creation (BRIEF.md at dispatch, ENVELOPE.md as the only result surface, adapter-written TERMINAL at exit). Role manifests declare only tools the adapter's startup inventory can verify, with extension-provided tools valid only when the role loads the providing extension. This reverses decision-19's global confined-delegation posture and T-177's application of it; qq methodology stays global. Settled by the operator's 2026-07-28 dispositions on architect batches batch-1d06da518a08f95d931c3a1a07fc2ae7 and batch-a997e8347fde61d4b394c0a3dccb0c5e plus the verbal alignment session the same day; first encoded in T-184.
