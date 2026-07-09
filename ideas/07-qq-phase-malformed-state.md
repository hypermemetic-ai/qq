# Harden `bin/qq-phase` against a malformed `.qq/state.json`

_Captured 2026-07-08 via /idea during the task-6 skill eval — the parked
analysis thread was an eval agent's, not the operator's, but its two crash
repros were real and every finding below was independently re-run live.
Status: researched._

## Original (verbatim — task-6 eval session)

> /idea
>
> I need you on something else right now, will pick this thread back up later.

(Bare `/idea` — the idea is a snapshot of the interrupted thread itself, parked
to pick up later.)

## Sharpened

Make `bin/qq-phase` immune to garbage in `.qq/state.json`, under this contract:
**`render` NEVER errors** (it feeds the Claude Code status line — garbage must
render as a blank cockpit, not a traceback), and **the writer never crashes on
garbage** (it starts clean instead). The session doing this work was analysis
only — **no code edits exist yet**.

State of the thread when parked:

- **Already handled (verified this session, both sides):** structural garbage —
  unparseable JSON, non-object top-level JSON, `producers` being a non-dict,
  an individual slot being a non-dict.
- **Confirmed broken (repros were run in a throwaway scratch repo):**
  1. `render` dies with `TypeError: '<' not supported between instances of
     'int' and 'str'` when two non-`main` slots carry mixed-type `started_at`
     values (int in one, string in the other) — the slot sort key compares
     them. Exit 1. Direct contract violation. Repro: write a `.qq/state.json`
     with two producer slots whose `started_at` are `123` and `"abc"`, run
     `qq-phase render`.
  2. The writer dies with `IsADirectoryError` on `os.replace` when
     `.qq/state.json` is a directory. `render` is immune to this one. Repro:
     `mkdir -p .qq/state.json`, then any writing invocation.
- **Decision in flight (the open question):** one outer never-error guard
  (try/except around everything, with a `QQ_PHASE_DEBUG` env var to re-raise
  for debugging) versus per-field validation at each read site. The session
  leaned outer guard but had not decided.
- **Next intended step:** settle that design question, then implement and add
  the two repros as regression checks.

Artifacts: `bin/qq-phase` (the script), `.qq/state.json` (the state surface),
`ideas/02-orchestrate-phase-state.md` (the substrate's design note).

## Open questions (for the researcher)

1. Outer guard vs per-field validation: which fits the "statusline must never
   break" contract better, given prior art (how do starship, git prompt
   scripts, tmux status generators, and similar always-render tools treat
   corrupt state files)?
2. Is an env-gated re-raise (`QQ_PHASE_DEBUG`) a sound debuggability pattern,
   or is stderr logging while still rendering blank strictly better?
3. Are there malformed-state cases beyond the two confirmed ones (mixed types
   in other fields, symlinked or unreadable `state.json`, a stale/foreign
   `state.json.lock`, the `.qq/` dir itself missing or read-only) that the
   chosen design must also survive?

## Findings

_Researched 2026-07-08. All repros run live in a throwaway scratch git repo
(`mktemp -d`), never against this repo's `.qq/state.json`. Line references are
to `bin/qq-phase` at commit f9b73f5._

### A. The full malformed-state matrix (live repro — HIGH)

**Render** (contract: NEVER errors). Its `[ -f ]` guard (`bin/qq-phase:32`)
plus the outer `try` around `json.load` (`bin/qq-phase:40-43`) make it immune
to every *filesystem-shape* case tested: `state.json` as a directory, dangling
symlink, unreadable file (chmod 000), FIFO, read-only `.qq/`, and `.qq` itself
being a file all exit 0 silently — HIGH, reproduced. Its residual holes are
exactly one class, **value-type confusion inside slots** that passes the
existing `isinstance(s, dict) and s.get("phase")` filter (`bin/qq-phase:51`):

1. **CONFIRMED (documented break):** two or more non-`main` slots whose truthy
   `started_at` values are incomparable (e.g. `123` vs `"abc"`) crash the sort
   key (`bin/qq-phase:85-90`) — `TypeError`, exit 1. Scoped tighter than the
   parked note had it: one `main` + one non-`main` slot does NOT crash — the
   tuple compare short-circuits on the main-first flag, so the bug needs ≥2
   non-`main` slots. HIGH, reproduced both ways.
2. **NEW BREAK:** a slot `status` that is unhashable (list/dict) crashes the
   icon lookup `{...}.get(status, "◐")` (`bin/qq-phase:95`) — `TypeError:
   unhashable type`, exit 1. HIGH, reproduced.
3. Non-string `phase`/`index`/`total`/`detail` values do NOT crash render —
   they format verbatim (a numeric phase renders as `a:◐ 42`). HIGH, reproduced.

**Writer** (contract: never crash on garbage — start clean instead). The
recovery that already works: unreadable `state.json` and dangling symlinks are
caught by the `try` at `bin/qq-phase:170-173`, start clean, and the atomic
replace re-materializes a healthy file (HIGH, reproduced). Everything else:

4. **CONFIRMED (documented break):** `state.json` as a directory —
   `IsADirectoryError` at `os.replace` (`bin/qq-phase:268`), exit 1. Two
   aggravations found alongside it: bare `qq-phase clear` dies on the same
   state at `os.unlink` (`bin/qq-phase:190`), and every failed replace leaves
   an orphaned `tmp*` file behind in `.qq/` (`delete=False`,
   `bin/qq-phase:264`). HIGH, reproduced.
5. **NEW BREAK:** `state.json.lock` as a directory — `IsADirectoryError` at
   the lock `open(..., "w")` (`bin/qq-phase:167`), which sits *before* the
   try/except; no phase stamp of any kind can land. HIGH, reproduced.
6. **NEW BREAK:** a non-string stored `phase` (e.g. `42`) crashes `done` and
   `gate` — the `__keep__` paths reload the stored value
   (`bin/qq-phase:213-214`) and die at `phase.lower()` (`bin/qq-phase:234`),
   `AttributeError`. Normal phase stamps are immune (the env-supplied phase
   overwrites). HIGH, reproduced for both subcommands.
7. **NEW BREAK (bash layer):** `.qq` itself being a regular file — `mkdir -p`
   fails and `set -euo pipefail` (`bin/qq-phase:22,155`) exits 1 before Python
   ever runs. No Python-side guard can reach this one. HIGH, reproduced.
8. **NEW — HANG, not crash:** `state.json` as a FIFO makes the writer block
   indefinitely at `open()` (`bin/qq-phase:171`; a FIFO with no writer blocks
   the reader). Render is immune (`-f` is false for a FIFO). HIGH, reproduced
   (killed by `timeout`, exit 124).
9. **NEW — HANG, not crash:** a lock held by a live process blocks every
   writer forever (`fcntl.flock LOCK_EX`, `bin/qq-phase:168`, no timeout).
   Stale locks from *dead* processes are harmless — flock releases on process
   exit — but one wedged holder starves all producers. HIGH, reproduced.
10. Read-only `.qq/` dir: writer dies with `PermissionError` at the lock open
    (`bin/qq-phase:167`). Render unaffected. This is an environment fault
    rather than garbage state — erroring is arguably correct, but it should be
    a clean one-liner, not a traceback. HIGH, reproduced.

### B. Prior art — how always-render tools treat corrupt state

_Verified against primary sources (official docs + source code) by a delegated
research agent, 2026-07-08; fetched pages treated as untrusted input._

- **How the breaks actually manifest here:** Claude Code's statusline docs say
  "Scripts that exit with non-zero codes or produce no output cause the status
  line to go blank" and stderr is not displayed — it is only surfaced by
  `claude --debug`, and only "from the first status line invocation in a
  session" (https://code.claude.com/docs/en/statusline). HIGH. So render's
  exit-1 crashes do not show a traceback; they **silently blank the cockpit,
  indistinguishable from idle**, with the error invisible — which both raises
  the stakes of the never-error contract (a crash and a clean blank look
  identical to the operator) and means stderr output is free (never rendered).
  The doc also pushes null/garbage handling explicitly onto the script author
  ("Fields may be `null`… Handle null values in your script with fallbacks").
