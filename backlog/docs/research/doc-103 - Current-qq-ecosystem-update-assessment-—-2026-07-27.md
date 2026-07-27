---
id: doc-103
title: Current qq ecosystem update assessment — 2026-07-27
type: other
created_date: '2026-07-27 03:58'
updated_date: '2026-07-27 07:20'
tags:
  - research
  - updates
  - pi
  - herdr
  - security
---
# Current qq ecosystem update assessment — 2026-07-27

**Owning Task:** T-166
**Assessment window:** 2026-07-27T03:20–03:53Z
**Final disposition/reconciliation window:** through 2026-07-27T07:20Z
**Operator context:** No additional context; assess the full currently discoverable ecosystem.
**Overall confidence:** **HIGH** for installed/source identity and the high-priority deltas; **MEDIUM** where upstream has no package-specific changelog, no immutable service version, or no safe runtime exercise.
**Settles:** the point-in-time inventory and recommendations plus the sequential operator-approved final disposition ledger in Section 5. It authorizes no implementation plan or ecosystem mutation.

## Executive verdict

qq should **not** run a bulk updater. The operator approved five separately planned Change boundaries:

1. **T-166.1 — Node/browser/runtime closure:** global Node 24.18.0, browser wrapper 0.2.72/runtime 0.33.0, direct exact Landstrip platform carrier at unchanged 0.17.31, and immutable current Actions v6 SHAs.
2. **T-166.2 — one updated Pi:** patched Pi 0.82.1, generated-model-payload qualification, removal of dormant stock/CI/peer-family divergence, and convergence of loaded Pi runtime libraries on exact Earendil 0.82.1.
3. **T-166.3 — pi-subagents 0.37.0:** rebase separately and delete qq/vendor overlap only where exact behavioral equivalence proves upstream ownership.
4. **T-166.4 — bundled maintenance:** Ask 2.1.0, Context7 Pi 0.1.2, Btw 2.1.0, green-gated pi-lens 3.8.72, removal of pi-github-pr/prompt-template-model/Slopchop/the unselected npm pi-subagents copy, truthful Herdr-config docs, and upstream fzf 0.74.1 with an independent package-channel rollback.
5. **T-166.5 — OpenWiki 0.2.3:** update despite the known #365/#457 release gap while preserving qq safeguards and the now-active T-171 local daily reviewed/guarded workflow.

The operator held Landstrip enforcement at exact 0.17.31 and Herdr at stable 0.7.5/integration v6. Components without a meaningful selected-channel delta remain no action. These are approved assessment dispositions only: every Task is unimplemented and requires a separately presented, explicitly approved plan.

## 1. Scope and reconciliation

### Authoritative qq baseline

Current source, fresh live observations, `CONCEPTS.md`, `AGENTS.md`, triggered Skills, accepted decisions, and current Tasks outrank historical plans and OpenWiki. The present system is the thin seven-entity harness described by `CONCEPTS.md` and `README.md`: Git/GitHub own Repository and Change; Backlog owns Task/doc/decision state; patched Pi plus mounted qq surfaces own the agent runtime; Herdr owns project-home terminal placement; OpenWiki is a separate derived maintainer surface; pi-subagents supplies vendor lifecycle behind qq policy/Landstrip; the operator retains intent, acceptance, and merge.

Current direction and retained seams are source-verified:

- **smallest resulting system:** compose owner surfaces, do not rebuild a workflow platform; delete obsolete state and adapters when an owner fully subsumes them (`CONCEPTS.md`, decisions 5, 9, 14);
- **patched Pi authority:** exact active identity `0.81.1+qq.execution-profile.1`; `bin/pi` refuses stock/global fallback; each Pi upgrade rebases the qq execution-profile patch (`README.md:58-107`, `patches/pi/v0.81.1/manifest.json`, `backlog/decisions/decision-13 - qq-owns-the-patched-Pi-execution-profile-seam.md`, T-153);
- **delegation:** exact fork `9e045ed75e09a163afa17271e55150ed1e8369df`, upstream parent `e2a125ee09c2e9ec61b2f6e11f9c2fa887398a39`, rollback `b7c531c238469e43866a1fe6697cb44279158c1c`; qq retains trusted roles/models, Completion Envelopes, confinement, observation, review, and delivery (decision-14, T-154);
- **Context7:** exact unregistered `@upstash/context7-pi@0.1.1`, researcher-child-only, no key/MCP/global registration (decision-15, T-160);
- **observation:** persisted session JSONL is the sole content seam; the old trace/span rig remains source debt pending a separate aligned retirement, not current authority (decisions 10-11, T-142, current `qq-observe`/trace source);
- **active intent/problems:** T-157 holds OpenWiki remote deployment for immutable #365 + #457; T-164 remains To Do; verified current defects are the browser mismatch, Node security lag, mixed/dormant operator npm roots, stale documentation, and candidate Landstrip policy-source expansion.

Derived OpenWiki is materially stale: it still describes per-Change Herdr work sessions, yazi/broot, Claude rollback, Pi 0.80.10+ bootstrap, and Repository-owned Herdr config. Source/decisions 7 and 9, current cockpit files, and current Tasks contradict those claims. It was consulted only to identify drift; this assessment does not invoke the OpenWiki maintainer.

Current README also conflicts with live/current records in three places: it still presents Kimi `k3:max` as the accountable default while safe live settings and all delegate manifests select `openai-codex/gpt-5.6-sol:xhigh`; it retains old OpenWiki source-build/PR-151 debt although live npm-global OpenWiki is 0.1.2; and it/cockpit docs call Herdr config Repository-owned even though commit `95dd46c` intentionally made the still-existing live target ignored operator-local state. These are evidence gaps or later documentation work, never permission to choose credentials or configuration.

### Finalization source reconciliation

The original inventory remains a timestamped observation from `main` at `6eca0ad…`. Before final publication, the branch was reconciled with current `main` at `6ef76fc…`. T-171 had meanwhile landed and activated a non-persistent local 03:00 OpenWiki maintainer with machine-verifiable receipts, independent generated-doc review, and a guarded exact-candidate qqp-bot merge. The operator explicitly directed T-166.5 to preserve and qualify that existing local workflow under OpenWiki 0.2.3. This does not authorize T-157’s GitHub-hosted generation design or any expansion of T-171. The report’s initial OpenWiki hold recommendation remains historical evidence; Section 5’s `update` disposition and T-171 preservation condition are authoritative.

Current `main` also took doc-102 for T-169 after this assessment PR had reserved that ID. The assessment procedure record was therefore renumbered to collision-free doc-109; doc-103 remains unchanged.

### Live observations and commands

Observed paths and versions came from non-installing commands at 03:23–03:32Z: `command -v`; `pi --version`, `pi list --approve`, `pi --help`, `pi list/update --help`; `qq-pi-runtime verify`; `herdr --version/status/channel show/integration status --outdated-only`; `openwiki --help`; `backlog --version`; `ghostty +version`; `glow/fzf/node/npm/python3/git/gh/jq/bash/curl/rg --version`; safe `jq` projections of Pi settings, package manifests/locks, and subagent config; `npm ls`, `npm view`, and `npm outdated`; read-only browser-wrapper doctor; symlink/identity checks; and Repository/source inspection. No auth file or credential value was read or reported.

