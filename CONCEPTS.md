# Concepts

Read this glossary before every work item. These definitions are the
canonical shared language for qq and every linked Repository; use them
consistently in reasoning, conversation, code, Tasks, and documentation. A
linked Repository appends its own vocabulary in a root `CONCEPTS.local.md`
and never redefines a canonical term. `compound` keeps the glossary aligned
as vocabulary changes.

**Actor** — The operator or a replaceable agent participating in the work. The
operator owns intent and judgment; agents investigate, recommend, execute, and
verify.

**Repository** — The Git history and GitHub project that own the system's files
and delivery state.

**Task** — Backlog.md's durable record of operator intent, acceptance criteria,
dependencies, and work status.

**Change** — A branch, its commits, and its pull request considered as one unit
of delivery.

**Check** — A reproducible observation that provides evidence about a Change,
locally or through GitHub Actions.

**Skill** — A stateless capability invoked when its trigger matches the work.

**Knowledge item** — A durable artifact that preserves system description,
research, an idea, a reusable lesson, or shared vocabulary.

**managed Backlog markdown** — Markdown owned by Backlog and edited only
through the Backlog CLI. When associating documents with a Task, `--doc`
replaces the complete list; it does not append to it.

**decision ledger** — The block in an owning Task's Description listing every
consequential decision its Change embeds, each citing the disposition that
settled it — a Backlog decision record, an approved Task, an
asked-and-answered alignment exchange, or an explicit operator opt-out
recorded verbatim — or the explicit entry `none`. An
uncited decision is open; deliver-change refuses to bind a Change without a
ledger. Dispositions do not transfer: each covers exactly the decision it
settled, on the surface it settled it for.

**alignment brief** — The default operator-alignment step for a genuinely new
work item: a plain-language statement of the intended work and every embedded
consequential decision with its citation or a recommendation, closed by one
approval question. All context that bears on each decision precedes the
options; a full grilling interview follows only when a decision is genuinely
open.

**GitHub Flow** — The delivery path from branch through pull request and final
Checks to operator merge and automatic branch deletion.

**project home** — A Repository's persistent Herdr workspace bound to its sole
primary `main` checkout. Its dedicated Backlog-board tab, operator-created
general tabs, and the accountable session dispatching every Change remain at
this level; Change checkouts and delegated agents do not.

**work session** — A linked-worktree Herdr workspace natively grouped beneath
its Repository's project home. Its **change label** is an
agent-chosen, operator-renameable recognizer matching `[A-Za-z0-9-]{1,15}`,
unique among sibling work sessions and independent of branch or Task
cardinality. One work
session owns one worktree, its root placeholder pane, and the delegated agents
working on its Change until the operator explicitly retires it; the
accountable session dispatches from the project home.

**green** — A unit of work whose applicable Checks pass with evidence that they
observed the intended subject.

**fresh-context independence** — The review property created when a reviewer
derives findings from the Change and its intent without inheriting the author's
working context or conclusions.

**agent messaging** — Direct live-agent coordination through pi-intercom plus
operator-visible herdr notifications outside transcripts. It does not start,
own, or retire agents.

**work order** — One complete work-order brief per delegated ticket: the
delegate's complete orientation and the plan bound, carrying the ticket and its
acceptance criteria, exact orientation paths and reconciliation facts the owner
already verified, hard constraints, the per-ticket commit protocol, the exact
Checks to run, and the required completion envelope.

**completion envelope** — Every delegate's final message must report per-ticket
status, commits, files changed, Checks run with results, decisions taken that
the operator might contest, open questions, unresolved risks, and the branch
and worktree that contain the work. The owner must verify every claim against
the tree; an envelope claim is not yet evidence.

**silent failure** — A command that succeeds or produces plausible output while
answering a different question from the one intended.

**drift-net** — A deliberately approximate guard that intercepts a well-meaning
Actor's accidental violation of a mandate. It carries a declared threat model
whose out-of-scope finding classes are declined rather than fixed; it is not a
security boundary, and the invariant's exact enforcement lives at the resource
that owns it.

**smallest resulting system** — "Smallest remedy" measures the post-Change
system, not the diff; diff size only breaks ties. Shrinking or preserving state
space inside the agreed boundary is pre-authorized, proceeds without
realignment, and appears in the completion envelope; boundary changes align.

**fence-or-shrink** — A finding fences only at a trust boundary cited in the
Change brief's threat model; without one, shrink the state space admitting the
illegal state. Classify by declared-boundary lookup, never origin archaeology.
An interior guard surviving the mechanical same-fix-smaller test stands,
labeled.

**refuse, don't sanitise** — Reject unsafe or malformed input instead of
rewriting it into a different value and proceeding as though it were valid.

**reproduce before you fix** — Establish an observation that fails on the
unfixed behavior and passes after the fix; a Check that passes in both states
has not verified the repair.

**by construction** — A property that holds because the system's structure
makes the failure impossible, not because a procedure checks or repairs it.
What holds by construction needs no reconciler and cannot silently drift.

**mount, don't mirror** — Consume a set through a single link to its root
rather than through per-member copies or links. Mirroring makes membership
itself reconcilable state whose reconciler must be remembered; mounting makes
every addition, removal, and edit live by construction.
