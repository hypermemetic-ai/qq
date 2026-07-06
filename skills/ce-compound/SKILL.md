---
name: ce-compound
description: Captures a just-solved problem as a durable solution doc under docs/solutions/ and records project-specific domain vocabulary in CONCEPTS.md. Use right after fixing a non-trivial bug or settling a decision worth not relearning, once the fix is verified and the reasoning is still fresh, so the next person spends minutes instead of hours.
---

# ce-compound

You just solved something worth not relearning. Capture it now, while the context is
fresh, so the next person — or the next you — spends minutes instead of hours. Each
capture compounds: solve once, document once, look up forever.

*Derived and slimmed from EveryInc/compound-engineering-plugin `ce-compound` (MIT).*

## When this fires

You just fixed a non-trivial bug or settled a decision, and the fix is verified working.
Capture the problems whose root cause took real thought to find. Skip trivial typos and
obvious errors — they don't earn a doc.

## Two artifacts

Capture produces up to two things: the solution doc always, and a vocabulary entry only
when the work surfaced a durable domain term.

### 1. Solution doc — `docs/solutions/YYYY-MM-DD-<slug>.md`

One self-contained file per solved problem. Use today's date; make `<slug>` a short
kebab-case summary of the problem (e.g. `n-plus-one-brief-generation`).

```markdown
---
title: <clear problem title>
date: <YYYY-MM-DD>
tags: [keyword-one, keyword-two]
---

# <clear problem title>

## Symptom
What was observed — exact error text, failing behavior, or the friction that started this.

## Root cause
The real, underlying cause, not the surface symptom. Explain *why* it happened.

## Fix
The change that resolved it, with the key code before/after when that clarifies.

## Verification
How you confirmed it actually works — the test that now passes, the command run, the
behavior observed.
```

Keep the four core sections always. Add others (what didn't work, prevention) only when
they carry real signal — a dead end worth warning the next person about, a guardrail that
prevents recurrence.

### 2. Vocabulary — `CONCEPTS.md` (repo root)

When the work surfaced a word that means something specific in *this* project — an entity,
a named process, a status concept — add it to `CONCEPTS.md`. Create the file if it does
not exist. This is the shared glossary that solution docs and instruction files can cite
without redefining.

```markdown
# Concepts

Shared domain vocabulary for this project — entities, named processes, and status
concepts with project-specific meaning. Accretes as real learnings surface durable
terms; direct edits are fine. Glossary only, not a spec.

## <Term>
<One-sentence, project-specific definition — what it means here and what makes it
distinct from its neighbors.>
```

- **What earns a slot:** a term precise enough here that a new engineer would need it
  defined to follow the code or conversations. Skip general programming vocabulary
  (cache, queue, job, session) and everyday English, however heavily used.
- **One sentence** per entry. A term with non-obvious rules (lifecycle, ownership,
  cancellation semantics) earns a second short paragraph for those rules — never for
  padding the definition.
- **Self-standing:** no file paths, class names, function signatures, or current-config
  numbers that will drift. State the behavior, not the number. If an entry leans on
  another project-specific term, define that term too.

## Quality bar

- **Specific over generic.** Real error text and the real cause, not "there was an issue."
- **Evidence-backed.** The verification section proves the fix works; every claim traces
  to something you observed.
- **Honest.** Record what actually happened, including a dead end if it saves the next
  person from repeating it. Don't dress a class or table name up as a concept.
- **Prune stale.** When a new capture contradicts or supersedes an older doc or a
  `CONCEPTS.md` entry, update the old one rather than letting the two drift apart.