One caveat is explicit: `brew outdated --json=v2` unexpectedly auto-refreshed Homebrew tap metadata (`33c3da5f49…` → `48f5f3f30…`) before producing its read result. It installed or changed no formula/cask, version, pin, channel, or qq configuration, but it was not a side-effect-free metadata query and is retained as an evidence gap. All subsequent Homebrew use was stopped; no attempt was made to reverse metadata.

### Notification coverage and omissions

No operator notification named a candidate. `herdr integration status --outdated-only` was empty. `npm outdated` supplied eight leads: Ask 2.0.0→2.1.0, Btw 2.0.0→2.1.0, GitHub PR 0.23.0→0.31.0, Context7 0.1.1→0.1.2, browser wrapper 0.2.71→0.2.72, `pi-landstrip` 0.17.31→0.17.38, pi-lens 3.8.71→3.8.72, and npm `pi-subagents` 0.35.1→0.37.0.

Those leads were incomplete and sometimes not active owners:

- notifications omitted unchanged `pi list` packages and did not own patched Pi, the exact git fork, Herdr/Pi integration, OpenWiki's accepted release gate, Backlog, global `agent-browser`, the Landstrip platform payload, Node/Bun/Pi build pins, cockpit owners, Actions refs, model service, dormant-current packages, or qq adapter/doc drift;
- `pi-landstrip` is installed but not Pi-registered and is only an accidental binary carrier; npm `pi-subagents` is installed but not the selected source; Context7 is installed but intentionally child-only and unregistered;
- no notification named an item that was absent. Homebrew named Hunk 0.17.3→0.17.6, broot 1.57→1.58, and mdcat 2.10→2.13, but all are installed-yet-unintegrated remnants after current plan-loop/yazi cockpit retirements. Other Homebrew leads (awscli, eza, libraries, pipx, pnpm, ripgrep, sqlite, ant) have no current qq owner or observed edge.

### Excluded generic prerequisites

The following were observed but excluded from the component matrix because current source gives them only commodity command/substrate responsibility and no release, security, compatibility, migration, overlap, or simplification edge controls a recommendation: Git 2.43.0, GitHub CLI 2.45.0, jq 1.7, Python 3.14.6, Bash 5.2.21, curl 8.21.0, ripgrep 15.1.0, npm/npx as package-manager commands, Homebrew itself, and shell/core utilities (`find`, `watch`, `timeout`, `flock`, `sha256sum`, `realpath`, `stat`, `grep`, `sed`, `xargs`). Fonts (`BigBlue TerminalPlus`, `MxPlus IBM VGA 8x16`), `xdg-open`, terminal graphics support, and OS MIME handlers are external assets/facilities without a version edge. Global Codex, Beads, OMP/Claude/Codex/OpenCode Herdr integrations are installed for other or retired harnesses, but current qq source explicitly does not make them qq runtime owners.

Node, Bun, Ghostty, Glow, and fzf are not excluded because qq names them in a manifest or cockpit surface. The Pi peer stack and `agent-browser` are included because observed compatibility edges make otherwise commodity/transitive state decision-relevant.

### Evidence disagreements and gaps

The fresh researcher returned useful primary release evidence but also conflicted with direct live evidence on several package names/versions, the selected fork hash, Glow, and Pi peer state. This report preserves the conflict and resolves it in favor of fresh `pi list`, installed manifests/locks, `qq-pi-runtime verify`, current source, and independent official `npm view`/release spot-checks. Consequently, installed identity is **HIGH**; package-specific behavior without a changelog or runtime trial is **MEDIUM**. No provider call, package promotion, browser launch, UI interaction, fetched-code execution, credential inspection, or live configuration write occurred. The operator’s Section 5 dispositions are decisions, not behavior evidence; every compatibility and promotion claim remains subject to the listed future Checks.

## 2. Complete component matrix

`Current channel` is the current release on qq's selected channel; `latest relevant` can differ. “Root” means the operator Pi npm prefix, not a registered Pi package. Every row contains exactly one allowed recommendation.

