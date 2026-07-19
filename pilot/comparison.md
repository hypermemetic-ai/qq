# T-108 structural index comparison

## Outcome

Under the required structural-first, no-embeddings configuration,
`opencode-codebase-index` 0.14.0 could not create or open an index: its status,
indexing, lookup, call-graph, path, and impact paths all required an
embedding-capable provider. It therefore answered **0 of 12** corpus questions.

`codebase-memory-mcp` 0.9.0 answered **7 of 12** correctly, returned two
source-contradicting empty results, and explicitly could not answer three. Its
main weakness on this repository is that it does not model functions inside
qq's extensionless `bin/qq-*` Bash entrypoints.

No semantic tool (`codebase_search` or `find_similar`) was called, no provider
was configured, and no network installation was attempted.

## Snapshot and index metadata

The comparison began while the worktree and the primary checkout both pointed
at `03f642c7431b1f37f6fa520602a56bed78e9aa87`. The incumbent project was the
owner-specified primary project, not the separate worktree project that
`list_projects` also reported.

| Field | Challenger | Incumbent |
|---|---|---|
| Product/version | `opencode-codebase-index` 0.14.0 | `codebase-memory-mcp` 0.9.0 |
| Indexed root | requested `/home/qqp/.herdr/worktrees/qq/feat-t108-index` | `/home/qqp/projects/qq` (`home-qqp-projects-qq`) |
| Files | index not created; 0 observed | 235 `File` nodes |
| Nodes/symbols | unavailable | 2,125 total nodes, including 57 `Function` and 5 `Method` nodes |
| Edges | unavailable | 2,282 |
| Size | no `.codebase-index/` created | 4,521,984 bytes |
| Freshness | unavailable because indexing failed | `main`, head/base SHA `03f642c7431b1f37f6fa520602a56bed78e9aa87`; exactly matched the pilot's starting source snapshot |

The incumbent metadata came from `list_projects` and root
`get_architecture(aspects=overview)`. Its language summary reported 25 Bash
files. Scoped to `bin`, it reported only the two `bin/lib/*.sh` files, which
confirms the observed extensionless-entrypoint gap.

## Exact invocation forms

Full response bodies and process exit statuses are attached under `pilot/raw/`
and mapped to corpus IDs and invocations in
[`pilot/raw/README.md`](raw/README.md).

The committed harness speaks newline-delimited JSON-RPC to the package's MCP
CLI from the current working directory:

```bash
pilot/mcp-driver.sh list
pilot/mcp-driver.sh call index_status '{}'
QQ_MCP_TIMEOUT_SECONDS=240 pilot/mcp-driver.sh call index_codebase '{"force":true,"verbose":true}'
```

The supplied `/tmp/t108-pkg/mcp-probe.cjs` and an initial Node-spawn adaptation
both timed out in this environment. A Bash coprocess carrying the same ordered
`initialize`, `notifications/initialized`, and request messages returned
immediately, so `pilot/mcp-driver.sh` preserves that working headless form.

Challenger corpus calls:

```bash
pilot/mcp-driver.sh call implementation_lookup '{"query":"qq_resolve_bin","limit":5}'
pilot/mcp-driver.sh call implementation_lookup '{"query":"qq_engine_finish","limit":5}'
pilot/mcp-driver.sh call implementation_lookup '{"query":"land_change","limit":5}'
pilot/mcp-driver.sh call implementation_lookup '{"query":"retire_change","limit":5}'
pilot/mcp-driver.sh call call_graph '{"name":"qq_engine_init","direction":"callers"}'
pilot/mcp-driver.sh call call_graph '{"name":"qq_resolve_bin","direction":"callers"}'
pilot/mcp-driver.sh call call_graph '{"name":"qq_engine_finish","direction":"callers"}'
pilot/mcp-driver.sh call call_graph_path '{"from":"qq_engine_done","to":"qq_engine_finish","maxDepth":3}'
pilot/mcp-driver.sh call call_graph_path '{"from":"land_change","to":"qq_engine_done","maxDepth":5}'
pilot/mcp-driver.sh call call_graph_path '{"from":"retire_change","to":"qq_engine_done","maxDepth":5}'
pilot/mcp-driver.sh call call_graph '{"name":"qq_engine_error","direction":"callers"}'
pilot/mcp-driver.sh call call_graph '{"name":"assert_equal","direction":"callers"}'
pilot/mcp-driver.sh call pr_impact '{"branch":"feat/t108-index","maxDepth":5,"direction":"both","checkConflicts":false}'
```

