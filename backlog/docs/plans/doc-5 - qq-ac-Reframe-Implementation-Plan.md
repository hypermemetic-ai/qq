---
id: doc-5
title: qq-ac Reframe Implementation Plan
type: specification
created_date: '2026-07-10 20:56'
updated_date: '2026-07-10 21:02'
tags:
  - plan
  - historical
---
# qq-ac Reframe Implementation Plan

> **Superseded gate examples (2026-07-08):** This dated plan's Phase 3 fallback
> and git-push-first examples predate qq's all-gated, landing-agent-owned policy.
> Current landings use `no-mistakes axi run --intent "<task + AC>"`, adding
> `--skip ci` only after confirming no CI exists. `git push no-mistakes` is only
> the fallback when no skip flags are needed and no explicit intent is available;
> see `AGENTS.md` and `qq-methodology.md`.

> **For the implementer (Codex):** This repo's `AGENTS.md` binds you as the behavioral floor. Implement Phase 1 task-by-task on a branch; do **not** touch the on-disk directory name, the git remote, or GitHub — those are Phase 4, run by the conductor (Claude) after landing. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn this repo from "hypercore — a distributable engineering methodology" into **qq-ac — surlej's bespoke agentic-dev command center**: rename every identifier, add a **Cockpit** layer as the sixth layer, vendor the cockpit's tuned configs (yazi · broot · glow · mdcat · herdr + shell glue) into the repo as the *live source of truth* via symlinks, and drop all "distribution for others" framing.

**Architecture:** Three concentric changes land in sequence. (1) **In-repo transform** — text/identity rename + a new `cockpit/` directory holding the vendored, renamed configs + a rewritten activation script that symlinks them into `~/.config`. (2) **Land** the in-repo change through the no-mistakes gate while paths are still stable. (3) **Flip** — rename the GitHub repo and the on-disk directory last, because renaming a live session's cwd breaks the session and herdr.

**Tech Stack:** Markdown (docs), TOML/YAML/JSON (tool configs), Bash (glue + install), Claude Code plugin manifests, `gh` (GitHub rename), `git`, the no-mistakes gate.

## Global Constraints

The **naming map** — apply everywhere in-repo. Copy these tokens verbatim.

| old | new | notes |
|---|---|---|
| `hypercore` (project / plugin / marketplace name) | `qq-ac` | identity |
| `/hypercore:<skill>` (namespace) | `/qq-ac:<skill>` | derived from plugin name |
| `HYPERCORE_HOME` (env var) | `QQAC_HOME` | default `$HOME/projects/qq-ac` |
| `hcy` `hcbr` `hcroot` (shell funcs) | `qqy` `qqbr` `qqroot` | in `file-navigation.bash` + herdr keys |
| `hfiles` `htree` (aliases) | `qfiles` `qtree` | |
| `hc-wip` `hc-wip-snapshot.sh` (bin) | `qq-wip` `qq-wip-snapshot.sh` | rename files + contents + refs |
| `hypercore-activate.sh` | `qqac-activate.sh` | rename + expand (symlink cockpit) |
| `~/projects/hypercore` (path literal) | `~/projects/qq-ac` | yazi `g H`, docs, scripts |
| `hypermemetic-ai/hypercore` (GitHub) | `hypermemetic-ai/qq-ac` | **Phase 4 only** |

**Do NOT rename** (generic, not hypercore-branded): the `y()` and `br()` shell wrappers; `refs/wip/<branch>` (branch-scoped); the `no-mistakes` remote/gate.

**Leave archival, do not rewrite:** existing `backlog/docs/plans/doc-{3,4}*.md` and other dated docs — they are truthful historical records of "hypercore" work. The knowledge graph (`.understand-anything/`) regenerates on commit; do not hand-edit it.

**Cockpit tools (all installed, verified):** yazi 26.5.6 · broot · glow 2.1.2 · mdcat 2.10.1 · herdr 0.7.1. No multiplexer (tmux/zellij absent) — "panes" = herdr panes.

