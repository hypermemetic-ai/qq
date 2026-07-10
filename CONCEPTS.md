# Concepts

Read this glossary before every work item. These definitions are qq's shared
language; use them consistently in reasoning, conversation, code, Tasks, and
documentation. `compound` keeps the glossary aligned as vocabulary changes.

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

**GitHub Flow** — The delivery path from branch through pull request and final
Checks to operator merge and automatic branch deletion.

**green** — A unit of work whose applicable Checks pass with evidence that they
observed the intended subject.

**fresh-context independence** — The review property created when a reviewer
derives findings from the Change and its intent without inheriting the author's
working context or conclusions.

**agent messaging** — Direct communication among agents through herdr's list,
send, read, and wait operations, used whenever coordination helps.

**silent failure** — A command that succeeds or produces plausible output while
answering a different question from the one intended.

**refuse, don't sanitise** — Reject unsafe or malformed input instead of
rewriting it into a different value and proceeding as though it were valid.

**reproduce before you fix** — Establish an observation that fails on the
unfixed behavior and passes after the fix; a Check that passes in both states
has not verified the repair.
