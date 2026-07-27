---
id: doc-110
title: Proportionate deterministic message plane assessment — 2026-07-27
type: specification
created_date: '2026-07-27 06:29'
updated_date: '2026-07-27 09:03'
---
# Proportionate deterministic message plane assessment — 2026-07-27

**Owning Task:** T-172
**Overall confidence:** MEDIUM-HIGH
**What this settles:** The observed workload needs crash-durable, at-least-once movement but not high throughput. Exact-version BullMQ/Redis and NATS JetStream probes both passed the shared process-crash, redelivery, idempotency, isolation, fan-in, footprint, and cleanup scenarios. The operator selected **NATS JetStream** as the recommended deterministic plane because it is the smaller raw broker surface, with its explicit terminal/result/fan-in layer counted as broker application work. The future broker core belongs in a **separate Repository**, while qq retains a thin Pi/Herdr methodology adapter. This is a design recommendation, not production adoption or implementation authorization.

## Findings

### The workload is small

- **HIGH — live scale:** at 2026-07-27T06:09Z, aggregate socket inspection found 11 established clients on `~/.pi/agent/intercom/broker.sock`; the accountable session independently observed 11 registered sessions. A later repeat found 10, showing the expected small and transient topology rather than a service fleet.
- **HIGH — observed history:** structural, content-free parsing of 189 Pi session JSONL files over 2026-07-19 through 2026-07-27 found 372 `intercom_sent` and 20 correlated `intercom_received` records. In the final 24 hours there were 145 records across five active hours, peaking at 87/hour, 25/five minutes, and 12/minute. Serialized record data was about 0.4 KiB median, below 1 KiB at p95, and about 5 KiB maximum. The accountable owner reproduced the event counts and burst peaks independently.
- **HIGH — these are lower bounds:** incumbent source appends `intercom_sent` only after socket delivery and records correlated `ask` replies differently from ordinary inbound messages. Failed sends and ordinary inbound delivery are therefore undercounted. The asymmetry is not a directionality measure.
- **MEDIUM — conservative comparison envelope:** judge candidates against 24 simultaneous sessions, 200 durable operations/hour, bursts of 25/minute, envelopes capped at 64 KiB, and tens of thousands rather than millions of retained records. These deliberately exceed observations without inventing a high-throughput requirement.

### Required transport contract

A qualifying tool must supply durable acceptance; worker acknowledgement and crash-safe lease/redelivery; at-least-once processing; usable enqueue deduplication; project-scoped queues; bounded retries and terminal failure; retained/correlated results; reconnect behavior; macOS/Linux and maintained Node/TypeScript support; and a modest local lifecycle. The separate broker-core Repository owns semantic message IDs, recipient-side idempotency, deadlines, and the distinction among accepted, delivered, answered, and resolved. The qq adapter declares Pi/Herdr capability and presence facts; broker-core stores and evaluates them without acquiring methodology authority.

A tool fails the gate if broker-core must invent the underlying queue protocol itself or if the complete operational surface is disproportionate to the measured workload.

### Candidate comparison

| Candidate | Native useful machinery | Application layer still required | Result |
|---|---|---|---|
| Raw SQLite / raw Redis Streams | Durable database/log primitives | Broker-core would have to invent lease ownership, redelivery, retry accounting, deduplication, terminal movement, and result conventions | **Reject — reinvents the queue** |
| pi-intercom 0.6.0 | Live presence, direct socket routing, correlation, reconnect, strong TUI patterns | Broker-core would still need persistence, durable inbox, recipient ACK, lease, retry, dedup ledger, retention, and terminal failure | **Reject as message plane; retain UX lessons in qq UI** |
| Faktory OSS | Reservations, ACK/FAIL, retry/dead set, named queues | Broker-core would still need strict default durability, OSS dedup, and robust Node result flow | **Reject — more processes and still incomplete** |
| NATS JetStream | One small server binary; durable streams/consumers; explicit ACK, AckWait/BackOff/MaxDeliver; subject isolation; producer dedup; retained arbitrary bytes/advisories | Broker-core owns result/correlation convention, exact-key fan-in/waiters, and explicit durable terminal materialization/reconciliation | **RECOMMEND — operator selected** |
| BullMQ + Redis | Job IDs, queue-scoped isolation, worker locks/renewal, stalled requeue, retries/backoff, failed set, deduplication, retained return values/results queues, retention/events | Broker-core would still own domain envelope/state machine, semantic deadline, recipient idempotency, and capability presence | **Reject for this use — larger raw surface** |

