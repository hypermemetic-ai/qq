---
id: doc-3
title: no-mistakes Gate Integration Implementation Plan
type: specification
created_date: '2026-07-10 20:56'
updated_date: '2026-07-10 21:07'
tags:
  - plan
  - historical
---
# no-mistakes Gate Integration Implementation Plan

> **Superseded gate policy (2026-07-08):** This dated plan preserves the initial
> blast-radius/straight-to-main design. Current qq policy is all-gated and
> landing-agent-owned: use `no-mistakes axi run --intent "<task + AC>"`, adding
> `--skip ci` only after confirming no CI exists. `git push no-mistakes` is only
> the fallback when no skip flags are needed and no explicit intent is available;
> `ask-user` findings are relayed by the landing agent. See `AGENTS.md` and
> `qq-methodology.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or hypercore:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt `kunchenguid/no-mistakes` as hypercore's externally-owned **blast-radius** merge gate — real work is pushed through an independent validation pipeline that opens a PR, while trivial work still commits straight to `main` — and re-slot the affected hypercore skills into a *layered* division of labor (author-side vs verifier-side).

**Architecture:** no-mistakes is a Go binary that installs a local git-remote *gate*. `git push no-mistakes` spins up a disposable worktree and runs a fixed pipeline (`intent → rebase → review → test → document → lint → push → pr → ci`) against the diff, forwarding to the push target and opening a PR only when every stage is green. It is agent-agnostic (uses the local `claude`/`codex`/`opencode` CLI) and reads `commands.{test,lint,format}` from the repo's default branch to stay deterministic. We keep hypercore's *front half* (align/plan/build) and *design+spec* review untouched, hand the *correctness+land* tail to the gate, and demote `verification-before-completion` to a cheap pre-push smoke test.

**Tech Stack:** Go binary (installed via upstream no-mistakes `docs/install.sh`), `git`, `gh` (GitHub PRs), `claude` CLI (pipeline agent), `shellcheck` (hypercore's lint command), Markdown (the rules/skills we edit).

## Global Constraints

- **Design is settled — do not re-litigate.** Merge gate = **blast-radius**. Consolidation = **layered**: `code-review` stays (design+spec, author-side); the gate owns correctness+land+CI; `verification-before-completion` demotes to a pre-push smoke test; `finishing-a-development-branch` shrinks to the merge decision.
- **The reviews are complementary, not redundant.** hypercore `code-review` = design (12 Fowler smells + this repo's documented standards) + spec conformance. Gate `review` = correctness/risk (bugs, security, perf, breaking changes, error handling), diff-only, *not* standards-aware. Do not delete `code-review`.
- **Task 1 is a hard GO/NO-GO gate.** Nothing in Tasks 2–5 touches this repo's real `AGENTS.md`, `skills/`, or `origin` until the Task 1 trial in a *scratch clone* has reported exactly what `no-mistakes init` writes and confirmed it does not stomp hypercore's own files.
- **The trial must never touch the real remote.** In the scratch clone the push target is a *local bare repo* (no GitHub host ⇒ the `pr` stage auto-skips). No PR is ever opened against `git@github.com:hypermemetic-ai/hypercore.git` during Task 1.
- **`commands` + `agent` are read from the default branch** (a no-mistakes security rule) — the gate config only takes effect once `.no-mistakes.yaml` is committed to `main`.
- **Cost is real:** each gated push runs a full AI pipeline (one `claude` invocation per agent-backed stage). Gate *real* work only; trivial work stays on the straight-to-main path.
- **Telemetry off:** always run with `NO_MISTAKES_TELEMETRY=0` (set it in the shell profile step).
- **hypercore honesty:** hypercore-the-repo is mostly prose skills + a few shell scripts, so the gate's *material* value here is modest (shellcheck + discipline). The high-value target is hypercore-*the-system* documenting the gate as the reusable implementation of its blast-radius/human merge gates for any project that installs the plugin.

---

### Task 1: Trial no-mistakes end-to-end in a scratch clone (GO/NO-GO gate)

**Files:**
- Create (scratch, outside repo): `/tmp/claude-1000/-home-qqp-projects-hypercore/f9defa21-2a38-44ab-b1ca-ed862d265e4b/scratchpad/nm-trial/` (clone + local bare upstream)
- Create: `backlog/docs/plans/doc-4 - no-mistakes-Gate-—-Trial-Report-GO-NO-GO-Verdict.md` (the decision-quality report — the only in-repo artifact of this task)

**Interfaces:**
- Produces: **`init-manifest`** — the exact list of paths `no-mistakes init` creates/modifies in a repo, and a yes/no on whether any collide with hypercore's `AGENTS.md`, `CLAUDE.md` (symlink → `AGENTS.md`), or `skills/`. Tasks 2 and 3 consume this to decide collision handling.
- Produces: **`trial-verdict`** — GO or NO-GO, plus observed per-stage behavior, the shape of the generated PR body, and rough token cost of one run.

- [ ] **Step 1: Install the binary (user-level, no sudo)**

```bash
NO_MISTAKES_TELEMETRY=0 curl -fsSL https://raw.githubusercontent.com/kunchenguid/no-mistakes/main/docs/install.sh | sh
command -v no-mistakes && no-mistakes --version
```

Expected: prints an install path on `PATH` (e.g. `~/.local/bin/no-mistakes`) and a version `>= 1.33.0`. If `no-mistakes` is not found on `PATH`, add its install dir to `PATH` and re-check before continuing. Do **not** fall back to a source build unless the binary install fails (source build needs Go, which is not confirmed installed).

- [ ] **Step 2: Confirm agents are visible to the gate**

```bash
NO_MISTAKES_TELEMETRY=0 no-mistakes doctor
```

Expected: reports `git`, at least one agent CLI (`claude`), and `gh` as available. Note any warnings verbatim in the report.

- [ ] **Step 3: Build an isolated scratch clone + a local bare upstream**

```bash
SCRATCH=/tmp/claude-1000/-home-qqp-projects-hypercore/f9defa21-2a38-44ab-b1ca-ed862d265e4b/scratchpad/nm-trial
rm -rf "$SCRATCH"; mkdir -p "$SCRATCH"
git clone /home/qqp/projects/hypercore "$SCRATCH/repo"
git init --bare "$SCRATCH/upstream.git"
git -C "$SCRATCH/repo" remote set-url origin "$SCRATCH/upstream.git"
git -C "$SCRATCH/repo" push origin main
git -C "$SCRATCH/repo" remote -v
```

Expected: `origin` now points at the **local bare repo**, not GitHub. This guarantees the `pr` stage has no GitHub host and auto-skips — the trial cannot open a real PR.

- [ ] **Step 4: Run `no-mistakes init` and capture the manifest (the key unknown)**

```bash
cd "$SCRATCH/repo"
git status --porcelain=v1 > /tmp/nm-before.txt
NO_MISTAKES_TELEMETRY=0 no-mistakes init
echo "=== NEW / MODIFIED FILES ==="; git status --porcelain=v1
echo "=== AGENTS.md / CLAUDE.md untouched? ==="; git diff --stat -- AGENTS.md CLAUDE.md skills
echo "=== user-level skill installed? ==="; ls -la ~/.claude/skills/ 2>/dev/null | grep -i mistake || echo "(none at ~/.claude/skills)"
```

Expected: records every path init writes (anticipated: `.no-mistakes.yaml`, `.no-mistakes/`, possibly repo-local agent-skill files, and a user-level `/no-mistakes` skill). **Write the full list into `init-manifest`.** If `AGENTS.md`, `CLAUDE.md`, or anything under `skills/` shows in `git diff --stat`, that is a **collision** — record it prominently; Task 3 will need to neutralize it.

- [ ] **Step 5: Write a minimal trial `.no-mistakes.yaml`**

```yaml
# scratch-trial config
agent: claude
commands:
  lint: "shellcheck bin/hc-wip bin/hc-wip-snapshot.sh bin/hypercore-activate.sh bin/install.sh"
  format: ""
  test: ""
