# Plan — methodology by link, not copy (drop the plugin)

> **Superseded gate examples (2026-07-08):** This dated plan's merge-gate
> examples predate qq's all-gated, landing-agent-owned policy. Current landings
> use `no-mistakes axi run --intent "<task + AC>"`, adding `--skip ci` only
> after confirming no CI exists. `git push no-mistakes` is only the fallback
> when no skip flags are needed and no explicit intent is available; see
> `AGENTS.md` and `qq-methodology.md`.

**Intent (approved by owner).** qq is the source of truth for the agent
methodology. Today linked repos hold *hand-copied* adaptations of qq's `AGENTS.md`,
and skills come from a versioned *plugin copy*. Both are snapshots, so they drift —
meeting-reviewer's `AGENTS.md` went stale ("five layers / NTM / `qq:` plugin").

**Fix: everything becomes a live link to this repo. No copies, no plugin, no drift.**
- **Rules** → a project-agnostic core file (`qq-methodology.md`) that every repo
  (qq included) `@`-imports through a symlink. Update it once → every repo current
  next session.
- **Skills** → symlinked from this repo into `~/.claude/skills/` (drop the qq
  plugin entirely); invoked as `/<name>`, live from `skills/`.

This is the same idiom qq already uses for the cockpit (configs symlinked from the
repo as the live source of truth).

Mechanism verified against Claude Code docs: `AGENTS.md`/`CLAUDE.md` support
`@path` imports that **follow symlinks** (relative to the importing file, ≤4 hops,
skipped inside code spans). Plugins **cannot** ship always-on rules, and the plugin
cache is a versioned copy — so the link must point at this **repo**, not the plugin.

The owner is shown the meeting-reviewer diff before anything is committed/pushed to
it. No auto-push in this build — Codex edits the working tree only.

---

## Handoff 1 — qq repo (`/home/qqp/projects/qq`), working tree only, NO commit

### 1. New file `qq-methodology.md` (the shared, project-agnostic core)
Extract the methodology out of the current `AGENTS.md` into this new file, worded so
it is true for **any** qq-linked repo (no "qq is surlej's…", no "this project:
blast-radius", no repo-specific paths in prose). Include, adapted from current
`AGENTS.md`:
- A one-line header: `# The qq methodology` + a sentence: "The shared operating core
  every qq-linked repo runs on. Linked live from the qq repo via a symlinked
  `@`-import — do not edit a copy; edit it in qq."
- **## The layers** — the layer model, generic: Rules (this import + the repo's own
  `AGENTS.md` header), Actions (curated skills, invoked `/<name>`, linked live from
  qq's `skills/`), Knowledge (`.understand-anything/knowledge-graph.json`, built with
  `/understand --auto-update`), Sessions (herdr — named parallel agents, each in its
  own worktree), Cockpit (the operator's tuned terminal surface, in the qq repo),
  Externals (Context7, `gh`, `fd`/`eza`/`rg`, and the gate — `no-mistakes`). Keep it
  tight; drop qq-repo-relative install paths from this shared file.
- **## Behavioral floor (always)** — copy verbatim from current `AGENTS.md`.
- **## Routing (the escape hatch)** — copy verbatim, including the `orchestrate`
  hand-off sentence.
- **## The loop** — copy verbatim (Align→…→Compound), including the Support line.
- **## Git — how work lands** — copy the generic parts (commit-on-green, push,
  revert, WIP savepoint, isolation) AND the three **merge-gate definitions**
  (`trunk` / `blast-radius` / `human`). Do NOT include the "**This project:
  blast-radius via the gate.**" paragraph — that is per-repo (stays in the header).
  Reword any "this project" phrasing to be gate-neutral; the repo header names its
  own gate.
