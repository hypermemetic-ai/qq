---
id: doc-4
title: no-mistakes Gate — Trial Report & GO/NO-GO Verdict
type: specification
created_date: '2026-07-10 20:56'
updated_date: '2026-07-10 20:56'
tags:
  - plan
  - historical
---
# no-mistakes Gate — Trial Report & GO/NO-GO Verdict

> **Superseded gate policy (2026-07-08):** This report captures the July 6 trial
> conditions (`v1.31.2` and the then-current blast-radius policy). Current qq
> landings are all-gated and driven by the landing agent with
> `no-mistakes axi run --intent "<task + AC>"`, adding `--skip ci` only after
> confirming no CI exists. `git push no-mistakes` is only the fallback when no
> skip flags are needed and no explicit intent is available; see `AGENTS.md` and
> `qq-methodology.md`.

**Date:** 2026-07-06
**Binary:** `no-mistakes v1.31.2` (installer pinned; latest release is v1.33.0 — recent enough, all features present)
**Environment:** isolated scratch clone at `…/scratchpad/nm-trial/repo` with a **local bare upstream** (no GitHub host ⇒ `pr`/`ci` auto-skip). The real remote `git@github.com:hypermemetic-ai/hypercore.git` was never touched.

## Verdict: **GO** ✅

The gate installed cleanly, did not collide with any hypercore file, ran a full AI pipeline end-to-end on a real change, **passed**, forwarded the branch to the upstream — and along the way caught and correctly auto-fixed **real pre-existing bugs in hypercore's own shell scripts**.

---

## `init-manifest` — exactly what `no-mistakes init` writes

The biggest unknown, now resolved. `init` writes **nothing to the working tree**:

| Location | Written | Tracked? | Collision risk |
|---|---|---|---|
| Working tree (`AGENTS.md`, `CLAUDE.md`, `skills/`, `bin/`, `README.md`) | **nothing** | — | **none** |
| `.git/config` | one `[remote "no-mistakes"]` → `~/.no-mistakes/repos/<hash>.git` | no (git config) | none |
| `~/.no-mistakes/repos/<hash>.git` | the bare **gate repo** + `post-receive` hook | no (outside repo) | none |
| `~/.claude/skills/no-mistakes` | the user-level `/no-mistakes` agent skill | no (global, additive) | none |
| `~/.config/systemd/user/no-mistakes-daemon-*.service` | the daemon as a systemd **user service** | no (global) | none |

**Consequence for the plan:** Task 2's "guard against init stomping our files" step is a **no-op** — there is nothing to guard. `.no-mistakes.yaml` is **opt-in** (you author it; init never creates it). `no-mistakes eject` cleanly removes the per-repo gate.

## Pipeline result (trial change: one harmless comment appended to `bin/hc-wip`)

Driven headlessly via `no-mistakes axi run --yes --intent "…"`. **`--intent` is passed directly** — the gate uses the supplied goal instead of inferring from transcripts, which mechanically confirms the "you own intent, the gate reviews the code" division.

| step | status | findings | duration |
|---|---|---|---|
| intent | completed | 0 | ~1 ms (used supplied `--intent` verbatim) |
| rebase | completed | 0 | 50 ms |
| review | completed | 0 | **38.8 s** (real AI review; clean on a comment change) |
| test | completed | 0 | **145.2 s** (no `commands.test` ⇒ agent validated behavior with evidence) |
| document | completed | 0 | **56.2 s** (found no doc gaps) |
| lint | completed | **auto-fixed** | **76.1 s** (`shellcheck` baseline + agent fix — see below) |
| push | completed | 0 | 19 ms (forwarded `trial/gate-smoke` to upstream) |
| pr | **skipped** | — | local bare upstream, no GitHub host |
| ci | **skipped** | — | no PR to watch |

**outcome: passed** → branch landed on the upstream.

## The lint auto-fix — evidence the gate does real work

The gate ran `shellcheck` (our configured `commands.lint`), found violations in `bin/hypercore-activate.sh`, fixed them, and committed:

> `no-mistakes(lint): fix shellcheck SC1087/SC2015 in hypercore-activate.sh`

- **SC1087 (error):** `$k[[:space:]]` → `${k}[[:space:]]` (bash reads `$k[` as an array subscript — a real footgun). Correct brace fix.
- **SC2015 (info):** `[ -f "$1" ] && cp … || true` → proper `if … then … fi`. Correct de-footgunning.

**These exist on hypercore `main` today** (confirmed: `shellcheck bin/hypercore-activate.sh` reports SC1087 at lines 28–29 and SC2015 at line 22). The fixes are minimal, intent-preserving, and cleanly messaged. → Feeds **Task 2 Step 5** (get the lint baseline green on the real repo — apply these exact fixes).

## Cost & latency (know before gating)

One gated push = **~5.5 min wall-clock** across **4 agent-backed stages** (review, test, document, lint) each spending `claude` tokens. Proportionate for real work; heavy for a one-line change. The historical conclusion was blast-radius gating only for real work; current qq policy keeps the single gate path and reduces waste with landing-agent ownership plus `--skip ci` on no-CI repos.

## Safety confirmations

- `pr`/`ci` skipped as predicted — the trial physically could not open a PR on the real remote.
- Pipeline runs **server-side in the daemon**: killing the foreground `axi run` did not stop the run (resumable via `axi status`/`attach`).
- All agent CLIs detected by `doctor`; `claude` used as primary.

## Notes / follow-ups

- Global side effects persist after the trial (user-level `/no-mistakes` skill + systemd daemon) — intended, and reused by the real integration.
- Scratch gate can be removed with `no-mistakes eject` from the scratch clone; the scratch dir itself is disposable.
- **Real-repo finding:** `bin/hypercore-activate.sh` has a shellcheck **error** (SC1087) on `main` — fix it as part of Task 2's green-baseline step.