**Symlink rule:** the repo's `cockpit/` files are the source of truth. Install symlinks each *individual file* under `~/.config` to the repo (never the herdr *directory* — it holds live sockets). Back up any pre-existing real file to `*.qqac.bak` first; if a correct symlink already exists, skip.

---

## File Structure

**New — `cockpit/` (vendored from `~/.config`, naming-map applied):**
- `cockpit/yazi/yazi.toml` — md opener (mdcat primary, glow tuned alt), preview pane dropped
- `cockpit/yazi/keymap.toml` — `!` shell; `g H` → `~/projects/qq-ac`
- `cockpit/glow/glow.yml` — width 80, no pager
- `cockpit/glow/tuned.json` — hand-tuned markdown theme (verbatim, no token changes)
- `cockpit/herdr/config.toml` — tokyo-night; `prefix+f`→`qqy`, `prefix+shift+f`→`qqbr`
- `cockpit/shell/file-navigation.bash` — `QQAC_HOME`, `y`/`br`, `qqroot`/`qqy`/`qqbr`, `qfiles`/`qtree`
- `cockpit/README.md` — what each config is, the yazi+glow flow, how symlinks are wired

**Renamed — `bin/`:**
- `bin/qq-wip` (was `hc-wip`), `bin/qq-wip-snapshot.sh` (was `hc-wip-snapshot.sh`)
- `bin/qqac-activate.sh` (was `hypercore-activate.sh`) — now also symlinks the cockpit
- `bin/install.sh` — preflight adds yazi/broot/glow/mdcat checks

**Modified — identity/docs:**
- `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` — name → `qq-ac`
- `AGENTS.md` — 6th layer (Cockpit), rebrand, drop distribution framing
- `README.md` — rewrite: bespoke, 6 layers, cockpit setup, drop "Distribution vs consumer"
- `SKILLS-ATTRIBUTION.md`, `.no-mistakes.yaml`, `skills/git-guardrails-claude-code/scripts/block-dangerous-git.sh`, and skill `SKILL.md`s mentioning `hypercore`
- `CLAUDE.md` is a symlink → `AGENTS.md` (no direct edit)

---

## Phase 1 — In-repo transform (Codex, on branch `qq-ac/reframe`)

### Task 1: Vendor the cockpit configs into `cockpit/`

**Files:**
- Create: `cockpit/yazi/yazi.toml`, `cockpit/yazi/keymap.toml`, `cockpit/glow/glow.yml`, `cockpit/glow/tuned.json`, `cockpit/herdr/config.toml`, `cockpit/shell/file-navigation.bash`

**Interfaces — Produces:** the six config files the activate script (Task 3) symlinks; the token names the docs (Task 5) reference.

- [ ] **Step 1: Copy the live configs into the repo.**
```bash
cd ~/projects/hypercore
mkdir -p cockpit/yazi cockpit/glow cockpit/herdr cockpit/shell
cp ~/.config/yazi/yazi.toml      cockpit/yazi/yazi.toml
cp ~/.config/yazi/keymap.toml    cockpit/yazi/keymap.toml
cp ~/.config/glow/glow.yml       cockpit/glow/glow.yml
cp ~/.config/glow/tuned.json     cockpit/glow/tuned.json
cp ~/.config/herdr/config.toml   cockpit/herdr/config.toml
cp ~/.config/shell/file-navigation.bash cockpit/shell/file-navigation.bash
```