| # | Identity / category | Observed installed state/source | qq pin/constraint and owner | Selected channel | Current channel | Latest relevant state/channel | Delta and primary evidence | Gap / confidence | Recommendation |
|---:|---|---|---|---|---|---|---|---|---|
| 1 | Pi core / accountable runtime | Patched immutable generation `0.81.1+qq.execution-profile.1`; dormant global stock 0.81.1; CI stock test 0.80.10 | Manifest/source/patch hashes owned by `patches/pi/v0.81.1`, `qq-pi-runtime`, and `backlog/decisions/decision-13 - qq-owns-the-patched-Pi-execution-profile-seam.md` | upstream stable + qq exact patch | 0.82.1 upstream; qq selected remains 0.81.1 | 0.82.1 stable | Security/provider/retry changes; 0.82 source includes generated model data, potentially deleting special hydration ([0.82.0][pi-0820], [0.82.1][pi-0821]) | Patch rebase and package composition untested; **HIGH** fact, **MEDIUM** compatibility | `test` |
| 2 | `pi-intercom` / Pi package | `npm:pi-intercom`, 0.6.0 | Unpinned npm source in Pi settings; agent-messaging owner | npm stable | 0.6.0 | 0.6.0 stable | No release delta; manifest still names old `@mariozechner/*` wildcard peers ([registry][npm-intercom]) | Loaded, but no fresh message exchange; weak repository metadata; **MEDIUM** | `no action` |
| 3 | `@tmustier/pi-files-widget` / Pi package | 0.2.0 | Unpinned npm; named sole in-Pi browsing owner after decision-7 | npm stable | 0.2.0 | 0.2.0 stable | None ([registry][npm-files]) | No interactive smoke this cycle; **HIGH** identity | `no action` |
| 4 | `@ff-labs/pi-fff` / Pi package | 0.10.1 | Unpinned npm; additive search owner | npm stable | 0.10.1 | 0.10.2 nightly, not selected | Stable current; nightly is not an appropriate automatic target ([registry][npm-fff]) | No runtime smoke; **HIGH** | `no action` |
| 5 | `@juicesharp/rpiv-todo` / Pi package | 2.1.0 | Unpinned npm; ephemeral session checklist, subordinate to Backlog Tasks | npm stable | 2.1.0 | 2.1.0 stable | None ([registry][npm-todo]) | **HIGH** | `no action` |
| 6 | `@juicesharp/rpiv-ask-user-question` / Pi package | Exact Pi source 2.0.0 | Explicit 2.0.0 settings pin; operator-question UI | exact stable pin | 2.1.0 stable exists; selected remains 2.0.0 | 2.1.0 stable | Notes access, blocked event, repeat/collapse and long-session fixes ([changelog][ask-changelog]) | Ghostty/UI behavior not exercised; **HIGH** | `update` |
| 7 | `@narumitw/pi-github-pr` / Pi package | 0.23.0; root range `^0.23.0` excludes 0.24+ under 0.x caret | Unpinned Pi source but root range constrains resolution; passive current-branch PR status | npm stable within current range | 0.23.x selected | 0.31.0 stable | Periodic refresh and lifecycle/stale-request fixes; adds authenticated polling ([source compare][github-pr-compare], [registry][npm-github-pr]) | API load/privacy and value vs explicit gh/qq watch untested; **HIGH** | `test` |
| 8 | `@juicesharp/rpiv-btw` / Pi package | Exact 2.0.0 | Explicit settings pin; same-session side thread | exact stable pin | 2.1.0 stable exists; selected remains 2.0.0 | 2.1.0 stable | 2.1 package delta is documentation/tarball only ([changelog][btw-changelog]) | No behavioral delta; **HIGH** | `no action` |
| 9 | `@juicesharp/rpiv-web-tools` / Pi package | 2.1.0 | Unpinned npm; text search/fetch owner | npm stable | 2.1.0 | 2.1.0 stable | None ([registry][npm-web-tools]) | Provider credentials/config deliberately uninspected; **HIGH** identity | `no action` |
| 10 | `pi-lens` / Pi package | 3.8.71 | Unpinned npm; diagnostics/index/formatter/security scanners | npm stable | 3.8.72 | 3.8.72 stable | 151-commit delta: security dependency fixes, bounded HOME scans, atomic state, LSP/session/workspace correctness, project report ([compare][lens-compare], [registry][npm-lens]) | Broad autoformat/state surface; no candidate smoke; **HIGH** facts | `test` |
| 11 | `pi-agent-browser-native` / Pi package wrapper | 0.2.71; read-only doctor fails expected runtime 0.32.2 vs live 0.27.0 | Unpinned npm; native browser tool owner | npm stable | 0.2.72 | 0.2.72 stable | Candidate rebaselines to runtime 0.33.0 and adds a11y/HAR/find support ([release][browser-wrapper-0272]) | Coupled runtime/Node/profile test required; **HIGH** | `test` |
| 12 | `pi-prompt-template-model` / Pi package | Registered 0.10.0 | No qq source/config consumer; native prompt + pi-subagents overlap | npm stable | 0.10.0 | 0.10.0 stable | No release delta; only project prompt is native `.pi/prompts/update.md`; no user prompt templates found ([registry][npm-prompt-model], live scan) | Scan covered `~/projects` and user prompt roots, not every possible mount; **MEDIUM-HIGH** | `remove` |
| 13 | `pi-subagents` / registered vendor fork | Exact git commit `9e045ed75e09a163afa17271e55150ed1e8369df`, package 0.35.1 | Exact immutable fork; qq deltas + promotion contract; rollback `b7c531…` | qq exact fork over upstream stable lineage | selected fork over 0.35.1 | upstream 0.37.0 stable | 0.36/0.37 add preflight/digests, capability ceilings, process proof and structured-output fixes that may subsume fork code ([0.36][subagents-036], [0.37][subagents-037]) | Rebase/delta/real-provider contract not run; **HIGH** | `test` |
| 14 | `pi-subagents` / unused npm-root duplicate | Root dependency 0.35.1; absent from `pi list` authority | No current owner; registered git fork wins | npm stable | 0.37.0 | 0.37.0 stable | Duplicate adds provenance/peer ambiguity; latest is irrelevant to this copy ([registry][npm-subagents]) | Removal/pruning effect needs dry ownership inventory; **HIGH** | `remove` |
| 15 | Herdr / terminal owner | Client/server 0.7.5, stable, protocol 17, compatible | Herdr external; qq owns tenancy/adapters only | stable | 0.7.5 | unreleased master/preview only | No forward stable release; moving work includes lifecycle/focus changes ([0.7.5][herdr-075], [master compare][herdr-master]) | Exact master content/date not stable; **HIGH** installed, **MEDIUM** preview | `hold` |
| 16 | Herdr Pi integration / adapter | Integration schema v6; `integration status` current and outdated-only empty | Embedded/installed by Herdr; qq requires Pi integration rerun after Pi activation | Herdr stable | v6 under Herdr 0.7.5 | v7 on unreleased master | Relevant focus/lifecycle evolution lacks immutable release ([master compare][herdr-master]) | No stable candidate or live v7 test; **MEDIUM-HIGH** | `hold` |
| 17 | `@landstrip/landstrip-linux-x64` / confinement binary | 0.17.31, obtained transitively | Exact 0.17.31 in roles/CI/README; qq policy owner | exact stable pin | 0.17.38 exists; selected remains 0.17.31 | 0.17.38 stable | Useful Linux fixes, but new ambient executable-policy merge can override explicit qq policy; no domain fields ([compare][landstrip-compare], [config][landstrip-config], [CLI][landstrip-cli]) | Composition source-proven; isolated behavior not executed; **HIGH** | `hold` |
| 18 | `pi-landstrip` / unregistered carrier | Root manifest range `^0.17.31`, lock-resolved to 0.17.31; absent from Pi settings; carries platform binary | Floating npm range conflicts with qq's exact 0.17.31 runtime requirement in roles/renderer; source wants a direct exact platform package | npm stable under caret + separate exact runtime contract | 0.17.38 satisfies the root range; installed lock remains 0.17.31 | 0.17.38 stable | A broad npm resolution can import row 17's held version and make delegation fail closed on version mismatch; carrier is unnecessary overlap ([registry][npm-pi-landstrip], `README.md:145-161`, root manifest, `roles.json`, renderer) | Package-prune mechanics untested; **HIGH** | `replace` |
| 19 | `@upstash/context7-pi` / child-only integration | Root exact 0.1.1; not Pi-registered; researcher manifest selects one extension file | decision-15/T-160 exact scope/integrity | exact npm pin | 0.1.2 | 0.1.2 stable | Only tool-query prompt wording improves; tools/auth surface unchanged ([changelog][context7-changelog], [registry][npm-context7]) | Exact integrity and per-role canary still required; **HIGH** | `update` |
| 20 | OpenWiki / derived knowledge runtime | npm-global 0.1.2 | T-157: local guarded wrapper; wait for immutable #365 + #457; maintainer-only | npm stable subject to accepted gate | 0.2.3 | main has #365; #457 remains open | 0.2.3 adds capabilities/telemetry but lacks both accepted completeness guards together ([registry][npm-openwiki], [#365][openwiki-365], [#457][openwiki-457]) | No candidate execution; privacy/credential behavior untested; **HIGH** | `hold` |
| 21 | Backlog.md / Task owner | npm-global 1.48.0 | Backlog CLI owns managed records | npm stable | 1.48.0 | 1.48.0 stable; unreleased main ignored | No stable delta ([release][backlog-148], [registry][npm-backlog]) | **HIGH** | `no action` |
| 22 | Node/npm / live runtime + Pi build toolchain | Node 22.22.3, npm 10.9.8; manifest exact same | Exact build URL/hash in Pi manifest; ambient Node runs qq adapters | Node 22 LTS | 22.23.1 | 24.18.0 newer LTS; 26 Current not appropriate | 22.23.0 security release + 22.23.1 regression fix; browser separately needs >=24 ([22.23.0][node-22230], [22.23.1][node-22231], [24.18.0][node-24180]) | Reproducibility/live activation untested; **HIGH** | `update` |
| 23 | Bun / Pi build toolchain | Not on PATH; exact cached/build-input pin 1.3.14 | Pi manifest URL/hash; offline build only | exact stable pin | 1.3.14 | 1.3.14 stable | None ([release][bun-1314]) | Cache presence not independently re-fetched; **HIGH** source | `no action` |
| 24 | `@earendil-works/pi-ai` / generated model-data payload | Active generation derives exact 0.81.1; operator npm peer tree has inactive 0.82.0 | Exact Pi manifest pin; coupled to Pi core | Pi stable coupled | 0.82.1 family | 0.82.1 stable | Must move only with row 1; 0.82 source may delete special external payload fetch ([Pi 0.82.0][pi-0820]) | Active payload internals not separately executed; **HIGH** | `test` |
| 25 | Operator npm Pi peer stacks / compatibility substrate | Inactive Earendil tree: agent-core/AI 0.82.0, coding-agent/TUI 0.80.10; inactive Mariozechner core/AI/coding-agent/TUI all 0.73.1; active host separately patched 0.81.1 | No intended unified owner; Earendil copies arise from package/carrier resolution, while `pi-intercom` declares wildcard peers on the legacy Mariozechner coding-agent/TUI | transitive npm peer resolution, not a qq runtime channel | conflicting inactive copies | active Pi family 0.82.1 is the relevant successor; legacy namespace is compatibility state | Blind normalization/pruning could break lexical imports; carrier/duplicate removal may prune some copies (installed locks/manifests; `pi-intercom` manifest) | Exact module reachability uninstrumented; **MEDIUM** | `test` |
| 26 | `agent-browser` / browser runtime | npm-global 0.27.0 | External runtime required by wrapper; not Pi-updated | npm stable | 0.33.0 | 0.33.0 stable | Candidate requires Node >=24 and adds a11y; installed pair already incompatible ([registry/release][agent-browser-033]) | Browser/profile/host-library behavior untested; **HIGH** | `test` |
| 27 | `pi-slopchop` / retired root residue | Root 0.10.1, absent from `pi list` | T-118 explicitly retired it; no current owner after later plan-loop retirement | npm stable | 0.10.1 | 0.10.1 stable | Current but unowned ([registry][npm-slopchop], T-118) | Removal smoke required; **HIGH** | `remove` |
| 28 | Ghostty / cockpit terminal | 1.3.1 stable; qq config symlink live | Source-controlled Ghostty config | stable | 1.3.1 | nightly `tip` exists but not selected | No stable delta ([official notes][ghostty-131]) | **HIGH** | `no action` |
| 29 | Glow / cockpit renderer | 2.1.2; qq config/theme links live | Source-controlled Glow configs | stable | 2.1.2 | 2.1.2 stable | None ([release][glow-212]) | **HIGH** | `no action` |
| 30 | fzf / `qqcd` picker | Debian 0.44.1 | No qq pin; shell uses only `--query` and stdin selection | distro stable | 0.44.1 installed channel | upstream 0.74.1 stable | Large upstream gap but no observed compatibility/security/value edge ([release][fzf-0741], `cockpit/shell/file-navigation.bash`) | Distro channel metadata not exhaustively researched; **MEDIUM-HIGH** | `no action` |
| 31 | `actions/checkout` / CI action | `actions/checkout@v6`, moving ref currently `d23441a…` = v6.1.0 | `.github/workflows/ci.yml`; no immutable pin policy recorded | moving major v6 | v6.1.0 | v7.0.1 stable | Current v6 already includes safer PR behavior; mutable ref is supply-chain drift ([v6 ref][checkout-v6-ref], [v6.1.0][checkout-v610], [v7.0.1][checkout-v701]) | Workflow not rerun on SHA here; **HIGH** | `replace` |
| 32 | `actions/setup-node` / CI action | `actions/setup-node@v6`, moving ref `24997072…` = v6.5.0 | `.github/workflows/ci.yml` | moving major v6 | v6.5.0 | v7.0.0 stable | Current v6 includes dependency security overrides; mutable ref is present edge; v7 features not needed ([v6 ref][setup-node-v6-ref], [v6.5.0][setup-node-v650], [v7.0.0][setup-node-v700]) | Workflow not rerun on SHA; **HIGH** | `replace` |
| 33 | OpenAI Codex route / model service | Safe live defaults and all delegates: `openai-codex/gpt-5.6-sol:xhigh`, standard/default tier | manifests + decision-16; credentials operator-owned and uninspected | rolling provider service | model ID available through current Pi | no immutable dated snapshot/lifecycle | No decision-relevant newer target established; priority remains explicitly retired ([official model page][openai-sol]) | Service release/support window inaccessible; **MEDIUM** | `no action` |
| 34 | Herdr config ownership / qq tenancy adapter | Live symlink target exists as ignored operator-local file; Herdr works | commit `95dd46c` says Repository no longer ships it; README/cockpit docs conflict | n/a, follows Herdr 0.7.5 | n/a | n/a | Documentation/source-ownership drift only; do not restore/remove operator config without alignment | Exact intended bootstrap wording open; **HIGH** fact | `update` |

