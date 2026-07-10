# The `/idea` capture skill

_Banked 2026-07-06. Status: ✅ built 2026-07-08 (task-6) as `skills/idea/SKILL.md`,
eval-first per `writing-skills`; harness-extensibility question researched
(2026-07-07, section below). It rides the background-status substrate built by #5._

## Original (verbatim — surlej)

> has anyone worked out a useful "ideas" skill? if not we'll write it. I'm
> imagining /btw from a session, I type some concern related to the running
> session or nothing at all, just a thought, the agent sharpens it and runs
> research to flesh it out, end result is the ideas.md file holds my original
> input and the supporting data, ready to take on when appropriate.

## Finding

At capture time, no such skill existed in `skills/` (checked the then-16 skills).
Closest prior art was the `research` skill (which this reuses) and this
`ideas/` folder's own convention (README backlog + `NN-slug.md`). So: build it,
on top of this scaffold.

## Native `/btw` already exists — reframe the idea around it (researched 2026-07-07)

**`/btw` is a *built-in Claude Code command*** (shipped 2.1.72, ~Mar 2026) — not
something to author. Official docs: `/btw <question>` = "Ask a quick side question
without adding to the conversation." It forks the session context, answers in an
overlay, keeps the Q&A out of the main history (context/token savings), and works
mid-task. It is **read-only** — no tools, no file writes — so it can *ask* about the
session but cannot *persist* anything.

Two native primitives together already cover most of what this note set out to build:
- **`/btw`** — the ephemeral aside-without-derailing ergonomics.
- **`/fork <directive>`** (Claude Code ≥ 2.1.161) — "spawn a background subagent that
  inherits the full conversation and works on the directive while you keep going; its
  result returns to your conversation when it finishes." This *is* the
  "sharpen-using-the-running-session's-context + research-in-the-background,
  non-blocking" engine the design spec'd from scratch — and unlike `/btw` it's a full
  subagent (can research, write files).

**Consequences:**
1. **Don't build a `/btw` skill** — the name is a built-in and the behavior overlaps.
   The durable-capture skill is `/idea`.
2. **Completion is *visibility*, not a *reply* (operator, 2026-07-07).** The done-signal
   must NOT re-enter the conversation — same contract as the orchestrate progress tracker:
   ambient status you glance at, zero conversation pollution. That rules out surfacing via
   `/fork`, whose defining behavior is "result returns to your conversation when it
   finishes." Instead: **capture in-turn** (that turn has full context → write a scoped
   brief, per the mini-handoff slot), **spawn a detached researcher**
   (`setsid … codex exec / claude -p … < /dev/null &`) that writes `ideas/NN-slug.md`, and
   **report status to the shared background-status surface** — `qq-phase` writing
   its own producer slot in `.qq/state.json`, read by `qq-phase render` in the Claude Code
   status line — flipping `capturing → researching → done: ideas/NN-slug.md` via
   `qq-phase ... --producer idea-NN`. The skill returns nothing into the transcript.
3. **The genuinely additive part is small but real:** durable persistence + the
   grooming convention (`ideas/` + README backlog). Everything else is now native.
4. **#1 and #5 converge.** The completion-visibility surface *is* the progress tracker's
   surface. With #5 built as producer-scoped `qq-phase` slots in `.qq/state.json` +
   `qq-phase render`, `/idea` gets its done-signal for free without clobbering
   orchestrate. This also lifts #5 from an orchestrate-only nicety into shared
   cockpit infrastructure.