**HIGH — incumbent weakness:** pi-intercom's broker stores connected sessions in memory. On send it writes to the target socket and immediately returns `delivered` to the sender; that proves neither recipient processing nor answerability. See local `pi-intercom/broker/broker.ts`, `broker/client.ts`, and `index.ts`.

**HIGH — BullMQ lifecycle:** BullMQ locks active jobs, workers renew those locks, and a stalled job returns to waiting or eventually moves to failed. It provides fixed/exponential retries, queue-scoped custom IDs, and Simple deduplication that suppresses equivalent additions until the retained job completes or fails. Worker return data is retained, and BullMQ documents a separate results queue for durable downstream handling. [Stalled jobs](https://docs.bullmq.io/guide/workers/stalled-jobs), [retries](https://docs.bullmq.io/guide/retrying-failing-jobs), [job IDs](https://docs.bullmq.io/guide/jobs/job-ids), [deduplication](https://docs.bullmq.io/guide/jobs/deduplication), [results](https://docs.bullmq.io/guide/returning-job-data).

**HIGH — persistence is conditional:** BullMQ explicitly says Redis persistence must be configured and requires `maxmemory-policy=noeviction`. Redis documents that `appendfsync always` performs an fsync before replies, whereas the default every-second policy can lose roughly one second. The probe must start a dedicated local Redis with AOF enabled, `appendfsync always`, `no-appendfsync-on-rewrite no`, and `noeviction`; it must verify the effective configuration before treating `Queue.add` as durable acceptance. [BullMQ production guidance](https://docs.bullmq.io/guide/going-to-production), [Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/).

**HIGH — NATS is credible but leaves more broker-core application machinery:** JetStream streams acknowledge successful storage, support file storage, retention, and producer deduplication. Durable consumers track ACKs and redeliver after AckWait/BackOff; MaxDeliver exhaustion emits an advisory while the message remains in the stream. The separate broker-core Repository must convert terminal advisories into durable terminal records and build the retained result convention. [Streams](https://docs.nats.io/nats-concepts/jetstream/streams), [consumers](https://docs.nats.io/nats-concepts/jetstream/consumers).

### Side-by-side result — awaiting operator disposition

This is not a throughput decision. Both candidates passed at the observed envelope and both add one local daemon plus one Node process. The choice is where complexity lives.

| Measured/observed dimension | BullMQ 5.81.2 + ioredis 5.11.1 + Redis 8.8.1 | NATS Server 2.14.3 + NATS.js 3.4.0 |
|---|---:|---:|
| Local image bytes | 37,645,543 | 6,867,594 |
| Complete probe `node_modules` bytes | 10,209,246 | 1,341,227 |
| Server RSS in final owner runs | 8,160 and 22,188 KiB; earlier runs about 22,000 KiB | about 18,400–19,304 KiB |
| Steady processes including Node | 2 | 2 |
| Local daemons | 1 | 1 |
| Direct Node dependencies | 2 | 2 |
| Executable probe `.mjs` lines | 1,251 | 1,255 |
| Server/client license surface | Redis 8 tri-license plus MIT BullMQ/ioredis | Apache-2.0 server and clients |

**HIGH — NATS has the smaller raw deterministic surface.** Its image is about 82% smaller and its complete installed Node tree about 87% smaller in these local measurements. It is a purpose-built broker with one server binary and no separate database product. Loopback binding, file storage, streams, consumers, health, and limits were inspectable through its own protocol/monitoring APIs.

**HIGH — BullMQ has more native application-job machinery.** It owns job locks, stalled recovery, attempts/backoff, a durable failed set, retained return values, and exact-key in-flight deduplication. Strict Redis AOF-always/no-eviction configuration adds lifecycle and license policy but reduces custom terminal/result work.

**HIGH — NATS makes terminal/result/fan-in conventions explicit application work.** JetStream natively stores request/receipt/result bytes and supplies durable consumers, redelivery, MaxDeliver, advisories, and finite stream-scoped publish deduplication. It does not natively turn MaxDeliver into a durable terminal record, attach four waiters to one adjudication, or define retained correlated results. The probe implemented and counted those pieces rather than crediting NATS for them.

**MEDIUM — NATS exposed two sharper recovery caveats.** Its MaxDeliver advisory was online but not durable, so production needs durable advisory capture or idempotent exhausted-message reconciliation. An exploratory immediate kill after confirmed ACK preserved request bytes but lost the consumer ACK floor; the passing restart scenario records a one-second settle before process kill. ACK loss causes safe duplicate redelivery under the agreed at-least-once contract, but it is still lifecycle evidence. BullMQ/Redis also cannot atomically cover recipient side effects, and neither probe tests host-power loss.

**Operator disposition:** recommend NATS JetStream. The deciding criterion is raw deterministic simplicity: one smaller purpose-built broker, a much smaller client dependency tree, Apache-2.0 licensing, and no separate database product. The future broker Repository must explicitly own and test durable terminal materialization/reconciliation, retained result correlation, exact-key fan-in, and waiter recovery; moving those concerns into application code does not make them disappear. BullMQ/Redis remains credible evidence and a fallback if the NATS terminal/recovery design later fails its production acceptance checks, but it is not the selected direction.

Raw SQLite/Redis queue machinery remains rejected because it would make the application author the core queue protocol.

## Probe design

Use a temporary data directory and an allocated loopback port or Unix socket. Pin exact BullMQ and Redis versions. Start Redis as a child with AOF-always and no eviction, and prefix every queue with `t172probe:<run-id>`.

- **Configuration/durable acceptance:** assert effective persistence settings; enqueue; kill Redis; restart from the same directory; assert the exact job and payload hash survive. While Redis is absent, a producer add must fail within a fixed bound and produce no accepted state.
- **Worker death after lease:** have worker A lease and block, kill it, start worker B, and assert the same job ID is marked stalled, redelivered, and completed once without producer republish.
- **Duplicate delivery/idempotency:** let a mock recipient durably record the message ID and receipt; kill the worker after delivery but before job completion; assert two processing attempts produce one visible wake-up and one stable receipt.
- **Disconnected recipient:** three bounded attempts must end in the failed set with `RECIPIENT_UNAVAILABLE`, with no completed event or successful result. This message-plane probe does not manufacture or claim future delivered/answered/resolved state.
- **Project isolation:** the same custom job ID in project-A and project-B queues must be independent; running only A's worker must leave B waiting.
- **Four-to-one fan-in:** four concurrent additions with one Simple deduplication ID, held behind a barrier, must identify one retained job, invoke one worker and one recipient, and return the same result to four callers.
- **Cleanup:** close clients, stop Redis, and prove no probe process, queue key, socket, or temporary directory remains.

## Required NATS JetStream equivalence probe

Use one exact NATS Server release with file-backed JetStream in a temporary directory and one exact Node client version. Run the same externally meaningful contract rather than copying BullMQ internals:

- assert a server-acknowledged ingress message survives forced server death and same-directory restart;
- kill a consumer after delivery but before ACK and prove bounded redelivery of the same stable message ID without producer republish;
- persist a recipient receipt and prove redelivery causes one visible wake;
- exhaust a disconnected-recipient attempt policy into an explicit durable terminal record with no completion/result claim;
- prove project subjects/streams isolate the same message ID as a trusted namespace boundary;
- collapse four exact-key concurrent in-flight requests to one adjudication/recipient wake and return one byte-identical result to four callers, measuring which parts are NATS-native versus application-authored;
- measure binary/client footprint, RSS/CPU/process count, configuration, startup, and shutdown; and
- prove normal, malformed-startup, and interrupted cleanup removes only exact generated resources.

The comparison must count custom terminal/result/fan-in state code against NATS and the Redis/configuration/lifecycle surface against BullMQ. No candidate wins by moving complexity out of the measurement.

## Sources

### Local primary evidence

- `~/.pi/agent/sessions/**/*.jsonl` — aggregate structural counts only; no message content used.
- `~/.pi/agent/npm/node_modules/pi-intercom/broker/broker.ts`
- `~/.pi/agent/npm/node_modules/pi-intercom/broker/client.ts`
- `~/.pi/agent/npm/node_modules/pi-intercom/index.ts`
- `~/.pi/agent/npm/node_modules/pi-intercom/types.ts`
- `skills/agent-messaging/SKILL.md`
- T-172 and realigned plan doc-111.

### Opened primary sources

- [BullMQ stalled jobs](https://docs.bullmq.io/guide/workers/stalled-jobs)
- [BullMQ retries](https://docs.bullmq.io/guide/retrying-failing-jobs)
- [BullMQ job IDs](https://docs.bullmq.io/guide/jobs/job-ids)
- [BullMQ deduplication](https://docs.bullmq.io/guide/jobs/deduplication)
- [BullMQ returning job data](https://docs.bullmq.io/guide/returning-job-data)
- [BullMQ production guidance](https://docs.bullmq.io/guide/going-to-production)
- [Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
- [NATS JetStream streams](https://docs.nats.io/nats-concepts/jetstream/streams)
- [NATS JetStream consumers](https://docs.nats.io/nats-concepts/jetstream/consumers)
- [NATS Server v2.14.3 release](https://github.com/nats-io/nats-server/releases/tag/v2.14.3)
- [NATS official Docker tag metadata](https://registry.hub.docker.com/v2/repositories/library/nats/tags/2.14.3)
- [`@nats-io/transport-node` 3.4.0 registry metadata](https://registry.npmjs.org/%40nats-io%2Ftransport-node/3.4.0)
- [`@nats-io/jetstream` 3.4.0 registry metadata](https://registry.npmjs.org/%40nats-io%2Fjetstream/3.4.0)
- [SQLite WAL](https://www.sqlite.org/wal.html)
- [Faktory repository](https://github.com/contribsys/faktory)

## Gaps and residual risks

- **HIGH:** NATS is recommended but not adopted; the first broker-Repository Change must prove durable terminal reconciliation and coordinator recovery before qq may depend on it.
- **HIGH:** external recipient effects cannot be atomically committed with queue completion. Stable message IDs and durable recipient-side idempotency remain mandatory under either candidate.
- **MEDIUM-HIGH:** NATS MaxDeliver advisories are not durable in the probed topology. A production NATS design needs durable advisory capture, idempotent terminal-before-`term` handling, or exhausted-message reconciliation; this is application-authored machinery.
- **MEDIUM:** an exploratory immediate NATS process kill after confirmed ACK preserved request bytes but not the durable consumer ACK floor. The passing probe waits one second before kill. Lost ACK state causes duplicate redelivery rather than message loss under the agreed at-least-once contract, but immediate consumer-state fsync is not proven.
- **MEDIUM:** both exact-version probes validate same-host process/container death and same-volume restart, not sudden host-power-loss, storage-controller, filesystem, cluster, or HA behavior. Redis's documented AOF-always contract is stronger evidence for fsync-before-reply than the NATS process-kill observation.
- **MEDIUM:** long-idle desktop behavior, native non-Docker lifecycle, and portability beyond this Linux/Docker host remain unmeasured.
- **MEDIUM:** Redis 8's tri-license and version policy require explicit production disposition only if BullMQ/Redis is selected.
- **MEDIUM:** exact production retention, request deadline, lease/retry intervals, recovery objective, broker model/cost, broker-core Repository name/hosting, and NATS lifecycle mechanism remain unsettled; the selected ownership boundary does not.
- **LOW:** aggregate intercom evidence undercounts inbound and failed sends, but the gap is not plausibly large enough to turn this into a high-throughput workload.

## Executable probe results

### BullMQ 5.81.2 with Redis 8.8.1

**HIGH — the corrected BullMQ/Redis probe passed all seven scenarios repeatedly with exact cleanup.** The probe first exposed a stale terminal `Job` snapshot and was corrected to reload terminal jobs. Review later found unbounded Worker readiness if Redis disappeared during setup. The correction gives every ioredis connection two short reconnect attempts with a 500 ms connect timeout and places a disconnect-and-join watchdog around readiness rather than abandoning the promise. While Redis was intentionally absent, a new Worker's underlying readiness attempt rejected in 209–216 ms under a 2.5-second bound without firing the watchdog.

Fresh full review then found that the direct `ioredis@5.8.2` coexisted with BullMQ's nested exact `ioredis@5.11.1`, making the reported stack identity misleading. The direct dependency is now exact `5.11.1`; the fresh lock/install assertion proves BullMQ 5.81.2 declares 5.11.1, the top-level client resolves 5.11.1, and no nested second copy exists. The final full reruns below use that one client version.

Fresh owner runs observed:

- an AOF-always accepted job and payload hash survived forced Redis container death and same-volume restart;
- an unavailable producer rejected in 2–5 ms under 1.5 seconds and left no job;
- killed leased work redelivered the same ID without producer republish;
- recipient-side idempotency reduced two processing attempts to one visible wake and one stable receipt;
- an absent recipient made exactly three attempts and ended in BullMQ `failed` with `RECIPIENT_UNAVAILABLE`, no completed event, and no result;
- project queues held independent same-ID jobs;
- four concurrent exact-key additions shared one retained job/execution/wake and four byte-identical results; and
- both normal completion and live SIGTERM removed the exact container, volume, child, listener, and temporary directory.

Measured locally after unifying the direct and BullMQ-internal client on ioredis 5.11.1: 37,645,543-byte Redis image; 10,209,246-byte complete probe dependency tree; Redis RSS of 8,160 and 22,188 KiB in the final two runs (earlier runs were about 22,000 KiB); one Redis process plus one Node process; 1,251 executable `.mjs` lines. The RSS variance makes memory a non-decisive local measurement.

### NATS Server 2.14.3 with NATS.js 3.4.0

**HIGH — the exact digest-pinned NATS JetStream probe passed the equivalent seven scenarios twice with exact cleanup.** The probe used two bounded file-backed `LimitsPolicy` streams and explicit-ACK durable pull consumers. It deliberately implemented terminal records, result records, exact-key fan-in, and waiter fanout in application code so those features were not credited to NATS.

Fresh owner runs observed:

- a non-duplicate PubAck request, exact sequence/body/hash, and settled consumer ACK floor survived forced NATS container death and same-volume restart without republish;
- a no-reconnect connection rejected in 1–8 ms while the server was absent and created no record;
- consumer death before ACK redelivered the same sequence/ID/body with `deliveryCount=2`, then confirmed-ACKed;
- recipient-side durable receipt handling reduced two deliveries to one receipt and one wake while exposing the receipt-before-external-wake gap;
- exactly three timeout deliveries produced a MaxDeliver advisory; custom code wrote one `RECIPIENT_UNAVAILABLE` terminal record and proved result/completion absent while declaring the advisory non-durable;
- separate project streams accepted independent same-ID records;
- four exact-key callers joined one application-owned in-flight map, one request/receipt/wake/result, and four byte-identical results; a fresh connection retrieved the retained result after the map was deleted; and
- malformed stream/consumer creation left no resource, while normal completion and live SIGTERM removed exact container, volume, children, both sockets, and temporary directory.

Measured locally: 6,867,594-byte exact NATS image; 18,007,610-byte server executable inside it; 1,341,227-byte complete probe dependency tree; about 18,400–19,304 KiB NATS RSS; one NATS process plus one Node process; 1,255 executable `.mjs` lines.

### Fresh Checks

From `/home/qqp/.herdr/worktrees/qq/agent-broker-message-plane`:

- `npm ci --prefix pilot/t172-message-plane-probe` — PASS, 0 audit findings;
- BullMQ/Redis full probe — PASS 7/7 plus exact cleanup twice after the final readiness correction;
- BullMQ/Redis targeted live SIGTERM — PASS, exit 143 and no exact resources left;
- `npm ci --prefix pilot/t172-nats-jetstream-probe` — PASS, 0 audit findings;
- NATS JetStream full probe — PASS 7/7 plus exact cleanup twice;
- NATS targeted live SIGTERM — PASS, exit 143 and no exact resources left;
- `git diff --check` — PASS;
- `bash tests/test-ratchet.sh` — PASS natively;
- Pi LSP diagnostics across all four `.mjs` files — 0 diagnostics.

## Selected production design boundary — not implementation authorization

The selected architecture uses NATS JetStream as the deterministic plane and places the broker core in a separate Repository. qq depends on a pinned broker-core release and retains only the Pi/Herdr methodology adapter. No Repository is created and no production dependency is added by this spike.

### Repository and system components

1. **Separate broker-core Repository.** It owns the exact NATS lifecycle wrapper, versioned protocol/schemas, JetStream topology, deterministic coordinator and epoch fencing, request/receipt/result/terminal state, durable advisory reconciliation, client SDK, generic broker runtime interface, diagnostics, migrations, and failure harness. It contains no qq Task mutation or operator-decision authority.
2. **qq adapter in every Pi session.** Loaded through qq's mounted extension surface, it resolves the qq project, registers Pi/session capabilities, exposes the agent-facing communication tool, consumes that session's durable inbox through the pinned broker SDK, injects broker-routed messages through Pi's documented queue, and renders compact inline/TUI state.
3. **One machine-local NATS JetStream plane.** The broker-core lifecycle wrapper starts or connects to one exact-version, loopback-only NATS server with file-backed JetStream, bounded storage/retention, health/config inspection, and fail-closed version/digest checks. JetStream owns durable storage, consumers, ACK/redelivery, MaxDeliver signaling, and finite publish deduplication; the broker core owns terminal and result conventions.
4. **One deterministic communication coordinator.** A machine-local singleton process, enforced by an OS process lock, owns NATS consumers, serializes one adjudication lane per project, and publishes a monotonically changing coordinator epoch. Durable state and epoch checks reject stale or overlapping broker-agent output; consumer delivery state is not misrepresented as a queue-wide leader lease.
5. **One logical broker agent per project home.** A dedicated visible Pi session in the project home holds the project communication picture. The coordinator invokes at most one broker turn at a time for that project and accepts actions only for its current epoch. The model receives bounded request batches plus deterministic registry/in-flight/cache evidence and returns constrained proposed actions.
6. **A deterministic broker engine around the model.** The model never writes NATS or addresses sessions directly. The coordinator validates constrained action output and epoch, enforces project/correlation/authority rules, publishes deliveries/results, and records why a request was answered, coalesced, routed, deferred, refused, or failed.
7. **qq-owned methodology and operator surface.** qq supplies project identity, Actor roles/authority, broker prompt/policy, the `communicate` tool and Skill, and compact inline/overlay presentation. The overlay shows broker health, pending requests, coalesced waiters, routes, recipient capability, and terminal failures. Operator direct messaging is explicit UI-only behavior and never an active agent bypass.

Pi's documented lifecycle supports this boundary: long-lived resources start only from `session_start`, clean up idempotently on `session_shutdown`, custom messages can be queued with `deliverAs`/`triggerTurn`, custom entries can preserve TUI-only state without adding model context, and overlays/renderers can retain the current visual quality. The extension must treat captured contexts as session-scoped and discard them across reload/new/resume/fork.

### Cheap sender envelope

The sender supplies intent, not routing. The extension enriches identity automatically.

```text
schemaVersion: 1
requestId: UUID                         # transport idempotency key
kind: question | update | response
source:
  projectKey: opaque stable key
  sessionId: Pi session UUID
  role: accountable | implementer | reviewer | researcher | observer | broker | unknown
  taskId?: T-N
  changeId?: opaque Change identifier
body: text                              # bounded; files/context travel by reference
blocking: boolean
deadlineAt?: timestamp
correlationId?: request UUID            # response/thread
causationId?: request UUID
externalProjectKey?: opaque key         # only for broker-to-broker requests
evidenceRefs?: bounded references
```

There is deliberately no agent-supplied recipient list and no required semantic deduplication key. Retransmission of the same `requestId` is deterministic idempotency; exact or semantic equivalence across different requests is a broker judgment. A `response` must carry a live correlation ID supplied by the broker. Oversized, malformed, expired, self-correlated, or project-mismatched envelopes are refused rather than rewritten.

The agent-facing tool is one narrow surface:

- `communicate({kind:"question"|"update", body, blocking?, deadlineAt?, evidenceRefs?})`
- `communicate({kind:"response", correlationId, body, evidenceRefs?})`
- `communicate({kind:"status", requestId})`

A blocking call may wait for a durable result while its turn is alive, but the request survives cancellation or session restart. If the wait ends first, the tool returns a request ID rather than declaring failure; the session inbox later injects the resolved result.

### Stable project identity

A current working directory is not a project identity because linked Change worktrees share one project home. The communication extension must resolve through `qq-herdr-home inspect` and an extended opaque `project_key` derived from Herdr's verified Repository/common-Git-directory binding. The engine returns the same key for the primary checkout and every registered linked worktree. It must not fall back to basename, remote URL, or guessed path. Missing, duplicate, or inconsistent project-home evidence makes broker communication unavailable and visible; it never silently creates a second namespace.

### JetStream topology

One NATS instance carries one bounded file-backed `LimitsPolicy` stream per project plus one broker-core advisory stream in the dedicated local account. An opaque `projectKey` is encoded into a validated subject token and stream name; it is never accepted from an agent.

```text
qq.comm.v1.<projectKey>.ingress
qq.comm.v1.<projectKey>.session.<sessionId>
qq.comm.v1.<projectKey>.record.request.<requestId>
qq.comm.v1.<projectKey>.record.receipt.<requestId>
qq.comm.v1.<projectKey>.record.result.<requestId>
qq.comm.v1.<projectKey>.record.terminal.<requestId>
qq.comm.v1.<projectKey>.coordinator.epoch
$JS.EVENT.ADVISORY.CONSUMER.MAX_DELIVERIES.>   # captured by broker-core advisory stream
```

- Every local and broker-to-broker request publishes to the destination project's `ingress` subject and receives a JetStream PubAck. `Nats-Msg-Id=requestId` is finite-window retransmission suppression; a retained request record is the longer-lived idempotency ledger.
- One explicit-ACK durable pull consumer per project filters `ingress`; the singleton coordinator serializes its project lane. Epoch records fence stale broker-agent output.
- Each live session owns one durable consumer filtered to its own `session.<sessionId>` inbox subject. ACK means the adapter claimed that inbox record, not that the recipient answered.
- Request, receipt, result, and terminal subjects retain bounded immutable records. Conditional publish prevents duplicate receipt/result/terminal creation. Exact-key in-flight waiters are application state reconstructed from unresolved retained records after coordinator restart.
- The broker-core advisory stream durably captures MaxDeliver advisories. A durable reconciler materializes an idempotent terminal record before acknowledging an advisory. Startup also scans unresolved request records so advisory loss or a crash between terminal publish and advisory ACK cannot create false success or silent abandonment.
- Presence/capability is separate expiring state, not a durable-message success state.
- Cross-project traffic is published by the origin broker to the destination project's ingress with origin project and correlation metadata. Sessions never address another project's sessions directly.

Stream/subject separation is namespace isolation for one trusted local operator, not hostile multi-tenant security. The first implementation must prove that the dedicated advisory subject can be captured durably with the selected NATS version; otherwise it stops and revises terminal reconciliation before qq integration.

### Capability and lifecycle model

The session extension declares facts; the deterministic engine computes transport state; the intelligent broker infers answerability.

Declared capability fields include session mode, UI availability, whether an idle turn can be triggered, whether busy work can queue a follow-up, whether the session is non-interactive and expected to exit, role, Task/Change association, and shutdown generation. Heartbeat expiry marks the registration stale.

Capability snapshot:

```text
transport: unknown | disconnected | connected
receive: unknown | idle-triggerable | busy-queueable | nonreceivable | shutting-down
answer: unknown | eligible | ineligible             # broker inference, never transport fact
```

Request lifecycle:

```text
submitted -> durably-accepted -> adjudicating
  -> resolved-by-broker -> resolved
  -> coalesced(parentRequestId) -> resolved-with-parent
  -> routed -> recipient-queued -> recipient-accepted -> answered -> resolved
  -> deferred
  -> refused
  -> failed
```

`recipient-accepted` means that the recipient extension durably claimed the inbox job. It is not `answered`. Only a correlated response produces `answered`; only delivery of that result to every waiting caller produces `resolved`. Disconnect, lease expiry, or answer timeout returns routed work to adjudication or terminal failure according to bounded policy.

### Intelligent adjudication

Every request enters the broker service. The service may resolve an exact retransmission or join an already-settled exact key without a model call, but there is no sender-to-peer bypass. For all other requests the broker agent sees:

- the normalized intent;
- source role/Task/Change;
- current capability registry;
- active and recently settled related requests;
- bounded read-only project evidence and cache entries with provenance; and
- prior routing/attempt history.

It returns one constrained action: `answer`, `coalesce`, `route-one`, `route-smallest-set`, `defer`, `refuse`, or `needs-accountable-owner`. The engine refuses missing evidence, nonexistent recipients, unauthorized cross-project scope, or an action that would let the broker settle a consequential decision. A batch of related ingress jobs may share one model turn; each request retains its own durable state and waiter list.

The four-session ownership degeneration is handled as follows: all four requests reach project ingress; deterministic and semantic correlation attach them to one parent topic; the broker answers from the project registry if authoritative, otherwise it routes one correlated question to the best eligible owner; one answer resolves all four caller records. No discovery broadcast exists in the tool or protocol.

### Authority boundary

The broker is a non-owning Actor. It may retrieve and summarize read-only evidence, identify an already-recorded owner or status, and choose communication recipients. It may not:

- approve scope, product behavior, architecture, acceptance, merge, or another consequential decision;
- mutate Repository, Task, Change, settings, or external systems;
- impersonate the operator or accountable owner;
- broaden a request across projects without explicit project scope; or
- turn transport acceptance into a claim of human/agent understanding.

Requests needing judgment become `needs-accountable-owner` and route once to the accountable session. If none is answerable, they remain visibly deferred; one deduplicated operator notification may be raised after a settled threshold, never one notification per waiter.

The broker session receives only read-only project/query tools plus its constrained decision tool. It has no generic write/edit tool and no raw transport credentials outside the deterministic engine.

### First production Changes — not authorized by this spike

The first implementation Change belongs in the new broker-core Repository and delivers one transport-only vertical slice:

1. exact NATS Server 2.14.3 / NATS.js 3.4.0 pins with digest/version/license checks and one loopback-only file-backed lifecycle wrapper;
2. versioned envelope and immutable request/receipt/result/terminal schemas plus project/subject token validation;
3. one OS-lock-singleton coordinator with durable epochs, serialized project lanes, stale-output refusal, and restart reconstruction;
4. bounded project streams, ingress/session consumers, finite retry/dedup/retention, and inspection APIs;
5. durable MaxDeliver advisory capture plus idempotent terminal reconciliation, including crash between terminal publish and advisory ACK;
6. retained result lookup and exact-key waiter recovery after coordinator process death;
7. tests for process restart, consumer death, duplicate effects, unavailable recipients, project isolation, four-to-one fan-in, overlapping-coordinator refusal, malformed state, signal cleanup, and complete teardown;
8. a narrow SDK and generic broker-runtime interface, with no Pi, Herdr, qq Task, model vendor, or UI dependency.

Only after that core Change is released and green does a separate qq integration Change pin it and deliver:

1. `qq-herdr-home inspect` opaque `project_key` shared by the primary checkout and linked worktrees;
2. one dedicated project-home broker session with read-only evidence access and constrained adjudication output;
3. an opt-in `communicate` tool with no `to` field, project/session capability registration, and durable inbox injection;
4. compact inline rendering and an operator overlay; raw intercom is disabled only inside the opt-in pilot, and operator direct messaging remains explicit/manual;
5. four-live-session UAT plus broker/core crash, reload, nonreceivable-session, and rollback checks.

Neither Change removes pi-intercom globally, enables the broker by default, implements cross-project traffic in its first slice, selects a permanent broker model/service class, adds semantic post-completion caching, or claims hostile tenant isolation. Later cross-project support must extend the same durable protocol rather than replace it.

Before the broker-core implementation aligns, the operator must settle the new Repository's name/hosting and the NATS lifecycle mechanism (for example, broker-managed child versus user service); responsibility remains unambiguously in broker-core. Before qq integration aligns, the operator must settle the broker model/cost budget. Redis licensing/version policy is closed because Redis is not selected.

Design sources verified completely before this specification:

- Pi runtime `bundle/README.md`;
- Pi `docs/extensions.md`, including lifecycle, custom tools, message queues, state, rendering, and mode behavior;
- Pi `docs/tui.md`, including overlays, components, focus, invalidation, and rendering constraints;
- Pi `docs/packages.md`, including runtime dependency and package scope rules;
- Pi examples `file-trigger.ts`, `message-renderer.ts`, `entry-renderer.ts`, `event-bus.ts`, `status-line.ts`, and `overlay-test.ts`;
- qq `extensions/index.ts`, `bin/qq-herdr-home`, current agent-messaging Skill, and the installed pi-intercom source.
