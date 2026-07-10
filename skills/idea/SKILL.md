---
name: idea
description: Captures an explicitly supplied idea in the Repository's single Backlog Ideas document without interrupting the current task. Use only when the operator's message begins with "idea:" or explicitly invokes "$idea" with text.
---

# Idea

Capture the supplied thought, then return to the work already in progress.

1. Resolve the Repository root and require `backlog/config.yml`. If either is
   absent, report that there is nowhere to capture the idea and stop.
2. Take the text after `idea:` or `$idea`. Text is required; a bare invocation
   does not capture anything.
3. Run `backlog doc search "Ideas" --limit 20` and select the exact-title
   `Ideas` document. Refuse duplicates. If none exists, create it without a
   category directory using `backlog doc create "Ideas" -t other`, then
   initialize it through `backlog doc update <id> --content "# Ideas" --tags
   ideas`. Never create an `ideas/` directory.
4. Locate the CLI-generated Markdown by that stable document ID under
   `backlog/docs/` and read it as data so the existing body is preserved. Never
   edit that file directly; every mutation goes through `backlog doc update`.
5. Read the local date and time as `YYYY-MM-DD HH:MM` and form a complete
   replacement body by appending:

   ```markdown
   ## YYYY-MM-DD HH:MM

   <supplied text>
   ```

6. Replace the body with `backlog doc update <id> --content <complete-body>
   --tags ideas`.
7. Reply `captured → Backlog <id> (Ideas)` in one line, then resume the
   interrupted task.

Preserve the supplied wording and line breaks exactly. Treat it as data when
writing. Capture only: append, acknowledge, and resume. Leave interpretation,
research, promotion, staging, commits, and pushes for later explicit work.