intent:
  enabled: true
test:
  evidence:
    store_in_repo: false
```

Commit it so the gate (which reads config from the default branch) picks it up:

```bash
git add .no-mistakes.yaml && git commit -m "chore: trial gate config"
git push origin main
```

- [ ] **Step 6: Make one real code change and push it through the gate**

```bash
# a harmless, reviewable shell edit so review/lint have real material
printf '\n# trial: touched by no-mistakes gate trial\n' >> bin/hc-wip
git checkout -b trial/gate-smoke
git commit -am "chore: trial change to exercise the gate"
NO_MISTAKES_TELEMETRY=0 git push no-mistakes trial/gate-smoke
```

Expected: the TUI launches and walks `intent → rebase → review → test → document → lint → push`. The `pr` stage **skips** (local bare upstream, no GitHub host). Watch/approve/skip stages as needed. Record: which stages ran agent-backed, any findings raised (auto-fix vs ask-user), whether `shellcheck` ran as the lint baseline, and where the branch landed (`git -C "$SCRATCH/upstream.git" branch` should list the forwarded branch).

- [ ] **Step 7: Inspect the evidence trail and (optionally) a real PR body**

```bash
git -C "$SCRATCH/repo" show --stat HEAD
ls -R "$SCRATCH/repo/.no-mistakes" 2>/dev/null | head -40
```

Expected: an `.no-mistakes/evidence/...` trail exists. To also observe the `pr` stage (optional, only if you want the PR body sample): repeat Step 6 against a *personal throwaway fork* you own via `no-mistakes init --fork-url <your-fork>` — never against `hypermemetic-ai/hypercore`. Capture the generated PR body sections (`## Intent / ## What Changed / ## Risk Assessment / ## Testing / ## Pipeline`) into the report.

