---
name: compound
description: Captures reusable learning from a verified, non-obvious solve and keeps project vocabulary aligned. Runs automatically after a fix or decision whose reasoning future work would otherwise have to rediscover.
---

# Capture reusable learning

Make the applicability decision yourself immediately after the solve. Capture
when the verified root cause or reasoning is non-obvious and reusable. When
future work would learn nothing from a record, exit silently.

1. Read `docs/solutions/` and `CONCEPTS.md` before writing. Reuse the
   established vocabulary. When an existing record covers the same lesson,
   update it in place rather than creating another; preserve its filename and
   original date.
2. Otherwise create `docs/solutions/YYYY-MM-DD-<slug>.md` with:
   - frontmatter: `title`, `date`, and focused `tags`;
   - `# <title>`;
   - `## Symptom`: the observed failure or decision pressure;
   - `## Root cause`: why it happened or why the decision follows;
   - `## Fix`: the implemented change or settled decision;
   - `## Verification`: the evidence that established the result.
3. Keep `CONCEPTS.md` aligned with the capture and match its existing format.
   Update it when the solve establishes, changes, or invalidates a stable
   project-specific term, and preserve the verified meaning exactly—including
   boundary and lifecycle semantics—in both artifacts. A glossary entry
   requires evidence that the project uses or explicitly adopted the term; a
   convenient label invented for the capture stays out. Definitions are one or
   two self-standing sentences with no file paths, implementation identifiers,
   or current configuration values. Leave the glossary unchanged when
   vocabulary did not change.
4. Re-read both artifacts against the actual evidence. Keep useful specifics
   and dead ends; remove speculation and superseded claims.