- **## Skill index** — copy the table verbatim (bare `/<name>` skills).
- Closing note: skills are linked from qq (vendored from MIT sources or authored for
  qq — see qq's `SKILLS-ATTRIBUTION.md`); the git rail runs as an always-on hook.

### 2. Rewrite `AGENTS.md` (qq's own) → thin header + import of the core
Replace the whole file with:
- `# qq — agent operating rules`
- The current intro paragraph ("qq is surlej's bespoke agentic-dev command
  center…") — keep.
- A short **This repo** note: qq is the source of truth for the methodology — the
  shared core is `qq-methodology.md` (imported below) and every linked repo symlinks
  + `@`-imports it; skills live in `skills/` and are linked into `~/.claude/skills`
  by `bin/qq-link.sh`; cockpit configs in `cockpit/` symlink into `~/.config` via
  `bin/qq-activate.sh`.
- `**Merge gate: `blast-radius`.**` + the current "This project: blast-radius via the
  gate." paragraph (moved here from the core).
- `## Methodology` containing exactly the import line: `@qq-methodology.md`
Leave `CLAUDE.md` (symlink → `AGENTS.md`) as is.

### 3. New script `bin/qq-link.sh` (the linking capability; `set -euo pipefail`, shellcheck-clean)
Resolve `QQ` from the script's own location (`cd "$(dirname "$0")/.."`). Idempotent,
backs up any real file it would replace to `*.qq.bak`. Subcommands:
- `skills` — for each `"$QQ"/skills/*/` dir, create symlink
  `~/.claude/skills/<name>` → that dir. Skip if the link already points there; if a
  real dir/file exists there, back it up first. Do NOT touch unrelated skills already
  in `~/.claude/skills` (e.g. `no-mistakes`, `typeset-pdf`). Print a one-line summary
  per skill.
- `repo <path> [--gate <trunk|blast-radius|human>]` (default gate `blast-radius`):
  - `mkdir -p <path>/.claude`; symlink `<path>/.claude/qq-methodology.md` →
    `"$QQ"/qq-methodology.md` (idempotent).
  - If `<path>/AGENTS.md` is **absent**, scaffold one: `# <basename> — agent
    operating rules`, a line "This project runs on qq. Merge gate: `<gate>`.", then
    `## Methodology` + `@.claude/qq-methodology.md`. If it is **present**, do not
    rewrite prose — just ensure it contains the line `@.claude/qq-methodology.md`
    (append a `## Methodology` section with that import if missing).
  - Merge Context7 into `<path>/.mcp.json` via `python3` (create file if missing; add
    the `context7` server — `{"command":"npx","args":["-y","@upstash/context7-mcp@latest"]}`
    — only if absent; never remove existing servers such as `recall-ai`).
  - Seed `<path>/CONCEPTS.md` only if missing, with the standard qq CONCEPTS header
    (match qq's current `CONCEPTS.md` template text).
- No args / unknown → short usage.

### 4. Update `bin/qq-activate.sh`
- Rewrite the header comment block to say links, not copies, and that skills are
  linked (the qq plugin is dropped).
- Add a step that runs `bash "$QQ/bin/qq-link.sh" skills` (link skills into
  `~/.claude/skills`).
- Replace the meeting-reviewer copy-staging (the `git -C "$MR" add AGENTS.md CLAUDE.md
  … .claude/skills` block) with `bash "$QQ/bin/qq-link.sh" repo "$MR"`. Keep the qq
  commit/push step; for MR, stage the link artifacts (`AGENTS.md`,
  `.claude/qq-methodology.md`, `.mcp.json`, `CONCEPTS.md`) but do NOT rewrite MR's
  `AGENTS.md` prose here.
- Renumber the "N/6" step labels if the count changes; keep it coherent.

### 5. Drop the qq plugin (repo side)
- Delete `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` (and the
  now-empty `.claude-plugin/` dir).
- `bin/install.sh`: line ~76 — replace the "activate in a project: /plugin
  marketplace add … /plugin install qq@qq" hint with a link hint: skills via
  `bash bin/qq-link.sh skills`, per-repo via `bash bin/qq-link.sh repo <path>`. Leave
  the Understand-Anything plugin hints (a separate third-party plugin) untouched.
- `README.md`: rewrite setup step 3 ("activate as a plugin") to the link model
  (`bash bin/qq-link.sh skills`; skills become `/<name>`); update the "## Skills"
  section and any `/qq:grilling` → `/grilling`; keep the Understand-Anything step.

### Acceptance (Handoff 1)
- `qq-methodology.md` exists; `AGENTS.md` contains `@qq-methodology.md` and no longer
  duplicates the floor/loop/skill-index prose.
- `bash bin/qq-link.sh skills` run once: `~/.claude/skills/grilling` … all qq
  skills are symlinks into `skills/`; `no-mistakes` and `typeset-pdf` untouched;
  re-running prints "ok"/idempotent and changes nothing.
- `bash -n bin/qq-link.sh && shellcheck bin/qq-link.sh` clean (same for the edited
  `qq-activate.sh` / `install.sh`).
- `rg -n 'qq:[a-z]|/plugin install qq|qq@qq' README.md bin/ .claude-plugin/ 2>/dev/null`
  → no hits (`.claude-plugin/` gone).
- No commit. `git status` shows the intended working-tree changes only.

---

## Handoff 2 — meeting-reviewer (`/home/qqp/projects/meeting-reviewer`), working tree only, NO commit/push
(Run after Handoff 1 verifies. Shown to owner before any commit/push.)

1. `bash /home/qqp/projects/qq/bin/qq-link.sh repo /home/qqp/projects/meeting-reviewer`
   → creates `.claude/qq-methodology.md` symlink; `.mcp.json` merge is a no-op
   (already has context7 + recall-ai — confirm both remain); CONCEPTS seed is a no-op.
2. Rewrite `AGENTS.md` surgically:
   - New header: `# meeting-reviewer — agent operating rules`, "This project runs on
     qq. Merge gate: `blast-radius`.", one line noting the methodology is linked live
     from qq (imported below).
   - `## Methodology` + `@.claude/qq-methodology.md`.
   - **Preserve** the "## Setup status (this project)" and "Project layout" tail
     (current lines ~75–90), BUT update the **Skills** bullet: it no longer comes
     from a plugin — skills are linked from qq into `~/.claude/skills`, invoked
     `/<name>`; drop the "vendored `.claude/skills/` copies were removed so the plugin
     is the single source of truth" sentence. Knowledge-layer + Context7 bullets stay.
   - Remove the now-duplicated methodology body (old "five layers", floor, routing,
     loop, skill index) — it comes from the import now.
3. `README.md` line ~60: "installed **qq plugin** (invoke as `qq:<name>`)" →
   "skills linked from qq into `~/.claude/skills` (invoke as `/<name>`)".
4. `docs/plans/2026-07-06-chunk-3-calendar-oauth.md` line 3: `qq:executing-plans` →
   `executing-plans`.

### Acceptance (Handoff 2)
- `readlink -f .claude/qq-methodology.md` resolves to `/home/qqp/projects/qq/qq-methodology.md`.
- `AGENTS.md` contains `@.claude/qq-methodology.md`, keeps the Setup/Project-layout
  tail, and no longer contains "five layers" / "NTM" / `qq:<name>`.
- `.mcp.json` still has both `context7` and `recall-ai`.
- `git -C /home/qqp/projects/meeting-reviewer status` shows only these files changed;
  no src/tests touched.

---

## Owner steps (after review) — NOT for Codex
- Land qq changes (blast-radius: `git push no-mistakes <branch>` or commit-on-green).
- Land meeting-reviewer changes after reviewing the diff.
- Drop the plugin from Claude Code: `/plugin uninstall qq@qq` then
  `/plugin marketplace remove qq` (restart to clear `qq:<name>` skills).