## 3. Initial candidate findings

These findings preserve the evidence-backed recommendations before operator disposition. Where they conflict, the operator-approved Section 5 ledger supersedes them; no historical evidence is rewritten.

### A. Node 22.23.1 — `update` (P0 security)

**Observed facts — HIGH.** Live Node is 22.22.3; the Pi build manifest pins the same version/hash. Node 22.23.0 is explicitly a security release with two High, six Medium, and three Low CVEs; 22.23.1 fixes unexpected behavior introduced by that release ([Node 22.23.0][node-22230], [22.23.1][node-22231], live baseline, `patches/pi/v0.81.1/manifest.json`).

**Inference — HIGH.** Updating within the selected Node 22 LTS line solves a current security lag without taking Node 24's migration merely for novelty. One Change should update the live Node package and exact manifest URL/hash together; leaving either side behind creates two runtime identities. Node 24 is only a browser experiment prerequisite, not qq's new global channel.

**Compatibility, migration, risk.** This crosses live runtime and Repository manifest boundaries but not credential/model/data formats. It can alter offline Pi build output and every Node-based adapter. Back up exact package/formula identity and current Pi generation references. Run the complete Repository suite, `qq-pi-runtime` two-build reproducibility and artifact inspection, Pi package load/help, dispatcher policy renderer/supervisor, and harmless OpenWiki/Backlog help/version paths. Rollback restores Node 22.22.3, the manifest URL/hash, and the known-good Pi generation. Residual risk: deterministic output may change despite functional checks.

### B. Browser wrapper/runtime/Node closure — `test` (P0 active defect)

**Observed facts — HIGH.** The read-only wrapper doctor fails on `expected 0.32.2, found 0.27.0`; Pi runtime floor passes and duplicate wrapper sources are absent. Wrapper 0.2.72 targets runtime 0.33.0; runtime metadata requires Node >=24.0.0 and ships accessibility auditing ([wrapper release][browser-wrapper-0272], [runtime][agent-browser-033], local doctor).

