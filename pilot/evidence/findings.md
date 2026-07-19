# T-94 pilot findings

## Migration verdict

**HOLD.** Seven required checks pass, Check 1 is
inconclusive-under-substrate for its network subcase, and Check 2 fails.
Migration from qq's current delegation substrate must not proceed while any
required check fails or cannot be attributed.

The decisive blocker is Landstrip 0.17.30's behavior when nested beneath the
outer Codex sandbox. The parent process can write every intended worktree,
Git-administrative, and runtime target. After crossing native Landstrip with
the implementer policy's nonempty `allowWrite`, a statically linked child is
denied on every explicitly allowed root. A real Pi child also exits before
startup because its dynamic loader cannot open libc. This prevents the pilot
from demonstrating usable implementer authority on the assigned substrate.

Reviewer/researcher filesystem denials are attributable to Landstrip because
the same targets succeed in parent controls. Network confinement is not: the
outer Codex sandbox rejects even the loopback listener used as the control,
and the work order prohibits external egress. That subcase remains
inconclusive rather than being credited as a pass.

The wrapper retains the role boundary, fail-closed preflights, resume
containment, direct native Landstrip invocation, offline Pi execution, and the
outer GNU timeout. A Linux subreaper between timeout and Landstrip is required
to adopt and terminate deliberately double-forked descendants. Landstrip's
trap-file-descriptor mode is not enabled because, on this nested substrate,
it also prevents dynamically linked children from loading libc.

## Evidence needed to release the hold

Reproduce the exact implementer policy with a dynamically linked Pi and the
static write probe outside the outer Codex sandbox, or use a Landstrip release
that fixes the nested nonempty-`allowWrite` behavior. Then rerun all nine
checks on a substrate where the loopback control is available, preserving the
same boundary-attribution rules. The actual native `PLATFORM_UNSUPPORTED`
branch also remains unobservable on this supported host; this pilot verifies
the wrapper response with the documented terminal record shape.

## Proposed owner-side decision record

Kill the Herdr delegation-status machinery outright: stage tokens, pane
presence, and delegate notifications. Keep the detail-file protocol. Accept
the loss of the out-of-transcript blocked-delegate ping. Cockpit, topology
scripts, and agent messaging survive. Record this as the outcome of the
asked-and-answered alignment exchange on 2026-07-19, including the operator's
statement: "kill the herdr machinery. I'm confident."
