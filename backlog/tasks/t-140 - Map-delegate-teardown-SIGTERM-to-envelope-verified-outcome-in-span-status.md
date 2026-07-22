---
id: T-140
title: Map delegate teardown SIGTERM to envelope-verified outcome in span status
status: To Do
assignee: []
created_date: '2026-07-22 00:15'
labels: []
dependencies: []
ordinal: 61000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-79 follow-on (SELECT #1). 17 of 21 baseline spans end exit=143 (teardown SIGTERM) and map to status=error although their runs delivered complete envelopes; the error rate is useless as a health signal until span status records the run outcome (status.json/envelope) rather than the exit code. Decision ledger: doc-79 ranking, owner analysis 2026-07-22.
<!-- SECTION:DESCRIPTION:END -->