**Inference — HIGH.** An extension-only update preserves incoherence. Browser is the correct owner for rendered/stateful interaction; `rpiv-web-tools` remains the separate text search/fetch owner. Neither replaces the other. The smallest system is one wrapper, one matching runtime, one documented Node closure, and no shadow binary.

**Compatibility, privacy, migration.** Profiles contain cookies/credentials and runtime downloads add supply-chain exposure. Test only with a fresh credential-free profile and public/local fixture. Require both doctors green, navigate/snapshot/click/a11y/HAR/domain-policy/teardown/process-leak checks, Pi tool registration, and explicit artifact verification. Test Node 22 and an isolated Node 24 runtime; select Node 24 only if the package requirement is enforced. The browser-only rollback is exact wrapper 0.2.71/runtime 0.32.2 on Node 24 after a green doctor; today's broken 0.2.71/0.27.0 pair is not a functional rollback. A full Node rollback to 22.22.3 disables/unregisters the browser wrapper until a coherent supported pair is restored. Residual risk: no current browser launch was authorized, so host Chromium/library compatibility is unknown.

### C. Pi 0.82.1 patched-runtime rebase — `test` (P1 core)

**Observed facts — HIGH.** Upstream 0.82.0 adds constrained sampling, Kimi/OpenRouter OAuth, Bash session/model metadata and RPC streaming, provider/retry fixes, `protobufjs` 7.6.5, and release-source model data. 0.82.1 adds model/catalog/auth/error fixes ([0.82.0][pi-0820], [0.82.1][pi-0821]). qq's patch spans provider adapters, runtime transactions, extension hooks, auxiliary work, model loading, and package version/source; current active identity is verified.

**Inference — MEDIUM-HIGH.** Generated model data in the release source should let qq delete the special `@earendil-works/pi-ai` fetch/cache/manifest branch. Constrained sampling may improve schema tools only where opted in; it does not replace Completion Envelopes, trusted seats, owner verification, or the execution-profile patch. Bash metadata complements but does not replace post-hoc session observation.

**Compatibility, migration, rollback.** Rebase intent, never textual patch drift. Update source/toolchain digests, remove obsolete hydration if proven, build twice, run Pi conformance/faux-provider tests, all 12 package loads, qq mounted extensions/footer/guards/handoff/watch, standard service-tier assertions, offline delegate startup, Context7 role isolation, and one separately authorized real-provider child canary. Rollback is exact current manifest/artifact/generation. Residual risk: provider semantics cannot be fully proven without an authorized inference canary.

### D. Landstrip latest blocks deterministic qq policy — `hold`; carrier — `replace`

**Observed facts — HIGH.** Current 0.17.31 is exact in `roles.json`, CI, docs, and the live payload, but the operator root manifest declares the carrier as `pi-landstrip: ^0.17.31`; its lock is presently 0.17.31 and `npm outdated` says the same range wants 0.17.38. The renderer refuses a binary version different from the exact role setting. In 0.17.38, `load_settings` begins with explicit policy paths, appends executable-derived candidates, and merges them; discovery covers target-adjacent `.pi`/`.opencode`, `/etc/landstrip`, current worktree, HOME Pi/config paths, and json/yaml/yml. The CLI has no disable flag. The schema still exposes network booleans/proxy ports, not domain allow/deny lists ([tagged config][landstrip-config], [CLI][landstrip-cli]). qq launches an executable named `pi` with explicit `-p` (`bin/qq-dispatch:348-368`).

**Inference — HIGH.** A worktree or HOME `sandbox.pi.*` could widen/narrow paths or change network booleans after qq renders and labels its canonical policy. That crosses the Repository/runtime trust boundary and makes qq's policy identity incomplete. A broad npm resolution can also move the floating carrier to held 0.17.38 before qq adopts it, causing delegation to fail closed on the exact-version check. Useful mkdir/Landlock fixes do not justify it; decision-8's domain-filter trigger is not met.

**Smallest-system action.** Hold binary 0.17.31. Separately replace the floating root `pi-landstrip` carrier, currently lock-resolved to 0.17.31, with exact direct `@landstrip/landstrip-linux-x64@0.17.31`, since qq already resolves that payload and explicitly forbids registering the extension. Preflight npm pruning, prove binary path/version and settings bytes, run all native confinement/role/teardown/structured-output tests, and keep the binary version constant. Rollback reinstalls the prior `^0.17.31` carrier constraint and its known 0.17.31 lock state. Any future executable-policy-discovery test must run inside a disposable VM, container, or mount namespace with synthetic HOME/CWD/tool paths and an isolated `/etc`; plant conflicts in every discovery location only inside that boundary, and refuse any location that cannot be isolated. Then prove an opt-out or incorporate every input into policy identity. Residual risk: direct platform dependency recipes must remain per-platform.

### E. pi-subagents 0.37.0 — `test`; unused npm copy — `remove`

**Observed facts — HIGH.** Active authority is exact fork `9e045ed…`, not the root npm 0.35.1 duplicate. Upstream 0.36 adds FleetView, handoff manifests, agent contract, TypeBox bundling, output/isolation and strict structured-output work; 0.37 adds definition digests/preflight, capability ceilings, process-terminal proof, and fixes successful terminal output vs stale errors ([0.36][subagents-036], [0.37][subagents-037], decision-14).

**Inference — MEDIUM-HIGH.** Upstream may now fully or partly subsume qq's structured-output watermark and trusted source lock. Prefer deletion of fork code only where exact black-box tests prove ownership; do not transfer qq role/model/policy/review authority to optional vendor features. Fleet/status surfaces may later shrink qq glass, but bridge-off and operator requirements still matter.

**Test/rollback.** Rebase the two deliberate qq deltas over exact 0.37 in a temporary fork branch; compare full fork diff; run vendor full suite, `tests/vendor-runtime-contract.sh`, trusted-seat shadowing, strict envelopes, prior-error recovery, async/resume/control/wait, output/session isolation, capability-negative tests, process teardown, Context7 scope, Pi 0.82 candidate composition, and a separately authorized real-provider canary. Rollback exact `9e045ed…`. Remove the unrelated root npm duplicate independently after reachability/pruning proof. Residual risk: new default allowlists can silently remove as well as grant tools.

### F. Ask 2.1.0 and Context7 0.1.2 — `update`; Btw 2.1.0 — `no action`

**Observed facts — HIGH.** Ask 2.1.0 carries current UI/lifecycle fixes and a typed blocked event; Context7 0.1.2 changes only query wording to request relevant library documentation rather than task completion; Btw 2.1.0 changes only README/tarball packaging ([Ask changelog][ask-changelog], [Context7 changelog][context7-changelog], [Btw changelog][btw-changelog]).

**Inference — HIGH.** Ask improvements solve current operator UI robustness; Context7 wording aligns with qq's research method. Btw has no runtime benefit and version parity alone is not value. `rpiv:ask-user:blocked` does not replace Herdr lifecycle unless a later Change deliberately adopts a listener.

