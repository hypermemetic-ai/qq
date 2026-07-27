# T-172 BullMQ/Redis deterministic-plane probe

This is a spike-only, self-cleaning probe of BullMQ 5.81.2 against the exact
`redis:8.8.1-alpine` image. It does not install or integrate a production
message plane.

## Prerequisites

- Node.js 22 and npm
- a working Docker CLI and daemon
- permission to pull `redis:8.8.1-alpine` if the exact image is not local
- probe-local dependencies installed with:

```sh
npm ci --prefix pilot/t172-message-plane-probe
```

From the Repository root, the exact probe command is:

```sh
node pilot/t172-message-plane-probe/probe.mjs
```

The command runs all seven scenarios, prints one JSON object per scenario and a
final JSON summary, and exits nonzero if any assertion or cleanup check fails.
Docker commands plus BullMQ readiness, state, event, child-IPC, and unavailable-
producer waits have finite bounds. Redis reconnects stop after two short attempts;
a readiness watchdog disconnects and joins the underlying promise rather than
abandoning it. Cleanup begins only after the current bounded operation settles.

## Scenario contract

1. An accepted stable job and payload hash survive a forced Redis process kill
   and same-volume restart under asserted AOF-always/no-eviction settings; while
   Redis is absent, a producer rejects within 1.5 seconds and a new Worker's
   underlying readiness attempt rejects within 2.5 seconds without its watchdog.
2. SIGKILL after a worker lease causes stalled-lock recovery to execute the
   same job in a second worker and complete it once, without republishing.
3. SIGKILL after recipient delivery causes duplicate processing while a Redis
   receipt ledger preserves one visible wake and a stable receipt.
4. Three fixed-backoff `RECIPIENT_UNAVAILABLE` attempts end in BullMQ's failed
   set with the exact attempt count and reason, no completed event, and no
   return value.
5. The same custom job ID remains independent in project-A and project-B queue
   namespaces. This is namespace isolation, not a hostile security boundary.
6. Four concurrent additions with one BullMQ Simple deduplication ID query the
   documented retained job, then independently query four byte-identical
   durable results after one execution and one mock recipient wake.
7. The probe reports local image/dependency/process/configuration footprint and
   verifies exact-resource cleanup.

The lock, stalled, retry, and backoff intervals are deliberately short probe
settings, not production defaults. Fan-in proves exact-key concurrent in-flight
collapse only; semantic equivalence and post-completion caching remain future
intelligent-broker work. Duplicate safety demonstrates at-least-once delivery
plus recipient idempotency, **not exactly once**. The disconnected-recipient
scenario observes only message-plane acceptance, attempts, and terminal state;
it does not claim future delivery, answer, or resolution domain state. Those
distinctions remain in the production design.

## Cleanup guarantee and interpretation boundary

Each run creates a cryptographically suffixed run ID, one same-ID Docker
container and volume, one Docker-allocated loopback-only TCP binding, and one
OS temporary directory. Queue prefixes include the run ID and scenario. A
`finally` path closes clients, SIGKILLs only tracked child workers, removes only
those exact Docker objects, and removes the exact temporary directory.
SIGINT/SIGTERM request this cleanup after the current bounded operation settles.
The final scenario asserts the container, volume, child
workers, listener, and temporary directory are gone. The probe never prunes
Docker or removes name-matched unrelated resources.

The output records the resolved local image ID/digest and labels footprint
measurements as local and non-generalizable. A Docker process-kill/restart does
not prove host power-loss behavior, and Redis recipient effects cannot be
atomically committed with BullMQ completion; stable recipient-side idempotency
remains required.