**Codex mapping (for when it's the primary cockpit):** Codex has `/side` (ephemeral
detour, parent status visible, can't nest) ≈ `/btw`, and `/fork` (a *durable* parallel
thread switched to via `/agent` — not a returns-when-done background subagent). A native
`/btw` alias for `/side` is only a **request** (openai/codex#18884). Codex has no
returns-when-done background-subagent-from-a-command, so the Codex build uses a
**detached agent subprocess** —
the wrapper in `skills/idea/SKILL.md` with `< /dev/null` (per idea #3) — that
self-files to `ideas/`. Both harnesses share the `SKILL.md` model, but
`bin/qq-link.sh` links only `~/.claude/skills` today; Codex invocation needs the
follow-up `~/.codex/skills` linker.

Sources: code.claude.com/docs/en/commands (`/btw`, `/fork`, `/branch`) ·
developers.openai.com/codex/cli/slash-commands · github.com/openai/codex/issues/18884

## Sharpened design

A `writing-skills` eval-first skill named `idea`. It also honors natural phrases:
"capture this", "note for later", and "idea:".

**Contract: `/idea` never blocks the running session.** Operator-side ceremony
stays at zero; the agent does the fleshing.

1. **Capture first, verbatim, instantly** — raw input is written to the idea
   record before anything else, so a thought is never lost even if research
   fails (same ethos as commit-on-green / WIP snapshots).
2. **Sharpen silently** — restate crisply using the *running session's context*
   to resolve "this/that" (which file, which behavior). Not a grilling — it
   does not interrogate. The "what we were doing when it came up" slot is a
   scoped mini-handoff: it inherits `handoff`'s discipline — reference existing
   artifacts by path/URL instead of duplicating them, and redact secrets.
3. **Research in the background** — reuse the `research` skill (cited,
   confidence-tagged), running async so the operator stays in-session.
4. **Ambient status, then out of the way** — e.g. the status line shows
   `idea:◐ researching · ideas/03-retry-backoff.md`. The transcript stays clean,
   and the file enriches itself when research lands.
5. **File shape, ready to take on cold:** `Original` (verbatim, sacred) ·
   `Sharpened` + what we were doing when it came up · `Findings` (cited
   research) · `Ready-to-take-on` (what acting on it involves, optional
   `writing-plans` pointer) · date stamp.

Output slots onto the existing convention: one-liners with no research → a
Backlog bullet in `README.md`; bare session snapshots and anything with
supporting data → their own `NN-slug.md` + a pointer bullet, with the researcher
spawned only when the idea is researchable.

## Relationship to `handoff`

`/idea` and `handoff` are two consumers of the **same underlying capability** —
"compact live session state so a *cold reader* can resume without re-deriving
it" — pointed at different targets. The `idea` skill should *reuse* handoff's
compaction discipline for its session-context work, not reinvent it.

Where they diverge (keep the two skills distinct):

| | `handoff` | `/idea` |
|---|---|---|
| **Fires when** | context is low; you must pass the baton | a tangential thought occurs; you want to keep going |
| **Relation to current task** | *end/transfer* this work | *park a different* work, stay on this one |
| **Cold reader** | a fresh *agent* (continuation) | future *you* (a deferred decision) |
| **Output** | OS temp dir, ephemeral | `ideas/NN-slug.md`, durable + committed convention |
| **Scope** | the whole live task | one spun-off idea |

Where they connect (borrow, don't duplicate):

- **Bare `/idea` = a scoped handoff.** Decision #2's recommended "snapshot the
  session as the seed" is literally handoff-style conversation compaction,
  redirected from the temp dir to `ideas/` and reframed as "a thread to pick up
  later" rather than "continue this exact work." Implement it by reusing
  handoff's method, not a second summarizer.
- **Reference-don't-duplicate + redact** (handoff's rules) apply to every idea
  file's session-context slot.
- **Handoff's "suggested skills" section = the `Ready-to-take-on` slot.** Adopt
  it explicitly: every idea names the next skill to reach for (`writing-plans`,
  `orchestrate`, …) so future-you starts warm.

Net: in the "Support, any time" trio, `idea` *uses* `research` (to flesh out)
and *borrows from* `handoff` (to capture context) — it sits between them.

## Locked decisions

1. **Research trigger** — judge per idea: spin up an agent only when there's
   something researchable; a bare todo just gets a bullet.
2. **Bare `/idea` (no text)** — snapshot the current session as the seed by
   reusing `handoff`'s compaction, redirected to `ideas/`.
3. **Sharpening depth** — silent distill, capture-first, with at most one
   clarifying question and only if the idea can't be researched without it.

## Ready to take on

Built via `writing-skills` (eval-first) as `skills/idea/SKILL.md`, with this
`ideas/` folder formalized as its output surface. The shared methodology imported
by `CLAUDE.md` now has both the "Support, any time" reference and the skill-index
row alongside `research` / `handoff`.

Implementation note from the handoff analysis: `idea` references `handoff` for
its session-snapshot / context-slot work. Factor a shared "compact live session
for a cold reader" method only if the duplication actually bites.