**Test/rollback.** Keep exact pins. For Ask: card modes, notes reopen, collapse/repeat keys under Ghostty, custom answers, cancellation, long-lived reload. For Context7: verify exact integrity, parent/reviewer/implementer/observer absence, researcher presence, no key/MCP/global registration, no automatic vendor Skill/prompt, and one separately authorized public query only if scope registration is insufficient. Roll back each exact pin independently.

### G. pi-lens 3.8.72 — `test`

**Observed facts — HIGH.** Despite a patch version, the delta from installed 3.8.71 spans 151 commits and 240 files: audit fixes, HOME-root scan ceilings, atomic state, LSP timeouts/warm attach, deferred-format ownership, workspace/monorepo resolution, safe spawning, mutation controls, and project-report capability ([compare][lens-compare], [registry][npm-lens]).

**Inference — HIGH.** Correctness/security improvements are valuable, and project-level orientation can reduce manual exploration, but pi-lens has mutation, autoformat, test-runner, cache, and multi-session state. This is not a low-risk blind patch. `project_report` complements source/OpenWiki/Tasks; it does not become current-system truth.

**Test/rollback.** Isolated exact 3.8.72, current qq config, representative shell/TypeScript/Python/Markdown diagnostics, deferred-format ownership across two sessions, HOME/worktree ceilings, project_report/lens tools, no unexpected mutation, full Repository suite. Rollback exact 3.8.71 and preserve/remove candidate cache only under package guidance. Residual risk: heavy analyzers and auto-installed tools have separate supply-chain/latency behavior.

### H. pi-github-pr 0.31.0 — `test`

**Observed facts — HIGH.** Current 0.23.0 cannot move across 0.x minors under root `^0.23.0`. Package source through 0.31 adds periodic refresh and cancels/invalidates stale lifecycle requests ([source compare][github-pr-compare]). `qq_pr_watch` watches one exact PR for terminal disposition; pi-github-pr is passive current-branch status. The owners remain distinct.

**Inference — MEDIUM-HIGH.** Fresher status may prevent stale operator decisions, but one-minute authenticated polling changes API load, token use, privacy/failure noise, and overlaps explicit `gh pr checks/view` at delivery. Value must be observed, not assumed.

**Test/rollback.** Exact 0.31.0 in an isolated Pi prefix/disposable PR; count requests, verify rate limits, offline/auth-expired behavior, footer status, branch switches, cleanup, and incremental value. Rollback exact 0.23.0; do not widen the range during trial. Residual risk depends on repository/account conditions.

### I. Remove unowned package state — `remove`

**Observed facts — HIGH.** `pi-prompt-template-model` is registered but has no current native-prompt consumer; `pi-slopchop` is absent from `pi list` and was explicitly retired by T-118; npm `pi-subagents@0.35.1` duplicates the selected exact git fork. All remain in the root dependency/lock state. The same tree also contains inactive Earendil peers split across 0.80.10/0.82.0 and a complete Mariozechner 0.73.1 peer family; `pi-intercom` explicitly declares wildcard peer dependencies on the legacy Mariozechner coding-agent and TUI, so those copies are compatibility state rather than proven-removable residue.

**Inference — HIGH.** The three named direct packages are smallest-resulting-system deletion candidates: fewer loaded tools/prompts/Skills, fewer peer copies, less provenance ambiguity. Native Pi prompts own `/update`; retained git pi-subagents owns bounded workflows; qq review methodology does not use Slopchop. This evidence does not authorize pruning either Pi peer family.

**Test/rollback.** Before each independent direct-package removal, re-run project/user prompt/consumer search, `pi list`, `npm ls`, package manifest reachability, and full package-load smoke. After deletion verify Ask/Todo/FFF/files/footer/intercom/browser/lens/delegate behavior and record which Earendil/Mariozechner peers npm would prune. Reinstall exact package/version/source to roll back. Do not remove or normalize either mixed Pi peer stack until lexical/runtime reachability and `pi-intercom` compatibility are instrumented. Residual risk: an undiscovered project outside scanned roots may use prompt-template-model.

### J. Pin Actions v6 refs — `replace`

**Observed facts — HIGH.** CI uses moving `actions/checkout@v6` and `actions/setup-node@v6`. Official refs resolved at assessment time to checkout `d23441a48e516b6c34aea4fa41551a30e30af803` (v6.1.0) and setup-node `249970729cb0ef3589644e2896645e5dc5ba9c38` (v6.5.0). v6 already includes relevant safety/dependency fixes; v7 exists but qq has no feature requirement ([ref APIs][checkout-v6-ref], [setup ref][setup-node-v6-ref], [v6 releases][checkout-v610], [setup v6.5][setup-node-v650]).

**Inference — HIGH.** Pinning the already-used commits removes movement without conflating a major upgrade. GitHub Actions remains the preferred CI owner; this is supply-chain narrowing, not new machinery.

**Test/rollback.** Pin SHAs with version comments; the PR's complete GitHub workflow is the Check. Rollback restores prior YAML but also restores moving-ref exposure. Residual risk: SHA pinning cannot address compromise before the selected commit and creates deliberate update work.

### K. Release-gated holds: OpenWiki and Herdr

**OpenWiki — HIGH.** 0.2.3 has useful changes and default telemetry, but #365 merged after its release and #457 remains open. T-157's accepted requirement—both fixes together in an immutable release—remains unmet. Keep 0.1.2 and local guarded workflow. Future test must prove interrupted/truncated runs fail and retry, telemetry off on every path, OAuth/credential scope, root-file restoration, generated diff quality, and rollback without wiki corruption ([#365][openwiki-365], [#457][openwiki-457], [registry][npm-openwiki]).

**Herdr — MEDIUM-HIGH.** Stable client/server 0.7.5 and Pi integration v6 are healthy. Focus/lifecycle changes and integration v7 are moving, unreleased state. Wait for an immutable release, then test client/server protocol, Pi integration, status metadata, snap/pull/operator-stage, and no-focus behavior together. Rollback 0.7.5/v6. Do not treat master novelty as benefit.

### L. Correct Herdr config ownership claims — `update`

**Observed facts — HIGH.** The live symlink and ignored target exist; Herdr is healthy. Commit `95dd46c` intentionally stopped shipping `cockpit/herdr/config.toml`, while README/cockpit docs still describe the Repository as source of truth and instruct the bootstrap link.

**Inference — HIGH.** The smallest correction is documentation/ownership truth: say this config is operator-local ignored state and preserve current live file/link. Restoring a tracked operator preference or deleting live config would cross the Repository/operator boundary and needs a separate decision. Check rendered docs and bootstrap-path consistency; rollback is prose-only. Residual risk: intended portability of this preference remains open.

## 4. Initial prioritized follow-ups

This queue records the pre-disposition recommendation order. Section 5 replaces it with the approved bundled boundaries.

