# `codex exec` hangs on stdin — close stdin for headless use

**Status:** _superseded for `orchestrate` by TASK-8.1._ Orchestrate no longer
uses headless `codex exec` handoffs; Codex implementation now runs in a named
herdr pane (`cx-<branch>`) with file-based `.qq/handoffs/` briefs and reports.
Keep this note only for background/headless side jobs such as the `/idea`
researcher pattern.

## The bug
`codex exec "<prompt>"` (codex-cli 0.142.5) reads stdin and concatenates it onto
the prompt arg. It prints `Reading additional input from stdin...` and blocks until
EOF. Launched non-interactively — a background job, a subshell, or any other
headless helper — stdin is an inherited-but-never-closed pipe, so it waits
**forever** and never starts the task. It reads as "Codex is slow / the model is
stuck"; it's actually hung before the first token.

Not the priority tier, not `--json`, not the prompt: a trivial
`codex exec "Reply with exactly: ok"` hangs identically across plain / `--json` /
`-c service_tier=default`. (Cost a hung Handoff-1 run plus a parallel diagnostic
chasing tier/json red herrings — all three probes stuck on the same stdin read.)

## The fix
Close stdin. `codex exec "<prompt>" < /dev/null` returns in ~3.7s (verified). The
`Reading additional input from stdin...` line still prints, hits EOF immediately,
and proceeds. For long briefs, prefer a prompt file + closed stdin (also dodges
shell-quoting hell):

```
codex exec --sandbox danger-full-access --skip-git-repo-check "$(cat brief.prompt)" < /dev/null
```

## Where it still applies
- **Background/headless helpers** — if a future detached researcher or one-off
  helper uses `codex exec`, close stdin explicitly and prefer a prompt file.
- **Not `orchestrate`** — Build handoffs now run through a visible herdr worker
  pane, `herdr agent send`/`wait`, and `.qq/handoffs/<n>-report.md` as the result
  of record. Do not reintroduce `codex exec` as the orchestrate handoff path.

_(2026-07-06; superseded for orchestrate 2026-07-08 by TASK-8.1)_
