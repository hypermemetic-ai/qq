# T-94 pilot findings

## Migration verdict

**HOLD.** Six required checks pass, Check 1 is
inconclusive-under-substrate, and Checks 2 and 4 fail. Migration from qq's
current delegation substrate must not proceed while any required check fails
or cannot be attributed.

One decisive blocker is Landstrip 0.17.30's behavior when nested beneath the
outer Codex sandbox. In the rework run, parent controls can write the assigned
worktree and runtime root. After crossing native Landstrip with the
implementer policy's nonempty `allowWrite`, a statically linked child receives
`EPERM` on both explicitly allowed roots. A real Pi child also exits before
startup because its dynamic loader cannot open libc. Git-administrative parent
controls return outer-substrate `EROFS` in this run, so those two target
subcases remain unattributed; they are not needed to establish the worktree
and runtime failures.

Check 1 now evaluates every filesystem target separately from network. The
repository, runtime, and temporary-escape controls succeed in the parent and
are denied in both read-only children, so those subcases pass with Landstrip
attribution. The Git-administrative controls return `EROFS`, and Codex rejects
the loopback listener itself, so those subcases are inconclusive. The verdict
combiner has an explicit regression guard showing that an observed child write
would force FAIL rather than being masked by an inconclusive network control.

The Completion Envelope schema now requires the whole qq contract: status,
summary, commits, files changed, Checks, contestable decisions, open questions,
unresolved risks, branch, and worktree. At the pi-subagents parent boundary a
complete fixture passes, malformed/missing/empty fixtures fail, and a
commits-less fixture specifically fails. Composed delivery still fails. The
bounded wrapper fix grants a reviewer only its canonical per-run capture file;
the recorded policy contains that exact `allowWrite`, yet the statically linked
child's capture `open()` returns `EPERM`. Thus Check 4 records parent validation
PASS and composed read-only delivery DEFECT, producing an honest overall FAIL.

The documented launch now exports both `PI_SUBAGENT_PI_BINARY` and
`PI_SUBAGENT_EXTRA_AGENT_DIRS`. Real discovery resolves all three pilot
manifests and the discovered reviewer launches with project context, skills,
and undeclared extensions disabled. The control without the manifest variable
selects the bundled reviewer, which inherits project context and has edit/write
tools, and discovers no implementer. This bundled-default leak remains visible
in Check 3 evidence.

The wrapper retains the role boundary, fail-closed preflights, resume
containment, direct native Landstrip invocation, offline Pi execution, and the
outer GNU timeout. A Linux subreaper between timeout and Landstrip is required
to adopt and terminate deliberately double-forked descendants. Check 6 now
requires Pi, Landstrip, timeout, tool, MCP, and orphan identities in every
signal case before cleanup can pass. Landstrip's trap-file-descriptor mode is
not enabled because, on this nested substrate, it also prevents dynamically
linked children from loading libc.

## Evidence needed to release the hold

Reproduce both the implementer policy and the read-only capture-only policy
outside the outer Codex sandbox, using the static probes and a dynamically
linked Pi, or use a Landstrip release that fixes the nested nonempty-
`allowWrite` behavior. Then rerun all nine checks on a substrate where Git
administrative parent controls and the loopback control are writable/available,
preserving the same independent boundary attribution. The actual native
`PLATFORM_UNSUPPORTED` branch also remains unobservable on this supported host;
this pilot verifies the wrapper response with the documented terminal record
shape.

## Proposed owner-side decision record

Kill the Herdr delegation-status machinery outright: stage tokens, pane
presence, and delegate notifications. Keep the detail-file protocol. Accept
the loss of the out-of-transcript blocked-delegate ping. Cockpit, topology
scripts, and agent messaging survive. Record this as the outcome of the
asked-and-answered alignment exchange on 2026-07-19, including the operator's
statement: "kill the herdr machinery. I'm confident."
