---
id: decision-25
title: Architect and disposition ceremony deleted in favor of durable batch state
date: '2026-07-28 15:03'
status: proposed
---
The architect and disposition pipeline keeps only its trust core: immutable settled batches, one handoff per batch, verified intake results, and resolution receipts. Ceremony is deleted: exact-phrase confirmation and retry rituals, in-memory-only context (confirmation re-reads the durable batch), stale-evidence refusals, generic validation rejections (remaining refusals name the failed invariant and corrective action), and the hand-cranked attempt-receipt path (record-handoff-attempt is gone; intake records only verified results). Settled by the operator's bundle directive in the 2026-07-28 architect session; first encoded in T-184.
