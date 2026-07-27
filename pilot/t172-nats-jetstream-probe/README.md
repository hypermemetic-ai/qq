# T-172 NATS JetStream deterministic-plane probe

This is spike-only executable evidence for NATS Server 2.14.3 and the NATS.js
3.4.0 JetStream client. It does not install, select, or integrate a production
broker or transport.

## Prerequisites and command

- Node.js 22 and npm
- a working Docker CLI/daemon
- permission to pull the official pinned image
  `nats:2.14.3@sha256:67ac7866d010e8d83302dd30332eeae1a2b7a8ee051155e2eb5a5485b720cd4b`

Install only the two exact direct Apache-2.0 dependencies and run the probe from
the Repository root:

```sh
npm ci --prefix pilot/t172-nats-jetstream-probe
node pilot/t172-nats-jetstream-probe/probe.mjs
```

The dependencies are `@nats-io/transport-node@3.4.0` and
`@nats-io/jetstream@3.4.0`. The lockfile captures their complete transitive
install. The probe asserts that Docker resolves the researched official image
digest, emits one JSON object for each of seven scenarios plus a final JSON
summary, and exits nonzero on any assertion or cleanup failure.

## Scenario contract

1. A non-duplicate PubAck, exact stored request bytes/hash/sequence, and durable
   consumer ACK floor survive forced removal and same-volume server restart
   without producer republish. The probe waits an explicit one second after the
   confirmed ACK before the kill; this is reported as a consumer-state
   persistence settling interval. A no-reconnect connection rejects while the
   server is absent within 1.5 seconds and leaves no accepted subject record.
2. A child receives delivery one and is SIGKILLed before ACK. A second binding
   receives the same sequence, `Nats-Msg-Id`, and bytes with
   `redelivered=true` and `deliveryCount===2`, then confirmed-ACKs it. The
   producer published once.
3. Delivery one conditionally creates one file-backed receipt and then one wake
   record before the child is killed. Redelivery reads the byte-identical
   receipt, creates no second wake, and confirmed-ACKs. The receipt-before-wake
   crash gap is reported rather than called atomic.
4. Three timeout-driven deliveries reach counts 1/2/3. A fourth pull observes
   MaxDeliver exhaustion and the online advisory. Custom code writes one
   file-backed `RECIPIENT_UNAVAILABLE` terminal record with request ID,
   sequence, and `attempts=3`; result and completion subjects stay absent.
5. Byte-identical messages with the same `Nats-Msg-Id` receive independent,
   non-duplicate PubAcks from separate project streams and are fetched/ACKed
   independently. This is trusted namespace isolation, not hostile tenancy.
6. Four concurrent exact-key callers synchronously join one application-owned
   in-flight Map before the owner's first await. They produce one adjudication,
   request, receipt, wake, and retained result, then receive four byte-identical
   result bodies/hashes. A fresh connection retrieves the retained result after
   the Map is removed.
7. The probe records image and server-binary bytes, complete installed dependency
   bytes/files, Node/server process counts, Docker PIDs/threads, RSS/CPU,
   loopback bindings, effective stream/consumer configuration, and relevant
   `/varz`, `/jsz`, and `/healthz` facts. It also proves malformed stream and
   consumer creation leaves no resource and proves exact cleanup.

The topology is two bounded, file-backed, one-replica `LimitsPolicy` streams,
one per trusted project. Each captures that project's request, receipt, wake,
result, and terminal subjects. Each project has one explicit-ACK durable pull
consumer filtered to request subjects with `max_deliver:3`,
`max_ack_pending:1`, and probe-only BackOff values of 250/500/1000 ms. Streams
are bounded to 10,000 messages, 16 MiB, 100 records per subject, one hour, and a
five-minute duplicate window. NATS is bounded to 64 MiB memory storage, 64 MiB
file storage, and a 64 KiB payload; this run uses file streams only. The
configured store root is `/data/jetstream`, reported effectively by `/jsz` as
`/data/jetstream/jetstream`.

## Native versus application-authored boundary

NATS-native evidence is the file stream and PubAck, durable consumer, explicit
and confirmed ACK, timeout redelivery, MaxDeliver advisory, finite
stream-scoped duplicate window, and retained arbitrary bytes.

Application-authored evidence is the envelope IDs/hashes, receipt and wake
schema/ordering, online advisory-to-terminal materializer, result schema,
correlation and lookup, exact-key in-process Map, waiter fanout, and
fresh-connection result retry. `Nats-Msg-Id` is not native fan-in, permanent
semantic idempotency, or a retained job-result facility. The advisory
subscription is not durable; a production design would need durable capture or
reconciliation of exhausted consumer state.

## Finite lifecycle and exact cleanup

Every Docker command, connection, JetStream management request, publish, pull,
confirmed ACK, HTTP request, child wait, and observation has a finite bound.
Ordinary connections use eight finite reconnect attempts at 250 ms; unavailable
connections disable reconnect. Pulls expire and publishes disable retries. A
drain watchdog closes the underlying connection and joins its settlement rather
than abandoning a live promise.

Each run creates cryptographically suffixed exact container, volume, stream,
consumer, subject, and temporary-directory names. Docker publishes client and
monitoring ports only on `127.0.0.1` and the probe inspects both bindings.
SIGINT/SIGTERM records cancellation and lets the current internally bounded
operation settle before cleanup. Cleanup closes tracked connections, SIGKILLs
only tracked child processes, inspects/removes only the exact generated Docker
objects, and removes only the exact temporary directory. It never prunes,
glob-deletes, or removes name-matched resources. The final scenario verifies
container, volume, children, both listening sockets, and temporary directory
are absent. SIGTERM exits 143; SIGINT exits 130.

## Interpretation limits and footprint gauge

This demonstrates at-least-once processing plus recipient idempotency, not
exactly once. One file-backed replica surviving a process/container kill is not
host-power-loss, filesystem, storage-controller, cluster, or HA proof. A
conditional receipt cannot atomically cover an external wake. The duplicate
window is finite. Subject/stream namespaces are not a hostile security boundary.
An online advisory materializer can miss exhaustion and therefore leaves a
counted reconciliation gap. An exploratory immediate post-ACK kill recovered
the request bytes but not the ACK floor; the passing scenario's explicit
one-second consumer-state settling interval does not prove that confirmed ACK
state is synchronously disk-durable.

Scenario 7 reports local measurements, not general platform claims or a
transport recommendation. In one fresh local run the NATS probe measured one
Node process plus one NATS process, one daemon, a 6,867,594-byte local image, an
18,007,610-byte server executable, and 1,341,227 bytes in complete
`node_modules`. Its comparison gauge uses wc-like newline counts over each
probe's two executable `.mjs` files and direct dependency keys: NATS measured
1,255 executable physical lines and two direct dependencies; the current
BullMQ probe measured 1,251 and two. Both current probes measure two steady
processes and one daemon. These are facts from the local probe surfaces, not a
candidate judgment.

The simple lexical decision gauge counts line-leading `// PROBE_DECISION:`
comments in `probe.mjs`; the expected count is five. Production LOC and
production decision deltas are both zero.
