# The `/btw` ideas skill

_Banked 2026-07-06. Status: aligned on design, three decisions open, not yet built._

## Original (verbatim — surlej)

> has anyone worked out a useful "ideas" skill? if not we'll write it. I'm
> imagining /btw from a session, I type some concern related to the running
> session or nothing at all, just a thought, the agent sharpens it and runs
> research to flesh it out, end result is the ideas.md file holds my original
> input and the supporting data, ready to take on when appropriate.

## Finding

No such skill exists in `skills/` (checked all 16). Closest prior art is the
`research` skill (which this reuses) and this `ideas/` folder's own convention
(README backlog + `NN-slug.md`). So: build it, on top of this scaffold.

## Sharpened design

A `writing-skills` eval-first skill named `ideas`, with a `btw` alias like
`grill-me`→`grilling` (`disable-model-invocation: true` on the alias). Also
honors natural phrases: "btw…", "capture this", "note for later", "idea:".

**Contract: `/btw` never blocks the running session.** Operator-side ceremony
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
4. **One confirmation line, then out of the way** — e.g.
   `💡 ideas/03-retry-backoff.md — researching whether the gate can key on X`.
   The file enriches itself when research lands.
5. **File shape, ready to take on cold:** `Original` (verbatim, sacred) ·
   `Sharpened` + what we were doing when it came up · `Findings` (cited
   research) · `Ready-to-take-on` (what acting on it involves, optional
   `writing-plans` pointer) · date stamp.

Output slots onto the existing convention: one-liners with no research → a
Backlog bullet in `README.md`; anything with supporting data → its own
`NN-slug.md` + a pointer bullet.

## Relationship to `handoff`

`/btw` and `handoff` are two consumers of the **same underlying capability** —
"compact live session state so a *cold reader* can resume without re-deriving
it" — pointed at different targets. The `ideas` skill should *reuse* handoff's
compaction discipline for its session-context work, not reinvent it.

Where they diverge (keep the two skills distinct):

| | `handoff` | `/btw` (ideas) |
|---|---|---|
| **Fires when** | context is low; you must pass the baton | a tangential thought occurs; you want to keep going |
| **Relation to current task** | *end/transfer* this work | *park a different* work, stay on this one |
| **Cold reader** | a fresh *agent* (continuation) | future *you* (a deferred decision) |
| **Output** | OS temp dir, ephemeral | `ideas/NN-slug.md`, durable + committed convention |
| **Scope** | the whole live task | one spun-off idea |

Where they connect (borrow, don't duplicate):

- **Bare `/btw` = a scoped handoff.** Decision #2's recommended "snapshot the
  session as the seed" is literally handoff-style conversation compaction,
  redirected from the temp dir to `ideas/` and reframed as "a thread to pick up
  later" rather than "continue this exact work." Implement it by reusing
  handoff's method, not a second summarizer.
- **Reference-don't-duplicate + redact** (handoff's rules) apply to every idea
  file's session-context slot.
- **Handoff's "suggested skills" section = the `Ready-to-take-on` slot.** Adopt
  it explicitly: every idea names the next skill to reach for (`writing-plans`,
  `orchestrate`, …) so future-you starts warm.

Net: in the "Support, any time" trio, `ideas` *uses* `research` (to flesh out)
and *borrows from* `handoff` (to capture context) — it sits between them.

## Three decisions open (with recommendations)

1. **Research trigger** — **Rec: judge per idea** (spin up an agent only when
   there's something researchable; a bare todo just gets a bullet). Alternatives:
   always research; only on explicit `--deep` flag.
2. **Bare `/btw` (no text)** — **Rec: snapshot the current session as the seed**
   (infer the concern from what we're wrestling with) — implemented by reusing
   `handoff`'s compaction, redirected to `ideas/`. Alternatives: prompt for a
   thought; disallow.
3. **Sharpening depth** — **Rec: silent distill, capture-first, at most one
   clarifying question and only if the idea can't be researched without it.**
   Alternatives: always ask one question; store verbatim only.

## Ready to take on

Confirm the three decisions (default = all three recommendations), then author
via `writing-skills` (eval-first): the `ideas` skill + `btw` alias, and
formalize this `ideas/` folder as its output surface. Index row goes under
"Support, any time" in `CLAUDE.md`, alongside `research` / `handoff`.

One build decision surfaced by the handoff analysis: whether `ideas` simply
*invokes* `handoff` for its session-snapshot / context-slot work, or whether the
shared "compact live session for a cold reader" method gets factored out so both
skills point at it. Lean toward the lighter option first (invoke/reference
`handoff`); factor only if the duplication actually bites.
