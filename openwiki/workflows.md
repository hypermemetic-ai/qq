# Workflows

## Orient, align, act

Every work item begins with knowledge retrieval before planning:

1. Read `CONCEPTS.md`.
2. If `backlog/config.yml` exists, consult Backlog instructions and search the shared index for matching Tasks, documents, and decisions. Alignment is read-only; create or update Backlog records only after approval and only through the CLI.
3. Read relevant OpenWiki pages and matching Backlog `solutions` documents. Consult `research` documents when a claim depends on them.
4. Use codebase-memory for architecture, dependency, call-path, and impact questions; confirm index freshness and verify important conclusions in source.
5. Run `grilling` to make consequential assumptions and tradeoffs explicit.
6. Invoke every other matching Skill.

If the wiki is absent or stale, inspect Backlog documents and source. Source and fresh Checks are final evidence.

## Task-to-Change delivery

Backlog Tasks preserve intent, acceptance criteria, dependencies, and status. A Change is the branch, commits, and pull request used to deliver that intent.

The expected GitHub Flow is:

1. Create a branch.
2. Implement and verify coherent units.
3. Run independent `code-review` for every non-trivial Change.
4. Resolve confirmed, in-scope findings and rerun affected Checks.
5. Commit only green work and push each green commit.
6. Open a pull request and pass final GitHub Checks.
7. The operator merges; GitHub deletes the branch.
8. Mark the Task Done only after acceptance criteria are verified and the Change has landed.

The current methodology places fresh-context review after implementation but before commit, push, and PR creation.

## Verification and review

A Check must observe the intended subject, not merely exit successfully. Read complete output and guard against **silent failure**—plausible output that answered a different question.

`code-review` prepares repository coordinates, Task intent, scope, and Check evidence for a fresh read-only reviewer without passing the author’s conclusions. The owning agent verifies reported findings. Fixes are limited to regressions introduced by the Change and within agreed scope; discovering a broader issue is evidence, not automatic authorization to expand work.

See [Verification](verification.md) for repository-specific checks and gaps.

## Specialized flows

### Difficult bugs

Use `diagnosing-bugs` when causality is unclear. Establish a discriminating reproducer, separate observations from inference, rank falsifiable hypotheses, and stop at diagnosis unless a fix is authorized. An authorized repair must fail before the fix and pass after it; add a regression Check where practical.

### Research

Use `research` for multi-source, decision-grade questions. A fresh read-only researcher can perform substantial reading, but the owning agent retains judgment and verifies load-bearing citations. Prefer primary sources and preserve one durable Backlog `research` document; attach its document ID to an owning Task rather than duplicating system truth.

### Human acceptance

Use `uat-signoff` after autonomous verification when behavior is visible or subjective. Present one observable check at a time and require explicit owner confirmation. Destructive, monetary, irreversible, or outbound actions still require separate just-in-time authorization.

### Knowledge capture

Use `compound` only after a verified, non-obvious solve with reusable reasoning. Update an existing lesson or create a concise solution record with Symptom, Root cause, Resolution, and Verification. Update `CONCEPTS.md` only for genuinely stable vocabulary.

Use `idea` only for messages beginning with `idea:` or explicit `$idea`; append the supplied text verbatim with a timestamp to the single Backlog `Ideas` document, without interpretation or side effects.

## Documentation update point

OpenWiki maintenance is not a step in this Task-to-Change flow. Ordinary source
agents consume it only; the narrowly triggered `openwiki-maintainer` Skill is
the sole procedural authority.