- [ ] **Step 8: Write the trial report and render the GO/NO-GO verdict**

Create `backlog/docs/plans/doc-4 - no-mistakes-Gate-—-Trial-Report-GO-NO-GO-Verdict.md` containing: `init-manifest` (full path list + collision yes/no), per-stage observations, the PR-body shape (if captured), rough token cost, and a one-line **`trial-verdict`: GO** or **NO-GO** with reason.

**NO-GO if any of:** init overwrites/modifies `AGENTS.md`/`CLAUDE.md`/`skills/` and the change can't be redirected or gitignored; the pipeline cannot complete a trivial change; or `shellcheck` can't be wired as the lint baseline. On NO-GO, stop and surface the blocker — do not start Task 2.

- [ ] **Step 9: Commit the trial report**

```bash
cd /home/qqp/projects/hypercore
git add 'backlog/docs/plans/doc-4 - no-mistakes-Gate-—-Trial-Report-GO-NO-GO-Verdict.md'
git commit -m "docs: no-mistakes gate trial report + GO/NO-GO verdict"
```

---

### Task 2: Install + configure the gate on the real hypercore repo

**Precondition:** Task 1 `trial-verdict` == GO.

**Files:**
- Create: `/home/qqp/projects/hypercore/.no-mistakes.yaml`
- Modify: `/home/qqp/projects/hypercore/.gitignore` (ignore `.no-mistakes/` scratch/evidence, keep `.no-mistakes.yaml` tracked)
- Conditionally modify: whatever `init-manifest` flagged as a collision (redirect or gitignore per Task 1 findings)

**Interfaces:**
- Consumes: `init-manifest` (collision list), `trial-verdict` (must be GO).
- Produces: **`gate-live`** — a committed, `doctor`-green gate configured for this repo with push target `origin` and PR base `main`.

- [ ] **Step 1: Run `no-mistakes init` in the real repo, guarding known collisions**

```bash
cd /home/qqp/projects/hypercore
git status --porcelain=v1   # confirm clean start (only expected untracked: .ntm/, .understand-anything scratch)
NO_MISTAKES_TELEMETRY=0 no-mistakes init
git status --porcelain=v1   # compare against init-manifest from Task 1
```

Expected: exactly the paths Task 1 predicted. If Task 1 flagged an `AGENTS.md`/`CLAUDE.md`/`skills/` collision, **revert that specific write immediately** (`git checkout -- <path>` for tracked, `rm` for the unwanted new file) — hypercore's own rules/skills are authoritative and must not be replaced by init's generic templates.

- [ ] **Step 2: Write hypercore's `.no-mistakes.yaml`**

