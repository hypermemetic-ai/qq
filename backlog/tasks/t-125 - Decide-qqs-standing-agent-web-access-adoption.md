---
id: T-125
title: Decide qq's standing agent web-access adoption
status: To Do
assignee: []
created_date: '2026-07-21 01:38'
updated_date: '2026-07-21 02:05'
labels: []
dependencies: []
documentation:
  - doc-70
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator request (2026-07-21 alignment exchange): a proper research round, codex-handled, to determine the most natural web-access adoption for qq agents. Triggered by the T-121 latency-toolkit research needing live web access. Candidates: pi-web-access (installed 2026-07-21), @juicesharp/rpiv-web-tools (family-consistent with pinned rpiv@1.20.0 set), pi-web-search (discovered alternative), other pi.dev web packages, or curl-only (no package). Constraints: both named packages register web_search (collision); delegate egress is open (decision-8). Evaluation lens (operator-settled 2026-07-21, two rulings): (1) deliberately-small applies to qq's OWN surfaces, not adopted extensions — judge on architecture quality; feature breadth is no demerit when well-architected. (2) zero-new-secret is NOT a value — operator will happily hold provider keys; the deciding axes are search quality and speed ('good search, fast and useful'). Evidence: doc-70 (architecture audit, owner-verified). Remaining evidence gap doc-70 named: no apples-to-apples quality/latency comparison exists — a trial corpus run supplies it. Decision ledger: research round + codex execution = operator direction 2026-07-21; well-architected-over-small lens = same exchange; zero-new-secret dropped, quality+speed lens, keys acceptable = same exchange.
<!-- SECTION:DESCRIPTION:END -->
