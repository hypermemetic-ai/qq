# QQ

QQ is being rebuilt from a clean history.

## Rule

Bring back one explicitly chosen piece at a time. Prefer deletion and simplification. If preserving a legacy behavior would require a costly repair, compatibility layer, or migration, leave that behavior behind instead.

The legacy system is quarantined locally and archived remotely; it is not this repository's starting point.

## Backlog

The tracked `backlog` link mounts QQ's single native Backlog.md collection from
the shared versioned store. Use the repository-pinned CLI with `npx backlog`.

## Agent messaging

QQ includes a durable, machine-local Event Plane and an initial cross-project
Pi messaging extension. See [`docs/agent-messages.md`](docs/agent-messages.md).