| Priority | Decision or experiment | Value / urgency / dependency | Blocking evidence and safe exit |
|---:|---|---|---|
| P0 | **Node 22.23.1 update Change** | Active security lag; same LTS line; independent of other candidates | Exact package + manifest digest, two-build Pi reproducibility, full qq Checks, rollback generation |
| P0 | **Browser-stack qualification** | Only currently proven broken user-facing runtime | Wrapper 0.2.72/runtime 0.33.0/Node closure, credential-free profile, both doctors, navigation/a11y/HAR/domain/teardown; no promotion if any layer disagrees |
| P0 | **Landstrip carrier replacement at unchanged 0.17.31** | Deletes accidental extension/peer state without moving boundary code | npm ownership/prune preview, settings unchanged, direct platform payload retained, full confinement/teardown suite |
| P0 | **Pin Actions v6 SHAs** | Removes mutable CI execution with no major migration | Exact SHAs above, version comments, full GitHub CI green |
| P1 | **Pi 0.82.1 patch-rebase experiment** | Security/provider fixes and possible hydration-code deletion; depends on Node/toolchain choice | Full patch/conformance/reproducibility/package/extension/delegate suite; separately authorized real-provider canary before promotion |
| P1 | **Ask 2.1.0 + Context7 0.1.2 exact updates** | Small current UI/research gains | Independent pin rollback; Ghostty cards and exact researcher-only scope/integrity |
| P1 | **pi-lens 3.8.72 isolated trial** | Security/correctness gains but unusually broad patch delta | Mutation/caches/LSP/multi-session/workspace/full-suite evidence |
| P1 | **Remove prompt-template-model, Slopchop, npm pi-subagents** | Direct state/tool/provenance shrink | Final global/project consumer and reachability scan; one independent removal/rollback at a time |
| P1 | **pi-subagents 0.37.0 fork qualification** | Potentially deletes fork delta and strengthens lifecycle; depends on current fork contract | Exact rebase, vendor + qq contract, trusted seats, strict output, capability-negative, Pi candidate composition, canary |
| P1 | **pi-github-pr 0.31.0 polling trial** | Possible fresher PR status; lower urgency and privacy/rate risk | Request counts, token/rate/offline/auth behavior, cleanup, demonstrated value beyond explicit gh/qq watch |
| P1 | **Herdr ownership-doc correction** | Removes current source/live contradiction | Confirm operator-local disposition; edit only claims, never live config; docs Checks/review |
| Blocked | **Landstrip >=0.17.38** | Useful fixes cannot outrank deterministic policy authority | Upstream opt-out or redesign proving every discovered profile is refused/accounted and identity-bound; domain-filter trigger still absent |
| Blocked | **OpenWiki >0.1.2 / remote workflow** | Accepted production design, but safety gate unmet | Immutable release containing #365 and #457 together; telemetry-off/credential/root-restoration/generated-diff test |
| Blocked | **Herdr integration v7** | Relevant to focus/lifecycle only after stable publication | Immutable release, protocol/client/server/Pi integration/no-focus/status test and exact rollback |
| Hold | **Btw 2.1, fzf upstream, Actions v7, Node 24 global, model replacement** | No current solved problem; novelty alone is not value | New observed failure or operator intent required |

## 5. Operator-approved final disposition ledger

The operator reviewed one complete candidate card at a time. Clarification requests and custom replies were not treated as dispositions. On 2026-07-27 the operator explicitly approved the complete ledger below as the final T-166 assessment record. After current-source reconciliation exposed T-171’s newly active local OpenWiki workflow, the operator explicitly amended the OpenWiki boundary to **preserve and qualify** T-171. Ledger approval authorizes final assessment evidence publication only; it approves no implementation plan, package/runtime mutation, acceptance, or merge.

| Candidate | Approved disposition | Bounded result / condition |
|---|---|---|
| Global Node | `update` to exact 24.18.0 LTS | T-166.1; live runtime and exact Pi build manifest move together. This supersedes the initial 22.23.1 recommendation. |
| Browser wrapper/runtime | `update` and bundle 0.2.72 + 0.33.0 | T-166.1; fresh credential-free profile, both doctors, navigation/a11y/HAR/domain/teardown qualification; verify exact 0.2.71/0.32.2 on Node 24 as coherent browser rollback, while full Node rollback disables the browser rather than restoring today’s broken pair. |
| Landstrip carrier | `replace` `pi-landstrip:^0.17.31` with direct exact platform 0.17.31 | T-166.1; no Landstrip version movement; exact binary/policy equivalence and complete prune inspection. |
| GitHub Actions v6 refs | `replace` with exact current official SHAs | T-166.1; checkout `d23441a48e516b6c34aea4fa41551a30e30af803`, setup-node `249970729cb0ef3589644e2896645e5dc5ba9c38`, readable comments, official lineage and GitHub execution proof. |
| Patched Pi | `update` separately to exact 0.82.1 | T-166.2; retain qq’s fail-closed execution-profile authority unless exact equivalence proves an intentionally aligned upstream replacement. |
| Pi-family copies | converge to one selected Pi version | T-166.2; active host, CI Pi, and loaded runtime libraries converge on Earendil 0.82.1; remove dormant stock and old 0.73.1/0.80.10/0.82.0 families. Update/migrate or remove incompatible extensions; stop if pi-intercom needs an unapproved fork or substantive redesign. |
| Generated Pi model payload | `test` with Pi update | T-166.2; delete separate hydration only after archive/build equivalence and reproducibility proof. |
| pi-subagents selected fork | `update` separately to 0.37.0 | T-166.3; retire qq/vendor overlap only where black-box equivalence proves upstream ownership; qq retains role/profile/Landstrip/trust-seat/delivery authority otherwise. |
| Landstrip enforcement binary | `hold` exact 0.17.31 | No version-movement Task. Reconsider normally in future assessments; not gated on a named feature. |
| Ask UI | `update` exact 2.1.0 | T-166.4; Ghostty/Kitty, notes/custom-answer/blocked-event, long-session, and operator UAT gates. |
| Context7 Pi | `update` exact 0.1.2 | T-166.4; exact integrity and researcher-child-only scope. |
| Btw | `update` exact 2.1.0 | T-166.4 despite documentation/tarball-only delta; preserve independent rollback. |
| pi-lens | `test`; update exact 3.8.72 only if green | T-166.4; isolated mutation/state/LSP/analyzer/full-suite gate. Failure retains 3.8.71 without blocking smaller maintenance. |
| pi-github-pr | `remove` | T-166.4; authoritative `gh` delivery and `qq_pr_watch` remain. |
| pi-prompt-template-model | `remove` after final consumer scan | T-166.4; native prompts and pi-subagents remain. |
| residual pi-slopchop | `remove` | T-166.4; complete the prior retirement without rewriting historical evidence. |
| unselected npm pi-subagents 0.35.1 | `remove` | T-166.4; retain the governed Git fork until T-166.3 updates it. |
| Herdr config ownership docs | `update` in bundle | T-166.4; correct ignored operator-local ownership without reading or changing the live file. |
| fzf | `update` upstream to exact 0.74.1 | T-166.4; direct official `.deb`, retained `qqcd <pattern>`, separate Ubuntu downgrade/re-promotion and package-channel ownership. |
| OpenWiki | `update` separately to exact 0.2.3 | T-166.5; explicitly accepted despite missing #365/#457. Disable telemetry; preserve credentials/root restoration/local safeguards and T-171’s active schedule/review/receipt/guard/rollback behavior; do not expand T-171 or adopt T-157 remote generation. |
| Herdr client/server + Pi integration | `hold` stable 0.7.5/v6 | Wait for an immutable stable release; do not adopt moving master/integration v7. |

