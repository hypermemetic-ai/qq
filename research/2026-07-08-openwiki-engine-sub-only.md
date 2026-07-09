# The openwiki/ engine under the sub-only constraint

_2026-07-08 · codex-delegated research round (operator directive: research legwork runs
on the ChatGPT sub, not the Claude session). 5 parallel `codex exec` research runs
(web search + curl + repo clones against primary sources) + local primary-source
inspection of the installed OpenWiki v0.0.2 package and no-mistakes v1.34.0 config +
2 empirical smoke tests + 1 adversarial `codex exec` verification pass over the
load-bearing claims (verdicts: 7 CONFIRMED, 1 WEAKENED, 0 REFUTED — corrections
applied in-text). Raw findings: session scratchpad `findings-q{1..5}.md`,
`findings-verify.md`. Fast-moving 2026 subjects — expect drift; versions pinned
in-text._

## Question

TASK-7: the gate's `commands.format` step is wired to `bin/qq-openwiki-refresh`,
which today expects the OpenWiki CLI plus an API key in `~/.openwiki/.env` — but the
operator constraint (2026-07-08) is **sub-only, no API keys**: ChatGPT sub driving
Codex CLI, Claude sub driving Claude Code, out-of-pocket API spend rejected. Five
hypotheses needed verification against primary sources before an engine decision:
(1) is headless `codex exec` on a ChatGPT sub permitted, including inside pipeline
scripts; (2) what is Anthropic's OAuth-outside-Claude-Code restriction as written;
(3) can no-mistakes' document step be steered to maintain a wiki, and what does it
do today; (4) how much intelligence does wiki maintenance need vs generation;
(5) what is the sub-compatible alternatives landscape.

## Verdict — drive the refresh with `codex exec`, keep the OpenWiki format

**Engine decision: bespoke `codex exec`-driven refresh.** Rewrite
`bin/qq-openwiki-refresh` to drive `codex exec` (ChatGPT sub, the same engine and
auth the gate already uses for its pipeline stages via `agent: codex`) with
OpenWiki's MIT-licensed prompt discipline vendored into the repo. Keep the
`openwiki/` format, the `.last-update.json` gitHead protocol, and every existing
guard. Drop the `openwiki` CLI + `~/.openwiki/.env` dependency. `claude -p` is the
ToS-clean fallback engine, deliberately reserved: the Claude sub is the operator's
scarce resource; the ChatGPT sub handles this class of load (operator directive,
2026-07-08). OpenWiki-CLI-with-key is rejected — it violates the constraint and
upstream has no merged subscription path.

Why this wins:

- **ToS-clean on both sides when scoped to the local operator machine.** OpenAI
  documents non-interactive `codex exec` for scripts and CI as a first-class use
  case, and documents ChatGPT-managed auth in CI/CD as a supported advanced
  pattern restricted to *trusted private automation*. The qq gate uses that shape
  as a local daemon on the operator's own machine under their interactive ChatGPT
  login, never as hosted CI or a fork-triggered workflow. This decision does not
  authorize putting `~/.codex/auth.json` or any subscription credential into
  hosted CI, GitHub Actions, or fork-triggered workflows for this public repo;
  OpenAI's auth guide explicitly excludes public/open-source repositories. API
  keys are only the *recommended default*, not a requirement. Verified against
  developers.openai.com and OpenAI ToS text. [high confidence, verified]
- **One engine, one auth, zero marginal cost.** The gate's review/document/lint
  stages already run `codex exec` (no-mistakes `agent: codex`, confirmed in
  no-mistakes source: `internal/agent/codex.go` passes prompts to `codex exec`).
  The wiki refresh riding the same engine adds no new trust surface, no new
  credential, and no API spend — quota is the only currency, and update runs are
  surgical by design. [high confidence]