```yaml
# hypercore's blast-radius merge gate — externally owned (MIT), agent-agnostic.
# Reference: https://kunchenguid.github.io/no-mistakes/reference/repo-config/
# NOTE: `agent` + `commands` are read from the DEFAULT BRANCH; this file must be
# committed to main to take effect.
agent: [claude, codex]        # ordered fallback (feature #379)
commands:
  lint: "shellcheck bin/hc-wip bin/hc-wip-snapshot.sh bin/hypercore-activate.sh bin/install.sh"
  format: ""                  # no formatter wired (shfmt optional, not required)
  test: ""                    # no formal suite; the agent validates behavior with evidence
ignore_patterns:
  - ".understand-anything/intermediate/**"
  - ".understand-anything/tmp/**"
  - ".understand-anything/.trash-*/**"
  - ".ntm/**"
  - "**/scratchpad/**"
intent:
  enabled: true
test:
  evidence:
    store_in_repo: false      # keep the evidence trail out of the tree
```

- [ ] **Step 3: Ignore the gate's scratch, keep the config tracked**

Append to `/home/qqp/projects/hypercore/.gitignore` (create the file if absent):

```gitignore
# no-mistakes gate — ignore local scratch/evidence, keep .no-mistakes.yaml tracked
.no-mistakes/
```

- [ ] **Step 4: Point the gate at origin / PR base main**

```bash
# The `no-mistakes` git remote is created by init; confirm its push target = origin.
git remote -v | grep no-mistakes
NO_MISTAKES_TELEMETRY=0 no-mistakes doctor
```

Expected: a `no-mistakes` remote exists; `doctor` is green (git + claude + gh). If the push target is not `origin`/`main`, set it per `no-mistakes` CLI config (see `no-mistakes --help` / `reference/cli.md`) and re-run `doctor`.

- [ ] **Step 5: Verify the configured lint command runs clean locally**

```bash
shellcheck bin/hc-wip bin/hc-wip-snapshot.sh bin/hypercore-activate.sh bin/install.sh; echo "exit=$?"
```

Expected: `exit=0` (or a known, accepted set of warnings — record them). If shellcheck flags real issues, either fix them in a separate trivial commit first or add targeted `# shellcheck disable=...` with justification, so the gate's lint baseline starts green.

- [ ] **Step 6: Commit the gate config (this is what activates it)**

```bash
git add .no-mistakes.yaml .gitignore
git commit -m "feat: adopt no-mistakes as the blast-radius merge gate (config)"
git push origin main
```

Expected: config lands on `main`; `agent`/`commands` are now authoritative for future gated pushes. This produces `gate-live`.

---

### Task 3: Rewrite AGENTS.md — merge gate, how work lands, layered skill roles

**Precondition:** `gate-live`.

**Files:**
- Modify: `/home/qqp/projects/hypercore/AGENTS.md` (Externals layer; "Git — how work lands"; skill roles; skill index)

**Interfaces:**
- Consumes: `gate-live`, `init-manifest`.
- Produces: **`rules-updated`** — AGENTS.md describes blast-radius-via-gate and the layered division of labor, with no internal contradictions.

- [ ] **Step 1: Read the current AGENTS.md so edits target exact text**

```bash
sed -n '1,200p' /home/qqp/projects/hypercore/AGENTS.md
```

- [ ] **Step 2: Add the gate to the Externals layer**

Replace the Externals bullet:

> - **Externals** — Context7 (live, version-correct library docs), `gh` (GitHub), `fd` / `eza` / `rg` (fast filesystem).

with:

```markdown
- **Externals** — Context7 (live, version-correct library docs), `gh` (GitHub),
  `fd` / `eza` / `rg` (fast filesystem), and **the gate** (`no-mistakes`, an
  external MIT tool): pushes real work through an independent validation
  pipeline and opens a PR. It is the implementation of the `blast-radius` /
  `human` merge gates below — capability you *push to*, not process you maintain.
```

- [ ] **Step 3: Rewrite "This project" merge-gate line + the blast-radius/human definitions**

Replace:

> **This project: `trunk`** (solo). Autocommit-on-green is agent-driven — `orchestrate` and the escape hatch commit the moment verification passes, because "green" is a fact the agent knows, not a timer a hook can trip.

