# T-94 pilot evidence matrix

Fresh local run: 2026-07-20. Package pins: pi-subagents 0.35.1, pi-landstrip/Landstrip 0.17.30, Pi 0.80.10.
Run substrate: pi-hosted qq accountable session (bash tool); no outer Codex sandbox; kernel 6.17.0-19-generic

Every raw log is normalized for machine paths, process IDs, and timestamps; runtime originals remain in the ephemeral `/tmp` run directory during execution. No Herdr stage bridge or reporting path was invoked.

| # | Required pilot check | Verdict | Boundary attribution | Evidence |
|---:|---|---|---|---|
| 1 | Reviewer/researcher read-only confinement | **PASS** | Filesystem targets and network confinement are evaluated independently. Each writable parent control attributes its matching child denial to native Landstrip; a read-only parent control is inconclusive, while any observed child write or missing confinement observation makes the row FAIL regardless of the network result. | [raw](raw/check-01.log) |
| 2 | Implementer workspace/Git write confinement | **PASS** | Per-target parent controls separate outer-substrate restrictions from Landstrip. Any definite failure — a missing child observation, an attributable allowed-root denial, a decoy write, or a failed real-Pi smoke — is FAIL; unavailable parent controls without a definite failure are INCONCLUSIVE; otherwise PASS. | [raw](raw/check-02.log) |
| 3 | No implicit skill/project-context/extension leakage | **PASS** | Real pi-subagents discovery is run first without and then with the two documented launch variables. Only the discovered pilot reviewer is launched through the wrapper; its child record verifies the resulting argument/environment boundary. Bundled-default behavior is retained as a separate observed leak, not mistaken for pilot isolation. | [raw](raw/check-03.log) |
| 4 | Strict Completion Envelope validation and composed delivery | **PASS** | Parent-boundary schema validation and composed reviewer delivery are reported separately. Direct mock runs prove the staged validator's behavior; composed runs cross the wrapper with a read-only policy granting only that run's capture path. A parent PASS cannot mask a composed delivery defect. | [raw](raw/check-04.log) |
| 5 | Outer timeout tears down the complete descendant tree | **PASS** | The wrapper's GNU timeout is outermost, the qq subreaper owns native Landstrip beneath it, and a static mock Pi creates named tool, MCP, and double-forked orphan descendants. Only that observed descendant tree is inspected or cleaned. | [raw](raw/check-05.log) |
| 6 | SIGINT/SIGTERM/pane-close signal cleanup | **PASS** | Each signal case must announce and expose Pi, Landstrip, timeout, tool, MCP, and orphan descendants before cleanup can pass. Signals target only that dedicated timeout leader. SIGHUP simulates Herdr pane closure; no live Herdr pane or unrelated PID is touched. | [raw](raw/check-06.log) |
| 7 | Auditable foreground/background artifacts | **PASS** | Pi-subagents owns foreground and async lifecycle artifacts; the wrapper event log independently binds each runId to the role-selected Landstrip policy identity. Child stderr supplies policy diagnostics without Herdr machinery. | [raw](raw/check-07.log) |
| 8 | Resume cwd containment | **PASS** | Pi-subagents supplies the persisted session path; before Landstrip or Pi starts, the wrapper canonicalizes the launch cwd's Git root and requires it to equal the wrapper's assigned worktree. | [raw](raw/check-08.log) |
| 9 | Landstrip absence/unsupported fail closed | **PASS** | The absence path is the wrapper's executable preflight. The unsupported path uses a deterministic launcher with Landstrip's documented PLATFORM_UNSUPPORTED terminal record and proves the wrapper never falls back to Pi; the installed native binary is separately smoke-tested on this supported kernel. | [raw](raw/check-09.log) |

Overall: **PASS**. Failed checks: none. Inconclusive-under-substrate checks: none.

The migration verdict is HOLD whenever any required check fails or is inconclusive. Filesystem/network and parent-validator/composed-delivery subcases are evaluated independently so a weaker result cannot mask a failure.
