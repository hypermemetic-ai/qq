# T-108 structural query corpus

This corpus evaluates architecture, dependency, execution-route, and impact
questions over qq at base commit `03f642c7431b1f37f6fa520602a56bed78e9aa87`.
Every expected-answer note below was derived by reading the cited source in this
worktree, not from either index.

qq has no HTTP/application routes. The route class therefore covers Bash
execution paths through its entrypoints and shared libraries. Impact is also
thin: it covers shared-helper consumers and this pilot-only Change rather than
inventing an application deployment surface.

## Architecture

### A1 — External-tool resolution

**Question:** Where is qq's external-tool resolver implemented, and what
executable wrapper exposes it?

**Challenger tool:** `implementation_lookup` for `qq_resolve_bin`.

**Expected answer:** `qq_resolve_bin` is defined in `bin/lib/qq-bin.sh:6`; it
validates a tool name, honors `QQ_<TOOL>_BIN`, checks `PATH`, then checks two
fallback directories. `qq_bin_main` at line 68 exposes the resolver when the
library is executed directly (lines 80–82).

### A2 — Shared result lifecycle

**Question:** Where is the shared JSON result emitter implemented, and which
status wrappers terminate through it?

**Challenger tool:** `implementation_lookup` for `qq_engine_finish`.

**Expected answer:** `qq_engine_finish` is defined in
`bin/lib/qq-engine.sh:24`; it emits the five-field engine JSON and exits.
`qq_engine_done`, `qq_engine_refuse`, and `qq_engine_error` call it at lines
50–63 with exit/status pairs `0/done`, `2/refused`, and `1/error`.

### A3 — Change workflow definitions

**Question:** Where are the Change land and retire workflows defined and
dispatched?

**Challenger tool:** `implementation_lookup` for `land_change` and
`retire_change`.

**Expected answer:** Both are in the extensionless Bash entrypoint
`bin/qq-change`: `land_change` spans lines 110–219, `retire_change` spans lines
221–540, and the verb dispatch at lines 542–545 calls the selected function.

## Dependencies

### D1 — Engine initialization dependency

**Question:** What internal function does `qq_engine_init` call to locate its
required `jq` executable?

**Challenger tool:** `call_graph` for `qq_engine_init`.

**Expected answer:** `qq_engine_init` calls `qq_resolve_bin jq` at
`bin/lib/qq-engine.sh:13`; the callee is defined in `bin/lib/qq-bin.sh:6`.

### D2 — Resolver's reusable-library callers

**Question:** Which reusable-library functions directly call
`qq_resolve_bin`?

**Challenger tool:** `call_graph` callers of `qq_resolve_bin`.

**Expected answer:** `qq_engine_init` calls it at
`bin/lib/qq-engine.sh:13`, and `qq_bin_main` calls it at
`bin/lib/qq-bin.sh:73`. Extensionless entrypoints also call the resolver at
top level or inside their own functions, but this question deliberately asks
only about the two reusable `bin/lib/*.sh` libraries.

### D3 — Result emitter callers

**Question:** Which functions directly depend on `qq_engine_finish`?

**Challenger tool:** `call_graph` callers of `qq_engine_finish`.

**Expected answer:** Exactly `qq_engine_done`, `qq_engine_refuse`, and
`qq_engine_error` call it in `bin/lib/qq-engine.sh:50-63`.

## Execution routes

### R1 — Done-result path

**Question:** What is the shortest call path from `qq_engine_done` to
`qq_engine_finish`?

**Challenger tool:** `call_graph_path` from `qq_engine_done` to
`qq_engine_finish`.

**Expected answer:** It is one direct edge:
`qq_engine_done → qq_engine_finish` (`bin/lib/qq-engine.sh:50-53`).

### R2 — Land success path

**Question:** Does `land_change` reach `qq_engine_done`, and by what shortest
path?

**Challenger tool:** `call_graph_path` from `land_change` to
`qq_engine_done`.

**Expected answer:** Yes, directly. The inspect/dry-run success exits through
`qq_engine_done` at `bin/qq-change:201-204`, and the applied success does so at
lines 218–219.

### R3 — Retire success path

**Question:** Does `retire_change` reach `qq_engine_done`, and by what shortest
path?

**Challenger tool:** `call_graph_path` from `retire_change` to
`qq_engine_done`.

**Expected answer:** Yes, directly. Representative exits are the already
absent path at `bin/qq-change:262`, branch-only completion at lines 304–305,
inspect/dry-run at lines 513–516, and applied completion at line 539.

## Impact

### I1 — Production error-helper blast radius

**Question:** Which production entrypoints are immediate consumers of
`qq_engine_error`?

**Challenger tool:** `call_graph` callers of `qq_engine_error`.

**Expected answer:** Five extensionless Bash entrypoints source the engine and
invoke `qq_engine_error`: `bin/qq-board`, `bin/qq-change`, `bin/qq-dispatch`,
`bin/qq-pr-watch`, and `bin/qq-status`. Each initializes the engine near its
top and contains direct error calls; no other production entrypoint sources
`bin/lib/qq-engine.sh`.

### I2 — Test assertion blast radius

**Question:** Which test scripts are in the direct or one-wrapper-deep blast
radius of changing `assert_equal`?

**Challenger tool:** `call_graph` callers of `assert_equal`.

**Expected answer:** `assert_equal` is defined at `tests/helpers.sh:10` and is
used by ten test scripts: `test-bin-resolution.sh`, `test-file-navigation.sh`,
`test-qq-board.sh`, `test-qq-change.sh`, `test-qq-claude-guard.sh` (through
`assert_result`), `test-qq-dispatch.sh`, `test-qq-herdr-snap.sh`,
`test-qq-pr-watch.sh`, `test-qq-status.sh`, and `test-ratchet.sh`.

### I3 — Pilot Change blast radius

**Question:** What production call-graph blast radius does branch
`feat/t108-index` introduce?

**Challenger tool:** `pr_impact` for `feat/t108-index`, direction `both`, depth
5.

**Expected answer:** The Change is confined to `pilot/`: research Markdown,
the ignored-vendor rule, and the MCP driver. It changes no production `bin/`,
`skills/`, `cockpit/`, or test behavior, so its production call-graph blast
radius is none. The harness itself may contribute pilot-local Bash symbols to
an index that includes the new file.