For `call_graph`, caller queries were used because the tool requires a symbol ID
returned by a successful graph query before it permits `direction=callees`.
The provider gate prevented obtaining such an ID. D1 was still asked through
the target-symbol query and compared with the incumbent's outbound trace.

Incumbent metadata and corpus calls used these forms (all calls also used
`--json`; response text was decoded with `jq`):

```bash
codebase-memory-mcp --version
codebase-memory-mcp cli list_projects
codebase-memory-mcp cli --json get_architecture --project home-qqp-projects-qq --aspects overview
codebase-memory-mcp cli --json get_architecture --project home-qqp-projects-qq --path bin --aspects overview

codebase-memory-mcp cli --json search_graph --project home-qqp-projects-qq --name-pattern '^qq_resolve_bin$' --include-connected true --limit 100
codebase-memory-mcp cli --json get_code_snippet --project home-qqp-projects-qq --qualified-name home-qqp-projects-qq.bin.lib.qq-bin.qq_resolve_bin --include-neighbors false
codebase-memory-mcp cli --json search_graph --project home-qqp-projects-qq --name-pattern '^qq_engine_finish$' --include-connected true --limit 100
codebase-memory-mcp cli --json get_code_snippet --project home-qqp-projects-qq --qualified-name home-qqp-projects-qq.bin.lib.qq-engine.qq_engine_finish --include-neighbors false
codebase-memory-mcp cli --json search_graph --project home-qqp-projects-qq --name-pattern '^land_change$' --include-connected true --limit 100
codebase-memory-mcp cli --json search_graph --project home-qqp-projects-qq --name-pattern '^retire_change$' --include-connected true --limit 100

codebase-memory-mcp cli --json trace_path --project home-qqp-projects-qq --function-name qq_engine_init --direction outbound --depth 3 --mode calls --include-tests false
codebase-memory-mcp cli --json trace_path --project home-qqp-projects-qq --function-name qq_resolve_bin --direction inbound --depth 3 --mode calls --include-tests false
codebase-memory-mcp cli --json trace_path --project home-qqp-projects-qq --function-name qq_engine_finish --direction inbound --depth 3 --mode calls --include-tests false
codebase-memory-mcp cli --json trace_path --project home-qqp-projects-qq --function-name qq_engine_done --direction outbound --depth 3 --mode calls --include-tests false
codebase-memory-mcp cli --json trace_path --project home-qqp-projects-qq --function-name land_change --direction outbound --depth 5 --mode calls --include-tests false
codebase-memory-mcp cli --json trace_path --project home-qqp-projects-qq --function-name retire_change --direction outbound --depth 5 --mode calls --include-tests false
codebase-memory-mcp cli --json trace_path --project home-qqp-projects-qq --function-name qq_engine_error --direction inbound --depth 2 --mode calls --include-tests false
codebase-memory-mcp cli --json trace_path --project home-qqp-projects-qq --function-name assert_equal --direction inbound --depth 2 --mode calls --include-tests true
codebase-memory-mcp cli --json search_graph --project home-qqp-projects-qq --file-pattern '^pilot/' --limit 100
```

The final incumbent call is only a stated proxy: version 0.9.0 exposes no
branch/PR impact tool, and the primary index intentionally describes the base
snapshot, not the pilot branch.

## Raw challenger outcome

`index_status`, `index_codebase`, every `implementation_lookup`, every
`call_graph`, and every `call_graph_path` call returned `isError: true` with:

```text
No embedding-capable provider found. Please authenticate with OpenCode using one of: ollama, github-copilot, openai, google.
```

`pr_impact` returned the same cause wrapped as text (without setting
`isError`):

```text
Error analyzing PR impact: No embedding-capable provider found. Please authenticate with OpenCode using one of: ollama, github-copilot, openai, google.
```

The 0.14.0 tool schema exposes no structural-only switch. Its local README
also states that the package requires an embedding provider. Because the work
order forbids configuring one, the pilot did not bypass this gate.

## Per-question comparison

