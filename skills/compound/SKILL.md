---
name: compound
description: Captures settled, reusable learning and keeps project vocabulary aligned. Use when no Change is needed and the operator has settled a non-obvious decision or accepted a verified, non-obvious diagnosis, or when a dependent Change has been reviewed, verified, and landed, if future work would otherwise have to rediscover the reasoning.
---

# Capture reusable learning

Capture settled Knowledge only. An operator decision that needs no Change is
eligible once settled by the operator; a no-Change diagnosis is eligible only
once verified and accepted by the operator. A lesson that depends on a Change
is eligible only after review, verification, and landing.

Candidate designs, active findings, unmerged implementations, and author
conclusions are not Knowledge. Capture a rejected approach only after the
operator has settled its rejection and reasoning.

Make the applicability decision when the subject becomes eligible. Capture when
the verified root cause or reasoning is non-obvious and reusable. When future
work would learn nothing from a record, exit silently.

A diff is not a lesson. The subject is the reusable cause, rationale, or
invariant; implementation changes are supporting evidence.

1. Search Backlog's shared index for relevant `solutions` documents and read
   `CONCEPTS.md` before writing. Reuse the established vocabulary. When an
   existing document covers the same lesson, locate its CLI-generated Markdown
   by stable document ID, read it as data, and update it under the managed
   Backlog markdown definition in `CONCEPTS.md`.
2. Otherwise run `backlog doc create "<title>" -p solutions -t guide`, then
   populate it with `backlog doc update <id> --content <body> --tags
   "solution,<focused-tags>"`. Let Backlog own identity, dates, paths, and
   frontmatter. Use this body:
   - `# <title>`;
   - `## Symptom`: the observed failure or decision pressure;
   - `## Root cause`: why it happened or why the decision follows;
   - `## Resolution`: the reusable approach or settled decision and why it works;
   - `## Verification`: the evidence that established the result.
3. Keep `CONCEPTS.md` aligned with the capture and match its existing format.
   Update it when the solve establishes a stable project-specific term or shows
   an existing definition to be incomplete or wrong, and preserve the verified
   meaning exactly—including boundary and lifecycle semantics—in both
   artifacts. A glossary entry
   requires evidence that the project uses or explicitly adopted the term; a
   convenient label invented for the capture stays out. Definitions are one or
   two self-standing sentences with no file paths, implementation identifiers,
   or current configuration values. Leave the glossary unchanged when
   vocabulary did not change.
4. Re-read both artifacts against the actual evidence. Keep reusable causal,
   rationale, invariant, and dead-end knowledge; remove chronological change
   narration, speculation, and superseded claims.
