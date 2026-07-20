# T-94 pilot findings

## Migration verdict

**ADOPT.** Rerun 2026-07-20 (T-120) on a pi-hosted shell with no outer Codex
sandbox: all nine required checks PASS, with the same independent boundary
attribution. The 2026-07-19 HOLD was a substrate-nesting artifact: every
failure and every inconclusive subcase attributed to the outer Codex sandbox,
and none of them reproduce outside it. The HOLD's stated release condition —
reproduction outside outer Codex confinement followed by a full nine-check
rerun — is met. **Recommendation: remove T-95's park note**; its stated release
conditions (reproduction outside codex confinement, full nine-check rerun)
are satisfied by this run. The disposition of T-95 itself — status, sequencing
of the migration Change — stays with the operator and T-95's owning session.

Fresh observations from the 2026-07-20 run:

- **Check 2 (was FAIL):** with the implementer policy's nonempty
  `allowWrite`, the statically linked child writes the assigned worktree, both
  Git administrative roots, and the runtime root; the decoy outside every
  allowed root stays denied. The real-Pi smoke starts the installed Pi 0.80.10
  inside the wrapper/Landstrip boundary to a clean exit — the codex-confined
  libc-load failure does not reproduce.
- **Check 4 (was FAIL):** composed read-only reviewer delivery succeeds
  through the wrapper with only the canonical per-run capture path allowed.
  Parent-boundary schema validation still independently rejects malformed,
  missing, empty, and commits-less fixtures.
- **Check 1 (was INCONCLUSIVE-UNDER-SUBSTRATE):** every confinement
  observation is attributable; no parent control is blocked by an outer
  sandbox and the loopback control is available.
- Checks 3 and 5–9 pass unchanged, including the deliberately retained
  bundled-default leak observation in Check 3.

Still not observed, unchanged from the original run: Landstrip's actual
`PLATFORM_UNSUPPORTED` branch (the wrapper response is verified through the
documented terminal record shape on this supported host), and a real
model-credentialed delegation — the matrix uses a deterministic mock child.
Model identity under migration is T-95's own acceptance criterion and stays
there.

Checker honesty fix riding this rerun: Check 2's boundary narrative,
diagnosis, and unresolved-risk prose were hardcoded from the codex-confined
failing run and rendered false statements on a PASS. After review found
successive corners where branch prose could disagree with the computed
verdict, the narrative layer was restructured per the operator's circuit-
breaker call: the boundary is static rule text, the verdict is computed from
explicit `definiteFailures`/`incompleteAttribution` predicate lists, and the
diagnosis renders exactly those lists — narrative can no longer drift from
the verdict by construction. Check 1's egress prose now states only what was
attempted and observed. The matrix header records its own date and run
substrate. The 2026-07-19 narrative below is preserved as history.

## 2026-07-19 codex-confined run (historical)

**HOLD (superseded).** Six required checks pass, Check 1 is
inconclusive-under-substrate, and Checks 2 and 4 fail — all under an outer
Codex workspace-write sandbox.

Landstrip 0.17.30 nested beneath the outer Codex sandbox denied its own
explicit `allowWrite` roots: parent controls could write the assigned
worktree and runtime root, while a statically linked child received `EPERM`
on both explicitly allowed roots, and a real Pi child exited before startup
because its dynamic loader could not open libc. Git-administrative parent
controls returned outer-substrate `EROFS`, leaving those subcases
unattributed.

Check 1 evaluated every filesystem target separately from network. The
repository, runtime, and temporary-escape controls succeeded in the parent
and were denied in both read-only children, passing with Landstrip
attribution. The Git-administrative controls returned `EROFS`, and Codex
rejected the loopback listener itself, leaving those subcases inconclusive.
The verdict combiner carries an explicit regression guard showing that an
observed child write forces FAIL rather than being masked by an inconclusive
network control.

The Completion Envelope schema requires the whole qq contract: status,
summary, commits, files changed, Checks, contestable decisions, open
questions, unresolved risks, branch, and worktree. At the pi-subagents parent
boundary a complete fixture passes and malformed/missing/empty fixtures fail.
Composed delivery failed under the nested substrate: the bounded wrapper
grants a reviewer only its canonical per-run capture file, yet the statically
linked child's capture `open()` returned `EPERM`.

The documented launch exports both `PI_SUBAGENT_PI_BINARY` and
`PI_SUBAGENT_EXTRA_AGENT_DIRS`. Real discovery resolves all three pilot
manifests, and the discovered reviewer launches with project context, skills,
and undeclared extensions disabled. The control without the manifest variable
selects the bundled reviewer, which inherits project context and has
edit/write tools, and discovers no implementer. This bundled-default leak
remains visible in Check 3 evidence.

The wrapper retains the role boundary, fail-closed preflights, resume
containment, direct native Landstrip invocation, offline Pi execution, and
the outer GNU timeout. A Linux subreaper between timeout and Landstrip adopts
and terminates deliberately double-forked descendants. Check 6 requires Pi,
Landstrip, timeout, tool, MCP, and orphan identities in every signal case
before cleanup can pass.

## Proposed owner-side decision record (landed 2026-07-19)

Kill the Herdr delegation-status machinery outright: stage tokens, pane
presence, and delegate notifications. Accept the loss of the
out-of-transcript blocked-delegate ping. Cockpit, topology scripts, and agent
messaging survive. Recorded as the outcome of the asked-and-answered
alignment exchange on 2026-07-19, including the operator's statement: "kill
the herdr machinery. I'm confident." (Minted as decision-3 in the T-94
Change; the detail-file protocol it initially kept was later deleted under
T-116.)
