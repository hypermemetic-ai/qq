# Concepts

Read this glossary before every work item. These definitions are the
canonical shared language for every Repository on this operator-owned Pi
installation; use them consistently in reasoning, conversation, code, Tasks,
and documentation. A root `CONCEPTS.local.md` may append its own Repository vocabulary
but never redefine a canonical term. Keep this glossary aligned as vocabulary
changes.

**Actor** — The operator or a replaceable agent participating in the work. The
operator owns intent and judgment; agents investigate, recommend, execute, and
verify.

**Repository** — The Git history and GitHub project that own the system's files
and delivery state.

**Task** — Backlog.md's durable record of operator intent, acceptance criteria,
dependencies, and work status.

**Unaligned** — Default-deny; execution unauthorized.

**Aligned** — Sole execution authorization.

**Active** — Requires one exact accountable Change Owner.

Completion/archive remove a Task from the active collection, never add a status.
`To Do`/`In Progress`/`Done` are migration compatibility behind existing rails,
not independent pickup authority. Unknowns fail closed.

**Task umbrella** — A parent Task grouping one outcome, used only when that
outcome needs multiple independently deliverable Changes. Its direct children
are membership, not sequence or prerequisite claims, and their decimal
suffixes are stable, non-ordinal identities.

**Task child** — One independently deliverable, coherent Change under an
umbrella. qq supports one direct child level only; smaller steps stay in that
child's plan or checklist. Parentage records membership; `depends_on` records
genuine prerequisites only. No durable `parallel_with` relation exists. An
external child stays in its owning Repository under its native Task identity,
linked by a qualified `owner/repository:<Task-ID>` coordinate.

**ready frontier** — Incomplete Task children whose genuine prerequisites are
satisfied. Frontier membership permits consideration for overlap; accountable
ownership and conflict review determines actual concurrency.

**Change** — A branch, its commits, and its pull request considered as one unit
of delivery. It has two delivery states: **created locally** until finalized,
and **mergeable now** only when finalized and green. Never call a Change bare
"mergeable".

**Check** — A reproducible observation that provides evidence about a Change,
locally or through GitHub Actions.

**Skill** — A stateless capability invoked when its trigger matches the work.

**Knowledge item** — A durable artifact that preserves system description,
research, an idea, a reusable lesson, or shared vocabulary.

**managed Backlog markdown** — Markdown owned by Backlog and edited only
through the Backlog CLI surface; the two `bin/qq-backlog` wrapper verbs
(`decision update --content`, `doc supersede`) are part of that surface, the
only edits permitted outside the vendor CLI. When associating documents with
a Task, `--doc` replaces the complete list; it does not append to it. When
updating a managed document's body, generate the complete body and pass it once
to `backlog doc update --content`.

**decision ledger** — The block in an owning Task's Description listing every
consequential decision its Change embeds, each citing the disposition that
settled it — a Backlog decision record, an approved Task, an
asked-and-answered alignment exchange, or an explicit operator opt-out
recorded verbatim — or the explicit entry `none`. An
uncited decision is open; deliver-change refuses to bind a Change without a
ledger. Dispositions do not transfer: each covers exactly the decision it
settled, on the surface it settled it for.

**alignment brief** — The default engagement-first operator-alignment step for
genuinely new work: current-state questions come first, and the plan is built
in conversation. It states every embedded consequential decision with its
citation or recommendation, records exactly one answered question card, and
closes with one approval question; generic continuation cannot choose among
consequential options.

**GitHub Flow** — The delivery path from branch through pull request and final
Checks to operator merge and automatic branch deletion.

**project home** — A Repository's persistent Herdr workspace bound to its sole
primary `main` checkout. Its dedicated Backlog-board tab, operator-created
general tabs, and the accountable session dispatching every Change remain at
this level. Change checkouts are plain linked worktrees with no Herdr workspace,
and delegated agents run as headless child processes in the Change worktree.

**green** — A unit of work whose applicable Checks pass with evidence that they
observed the intended subject.

**fresh-context independence** — The review property created when a reviewer
derives findings from the Change and its intent without inheriting the author's
working context or conclusions.

**agent messaging** — Direct live-agent coordination through pi-intercom plus
operator-visible herdr notifications outside transcripts. It does not start,
own, or retire agents.

**work order** — One complete `BRIEF.md` per delegated ticket, written in the
ticket's durable run directory at creation. It carries the delegate's complete
orientation and plan bound: ticket and acceptance criteria, exact orientation
paths and owner-verified reconciliation facts, hard constraints, per-ticket
commit protocol, exact Checks, and required completion envelope. The run
directory owns the ticket's brief, scratch, result, and terminal lifecycle state.

**completion envelope** — The delegate's run-directory `ENVELOPE.md` is its only
result surface. It reports per-ticket status, commits, files changed, Checks and
results, contestable decisions, open questions, unresolved risks, branch, and
worktree. The owner verifies every claim against the tree; an envelope claim is
not yet evidence.

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
