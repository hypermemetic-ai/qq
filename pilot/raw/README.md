# T-108 raw tool responses

- Challenger: `opencode-codebase-index` 0.14.0
- Incumbent: `codebase-memory-mcp` 0.9.0
- Incumbent project: `home-qqp-projects-qq`
- Comparison base SHA: `03f642c7431b1f37f6fa520602a56bed78e9aa87`

These files were regenerated from the worktree root. Each JSON envelope records
the process `exit_status` and the full parsed JSON response body. The version
call has a `response_text` field because its native response is plain text.
The incumbent project-metadata file contains the exact selected
`home-qqp-projects-qq` entry from `list_projects`.

No embedding provider was configured, no semantic tool was called, and
`.codebase-index/` remained absent after capture.

## Challenger

| Corpus ID | Raw response | Exact invocation | Exit |
|---|---|---|---|
| setup | [`challenger-tools-list.json`](./challenger-tools-list.json) | `pilot/mcp-driver.sh list` | 0 |
| setup | [`challenger-index-status.json`](./challenger-index-status.json) | `pilot/mcp-driver.sh call index_status '{}'` | 1 |
| setup | [`challenger-index-codebase-force.json`](./challenger-index-codebase-force.json) | `QQ_MCP_TIMEOUT_SECONDS=240 pilot/mcp-driver.sh call index_codebase '{"force":true,"verbose":true}'` | 1 |
| A1 | [`challenger-a1-implementation-qq-resolve-bin.json`](./challenger-a1-implementation-qq-resolve-bin.json) | `pilot/mcp-driver.sh call implementation_lookup '{"query":"qq_resolve_bin","limit":5}'` | 1 |
| A2 | [`challenger-a2-implementation-qq-engine-finish.json`](./challenger-a2-implementation-qq-engine-finish.json) | `pilot/mcp-driver.sh call implementation_lookup '{"query":"qq_engine_finish","limit":5}'` | 1 |
| A3 | [`challenger-a3-implementation-land-change.json`](./challenger-a3-implementation-land-change.json) | `pilot/mcp-driver.sh call implementation_lookup '{"query":"land_change","limit":5}'` | 1 |
| A3 | [`challenger-a3-implementation-retire-change.json`](./challenger-a3-implementation-retire-change.json) | `pilot/mcp-driver.sh call implementation_lookup '{"query":"retire_change","limit":5}'` | 1 |
| D1 | [`challenger-d1-call-graph-qq-engine-init.json`](./challenger-d1-call-graph-qq-engine-init.json) | `pilot/mcp-driver.sh call call_graph '{"name":"qq_engine_init","direction":"callers"}'` | 1 |
| D2 | [`challenger-d2-call-graph-qq-resolve-bin.json`](./challenger-d2-call-graph-qq-resolve-bin.json) | `pilot/mcp-driver.sh call call_graph '{"name":"qq_resolve_bin","direction":"callers"}'` | 1 |
| D3 | [`challenger-d3-call-graph-qq-engine-finish.json`](./challenger-d3-call-graph-qq-engine-finish.json) | `pilot/mcp-driver.sh call call_graph '{"name":"qq_engine_finish","direction":"callers"}'` | 1 |
| R1 | [`challenger-r1-call-path-done-finish.json`](./challenger-r1-call-path-done-finish.json) | `pilot/mcp-driver.sh call call_graph_path '{"from":"qq_engine_done","to":"qq_engine_finish","maxDepth":3}'` | 1 |
| R2 | [`challenger-r2-call-path-land-done.json`](./challenger-r2-call-path-land-done.json) | `pilot/mcp-driver.sh call call_graph_path '{"from":"land_change","to":"qq_engine_done","maxDepth":5}'` | 1 |
| R3 | [`challenger-r3-call-path-retire-done.json`](./challenger-r3-call-path-retire-done.json) | `pilot/mcp-driver.sh call call_graph_path '{"from":"retire_change","to":"qq_engine_done","maxDepth":5}'` | 1 |
| I1 | [`challenger-i1-call-graph-qq-engine-error.json`](./challenger-i1-call-graph-qq-engine-error.json) | `pilot/mcp-driver.sh call call_graph '{"name":"qq_engine_error","direction":"callers"}'` | 1 |
| I2 | [`challenger-i2-call-graph-assert-equal.json`](./challenger-i2-call-graph-assert-equal.json) | `pilot/mcp-driver.sh call call_graph '{"name":"assert_equal","direction":"callers"}'` | 1 |
| I3 | [`challenger-i3-pr-impact.json`](./challenger-i3-pr-impact.json) | `pilot/mcp-driver.sh call pr_impact '{"branch":"feat/t108-index","maxDepth":5,"direction":"both","checkConflicts":false}'` | 0 |

## Incumbent