Ratings mean: **correct** matches direct source inspection; **partial** omits a
material part; **wrong** returns an answer contradicted by source;
**cannot-answer** explicitly fails or has no equivalent capability.

| ID | Challenger answer and rating | Incumbent answer and rating | Source check |
|---|---|---|---|
| A1 | Provider error — **cannot-answer** | Found `qq_resolve_bin` at `bin/lib/qq-bin.sh:6-66`; connected `qq_bin_main` — **correct** | Definition and direct-execution guard are at lines 6–82. |
| A2 | Provider error — **cannot-answer** | Found `qq_engine_finish` at `bin/lib/qq-engine.sh:24-48` and its three wrapper callers — **correct** | Lines 24–63 contain the emitter and wrappers. |
| A3 | Provider error for both names — **cannot-answer** | Both searches returned zero nodes even though the functions exist — **wrong** | `bin/qq-change:110-545` defines and dispatches both. |
| D1 | Provider error — **cannot-answer** | Outbound trace from `qq_engine_init` found `qq_resolve_bin` at hop 1 (and external `command` at hop 2) — **correct** | Direct call is `bin/lib/qq-engine.sh:13`. |
| D2 | Provider error — **cannot-answer** | Inbound trace found reusable callers `qq_engine_init` and `qq_bin_main` at hop 1 — **correct** | Calls are at `qq-engine.sh:13` and `qq-bin.sh:73`. |
| D3 | Provider error — **cannot-answer** | Inbound trace found `qq_engine_done`, `qq_engine_refuse`, and `qq_engine_error` — **correct** | Those are the only direct calls at `qq-engine.sh:50-63`. |
| R1 | Provider error — **cannot-answer** | Outbound trace returned `qq_engine_finish` at hop 1 — **correct** | Direct edge at `qq-engine.sh:52`. |
| R2 | Provider error — **cannot-answer** | Explicit `function not found` for `land_change` — **cannot-answer** | Direct success calls at `qq-change:202` and `:218`. |
| R3 | Provider error — **cannot-answer** | Explicit `function not found` for `retire_change` — **cannot-answer** | Multiple direct success calls, including `qq-change:539`. |
| I1 | Provider error — **cannot-answer** | Returned an empty caller list — **wrong** | Five extensionless production entrypoints directly invoke the helper. |
| I2 | Provider error — **cannot-answer** | Depth-2 test trace covered all ten scripts, including `test-qq-claude-guard.sh` through `assert_result` — **correct** | Direct `rg` inspection of `tests/*.sh` confirms the ten-script set. |
| I3 | Provider error wrapped by `pr_impact` — **cannot-answer** | No branch-impact primitive; base-index `pilot/` search returned zero — **cannot-answer** | The Change diff is confined to `pilot/`, so production call-graph impact is none. |

## Aggregate correctness

| Class | Challenger | Incumbent |
|---|---|---|
| Architecture (3) | 0 correct, 3 cannot-answer | 2 correct, 1 wrong |
| Dependency (3) | 0 correct, 3 cannot-answer | 3 correct |
| Route (3) | 0 correct, 3 cannot-answer | 1 correct, 2 cannot-answer |
| Impact (3) | 0 correct, 3 cannot-answer | 1 correct, 1 wrong, 1 cannot-answer |
| **Total (12)** | **0 correct, 12 cannot-answer** | **7 correct, 2 wrong, 3 cannot-answer** |

## Coverage and interpretation limits

- This run measures the challenger's usability under the settled no-provider
  condition, not its graph accuracy after a provider-backed index. That is the
  relevant replacement condition for this ticket.
- The challenger's compiled defaults include `**/*.{sh,bash,zsh}` but not
  extensionless files. Because indexing never began, likely omission of
  `bin/qq-*` is a source-inspected risk, not a live challenger result.
- The incumbent's extensionless omission is live evidence: it found both
  shared `*.sh` libraries but missed `land_change`, `retire_change`, and all
  production callers of `qq_engine_error`.
- `pr_impact` could not inspect even a pilot-only branch without provider
  discovery, while the incumbent exposes no equivalent branch-level tool.
- No second permanent index was created: `.codebase-index/` remained absent,
  and its required local exclusion is in Git metadata.

The proposed disposition is recorded separately in
`pilot/proposed-verdict.md`; it remains for the operator to accept or reject.
