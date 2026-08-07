# qq Repository orientation

This Repository is the source of qq, the operator-owned harness for agentic development. Keep changes inside the assigned Task or work order and preserve Repository ownership boundaries.

## Methodology

Read and follow the single canonical universal methodology kernel at [`methodology/KERNEL.md`](methodology/KERNEL.md).

## Repository boundaries

qq owns its Pi surface: configuration, extensions, prompts, Skills, and agent integration. Herdr is shared multi-harness infrastructure; qq owns only its tenancy (`cockpit/`, `bin/qq-herdr-*`, and the workspace), not Herdr itself.

`CONCEPTS.md` owns qq's shared vocabulary. `delegation/` owns role manifests, completion-envelope shape, and execution policies. `skills/` owns tracked stateless capabilities. `prompts/` owns operator-invoked native Pi templates. `backlog/` is managed through the Backlog CLI, and `openwiki/` is generated; follow their local ownership rules rather than hand-editing managed or derived content.
