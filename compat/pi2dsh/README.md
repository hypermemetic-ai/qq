# qq on DSH through pi2dsh

This is an isolated compatibility harness, not an operator-runtime cutover. It mounts qq's single Pi bundle (`extensions/index.ts`) in a fresh DSH `headless` profile through pi2dsh, checks the pinned compatibility matrix, and stops before a model call. It does not rewrite qq or replace Herdr/Pi.

## Pinned baseline

| Project | Package | Exact source revision | Package integrity |
|---|---|---|---|
| qq | local checkout | [`2b4b9898605144530cf385a60eca30d86bb23178`](https://github.com/hypermemetic-ai/qq/commit/2b4b9898605144530cf385a60eca30d86bb23178) | n/a |
| pi2dsh | `pi2dsh@0.12.3` | [`7420aac0f6b5513e056c44c099527ddee0d705f0`](https://github.com/weijiafu14/pi2dsh/commit/7420aac0f6b5513e056c44c099527ddee0d705f0) | `sha512-GDvzm9m9QIlEvSd9g6txZ7emKMbYCU++qFwoLgaz+qMq6sO39oe6OL839IIaU5KGfm6yKEet97tUSL5GgZpukA==` |
| DeepSeek Harness | `@deepseek-ai/dsh@0.1.0-rc.6` | [`47f943859bef60e4160492346772ded9b24f765a`](https://github.com/deepseek-ai/deepseek-harness/commit/47f943859bef60e4160492346772ded9b24f765a) | `sha512-brpZfED7ieRa2PQ5tUxMhHrM1pb2CmKFVM/f6yMULBDMicahk+Z2OsHgTwTDnoiZm23Ftu9rQz0NN4pflaoJcg==` |

`pins.json` is the machine-readable source of truth. The qq pin is the extension revision exercised by this evidence. `run.sh` refuses to run if `extensions/` differs from that revision, forcing a deliberate re-probe after extension changes.

## Run

Requirements: Linux, Git, Node.js 22.19 or newer, npm, and network access to the npm registry.

```bash
compat/pi2dsh/run.sh
```

The script:

1. recreates the npm tool installation with `npm ci` from the committed transitive lock, then verifies the exact package versions, pi2dsh `gitHead`, and both top-level integrity hashes;
2. runs `pi2dsh matrix --json` and `pi2dsh inspect <qq> --json`;
3. creates a fresh `$DSH_HOME`, installs the pinned local pi2dsh package and the current qq checkout with DSH's plugin manager;
4. supplies a capture-only qq-relay client stub that drives one synthetic delivery because the separately installed relay runtime is outside the extension ABI (no relay transport operation is claimed compatible);
5. points DSH's real DeepSeek adapter at a deterministic localhost wire stub, using only a sentinel probe key, so queued input can cross two agent steps without credentials or external model traffic;
6. proves agent messaging's `session_start` receiver addresses the relay as `agents/<exact DSH session id>`, observes retry before persistence, then observes one acknowledgement only after the matching DSH `user/message` is durable and visible through pi2dsh's session-manager projection;
7. verifies that durable record's plugin source carries `piCustomType: "qq-agent-message"`, while the qq bundle still loads as eight tools and three commands and the expected model-policy warning remains.

Keep the temporary profile for inspection or copy the generated artifacts:

```bash
QQ_PI2DSH_KEEP=1 compat/pi2dsh/run.sh
QQ_PI2DSH_OUTPUT=/tmp/qq-pi2dsh-evidence compat/pi2dsh/run.sh
```

The output directory receives `matrix.json`, `inspection.json`, DSH stdout/stderr, the captured relay request and receipt calls, the plaintext isolated DSH session artifact, the localhost LLM requests, the DSH session id, and the npm lockfile used to verify package integrity. No real credential is read or used, and model traffic stays on localhost.

A fast, offline drift test covers the declared bundle and qq's non-ABI assumptions:

```bash
node tests/test-pi2dsh-compat.mjs .
```

## Observed facts

The complete machine-readable record is [`evidence.json`](evidence.json). At this baseline:

- static inspection reports **66 full**, **57 partial**, **0 unsupported**, and **0 fatal** findings, with an overall `review` verdict;
- package-local events and `before_agent_start` are full mappings;
- tools, commands, model selection, and thinking effort are mapped with stated differences;
- `registerShortcut` and `session_tree` handlers register but never fire;
- `ctx.shutdown` is absorbed, and project trust is unavailable/fails closed;
- qq mounts only after the isolated DSH profile disables `tool-fs`, because qq intentionally replaces Pi's built-in `read` and pi2dsh rejects the native DSH collision;
- qq execution-profile activation refuses the isolated DSH model directory because the required `xai-auth/grok-4.6` route is absent;
- qq agent messaging accepts only the pinned headless host's exact `session-<randomUUID()>` identity form and preserves the complete value as the live relay receiver address;
- agent-message acknowledgement now uses `ctx.sessionManager.getEntries()` as its only persistence authority; the pinned runtime probe observes retries before the bridged plugin-sourced `user/message`, then one acknowledgement after that record appears;
- qq's separately installed relay client is a load-time dependency outside pi2dsh, so the harness uses a capture-only stub to drive and record the receipt boundary rather than pretending to prove relay transport compatibility.

The collision, model refusal, and session-id activation are runtime observations from the DSH boot, not static predictions.

## Cutover blockers

Mount compatibility does not make the orchestration DSH-native:

- delegation and review still issue `herdr agent start ... --kind pi`;
- runner acceptance requires Herdr's `herdr:pi` session descriptor and reads a Pi `.jsonl` user-message record;
- review receipts still parse `ctx.sessionManager.getSessionFile()` as Pi JSONL, while pi2dsh exposes a sidecar and DSH stores messages in its own durable log;
- session scrub accepts only `~/.pi/agent/sessions` files and depends on Pi `/new` behavior;
- absorbed shutdown and non-firing shortcut/tree events change qq workflow behavior.

Therefore the evidence says **do not cut over the operator runtime**. Translate and prove those capabilities individually in follow-up tickets.