- **Starship** renders on a malformed `starship.toml` — the TOML parse error
  is caught, logged, and the config falls back to defaults; no panic, no exit
  (`src/config.rs`: `Err(error) => { log::error!("Unable to parse the config
  file: {error}"); None }`,
  https://raw.githubusercontent.com/starship/starship/master/src/config.rs).
  Errors go to a per-session log file (`~/.cache/starship/session_*.log`,
  https://starship.rs/config/) and stderr; `STARSHIP_LOG` is purely a log-level
  knob (trace…error, default warn) — it never makes errors fatal
  (https://raw.githubusercontent.com/starship/starship/master/src/logger.rs,
  https://starship.rs/faq/). HIGH.
- **git's `__git_ps1`** (contrib/completion/git-prompt.sh) silences stderr on
  every git call (`2>/dev/null`), detects failure via empty output, and
  returns early with the shell's *prior* exit status so the prompt is never
  broken — the git segment is simply omitted
  (https://raw.githubusercontent.com/git/git/master/contrib/completion/git-prompt.sh,
  corroborated against the local git 2.43.0 copy). HIGH.
- **tmux `#()`** status commands run async: "the previous result from running
  the same command is used, or a placeholder if the command has not been run
  before" (man tmux 3.7b, FORMATS). Failure of the command is not explicitly
  documented — unconfirmed beyond those semantics. HIGH for the quoted
  behavior, gap on the failure case.
- **Debuggability pattern:** GIT_TRACE routes trace messages to
  stderr/fd/file, purely diagnostic (https://git-scm.com/docs/git);
  Claude Code's analog is the `--debug` flag. Across all four tools the
  pattern is "always render something + route errors to stderr or a log file
  + an env knob/flag for verbosity"; **none deliberately crash or re-raise
  under a debug env var** — LOW (cross-source inference; no tool states it as
  a design principle).

### C. Answers to the open questions

**Q1 — outer guard vs per-field validation:** the evidence splits the answer
by half. For **render**, the outer guard wins on this session's own data: two
independent type-confusion crashes (findings 1–2) survived a script that had
*already* received per-field `isinstance` hardening — per-site validation is
demonstrably whack-a-mole, every new field access is a new hole, and one outer
`try/except → SystemExit(0)` around the whole render body collapses the entire
class (HIGH — direct repro evidence). For the **writer**, an outer guard is
neither sufficient nor honest: two of the breaks are *hangs* (findings 8–9),
which no exception handler can reach; one is at the bash layer (finding 7),
outside Python entirely; and swallowing a failed stamp with exit 0 would make
the status surface lie — a producer that believes it stamped when nothing
landed is worse than one that errored. The writer needs targeted repair
instead: a pre-flight shape check (`S_ISREG` / clear the obstruction — `.qq/`
is transient and gitignored, so removing a garbage `state.json` directory is
sane), a non-blocking or bounded-wait lock (`LOCK_NB` + retry), and type
coercion at the two `__keep__` read sites — with a clean one-line error only
when it genuinely cannot write. HIGH for the mechanics (each is pinned to a
reproduced failure), MEDIUM for the design weighting (judgment, though
evidence-backed). Prior art agrees on the render half: starship, `__git_ps1`,
and tmux all render a fallback rather than erroring (section B).

**Q2 — env-gated re-raise vs stderr logging:** not either/or — the evidence
says *stderr logging is the established base and it costs nothing here*, and a
`QQ_PHASE_DEBUG` re-raise is an unattested but harmless extra. Claude Code
never renders stderr (section B — HIGH), so an always-on one-line warning to
stderr is invisible in the cockpit yet immediately visible when the operator
runs `qq-phase render` by hand or via `claude --debug` — exactly the
starship/git-prompt pattern. No tool examined re-raises under a debug env var
(LOW, inference), but none forbids it either; the marginal value of
`QQ_PHASE_DEBUG=1` over the stderr line is the full traceback with the exact
crash site, which this session's own debugging needed (the sort-key TypeError
was located by reading a traceback). Recommendation: do both — default = render
blank + one-line stderr warning; `QQ_PHASE_DEBUG=1` = re-raise. MEDIUM
(design judgment on evidence, not a copied precedent).

**Q3 — cases beyond the two documented:** yes — five new breaks and two hangs
(findings 2, 4-aggravations, 5, 6, 7, 8, 9), plus one clean-error gap (10).
The two hangs are the strongest new result: they are invisible to any
guard-based design and force the lock/open strategy to change. HIGH.

## Ready to take on

The design question the thread was parked on is now settled by evidence, so
the next skill is **`writing-plans`** — not `grilling` (intent is already
sharp) and not `orchestrate` (one script, one contract, no cross-file
ambiguity). Then `executing-plans`, and land through the gate
(`no-mistakes axi run --skip ci --intent "…"`).

What the plan should cover — all changes confined to `bin/qq-phase`, plus
regression checks:

1. **Render:** wrap the whole render Python body in one outer
   `try/except → SystemExit(0)` (closes findings 1–2 and the entire
   type-confusion class), emit a one-line warning to stderr in the except
   path, and re-raise when `QQ_PHASE_DEBUG=1` (Q2 recommendation).
2. **Writer:** pre-flight shape check before lock/open — if `state.json` or
   its `.lock` is not a regular file (directory, FIFO), repair or bail cleanly
   (closes findings 4, 5, 8); replace blocking `LOCK_EX` with `LOCK_NB` +
   bounded retry, clean one-line error on timeout (closes finding 9); coerce
   the stored `phase` to `str` in the `__keep__` paths (closes finding 6);
   handle `mkdir -p` failure at the bash layer with a clean message (finding
   7); clean up the orphaned temp file when replace fails, and make bare
   `clear` shape-safe (finding 4 aggravations); let a genuine environment
   fault (read-only `.qq/`, finding 10) error as one line, not a traceback.
3. **Regression checks:** script the repro matrix from section A (a scratch
   git repo per case, asserting exit codes and non-blank/blank render output)
   so the gate can run it; wire it into `.no-mistakes.yaml` alongside the
   existing shellcheck entry.

One operator judgment call to surface during plan review: whether the writer
may **delete** a garbage `state.json` directory to self-repair (`.qq/` is
transient and gitignored, so this is defensible) or must bail with an error
and leave the obstruction for a human. Everything else is mechanical
consequence of the findings.

Also worth carrying into the plan: the registry touch — create/claim a
backlog task for the hardening before landing, since the gate refuses a diff
that does not touch `backlog/`.
