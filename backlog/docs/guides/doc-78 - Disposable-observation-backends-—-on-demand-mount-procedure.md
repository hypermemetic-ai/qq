---
id: doc-78
title: Disposable observation backends — on-demand mount procedure
type: guide
created_date: '2026-07-21 23:05'
---
# Disposable observation backends — on-demand mount procedure

**Owning Task:** T-127 (AC#4). **Rule:** nothing standing. A backend is
mounted for one analysis sprint, then torn down; qq runs no always-on
observability infrastructure. The append-only span store under
`$XDG_STATE_HOME/qq/spans/<repo>/` is the only persistent state and never
depends on a backend.

## When

Mount only when `qq-observe summarize` over a baseline window (T-127 AC#5)
shows latencies worth a waterfall — cross-session trace shape, delegate
parenting gaps, or span-level detail a table cannot show.

## Candidates (doc-71 verdicts, HIGH authority)

- **Jaeger all-in-one** — the lighter, license-clean (Apache-2.0) default.
  Dumb-but-honest trace store with a latency waterfall:
  `docker run --rm -p 16686:16686 -p 4317:4317 cr.jaegertracing.io/jaegertracing/jaeger:2.13.0`
  (UI on 16686, OTLP ingest on 4317; in-memory storage — container stop is
  the teardown and loses nothing qq needs).
- **Arize Phoenix** — heavier, stronger analysis (span attribute search,
  OpenInference `session.id` grouping), ELv2. Mount it in a throwaway venv —
  bare `pip install` is both non-disposable and refused on PEP 668 hosts:
  `python3 -m venv /tmp/phoenix-sprint && /tmp/phoenix-sprint/bin/pip install arize-phoenix && PHOENIX_WORKING_DIR=/tmp/phoenix-sprint/data /tmp/phoenix-sprint/bin/phoenix serve`.
  The venv is the disposability unit: PHOENIX_WORKING_DIR keeps Phoenix's
  SQLite trace store inside it (default $HOME/.phoenix would survive
  teardown), so deleting the venv removes every trace. Choose Phoenix when the sprint needs session-grouped queries across
  many Changes.

Adopt neither as a platform (doc-71): they are sprint tools.

## Data path

The store is local JSONL (schema_version 1, OTel-shaped: trace_id,
parent_span_id, name, phase, actor, start/end, duration_ms). Both backends
ingest OTLP, so a sprint mounts the backend AND a throwaway
store→OTLP replay (a few dozen lines, written in the sprint, deleted with
it — or promoted only if a later Task approves it as permanent). Span names
already follow OTel GenAI `invoke_workflow`/`invoke_agent`/`execute_tool`
vocabulary so the replay is a mechanical mapping, not a redesign.

## Teardown checklist

1. Stop the container/process (Jaeger's `--rm` self-cleans).
2. Delete the Phoenix sprint venv (`rm -rf /tmp/phoenix-sprint`) and any
   sprint-local replay script or exported data.
3. Record the sprint's findings as a research doc attached to the owning
   Task; the span store itself is never exported off the machine.