The following inventoried components have no meaningful selected-channel candidate and remain `no action`: Files Widget 0.2.0, FFF 0.10.1 stable (nightly excluded), Todo 2.1.0, Web Tools 2.1.0, Backlog.md 1.48.0, Bun 1.3.14, Ghostty 1.3.1 stable, Glow 2.1.2, and the current Codex route. pi-intercom 0.6.0 has no newer release, but its legacy Pi runtime namespace is explicitly handled by T-166.2’s one-version outcome.

### Residual evidence gaps

- No recommendation has been implemented or qualified.
- OpenWiki 0.2.3 knowingly lacks the two previously accepted upstream completeness guards; T-171 preservation must be proven against that release.
- Strict one-Pi-version convergence may require a larger pi-intercom migration and must stop for realignment if it requires an unapproved fork or redesign.
- Browser host/profile/artifact behavior, pi-lens promotion, npm prune/reachability, Ask terminal UAT, and direct-upstream fzf channel ownership remain untested.
- Herdr has no immutable forward candidate.

## Sources

### qq and live primary evidence

- Initial source: `CONCEPTS.md`, `AGENTS.md`, `README.md`, `.github/workflows/ci.yml`, `patches/pi/v0.81.1/manifest.json`, `delegation/**`, `bin/qq-pi-runtime`, `bin/qq-dispatch`, `bin/qq-openwiki`, `cockpit/**`, the exact named decision files cited above, and Tasks T-118/T-142/T-152–T-164. Finalization also inspected landed T-171, `backlog/docs/plans/doc-108 - T-171-daily-local-OpenWiki-refresh-and-guarded-auto-merge-plan.md`, `bin/qq-openwiki-{daily,daily-finish,merge,schedule}`, and its systemd/test surfaces.
- Fresh command evidence was captured under `/tmp/qq-update-2026-07-27-*.txt` during this cycle; its durable conclusions are restated above rather than treating temp files as future system truth.

### Primary upstream links

[pi-0820]: https://github.com/earendil-works/pi/releases/tag/v0.82.0
[pi-0821]: https://github.com/earendil-works/pi/releases/tag/v0.82.1
[subagents-036]: https://github.com/nicobailon/pi-subagents/releases/tag/v0.36.0
[subagents-037]: https://github.com/nicobailon/pi-subagents/releases/tag/v0.37.0
[herdr-075]: https://github.com/ogulcancelik/herdr/releases/tag/v0.7.5
[herdr-master]: https://github.com/ogulcancelik/herdr/compare/v0.7.5...master
[landstrip-compare]: https://github.com/landstrip/landstrip/compare/0.17.31...0.17.38
[landstrip-config]: https://raw.githubusercontent.com/landstrip/landstrip/0.17.38/src/config.rs
[landstrip-cli]: https://raw.githubusercontent.com/landstrip/landstrip/0.17.38/src/cli.rs
[browser-wrapper-0272]: https://github.com/fitchmultz/pi-agent-browser-native/releases/tag/v0.2.72
[agent-browser-033]: https://github.com/vercel-labs/agent-browser/releases/tag/v0.33.0
[node-22230]: https://nodejs.org/en/blog/release/v22.23.0
[node-22231]: https://nodejs.org/en/blog/release/v22.23.1
[node-24180]: https://nodejs.org/en/blog/release/v24.18.0
[ask-changelog]: https://raw.githubusercontent.com/juicesharp/rpiv-mono/v2.1.0/packages/rpiv-ask-user-question/CHANGELOG.md
[btw-changelog]: https://raw.githubusercontent.com/juicesharp/rpiv-mono/v2.1.0/packages/rpiv-btw/CHANGELOG.md
[context7-changelog]: https://raw.githubusercontent.com/upstash/context7/master/packages/pi/CHANGELOG.md
[github-pr-compare]: https://github.com/narumiruna/pi-extensions/compare/bce9af31c5f0be84fc61c300df61ceeb35400f58...3ad2c94970132353fc869cd2297b017465740791
[lens-compare]: https://github.com/apmantza/pi-lens/compare/2ea8691a25e3a39bf944e0d1c5ed4178c50b55da...6ceb9751e2799e8aae9eae55e1798acb56730006
[openwiki-365]: https://github.com/langchain-ai/openwiki/pull/365
[openwiki-457]: https://github.com/langchain-ai/openwiki/pull/457
[backlog-148]: https://github.com/MrLesk/Backlog.md/releases/tag/v1.48.0
[bun-1314]: https://github.com/oven-sh/bun/releases/tag/bun-v1.3.14
[ghostty-131]: https://ghostty.org/docs/install/release-notes/1-3-1
[glow-212]: https://github.com/charmbracelet/glow/releases/tag/v2.1.2
[fzf-0741]: https://github.com/junegunn/fzf/releases/tag/v0.74.1
[checkout-v6-ref]: https://api.github.com/repos/actions/checkout/git/ref/tags/v6
[checkout-v610]: https://github.com/actions/checkout/releases/tag/v6.1.0
[checkout-v701]: https://github.com/actions/checkout/releases/tag/v7.0.1
[setup-node-v6-ref]: https://api.github.com/repos/actions/setup-node/git/ref/tags/v6
[setup-node-v650]: https://github.com/actions/setup-node/releases/tag/v6.5.0
[setup-node-v700]: https://github.com/actions/setup-node/releases/tag/v7.0.0
[openai-sol]: https://developers.openai.com/api/docs/models/gpt-5.6-sol

[npm-intercom]: https://registry.npmjs.org/pi-intercom/latest
[npm-files]: https://registry.npmjs.org/%40tmustier%2Fpi-files-widget/latest
[npm-fff]: https://registry.npmjs.org/%40ff-labs%2Fpi-fff/latest
[npm-todo]: https://registry.npmjs.org/%40juicesharp%2Frpiv-todo/latest
[npm-github-pr]: https://registry.npmjs.org/%40narumitw%2Fpi-github-pr/latest
[npm-web-tools]: https://registry.npmjs.org/%40juicesharp%2Frpiv-web-tools/latest
[npm-lens]: https://registry.npmjs.org/pi-lens/latest
[npm-prompt-model]: https://registry.npmjs.org/pi-prompt-template-model/latest
[npm-subagents]: https://registry.npmjs.org/pi-subagents/latest
[npm-pi-landstrip]: https://registry.npmjs.org/pi-landstrip/latest
[npm-context7]: https://registry.npmjs.org/%40upstash%2Fcontext7-pi/latest
[npm-openwiki]: https://registry.npmjs.org/openwiki/latest
[npm-backlog]: https://registry.npmjs.org/backlog.md/latest
[npm-slopchop]: https://registry.npmjs.org/pi-slopchop/latest