- [ ] **Step 2: Apply the naming map to the copied files.** Edit only these tokens; leave everything else byte-for-byte (especially `cockpit/glow/tuned.json` — **no changes**, it's pure theme data):
  - `cockpit/shell/file-navigation.bash`: `HYPERCORE_HOME`→`QQAC_HOME`; default `$HOME/projects/hypercore`→`$HOME/projects/qq-ac`; `hcroot`→`qqroot`, `hcy`→`qqy`, `hcbr`→`qqbr`; `alias hfiles='hcy'`→`alias qfiles='qqy'`, `alias htree='hcbr'`→`alias qtree='qqbr'`. Keep `y()` and `br()` unchanged.
  - `cockpit/yazi/keymap.toml`: `run = "cd ~/projects/hypercore"`→`run = "cd ~/projects/qq-ac"`; `desc = "Go to Hypercore"`→`desc = "Go to qq-ac"`.
  - `cockpit/herdr/config.toml`: `command = "bash -ic 'hcy; exec bash -i'"`→`'qqy; ...'`; `command = "bash -ic 'hcbr; exec bash -i'"`→`'qqbr; ...'`.
  - `cockpit/yazi/yazi.toml`, `cockpit/glow/glow.yml`: no hypercore tokens — leave as-is.

- [ ] **Step 3: Verify shell glue is syntactically valid and tokens are renamed.**
```bash
bash -n cockpit/shell/file-navigation.bash && echo "syntax OK"
rg -n 'HYPERCORE_HOME|hcy|hcbr|hcroot|hfiles|htree|projects/hypercore' cockpit/ ; echo "exit=$? (want: 1 = no matches)"
rg -n 'QQAC_HOME|qqy|qqbr|qqroot|qfiles|qtree|projects/qq-ac' cockpit/ | head
```
Expected: `syntax OK`; first `rg` prints nothing and `exit=1`; second `rg` shows the new tokens.

- [ ] **Step 4: Commit.**
```bash
git add cockpit/ && git commit -m "qq-ac: vendor cockpit configs (yazi/glow/herdr/shell), naming-map applied"
```

### Task 2: Rename the wip bin scripts

**Files:**
- Rename: `bin/hc-wip`→`bin/qq-wip`, `bin/hc-wip-snapshot.sh`→`bin/qq-wip-snapshot.sh`
- Modify: contents of both; any `hc-wip` reference in `AGENTS.md`, `README.md`

**Interfaces — Consumes:** nothing. **Produces:** `qq-wip` command name referenced by docs + activate.

- [ ] **Step 1: git-mv the scripts.**
```bash
git mv bin/hc-wip bin/qq-wip
git mv bin/hc-wip-snapshot.sh bin/qq-wip-snapshot.sh
```

- [ ] **Step 2: Rename tokens inside the scripts.** In both files replace `hc-wip`→`qq-wip`, `hc-wip-snapshot`→`qq-wip-snapshot`, and any `HYPERCORE`/`hypercore` self-reference in comments/usage → `qq-ac`/`QQAC`. Read each file first; keep logic identical.

- [ ] **Step 3: Update doc references.** In `AGENTS.md` and `README.md`, `hc-wip`→`qq-wip` (e.g. "Recover with `hc-wip list | diff | branch <name>`").

- [ ] **Step 4: Verify no stale wip tokens remain and scripts still parse.**
```bash
rg -n 'hc-wip' . -g '!backlog/docs/plans/doc-{3,4}*' ; echo "exit=$? (want 1)"
bash -n bin/qq-wip-snapshot.sh && echo "snapshot syntax OK"
```
Expected: no matches (`exit=1`); `snapshot syntax OK`.

- [ ] **Step 5: Commit.**
```bash
git add -A && git commit -m "qq-ac: rename hc-wip → qq-wip (bin + doc refs)"
```

### Task 3: Rewrite the activation script to symlink the cockpit

**Files:**
- Rename+rewrite: `bin/hypercore-activate.sh`→`bin/qqac-activate.sh`

**Interfaces — Consumes:** `cockpit/*` (Task 1), `bin/qq-wip*` (Task 2). **Produces:** the symlink wiring Phase 4 runs.

- [ ] **Step 1: git-mv the script.**
```bash
git mv bin/hypercore-activate.sh bin/qqac-activate.sh
```

- [ ] **Step 2: Rebrand + repoint the existing steps.** Read the file. Change: header/comments `hypercore`→`qq-ac`; `HC=/home/qqp/projects/hypercore`→`QQAC=/home/qqp/projects/qq-ac` (and all `$HC` refs → `$QQAC`); the wip symlink source `bin/hc-wip*`→`bin/qq-wip*`, and the `~/.local/bin/hc-wip` link name → `qq-wip`; the commit messages' `hypercore`→`qq-ac`. Keep the git-rail-before-yolo ordering and the meeting-reviewer block behavior; update its path literals only if present.

- [ ] **Step 3: Add a cockpit-symlink step** (new numbered section). Insert a block that, for each pair below, backs up a pre-existing real file to `*.qqac.bak` and creates a symlink into `~/.config` pointing at the repo; skip if the correct symlink already exists:
```bash
say "N/M  cockpit — symlink tuned configs (~/.config → $QQAC/cockpit)"
link_cfg() {  # $1 = repo-relative source, $2 = ~/.config dest
  local src="$QQAC/$1" dst="$HOME/.config/$2"
  mkdir -p "$(dirname "$dst")"
  if [ -L "$dst" ] && [ "$(readlink -f "$dst")" = "$(readlink -f "$src")" ]; then
    echo "     ok (already linked): $2"; return
  fi
  [ -e "$dst" ] && ! [ -L "$dst" ] && cp -a "$dst" "$dst.qqac.bak" && echo "     backed up $2 → $2.qqac.bak"
  ln -sfn "$src" "$dst" && echo "     linked $2 → $1"
}
link_cfg cockpit/yazi/yazi.toml            yazi/yazi.toml
link_cfg cockpit/yazi/keymap.toml          yazi/keymap.toml
link_cfg cockpit/glow/glow.yml             glow/glow.yml
link_cfg cockpit/glow/tuned.json           glow/tuned.json
link_cfg cockpit/herdr/config.toml         herdr/config.toml
link_cfg cockpit/shell/file-navigation.bash shell/file-navigation.bash
```
(Renumber the `say "X/Y"` headers so the count is consistent.)

- [ ] **Step 4: Verify the script parses and references the right paths.**
```bash
bash -n bin/qqac-activate.sh && echo "activate syntax OK"
rg -n 'hc-wip|/projects/hypercore|\bHC=' bin/qqac-activate.sh ; echo "exit=$? (want 1)"
```
Expected: `activate syntax OK`; no matches (`exit=1`).

- [ ] **Step 5: Commit.**
```bash
git add -A && git commit -m "qq-ac: qqac-activate symlinks the cockpit into ~/.config (repo = source of truth)"
```

### Task 4: Rename the plugin identity

**Files:**
- Modify: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`

**Interfaces — Produces:** the `/qq-ac:` skill namespace.

- [ ] **Step 1: Rewrite `plugin.json`.** `"name": "hypercore"`→`"qq-ac"`; description → `"surlej's bespoke agentic-dev command center: skills, rules, knowledge, sessions, and a tuned terminal cockpit."`; `keywords` drop `"hypercore"`, add `"qq-ac"`, keep the rest.

- [ ] **Step 2: Rewrite `marketplace.json`.** Top-level `"name": "hypercore"`→`"qq-ac"`; description → `"surlej's personal qq-ac plugin."`; the plugin entry `"name": "hypercore"`→`"qq-ac"` and its description → `"Curated skills + operating rules, plus knowledge, session, and cockpit layers."`. Keep `"source": "./"`.

- [ ] **Step 3: Verify JSON is valid.**
```bash
for f in .claude-plugin/plugin.json .claude-plugin/marketplace.json; do node -e "JSON.parse(require('fs').readFileSync('$f'))" && echo "$f OK"; done
rg -n '"hypercore"' .claude-plugin/ ; echo "exit=$? (want 1)"
```
Expected: both `OK`; no `"hypercore"` matches.

- [ ] **Step 4: Commit.**
```bash
git add .claude-plugin && git commit -m "qq-ac: rename plugin + marketplace (namespace /qq-ac:)"
```

### Task 5: Reframe the narrative — AGENTS.md + README.md + the cockpit layer

**Files:**
- Modify: `AGENTS.md`, `README.md`, `cockpit/README.md` (create), `SKILLS-ATTRIBUTION.md`, `.no-mistakes.yaml`, `skills/git-guardrails-claude-code/scripts/block-dangerous-git.sh`, and any `skills/*/SKILL.md` containing `hypercore`

**Interfaces — Consumes:** the naming map, the cockpit tokens (Task 1). **Produces:** the reframed identity.

- [ ] **Step 1: `AGENTS.md` — rebrand + add the Cockpit layer.**
  - Title/opening: `hypercore`→`qq-ac`; reframe the one-liner to "qq-ac is surlej's bespoke agentic-dev command center — capability I reach for, tuned to one operator: me."
  - "The five layers"→"The six layers"; add:
    > - **Cockpit** — `cockpit/`: the human-driven terminal surface and its tuned configs — **herdr** (multiplexer; tokyo-night; `prefix+f`→`qqy`, `prefix+shift+f`→`qqbr`), **yazi** (file pane; `.md` opens in-pane via mdcat/glow, preview pane dropped), **broot** (tree nav via `qqbr`), **glow**/**mdcat** (pane-width markdown rendering; `glow/tuned.json` theme). Symlinked from `~/.config` so the repo is the live source of truth. Installed by `bin/qqac-activate.sh`.
  - Sweep remaining `hypercore`/`hc-wip`→`qq-ac`/`qq-wip` (skill-index row "authoring or editing a hypercore skill"→"a qq-ac skill", etc.).

- [ ] **Step 2: `README.md` — rewrite for bespoke framing.**
  - Header + intro → qq-ac, "my own agent core; bespoke because it only serves me."
  - Layers table: add the **Cockpit** row (`cockpit/`, human-driven tools + tuned configs).
  - Setup: `bash bin/qqac-activate.sh` as the one-shot; plugin install lines → `qq-ac@qq-ac`; add a "Cockpit" setup bullet (symlinks + the yazi/glow flow).
  - **Delete** the "Distribution vs. consumer" section. Keep "Provenance" but reframe: "Curated from MIT sources, kept only where they serve my workflow" — no "become hypercore-powered" language.

- [ ] **Step 3: Create `cockpit/README.md`.** One screen: what each config is, the flow ("herdr `prefix+f` spawns a pane running `qqy` → yazi at repo root → Enter on a `.md` renders in-pane via mdcat or glow-tuned, sized to the pane"), and that they're symlinked (edit here or in `~/.config` — same file).

- [ ] **Step 4: Sweep the remaining files.** `SKILLS-ATTRIBUTION.md`, `.no-mistakes.yaml`, `block-dangerous-git.sh` (comments), and any `skills/*/SKILL.md` hit by `rg -l hypercore`: replace `hypercore`→`qq-ac` where it names the project (leave prose that references upstream skill *sources* accurate). Do **not** touch `backlog/docs/plans/doc-{3,4}*.md` (archival).

- [ ] **Step 5: Verify the sweep is complete.**
```bash
rg -n 'hypercore|HYPERCORE|hc-wip|\bhcy\b|\bhcbr\b' . \
  -g '!backlog/docs/plans/doc-{3,4}*' -g '!.understand-anything/**' -g '!**/*.qqac.bak'
echo "exit=$? (want 1 = clean, except intentional upstream-source mentions)"
```
Expected: only intentional matches (e.g. a sentence crediting an upstream repo), if any — review each. No project-identity `hypercore` left.

- [ ] **Step 6: Commit.**
```bash
git add -A && git commit -m "qq-ac: reframe identity — bespoke command center + Cockpit as the sixth layer"
```

---

## Phase 2 — Verify (Claude sub-agent, `verification-before-completion`)

Run and read full output; claim only with evidence:
- [ ] `bash -n` on every `bin/*.sh` and `cockpit/shell/file-navigation.bash` → all parse.
- [ ] `node -e JSON.parse` on both `.claude-plugin/*.json` and `cockpit/glow/tuned.json` → valid.
- [ ] Source the glue in a subshell: `bash -ic 'source cockpit/shell/file-navigation.bash; type qqy qqbr qqroot; echo OK'` → functions defined.
- [ ] Repo-wide token sweep (the Step 5 command above) → clean.
- [ ] `git status` clean; `git log --oneline -6` shows the six task commits.
- [ ] **Dry-run the symlink logic** against a temp `HOME` so nothing in the real `~/.config` changes, and confirm links resolve to the repo.

## Phase 3 — Land through the gate

- [ ] Pre-push smoke test (Phase 2 green).
- [ ] `git push no-mistakes qq-ac/reframe` → pipeline reviews, opens a PR. **If the gate isn't applicable to a docs/config diff, fall back** to a standard `gh pr create` → review → merge to `main`.
- [ ] Owner merges the PR (one click). Paths are still `hypercore` at this point — intentional.

## Phase 4 — Flip: GitHub + on-disk directory (conductor, terminal step)

> Runs **after** the PR merges. Renaming the live session's cwd breaks this Claude session and herdr panes — this is the last thing, and a herdr/Claude reattach in the new path follows.

- [ ] `gh repo rename qq-ac -R hypermemetic-ai/hypercore --yes`
- [ ] `git -C ~/projects/hypercore remote set-url origin git@github.com:hypermemetic-ai/qq-ac.git`
- [ ] `mv ~/projects/hypercore ~/projects/qq-ac`
- [ ] From the new path, run `bash ~/projects/qq-ac/bin/qqac-activate.sh` → symlinks `~/.config/*` to the new repo location, re-runs herdr integration.
- [ ] Update herdr session state: rewrite `identity_cwd`/`cwd` path literals in `~/.config/herdr/session.json` (`/projects/hypercore`→`/projects/qq-ac`), or let herdr recreate the workspace.
- [ ] Re-register the Claude Code plugin at the new path: `/plugin marketplace remove hypercore` (old) then `/plugin marketplace add ~/projects/qq-ac` + `/plugin install qq-ac@qq-ac` (interactive; hand to owner).
- [ ] **Sweep `meeting-reviewer`** (separate repo at `~/projects/meeting-reviewer`, which adopted hypercore). After the dir rename so path refs resolve: `rg -l 'hypercore|HYPERCORE|/hypercore:'` across it, then replace `hypercore`→`qq-ac`, `/hypercore:`→`/qq-ac:`, and `~/projects/hypercore`→`~/projects/qq-ac` in its `AGENTS.md`, `CLAUDE.md`, `CONCEPTS.md`, `SKILLS-ATTRIBUTION.md`, `.mcp.json`, and `.claude/skills/`. Commit + push meeting-reviewer's own repo (separate from the qq-ac gate PR).
- [ ] Note (no action): `no-mistakes` tracks the repo by its old path — the next gated task may need `no-mistakes` re-init at `~/projects/qq-ac`. `~/Documents/hypercore-parked/` still references the old path; left as-is (archival).

---

## Risks & Sequencing

- **Live-cwd rename** is why Phase 4 is last and conductor-run, not part of the Codex handoff. Codex never touches the directory/remote.
- **Gate vs docs diff:** the no-mistakes pipeline targets code correctness; a rename/docs/config diff may not fit. Phase 3 has an explicit standard-PR fallback.
- **herdr config symlink** targets `config.toml` only — never the herdr directory (live sockets).
- **Plugin continuity:** after the dir rename the plugin source path is stale until re-registered (Phase 4). The running session keeps its loaded skills; a fresh session needs the re-register.

## Self-Review

- **Spec coverage:** rename (Tasks 2–5, Phase 4) ✓; Cockpit layer (Tasks 1, 5) ✓; vendor configs (Task 1) ✓; symlink source-of-truth (Task 3) ✓; drop distribution framing (Task 5.2) ✓; wire yazi+glow flow (already in vendored yazi.toml; documented Task 5.3) ✓; qq- naming (global map) ✓; GitHub+dir "everything now" (Phase 4) ✓.
- **Placeholder scan:** none — every token change is explicit; verify commands have expected output.
- **Type/token consistency:** `QQAC_HOME`, `qqy/qqbr/qqroot`, `qfiles/qtree`, `qq-wip`, `qqac-activate.sh`, namespace `qq-ac` used consistently across all tasks.