- **The engine was never the moat — the prompt is.** OpenWiki v0.0.2 is a generic
  LangChain/deepagents filesystem+git agent loop around one system prompt
  (`dist/agent/prompt.js`, MIT): init mode (inventory → quickstart.md → ≤8 pages)
  and update mode (diff-driven, docs-impact plan, soft diff budget — <5 changed
  source files → ≤1-2 pages touched, formatting-only edits forbidden, no-op
  allowed), plus `openwiki/.last-update.json` recording `gitHead` and an update
  context diffing `gitHead..HEAD`. All of it is replicable verbatim under MIT with
  `codex exec` as the runtime. [high confidence, read from installed package]

## The five questions

### 1. Headless `codex exec` on a ChatGPT sub — permitted? YES, with conditions

- `codex exec` is the official non-interactive surface; OpenAI's docs list
  "run as part of a pipeline" and "continuous integration (CI) jobs" as use cases
  (developers.openai.com/codex/noninteractive). [high, verified]
- ChatGPT-managed auth (`auth_mode: "chatgpt"`) in CI/CD is documented as an
  advanced supported pattern for "trusted private automation"; explicitly NOT for
  public/open-source repositories or fork-triggered CI
  (developers.openai.com/codex/auth/ci-cd-auth). The adopted qq design is local
  operator-machine `codex exec`, not hosted CI, and it does not authorize putting
  `~/.codex/auth.json` or subscription credentials into GitHub Actions or any
  other public-repo runner. [high, verified]
- The official `openai/codex-action` GitHub Action is API-key-only — irrelevant
  here (the gate is local), but it kills any "use the official action on the sub"
  idea. [high]
- OpenAI ToS prohibitions that matter: credential sharing, rate-limit
  circumvention, automated *data extraction*. None reaches local single-operator
  automation with your own account. Limit exhaustion → buy credits / blocked until
  window resets; no primary source frames normal exhaustion as ban-worthy.
  [verified but WEAKENED by the adversarial pass: "not bans" is not a guarantee —
  the terms keep suspension power for violations/circumvention; medium]
- Empirical: `codex exec --sandbox read-only` ran headlessly on this machine's
  `auth_mode: chatgpt` login during this research (6.7k tokens, clean exit).
- Plus-plan reality check: Codex limits are per-5-hour local-message windows
  (Plus: 15–80 messages/5h for gpt-5.5; Pro: 75–1600) plus weekly caps — a
  per-landing surgical update fits comfortably; a full re-init is the only
  quota-noticeable event. [high]

**Operator's hypothesis confirmed** — with the written conditions: local trusted
operator-machine automation only, no hosted/public-CI or fork-triggered
subscription credentials, no rate-limit circumvention.

### 2. Anthropic's restriction as written — `claude -p` is INSIDE the envelope

- Claude Code docs document headless `-p`/print mode for "CI, pre-commit hooks, or
  batch processing", and `CLAUDE_CODE_OAUTH_TOKEN` for CI/scripts explicitly
  requiring a Pro/Max subscription (code.claude.com/docs: cli-reference,
  common-workflows, iam). Scripted subscription use through the official binary is
  documented, not tolerated-by-silence. [high, verified]
- The restriction, as actually written, targets **third parties**: "Anthropic does
  not permit third-party developers" to offer Claude.ai login or route
  Free/Pro/Max credentials on users' behalf (code.claude.com legal-and-compliance);
  Agent SDK docs require API keys for third-party products "unless previously
  approved". Consumer Terms add generic clauses: no credential sharing, no
  automated access "unless via an Anthropic API Key" *or explicitly permitted* —
  Claude Code's own docs are that explicit permission for `-p` on a sub. [high]
- The folklore ("OAuth token outside Claude Code = ban") is enforced-not-written:
  server-side errors ("only authorized for use with Claude Code"), the Jan-2026
  OpenCode blocking, the Apr-2026 OpenClaw episode, and a still-muddy Agent-SDK
  credits pause. No Consumer-Terms/Usage-Policy clause names OAuth tokens or
  third-party clients. [medium — the boundary is real but its text is not in the
  consumer terms]
