# qq on DSH through pi2dsh

This is an isolated compatibility harness, not an operator-runtime cutover. It mounts qq's single Pi bundle (`extensions/index.ts`) in a fresh DSH `headless` profile through pi2dsh, checks the pinned compatibility matrix, and stops before a model call. It does not rewrite qq or replace Herdr/Pi.

## Pinned baseline

| Project | Package | Exact source revision | Package integrity |
|---|---|---|---|
| qq | local checkout | [`6ac5c0796ebe8f98682ee4b96f9900a7784c0890`](https://github.com/hypermemetic-ai/qq/commit/6ac5c0796ebe8f98682ee4b96f9900a7784c0890) | n/a |
| pi2dsh | `pi2dsh@0.12.3` | [`7420aac0f6b5513e056c44c099527ddee0d705f0`](https://github.com/weijiafu14/pi2dsh/commit/7420aac0f6b5513e056c44c099527ddee0d705f0) | `sha512-GDvzm9m9QIlEvSd9g6txZ7emKMbYCU++qFwoLgaz+qMq6sO39oe6OL839IIaU5KGfm6yKEet97tUSL5GgZpukA==` |
| DeepSeek Harness | `@deepseek-ai/dsh@0.1.0-rc.6` | [`47f943859bef60e4160492346772ded9b24f765a`](https://github.com/deepseek-ai/deepseek-harness/commit/47f943859bef60e4160492346772ded9b24f765a) | `sha512-brpZfED7ieRa2PQ5tUxMhHrM1pb2CmKFVM/f6yMULBDMicahk+Z2OsHgTwTDnoiZm23Ftu9rQz0NN4pflaoJcg==` |

`pins.json` is the machine-readable source of truth. The qq pin is the bundle baseline immediately before this harness was added. `run.sh` refuses to run if `extensions/` differs from that revision, forcing a deliberate re-probe after extension changes.

## Run

Requirements: Linux, Git, Node.js 22.19 or newer, npm, and network access to the npm registry.

```bash
compat/pi2dsh/run.sh
```

The script:

1. recreates the npm tool installation with `npm ci` from the committed transitive lock, then verifies the exact package versions, pi2dsh `gitHead`, and both top-level integrity hashes;
2. runs `pi2dsh matrix --json` and `pi2dsh inspect <qq> --json`;
3. creates a fresh `$DSH_HOME`, installs the pinned local pi2dsh package and the current qq checkout with DSH's plugin manager;
4. supplies a load-only qq-relay client stub because that separately installed runtime is outside the extension ABI (no relay operation is claimed or exercised);
5. boots the real DSH headless composition with no provider credentials;
6. proves the qq bundle loaded as eight tools and three commands, checks expected warnings/blockers, and accepts only the intentional final `MISSING_CREDENTIAL` exit.

Keep the temporary profile for inspection or copy the generated artifacts:

```bash
QQ_PI2DSH_KEEP=1 compat/pi2dsh/run.sh
QQ_PI2DSH_OUTPUT=/tmp/qq-pi2dsh-evidence compat/pi2dsh/run.sh
```

The output directory receives `matrix.json`, `inspection.json`, DSH stdout/stderr, and the npm lockfile used to verify package integrity. No credentials are read or used.

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
- qq agent messaging rejects the DSH session id as non-canonical;
- qq's separately installed relay client is a load-time dependency outside pi2dsh, so the harness uses a non-operational stub rather than pretending to prove it.

The collision, model refusal, and session-id failure are runtime observations from the DSH boot, not static predictions.

## Cutover blockers

Mount compatibility does not make the orchestration DSH-native:

- delegation and review still issue `herdr agent start ... --kind pi`;
- runner acceptance requires Herdr's `herdr:pi` session descriptor and reads a Pi `.jsonl` user-message record;
- relay and review receipts parse `ctx.sessionManager.getSessionFile()` as Pi JSONL, while pi2dsh exposes a sidecar and DSH stores messages in its own durable log;
- session scrub accepts only `~/.pi/agent/sessions` files and depends on Pi `/new` behavior;
- absorbed shutdown and non-firing shortcut/tree events change qq workflow behavior.

Therefore the evidence says **do not cut over the operator runtime**. Translate and prove those capabilities individually in follow-up tickets.
