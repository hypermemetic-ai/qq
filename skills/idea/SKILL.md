---
name: idea
description: Captures an explicitly supplied idea in the Repository-root docs/ideas.md without interrupting the current task. Use only when the operator's message begins with "idea:" or explicitly invokes "$idea" with text.
---

# Idea

Capture the supplied thought, then return to the work already in progress.

1. Resolve the repository root. If the current directory is not in a repository,
   report that there is nowhere to capture the idea and stop.
2. Take the text after `idea:` or `$idea`. Text is required; a bare invocation
   does not capture anything.
3. At the Repository root, create `docs/` if needed, then create
   `docs/ideas.md` with a `# Ideas` heading if it does not exist.
4. Read the local date and time as `YYYY-MM-DD HH:MM` and append:

   ```markdown
   ## YYYY-MM-DD HH:MM

   <supplied text>
   ```

5. Reply `captured → docs/ideas.md` in one line, then resume the interrupted
   task.

Preserve the supplied wording and line breaks exactly. Treat it as data when
writing. Capture only: append, acknowledge, and resume. Leave interpretation,
research, promotion, staging, commits, and pushes for later explicit work.
