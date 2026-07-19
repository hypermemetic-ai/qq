# T-94 delegation substrate pilot

This pilot composes `pi-subagents@0.35.1` with native Landstrip `0.17.30` through `PI_SUBAGENT_PI_BINARY`. It is deliberately bridge-less: it does not call `qq-status`, Herdr, or any stage/presence/notification machinery. Pi-subagents' run files and the wrapper's Landstrip diagnostics are the only delegate visibility surfaces.

## Launch contract

Set `PI_SUBAGENT_PI_BINARY` to `pilot/bin/pi-landstrip-wrapper`. Pi-subagents supplies `PI_SUBAGENT_CHILD_AGENT`; the wrapper accepts only `reviewer`, `researcher`, and `implementer`.

- reviewer/researcher: have an empty Landstrip write allowlist; Pi-subagents' parent process owns their run artifacts beneath `/tmp`;
- implementer: additionally writes to the assigned worktree, common Git directory, and linked-worktree Git directory;
- every role: direct network, local TCP binding, and Unix sockets are denied by Landstrip;
- every launch: GNU `timeout -k 10` remains outermost; a Linux child-subreaper beneath it reaps the Landstrip/Pi tree, including descendants that double-fork or create a new session;
- missing roles, unrelated working directories, missing Pi/Landstrip binaries, invalid runtime roots, and native sandbox startup failures stop before an unsandboxed Pi can run.

The wrapper derives the assigned worktree from its own location and verifies the child's current directory resolves to that same worktree. Git administrative paths are discovered with `git rev-parse --path-format=absolute`; no machine path is stored in a tracked policy. The subreaper scans only the `/proc` ancestry rooted at itself and signals only that owned tree.

By default, the wrapper uses the native binary from the project-staged Landstrip package and `pi` from `PATH`. `QQ_PILOT_LANDSTRIP_BINARY` and `QQ_PILOT_PI_BINARY` exist only for deterministic fail-closed probes. `QQ_PILOT_RUNTIME_ROOT` must resolve to a strict child of `/tmp`. `QQ_PILOT_TIMEOUT` accepts a positive GNU-timeout duration and defaults to `30m`.

## Agent and completion policy

The role manifests under `manifests/agents/` use fresh context, system-prompt replacement, `inheritProjectContext: false`, `inheritSkills: false`, and an empty extension allowlist. Pi-subagents still loads its required child runtime extension. The JSON Schema in `manifests/completion-envelope.schema.json` rejects missing output, malformed JSON, empty objects/fields, unknown status values, and empty Check lists.

## Checks

Run `pilot/checks/run-all.sh` from anywhere inside this worktree. The runner uses Pi-subagents' real foreground and detached async execution code with a deterministic mock Pi JSONL child, so it needs no model credentials or network. Every child still crosses the real wrapper and native Landstrip boundary. A separate smoke probe launches the installed real Pi binary inside that boundary.

Raw normalized observations live under `evidence/raw/`; `evidence/matrix.md` records the per-check verdict and boundary attribution. Runtime files with machine paths stay beneath the temporary runtime root and are not tracked. The wrapper intentionally does not enable Landstrip's `--trap-fd`: under the outer Codex seccomp substrate, that query-trap route prevents dynamically linked children from loading. Denial attribution therefore pairs child errno/output with an unsandboxed parent baseline.