with:

```markdown
**This project: `blast-radius` via the gate.** Trivial + local + reversible work
still commits on green straight to `main` (the escape hatch — `orchestrate` and
trivial fixes commit the moment the pre-push smoke test passes). **Real work**
(multi-file / user-facing / irreversible) is pushed through the gate:
`git push no-mistakes <branch>` → the pipeline reviews correctness, runs the
tests/lint, and opens a PR → you merge with one click. "Green" for gated work is
no longer a fact the agent *asserts* — it is a fact the gate *proves*,
independently, with a committed evidence trail.
```

In the merge-gate definition list, append to the `blast-radius` and `human` bullets that no-mistakes is their implementation:

- `blast-radius` bullet → add: "The gate (`no-mistakes`) is how the PR path is enforced: real work is `git push`-ed to it, validated, and lands as a PR."
- `human` bullet → add: "Same gate, with every task routed to a human-merged PR."

- [ ] **Step 4: Re-slot the affected skills (the layered consolidation)**

In the "The loop" / behavioral text and the skill index, apply these role changes (edit the relevant sentences; do not delete any skill):

- **`verification-before-completion`** — reframe as the **pre-push smoke test**: the cheap, author-side check (compile / fast unit slice / `lint --fix`) run *before* pushing to the gate, so red work never burns a full gate pipeline. It remains **never skipped**. For gated work, the *authority* on green is the gate, not this skill's self-report.
- **`code-review`** — clarify its lane: the **design + spec** review (Fowler smells tuned to this repo's standards + spec conformance), run **author-side, in-session**. The gate's `review` stage covers **correctness** (bugs / security / perf / breaking changes / error handling) — a different, complementary target. Run both; they do not overlap.
- **`finishing-a-development-branch`** — for gated work, the gate performs rebase / push / PR; this skill narrows to **the merge decision** (approve + merge the gate's PR, or send it back).
- **`receiving-code-review`** — note it now also applies to **the gate's findings**: weigh them, don't rubber-stamp.

Edit the skill-index table's "reach for it when" cells for these four rows to match the reframed roles above.

- [ ] **Step 5: Add the gate invocation to the loop's landing step**

In "The loop", step 2 (Plan → land) or a new "Land" note, add:

```markdown
- **Land (gated)** — for real work, `git push no-mistakes <branch>` hands the
  verified branch to the gate; it runs correctness review + tests + lint and
  opens the PR. `/no-mistakes` (the agent skill init installs) does the same
  headlessly. Trivial work skips the gate and commits straight to `main`.
```

- [ ] **Step 6: Coherence pass — no contradictions**

```bash
grep -n -iE "commit on green|straight to .?main|trunk|no-mistakes|blast-radius" /home/qqp/projects/hypercore/AGENTS.md
```

Expected: every "commit on green straight to main" statement is now scoped to *trivial* work; no leftover line claims this project is plain `trunk`. Read the "Git — how work lands" section end-to-end and confirm it reads as one coherent policy.

- [ ] **Step 7: Commit the rules update**

```bash
cd /home/qqp/projects/hypercore
git add AGENTS.md
git commit -m "docs: route real work through the no-mistakes gate; layered skill roles"
git push origin main
```

---

### Task 4: Dogfood — run one real change through the gate to a real PR, and confirm no rail collision

**Precondition:** `rules-updated`.

**Files:**
- Modify: one small, real hypercore file (pick a genuine pending improvement, e.g. a `bin/` script comment/typo or a `README.md` clarification)

**Interfaces:**
- Consumes: `gate-live`, `rules-updated`.
- Produces: **`dogfood-evidence`** — a merged (or ready-to-merge) PR on `hypermemetic-ai/hypercore` produced entirely by the gate, and confirmation the git-guardrail hooks don't false-positive on `git push no-mistakes`.

- [ ] **Step 1: Confirm the guardrails don't block a plain gate push**

The git-guardrails hook blocks destructive git (`push --force` / `-f`, remote
branch deletion, `reset --hard`, `clean -fd`, `reflog expire`, `update-ref -d`,
history rewrites) — not a plain push. Verify the matcher:

```bash
grep -rn -iE "force|no-mistakes|push" ~/.config/hypercore 2>/dev/null | grep -i guardrail || true
```

Expected: no rule matches a plain `git push no-mistakes <branch>`. `no-mistakes` uses `--force-with-lease` **internally on its own remote** (a separate process), which is outside Claude Code's Bash-hook surface, so there is no collision. Record the finding.

- [ ] **Step 2: Make a small, genuine change on a branch**

```bash
cd /home/qqp/projects/hypercore
git checkout -b gate/first-real
# ...make one real, useful edit...
git commit -am "docs: <describe the real change>"
```

- [ ] **Step 3: Push it through the gate to a real PR**

```bash
NO_MISTAKES_TELEMETRY=0 git push no-mistakes gate/first-real
```

Expected: the full pipeline runs and the `pr` stage opens a PR on `hypermemetic-ai/hypercore` with the generated intent/risk/testing/pipeline body. Resolve any ask-user findings via the TUI.

- [ ] **Step 4: Verify the PR exists and is green, then merge**

```bash
gh pr list --repo hypermemetic-ai/hypercore
gh pr view --repo hypermemetic-ai/hypercore <n>
gh pr merge --repo hypermemetic-ai/hypercore <n> --squash   # the one-click land
```

Expected: a gate-produced PR, checks green, merged to `main`. This is the `dogfood-evidence` and the `verification-before-completion` proof for the whole integration.

---

### Task 5: Compound — capture the decision so it isn't relearned

**Precondition:** `dogfood-evidence`.

**Files:**
- Create through `backlog doc create`: a `solutions` document titled `no-mistakes gate`
- Modify: `/home/qqp/projects/hypercore/CONCEPTS.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a durable solution doc + vocabulary entries.

- [ ] **Step 1: Write the solution doc**

Create a Backlog `solutions` document titled `no-mistakes gate` covering: the decision (blast-radius, layered), the load-bearing insight (**the two reviews are complementary, not redundant** — gate = correctness, `code-review` = design+spec), why we demoted `verification-before-completion` rather than deleting it, the trial's `init-manifest` findings, and the exact `git push no-mistakes` flow. Follow the format in Backlog document `doc-15` (`Solutions`).

- [ ] **Step 2: Add vocabulary to CONCEPTS.md**

Add terms: **the gate** (no-mistakes as external blast-radius enforcement), **author-side vs verifier-side review** (in-session design+spec vs gate correctness), **pre-push smoke test** (demoted `verification-before-completion` role), **evidence trail** (gate-persisted proof of green).

- [ ] **Step 3: Commit**

```bash
cd /home/qqp/projects/hypercore
git add backlog/docs/solutions CONCEPTS.md
git commit -m "docs: capture no-mistakes gate decision + vocabulary"
git push origin main
```

---

## Self-Review

**Spec coverage:**
- Blast-radius gate (trivial→main, real→gate→PR) → Task 3 Steps 3, 5.
- Layered consolidation (keep code-review; demote verification; shrink finishing-a-branch; receiving-code-review weighs gate) → Task 3 Step 4.
- First step = live trial in a scratch clone before touching rules → Task 1 (hard GO/NO-GO gate).
- `init` writes repo-local files → trialed & inspected before real use → Task 1 Step 4 (`init-manifest`), consumed by Task 2 Step 1.
- Edit AGENTS.md "Git — how work lands" + skill index → Task 3.
- Config uses this repo's real commands (shellcheck; no test suite) → Task 2 Step 2.
- PR-shaped / never pollute real remote during trial → Task 1 Steps 3, 6 (local bare upstream).
- Cost awareness (gate real work only) → Global Constraints + Task 3 Step 3.
- No git-rail collision → Task 4 Step 1.

**Placeholder scan:** The one deliberate blank is Task 4 Step 2's "one real, useful edit" — chosen at execution time by design (dogfood needs a genuine pending change, not a fabricated one). All config/prose content is provided in full.

**Consistency:** `init-manifest` / `trial-verdict` / `gate-live` / `rules-updated` / `dogfood-evidence` are produced and consumed with matching names across tasks. Skill names match hypercore's index (`verification-before-completion`, `code-review`, `finishing-a-development-branch`, `receiving-code-review`).
