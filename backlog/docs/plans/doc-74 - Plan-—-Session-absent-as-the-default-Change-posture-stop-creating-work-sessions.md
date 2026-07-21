---
id: doc-74
title: >-
  Plan — Session-absent as the default Change posture (stop creating work
  sessions)
type: specification
created_date: '2026-07-21 05:58'
---


Approved by the operator in chat 2026-07-21 (asked-and-answered exchange; card: Chat approval stands). Owning Task: t-129. Source scratch: .pi/plans/2026-07-21-session-absent-default-posture.md (not captured per convention).


## Intended outcome

qq stops creating per-Change Herdr work-session workspaces. A Change is born
as a plain linked worktree; the session-absent retire path (already
implemented in `qq-change`) becomes the default posture. The empty
placeholder panes under the qq space never come into existence, so the
alt+up/down traversal pain disappears by construction — with no keybinding
changes and no herdr-side requests.

## Decisions and dispositions

- **D1 — Stop creating work sessions; session-absent is the default Change
  posture.** Operator choice, this alignment exchange (2026-07-21,
  asked-and-answered structured card: Direction → "Stop creating work
  sessions"). Supersedes the work-session-creation half of the T-70
  convention. T-70's other half — accountable session always dispatches from
  the project home, never migrates — **stands unchanged**.
- **D2 — Session-migration idea abandoned.** Operator verbatim, this
  exchange: "I abandon the movement idea. it doesn't work in practice, like
  with multiple subagents, each in a different worktree (this should be how
  it works), can't move to multiple worktrees." The multi-worktree delegate
  fan-out is affirmed as the correct model and is untouched.
- **D3 — No alt+up/down rebind, no herdr-native skip request.** Moot by
  construction under D1 (skip-rule card answered "-"): with no worktree
  entries under the space, there is nothing to skip.
- **D4 — Engines stay byte-identical.** `bin/qq-change` keeps both retire
  modes; the placeholder-pane mode remains for legacy work sessions (T-122's
  parked w71) until none remain, and `bin/qq-reap` already tolerates absent
  placeholder evidence. Owner recommendation from source evidence
  (`bin/qq-change:304` session-absent branch; `bin/qq-reap` placeholder-
  optional census), within D1's scope — the smallest change that achieves
  the outcome.
- **D5 — Accepted costs** (named in the option card the operator selected):
  `qqcd` focused-worktree jumps die by absence (it falls back to `QQ_HOME`
  by construction); the CONCEPTS "work session" glossary entry shrinks away;
  in-flight Change visibility rests on the Backlog board (T-88 cross-
  worktree aggregation), not on workspace grouping.
- **D6 — Mint a Backlog decision record** (work sessions retired;
  session-absent default) in the Change checkout, riding this Change's PR.
  Reach exceeds one Change: retires a glossary-level convention cited across
  doc-42/43/44 and T-70/T-88-era records. Historical records stay unedited;
  the ledger cites this exchange until the record lands.

## Surfaces (prose sweep, grep-verified; no `bin/` changes)

- `skills/deliver-change/SKILL.md` — step 2: drop "create a work session /
  retain workspace and pane IDs"; the Change is born as a plain worktree
  from the agreed base. Step 11: the canonical retire invocation becomes
  `qq-change retire <change-label-or-id> --repo <checkout> --branch <branch>
  --checkout <path> --workspace-absent-owned`; the `--placeholder-pane` form
  is documented only as the legacy path for pre-existing work sessions.
- `skills/delegate-batch/SKILL.md` — "each writing ticket gets its own work
  session and worktree" → worktree only; drop "work sessions" from the
  disjoint-resources line.
- `skills/deliver-change/agents/openai.yaml` — remove the "short-labeled
  grouped work session" phrase from `default_prompt`.
- `CONCEPTS.md` — remove the "work session" entry; adjust "project home" so
  Change checkouts are plain linked worktrees and delegates are headless
  child processes, neither grouped beneath the home.
- `cockpit/README.md` — rewrite the work-session paragraph: home holds the
  board tab and operator tabs; no per-Change workspaces are created;
  `qq-herdr-pull --workspace` stays documented as an operator-invocable
  mover (unchanged binary).
- `README.md` (root) — verify and fix the "short-labeled grouped" phrase
  (line ~36).
- `tools/ratchet-baselines.conf` — update the exact `prose_words` baseline
  to the new shrunken count.
- `tests/` — engine tests untouched (both retire modes remain); update any
  skill-content tripwires that assert the removed phrases.

## Non-goals

- No `bin/` engine changes (qq-change, qq-reap, qq-herdr-pull,
  qq-herdr-home, qq-herdr-snap stay byte-identical).
- No herdr-side tickets; no cockpit keybinding changes.
- No change to the delegate fan-out model, dispatch adapter, or the
  born-in-worktree Task lifecycle.
- No retroactive edits to historical Tasks, decisions, or docs; no migration
  of legacy work sessions — w71 retires through the existing placeholder
  path under T-122's own resume.
- openwiki is a derived surface; its maintainer refreshes post-land, outside
  this Change.

## Success evidence

1. `grep -rn "work session" skills/ CONCEPTS.md cockpit/ README.md` returns
   only intentional legacy/retirement pointers (or none).
2. Full Repository test suite green in a native run, including the updated
   ratchet exact count.
3. deliver-change step 11's canonical retire invocation is the
   session-absent form; a `--dry-run` probe demonstrates the invoked path
   parses and resolves.
4. Fresh-context `code-review` verdict over the diff before the PR, per the
   review contract.

## Ownership boundary

This session (operator-facing accountable owner) owns alignment, this plan,
and delivery through `deliver-change`: one PR, implementation via one
`delegate-batch` work order, operator merges. The herdr project is
untouched. T-126 (adjacent vocabulary alignment) is not a blocker; legacy
w71 retirement stays with T-122's owning Change.
