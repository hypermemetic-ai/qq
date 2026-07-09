# `codex exec` hangs on stdin — always pass `< /dev/null`

**Superseded 2026-07-08 by TASK-8** (worker-pane Build path,
`docs/plans/2026-07-08-orchestrate-codex-panes.md`): orchestrate no longer has
a headless `codex exec` path, so the `< /dev/null` rule below no longer applies
to orchestrate handoffs. The rationale still applies to background side-quest
`codex exec` invocations, including the detached `/idea` subprocess described in
`ideas/01-btw-ideas-skill.md`; this is not a blanket "redirect never needed"
repeal.

**Status:** _orchestrate handoff guidance superseded; still live for detached
background `codex exec` invocations._

## The bug
`codex exec "<prompt>"` (codex-cli 0.142.5) reads stdin and concatenates it onto
the prompt arg. It prints `Reading additional input from stdin...` and blocks until
EOF. Launched non-interactively — a background job, a subshell, any detached
side-quest worker — stdin is an inherited-but-never-closed pipe, so it waits
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
- **Detached/background `codex exec` side-quests** — keep using `< /dev/null`,
  ideally with the prompt-file pattern. The `/idea` subprocess pattern is the
  live example.
- **Historical:** this record originally targeted `skills/orchestrate/SKILL.md`
  Build handoffs. TASK-8 replaced that headless path with worker-pane
  send/read/wait, so no orchestrate wiring remains.

_(2026-07-06)_
