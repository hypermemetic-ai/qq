# qq on DSH through pi2dsh

This is an isolated compatibility harness, not an operator-runtime cutover. It mounts qq's single Pi bundle (`extensions/index.ts`) in a fresh DSH `headless` profile through pi2dsh, checks the pinned compatibility matrix, and advances only through a deterministic localhost model boundary. Agent messaging and run-outcome addressing use a privately installed qq-relay artifact and isolated real service. It does not rewrite qq or replace Herdr/Pi.

## Pinned baseline

| Project | Package | Exact source revision | Package integrity |
|---|---|---|---|
| qq | local checkout | [`2b4b9898605144530cf385a60eca30d86bb23178`](https://github.com/hypermemetic-ai/qq/commit/2b4b9898605144530cf385a60eca30d86bb23178) | n/a |
| pi2dsh | `pi2dsh@0.12.3` | [`7420aac0f6b5513e056c44c099527ddee0d705f0`](https://github.com/weijiafu14/pi2dsh/commit/7420aac0f6b5513e056c44c099527ddee0d705f0) | `sha512-GDvzm9m9QIlEvSd9g6txZ7emKMbYCU++qFwoLgaz+qMq6sO39oe6OL839IIaU5KGfm6yKEet97tUSL5GgZpukA==` |
| DeepSeek Harness | `@deepseek-ai/dsh@0.1.0-rc.6` | [`47f943859bef60e4160492346772ded9b24f765a`](https://github.com/deepseek-ai/deepseek-harness/commit/47f943859bef60e4160492346772ded9b24f765a) | `sha512-brpZfED7ieRa2PQ5tUxMhHrM1pb2CmKFVM/f6yMULBDMicahk+Z2OsHgTwTDnoiZm23Ftu9rQz0NN4pflaoJcg==` |

`pins.json` is the machine-readable source of truth. The qq pin is the extension revision exercised by this evidence. `run.sh` refuses to run if `extensions/` differs from that revision, forcing a deliberate re-probe after extension changes.

## Run

Requirements: Linux, Git, Node.js 22.19 or newer, npm, and network access to GitHub and the npm registry.

```bash
tests/test-qq-relay.sh
```

This existing relay-contract entrypoint owns the composed proof:

1. fetches the configured qq-relay branch, validates its public surface, privately installs it, and deletes the source checkout;
2. starts one isolated real service from that installed artifact and retains the lower-level persistence coverage for delayed evidence, safe redelivery, no duplicate injection, restart recovery with empty memory, and no session-file fallback;
3. invokes `compat/pi2dsh/run.sh` inside that lifecycle; the harness refuses any standalone relay root or missing service socket;
4. recreates the pinned pi2dsh/DSH tool installation, verifies package integrity and `gitHead`, runs the compatibility matrix and inspection, and mounts qq in a fresh `$DSH_HOME`;
5. points DSH's real DeepSeek adapter at a deterministic localhost wire stub, using only a sentinel probe key, so queued input remains local while the real relay retry backoff elapses;
6. sends through qq's installed-product client loader to both `agents/<exact DSH session id>` and `qq/review-flow/<exact DSH session id>`; mounted qq consumes both addresses against the same service;
7. requires agent-message status to become delivered only after one pinned plugin-sourced DSH `user/message`, with relay attempt/failure counts proving retry without duplicate injection;
8. requires the run-outcome record, obligation, payload, and one durable bridged message to preserve the complete DSH architect identity, while status remains pending at the separately documented Pi-JSONL receipt blocker.

Keep the temporary DSH profile for inspection or copy its generated artifacts while running the owning entrypoint:

```bash
QQ_PI2DSH_KEEP=1 tests/test-qq-relay.sh
QQ_PI2DSH_OUTPUT=/tmp/qq-pi2dsh-evidence tests/test-qq-relay.sh
```

The output directory receives `matrix.json`, `inspection.json`, DSH stdout/stderr, the installed-relay send/status proof, the plaintext isolated DSH session artifact, the localhost LLM requests, the DSH session id, and the npm lockfile used to verify package integrity. No real credential is read or used, and model traffic stays on localhost. The relay source and private service remain owned by the outer test lifecycle.

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
- run-outcome production, recipient validation, and parsing accept bare canonical Pi UUIDs and that exact pinned DSH form; the real relay and mounted architect receiver preserve `session-<UUID>` throughout the address and payload;
- agent-message acknowledgement uses `ctx.sessionManager.getEntries()` as its only persistence authority; the pinned runtime probe observes the real relay's retry and redelivery, one bridged plugin-sourced `user/message`, and acknowledgement only after that durable record appears;
- the DSH-addressed run outcome produces one durable bridged message but remains pending because review receipt acknowledgement still depends on Pi JSONL;
- qq's load-time client resolver works under pi2dsh against the privately installed artifact after relay source deletion, and final agent-message status is delivered without changing the exact `session-<UUID>` identity.

The collision, model refusal, and session-id activation are runtime observations from the DSH boot, not static predictions.

## Cutover blockers

Mount compatibility does not make the orchestration DSH-native:

- delegation and review still issue `herdr agent start ... --kind pi`;
- runner acceptance requires Herdr's `herdr:pi` session descriptor and reads a Pi `.jsonl` user-message record;
- review receipts still parse `ctx.sessionManager.getSessionFile()` as Pi JSONL, while pi2dsh exposes a sidecar and DSH stores messages in its own durable log;
- session scrub accepts only `~/.pi/agent/sessions` files and depends on Pi `/new` behavior;
- absorbed shutdown and non-firing shortcut/tree events change qq workflow behavior.

Therefore the evidence says **do not cut over the operator runtime**. Translate and prove those capabilities individually in follow-up tickets.
