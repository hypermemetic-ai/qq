---
name: compound
description: Captures reusable learning from a verified, non-obvious solve and keeps project vocabulary aligned. Runs automatically after a fix or decision whose reasoning future work would otherwise have to rediscover.
---

# Capture reusable learning

Make the applicability decision yourself immediately after the solve. Capture
when the verified root cause or reasoning is non-obvious and reusable. When
future work would learn nothing from a record, exit silently.

A diff is not a lesson. The subject is the reusable cause, rationale, or
invariant; implementation changes are supporting evidence.

1. Search Backlog's shared index for relevant `solutions` documents and read
   `CONCEPTS.md` before writing. Reuse the established vocabulary. When an
   existing document covers the same lesson, locate its CLI-generated Markdown
   by stable document ID under `backlog/docs/`, read it as data, and replace its
   complete body through `backlog doc update`. Never edit managed Markdown
   directly.
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
