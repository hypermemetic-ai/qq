---
type: API reference
title: Event Plane Protocol and Clients
description: Public Event Plane operations, bounded Unix-socket framing, strict JSON contract, client exports, guards, and local trust model.
tags: [event-plane, api, clients, security]
---

# Event Plane Protocol and Clients

The public protocol is `qq-event-plane/v1`, carried over a Unix stream socket. The service dispatch table in `EventPlane.dispatch` is canonical. Python consumers import `EventPlaneClient` from `bin/lib/event_plane_client.py`; Node consumers import `EventPlaneClient`, `EventPlaneError`, and `canonicalEventPlaneJson` from `bin/lib/event-plane-client.ts`. `bin/event-plane-admin` exposes the Python methods as a strict JSON CLI.

## Transport and JSON contract

Each connection carries exactly one request and one response: four-byte unsigned big-endian length followed by UTF-8 JSON, maximum 128 KiB. The client half-closes its write side; `RequestHandler` waits for EOF before dispatch so trailing bytes or duplicate frames cannot mutate state. Missing/short headers or bodies, lengths outside the bound, malformed JSON, and trailing or duplicate frames are refused without dispatch. Responses are `{protocol, ok, result}` or `{protocol, ok, error:{code,message}}` and must contain no trailing frame bytes.

Bodies use finite, acyclic JSON with integers only in JavaScript's shared safe range, Unicode scalar strings, unique fields, and no object key that is a JavaScript array index (`0` through `4294967294`). Client-side object traversal rejects cycles; wire decoding rejects duplicate fields. Canonical serialization sorts keys by Unicode scalar order. This cross-language identity underpins request idempotency.

## Operations

| Operation | Purpose and critical fields |
|---|---|
| `send` | Address one `recipient_id`; common envelope includes `producer_id`, `request_id`, `origin_id`, `product_id`, `kind`, `schema_version`, `payload`; optional bounded `deadline_at`. |
| `publish` | Fan out by `product_id` and `kind` to active subscriptions; same envelope without recipient/deadline. |
| `ensure_subscription` | Create/reconstruct with `subscription_id`, `product_id`, `kind`, positive `generation`, `reconstruct_from`; renew unchanged active generation without reconstruction. |
| `next` | Claim/redeliver oldest due obligation using `consumer_type`, `consumer_id`, generation (`0` for recipient), `endpoint_token`, optional `wait_ms` up to 30000. Client `wait` is an alias that requires explicit `wait_ms`. |
| `acknowledge` | Finish an `in_flight` delivery and advance subscription high-water. Requires the complete delivery guard. |
| `retry` | Record `reason`, back off, and block after eight failures; valid for `in_flight` or currently redelivered `blocked` work. |
| `block` | Preserve unresolved custody and reason for a poison delivery. |
| `disposition` | Operator-resolve one open obligation with complete guard, `expected_status`, `authorized_by`, `authorization:"operator"`, and reason; writes audit row. |
| `status` | Select by `event_id` or `(producer_id, request_id)`; optional terminal wait. |
| `inspect` | Views: `health`, `integrity`, paged `journal`, filtered `obligations`, `subscriptions`, or `dispositions`; list limits are 1–20. |
| `backup` | Create a new validated SQLite snapshot at an absolute destination outside state. |
| `shutdown` | Stop the exact inspected service instance with `expected_instance_id` and `authorization:"operator"`. |

All mutating delivery transitions must copy `obligation_id`, `event_id`, consumer identity/generation, `attempt_token`, `endpoint_token`, `expected_high_water`, and `expected_gap_token` from the delivery. Do not synthesize or partially reuse guards.

## CLI pattern

```bash
bin/event-plane-admin inspect '{"view":"health"}'
bin/event-plane-admin status '{"event_id":"evt_...","wait_ms":0}'
bin/event-plane-admin backup '{"path":"/absolute/private/new-snapshot.sqlite3"}'
```

The body may instead be `@file` or `-` for stdin. Output is compact JSON and refusal exits 2. `--state-dir` must identify an existing account-owned mode-0700 directory through a safe ancestor chain. Use [Operations](../operations/runbook.md) before administrative calls.

## Trust and authorization boundary

The socket is machine-local but not credential-authenticated. Actual access control is the account-owned private state path and mode-0600 socket; any process running as that account and able to connect can invoke every dispatch operation. There are no per-client identities or cryptographic credentials.

`authorization: "operator"` in `disposition` and `shutdown` is an explicit-intent assertion, **not authentication**. Delivery guards stop stale or misdirected disposition; `expected_instance_id` stops shutting down a replaced instance. Neither proves who sent the request. `backup` similarly relies on filesystem fencing: destination ancestors must be safe, the immediate parent account-owned mode `0700`, the name new and outside Event Plane state, and retained inode checks must survive races before file and parent `fsync`. On failure, cleanup removes only the exact destination inode created by that operation and only while the name still points to it; a replacement is never unlinked, and failed backup attempts leave the installed journal unchanged.

Therefore protect the Unix account, never broaden state/socket permissions, inspect before destructive intent, and do not expose this socket through a proxy. Tests `state_ancestor_fence`, `online_backup_contract`, and `exact_v2_and_fixed_process_contract` define this boundary.

## Extension and validation

A new operation requires coordinated changes to `EventPlane.dispatch`, service implementation/validation, Python `OPERATIONS` and method, TypeScript `OPERATIONS` and method, admin CLI choices, and parity tests. Keep method naming convention in mind: Python uses `ensure_subscription`; TypeScript uses `ensureSubscription`.

Run `tests/test-event-plane.sh`. `framing_exactness` proves exact-one-frame behavior, `ts_equivalence`, `shared_integer_json_state_space`, and `bounded_decimal_key_classification` prove client parity, while `removed_operations_absence` ensures unsupported restore/rollback surfaces stay absent.