| Corpus ID | Raw response | Exact invocation | Exit |
|---|---|---|---|
| metadata | [`incumbent-version.json`](./incumbent-version.json) | `codebase-memory-mcp --version` | 0 |
| metadata | [`incumbent-project-metadata.json`](./incumbent-project-metadata.json) | `codebase-memory-mcp cli list_projects` | 0 |
| metadata | [`incumbent-architecture-root.json`](./incumbent-architecture-root.json) | `codebase-memory-mcp cli --json get_architecture --project home-qqp-projects-qq --aspects overview` | 0 |
| metadata | [`incumbent-architecture-bin.json`](./incumbent-architecture-bin.json) | `codebase-memory-mcp cli --json get_architecture --project home-qqp-projects-qq --path bin --aspects overview` | 0 |
| A1 | [`incumbent-a1-search-qq-resolve-bin.json`](./incumbent-a1-search-qq-resolve-bin.json) | `codebase-memory-mcp cli --json search_graph --project home-qqp-projects-qq --name-pattern '^qq_resolve_bin$' --include-connected true --limit 100` | 0 |
| A1 | [`incumbent-a1-snippet-qq-resolve-bin.json`](./incumbent-a1-snippet-qq-resolve-bin.json) | `codebase-memory-mcp cli --json get_code_snippet --project home-qqp-projects-qq --qualified-name home-qqp-projects-qq.bin.lib.qq-bin.qq_resolve_bin --include-neighbors false` | 0 |
| A2 | [`incumbent-a2-search-qq-engine-finish.json`](./incumbent-a2-search-qq-engine-finish.json) | `codebase-memory-mcp cli --json search_graph --project home-qqp-projects-qq --name-pattern '^qq_engine_finish$' --include-connected true --limit 100` | 0 |
| A2 | [`incumbent-a2-snippet-qq-engine-finish.json`](./incumbent-a2-snippet-qq-engine-finish.json) | `codebase-memory-mcp cli --json get_code_snippet --project home-qqp-projects-qq --qualified-name home-qqp-projects-qq.bin.lib.qq-engine.qq_engine_finish --include-neighbors false` | 0 |
| A3 | [`incumbent-a3-search-land-change.json`](./incumbent-a3-search-land-change.json) | `codebase-memory-mcp cli --json search_graph --project home-qqp-projects-qq --name-pattern '^land_change$' --include-connected true --limit 100` | 0 |
| A3 | [`incumbent-a3-search-retire-change.json`](./incumbent-a3-search-retire-change.json) | `codebase-memory-mcp cli --json search_graph --project home-qqp-projects-qq --name-pattern '^retire_change$' --include-connected true --limit 100` | 0 |
| D1 | [`incumbent-d1-trace-qq-engine-init.json`](./incumbent-d1-trace-qq-engine-init.json) | `codebase-memory-mcp cli --json trace_path --project home-qqp-projects-qq --function-name qq_engine_init --direction outbound --depth 3 --mode calls --include-tests false` | 0 |
| D2 | [`incumbent-d2-trace-qq-resolve-bin.json`](./incumbent-d2-trace-qq-resolve-bin.json) | `codebase-memory-mcp cli --json trace_path --project home-qqp-projects-qq --function-name qq_resolve_bin --direction inbound --depth 3 --mode calls --include-tests false` | 0 |
| D3 | [`incumbent-d3-trace-qq-engine-finish.json`](./incumbent-d3-trace-qq-engine-finish.json) | `codebase-memory-mcp cli --json trace_path --project home-qqp-projects-qq --function-name qq_engine_finish --direction inbound --depth 3 --mode calls --include-tests false` | 0 |
| R1 | [`incumbent-r1-trace-qq-engine-done.json`](./incumbent-r1-trace-qq-engine-done.json) | `codebase-memory-mcp cli --json trace_path --project home-qqp-projects-qq --function-name qq_engine_done --direction outbound --depth 3 --mode calls --include-tests false` | 0 |
| R2 | [`incumbent-r2-trace-land-change.json`](./incumbent-r2-trace-land-change.json) | `codebase-memory-mcp cli --json trace_path --project home-qqp-projects-qq --function-name land_change --direction outbound --depth 5 --mode calls --include-tests false` | 0 |
| R3 | [`incumbent-r3-trace-retire-change.json`](./incumbent-r3-trace-retire-change.json) | `codebase-memory-mcp cli --json trace_path --project home-qqp-projects-qq --function-name retire_change --direction outbound --depth 5 --mode calls --include-tests false` | 0 |
| I1 | [`incumbent-i1-trace-qq-engine-error.json`](./incumbent-i1-trace-qq-engine-error.json) | `codebase-memory-mcp cli --json trace_path --project home-qqp-projects-qq --function-name qq_engine_error --direction inbound --depth 2 --mode calls --include-tests false` | 0 |
| I2 | [`incumbent-i2-trace-assert-equal.json`](./incumbent-i2-trace-assert-equal.json) | `codebase-memory-mcp cli --json trace_path --project home-qqp-projects-qq --function-name assert_equal --direction inbound --depth 2 --mode calls --include-tests true` | 0 |
| I3 | [`incumbent-i3-search-pilot.json`](./incumbent-i3-search-pilot.json) | `codebase-memory-mcp cli --json search_graph --project home-qqp-projects-qq --file-pattern '^pilot/' --limit 100` | 0 |