- Net: `claude -p` inside qq scripts on the operator's own sub = permitted as
  written. Extracting the OAuth token into a non-Claude-Code tool (e.g. pointing
  OpenWiki's LangChain `ChatAnthropic` at it) = the exact pattern Anthropic blocks.
  So OpenWiki-CLI-on-Claude-sub is not just unsupported — it's the prohibited shape.

### 3. The gate's document step — NOT steerable; `commands.format` is the right hook

Verified from no-mistakes v1.34.0 source (cloned at tag) and docs:

- Pipeline order is fixed: `intent → rebase → review → test → document → lint →
  push → pr → ci`. The document step diffs changed file names, skips entirely if
  every changed path is ignored, and prompts the agent to "read the diff and
  changed files" and update matching docs/doc-comments in the worktree
  (`internal/pipeline/steps/document.go`). [high, verified]
- There is **no** repo-config surface to steer it: no `document.dir`, no custom
  instructions key, no wiki targeting (`internal/config/config.go` — config is
  `agent`, `commands`, `ignore_patterns`, `allow_repo_commands`, `auto_fix`,
  `intent`, `test`). `--instructions` exists only on `axi respond`. And qq's own
  `ignore_patterns: openwiki/**` actively hides the wiki from it. Steering the
  document step at openwiki/ would require upstream changes. [high, verified]
- `commands.format` runs inside the push step, through `sh -c`, **before** the
  final "no-mistakes: apply agent fixes" commit — so refresh output rides the same
  landing commit/PR: the current wiring is architecturally correct. Two properties
  to respect: format failure only logs a warning (the refresh script must stay
  self-guarding — which it already is), and `commands`/`agent` are read from the
  **default branch** (a keyed refresh script only becomes live once merged to
  main; the security rule that makes gate config trustworthy). [high, verified]

### 4. Maintenance vs generation intelligence — scope shrinks provably; IQ needs don't

- Proven: incremental maintenance is a much smaller *task* than generation.
  RepoDoc (arXiv:2604.26523) measures −73% update time / −77% tokens with +10.2%
  update-recall vs full regeneration (same backbone model — deliberately not a
  model-size claim). RepoAgent (ACL 2024 demo) regenerates only change-affected
  objects. OpenWiki's update prompt enforces surgical diff-driven edits with a
  soft diff budget. [high, verified]
- NOT proven: that maintenance tolerates a *dumber* model. No published
  maintenance-only model-size ablation exists. Adoption evidence points mid-tier:
  OpenWiki defaults to GLM-5.2-class via OpenRouter (incl. its CI update
  examples); RepoAgent defaults to mini-class. Cautionary evidence against small
  local models: RepoAgent's Llama-2-7B "performs poorly"; deepwiki-open's
  documented `qwen3:1.7b` path carries explicit quality warnings and
  structured-output failure reports. [high on the absence; medium on mid-tier
  sufficiency]
- For qq the cheap-engine question dissolves: the sub makes gpt-5.5 the
  zero-marginal-cost engine, and per-landing updates are quota-small by
  construction. There is no reason to buy a lesser engine's risk.

### 5. Sub-compatible landscape — upstream OpenWiki: no; bespoke CLI scripts: yes

- **OpenWiki upstream (langchain-ai): API-key-only, today and on main.** v0.0.2's
  provider enum is openrouter/baseten/fireworks/openai/openai-compatible/anthropic
  — every one keyed via env var (confirmed in the installed package:
  `PROVIDER_CONFIGS[].apiKeyEnvKey`; `needsCredentialSetup()` even wants
  `LANGSMITH_API_KEY` defined). Subscription-compatible backends exist only as
  open issues (#59, #106, #120, #156, #225) and unmerged PRs (#76 and #181
  open, #188 closed; #151 opened 2026-07-06 and #205 opened 2026-07-08, both
  open non-draft) — nothing merged on main. No roadmap commitment found.
  [high, verified; #151/#205 surfaced by the gate's review and re-verified via
  gh]
  Note on #151/#205: both add ChatGPT/Codex OAuth but call the Codex Responses
  backend *directly* from OpenWiki (via LangChain `ChatOpenAI` in #151, via a
  self-managed provider in #205) — i.e. a non-Codex client on ChatGPT-sub
  credentials, the same shape Anthropic prohibits on its side and a weaker ToS
  position than driving the official `codex` binary. Even if either merges, it
  does not obviously beat option 1.
- **CodeWiki (FSoft-AI4Code)**: the strongest existing tool for this constraint —
  `CAW_PROVIDERS = {"claude-code", "codex"}` routes every LLM call through the
  local authenticated CLI binaries. But it writes its own `docs/` structure, not
  the `openwiki/` format qq standardized on, and adopting it means adopting its
  generation opinions wholesale. [high, verified]
- **Agent-native plugins/skills** (openwiki-cc, openwiki-for-claude-code,
  deepwiki-skill, microsoft/skills deep-wiki): all sub-only-capable, all
  Claude-Code-centric (shell out to `claude -p`) — which burns the wrong sub
  under the operator's load directive, and all are young third-party projects.
  [medium]
- **Bespoke `codex exec` / `claude -p` scripts**: fully documented primitives on
  both vendors' officially supported headless surfaces; the only build cost is
  the prompt — which OpenWiki already wrote and MIT-licensed. [high]

## Rankings — end-state options under sub-only

| # | Option | ToS standing | Cost | Maintenance quality | Verdict |
|---|---|---|---|---|---|
| 1 | **Bespoke `codex exec` refresh, OpenWiki MIT prompts vendored** | Local operator Codex CLI; no hosted/public CI credentials | ChatGPT-sub quota only; surgical updates are small | gpt-5.5 xhigh ≥ every engine any wiki tool ships by default | **ADOPTED** |
| 2 | Same script, `claude -p` engine (never `--bare` — it skips OAuth) | Documented (`-p` + CI docs) | Claude-sub quota — the scarce resource | Equivalent | Fallback, reserved |
| 3 | CodeWiki (claude-code/codex providers) | Same CLI primitives | Same | Good, but `docs/` format ≠ `openwiki/`; wholesale adoption | Rejected — format break |
| 4 | openwiki-cc / openwiki-for-claude-code / deepwiki-skill | `claude -p` envelope | Claude-sub quota | OpenWiki-format capable | Rejected — wrong sub, third-party churn |
| 5 | OpenWiki CLI + API key (status quo script) | Fine, but violates the operator constraint | Out-of-pocket API spend | Good | **Rejected** — the constraint |
| 6 | OpenWiki CLI + ChatGPT/Codex OAuth provider (#151/#205 shape) | Non-Codex client calls Codex backend directly; weaker than `codex` binary | ChatGPT-sub quota | Good if merged | Rejected until vendor-blessed/ToS-clear |
| 7 | OpenWiki CLI + Claude-sub OAuth shim | The prohibited third-party-routing shape | — | — | Rejected — ToS |
| 8 | Local model via openai-compatible/ollama | Fine (no keys) | Hardware | Documented quality failures at this size | Rejected — quality evidence negative |
| 9 | Steer no-mistakes document step at openwiki/ | n/a | n/a | n/a | Rejected — no config surface exists (verified in source) |

## Implementation re-plan (for the follow-up task)

The engine decision converts TASK-7's implementation half into:

1. Vendor OpenWiki's init/update prompt discipline (MIT — preserve the copyright
   and permission notice alongside the copied prompt material, attribution in
   SKILLS-ATTRIBUTION.md) as prompt templates in the qq repo — adapted: no
   AGENTS.md/CLAUDE.md injection by default (qq wires its own imports), keep
   `openwiki/.last-update.json` + `gitHead..HEAD` diff protocol.
2. Rewrite `bin/qq-openwiki-refresh` to call
   `timeout 600 codex exec -c approval_policy=never --sandbox workspace-write --cd <repo> --skip-git-repo-check - < "$prompt_file"` — the sandbox flag is mandatory:
   non-interactive codex defaults to a read-only sandbox
   (developers.openai.com/codex/noninteractive), so an unflagged call could
   never write `openwiki/`; the prompt-file stdin form is mandatory because it
   EOF-closes stdin without putting repo context/diffs in shell arguments, while
   raw `codex exec "<prompt>"` can block forever while reading inherited stdin.
   The non-interactive approval flag surface is version-dependent:
   `-c approval_policy=never` was verified on codex-cli 0.142.5 and remains
   present in 0.143.0 help, so re-check `codex exec --help` during
   implementation rather than copying top-level docs flags.
   Keep the bounded timeout so stalled Codex/model/network calls always reach the
   warn-don't-block path and restore the snapshot. Do not rely on a machine's
   permissive `~/.codex/config.toml`. Keep
   update-mode guards (no `openwiki/` → skip unless `--init`; no `codex` binary
   or no ChatGPT-managed Codex login → warn+skip; snapshot/restore on failure;
   pre/post diff containment that restores/rejects every refresh-introduced
   modification outside `openwiki/` before returning and warns loudly if it
   trips; warn-don't-block) and re-key the "is it configured" check from
   `~/.openwiki/.env` to a CODEX_HOME/keyring-aware `codex login status` probe
   that accepts human status output such as `Logged in using ChatGPT` (or a
   `$CODEX_HOME/auth.json` record with `auth_mode: "chatgpt"`) and rejects
   API-key auth.
3. One-time initial generation: the init-mode prompt through the same script
   (`--init` flag), bypassing the update-only missing-`openwiki/` skip and
   creating `openwiki/` only after the ChatGPT-auth probe passes, reviewed by the
   operator before first landing.
4. Update `.no-mistakes.yaml` comment + lint list and rewrite `bin/install.sh`
   preflight from OpenWiki CLI/API-key setup to Codex CLI + ChatGPT-login setup;
   remember `commands.*` goes live only after merge to main (default-branch trust
   rule).
5. Roll-out note for TASK-9 (linked repos): the same script works per-repo since
   codex auth is machine-global.

Watch-fors recorded: OpenAI could tighten the CI/CD-auth-on-sub language (it is
one docs page, not a ToS commitment), and the public-repo caveat remains strict:
do not place `~/.codex/auth.json` or subscription credentials into hosted CI,
GitHub Actions, or fork-triggered workflows for this public repo; OpenWiki
upstream may merge a subscription backend (issues #59/#156, PR #151's
ChatGPT-login provider and PR #205's self-managed Codex OAuth provider —
re-evaluate if one merges, weighing the direct-backend ToS caveat); the
Anthropic Agent-SDK credits pause may resolve into a cleaner written rule for
`claude -p`-class automation.

## Verification note

Load-bearing claims were re-verified by an independent adversarial `codex exec`
pass that re-fetched every cited primary source (docs pages, ToS text, repo files
at pinned tags, PR/issue states, the RepoDoc paper). Verdicts:

| # | Load-bearing claim | Verdict |
|---|---|---|
| 1 | `codex exec` documented for scripts/CI; ChatGPT-managed auth documented for trusted private automation, excluding public/open-source repos | CONFIRMED |
| 2 | Limit exhaustion → credits/blocking; no written prohibition on local scripted sub use | WEAKENED (holds, minus any "no bans" guarantee) |
| 3 | `claude -p` headless/CI on subs documented incl. `CLAUDE_CODE_OAUTH_TOKEN`; written ban targets third-party credential routing | CONFIRMED |
| 4 | no-mistakes document step unsteerable; `commands.format` in push step pre-commit; failures warn; default-branch trust rule | CONFIRMED |
| 5 | OpenWiki upstream API-key-only; sub-compatible PRs unmerged (#76/#151/#181/#205 open, #188 closed) | CONFIRMED (PR states corrected) |
| 6 | CodeWiki genuinely routes via local `claude`/`codex` CLIs; writes `docs/` not `openwiki/` | CONFIRMED |
| 7 | RepoDoc: −73% time / −77% tokens / +10.2% update recall for incremental maintenance, same backbone | CONFIRMED |
| 8 | OpenWiki update prompt is surgical/diff-driven; MIT permits prompt reuse (with notice) | CONFIRMED |

Claims tagged [verified] in-text survived that pass; [medium] items are either
negative findings (absence of written rules) or fast-moving vendor posture.
