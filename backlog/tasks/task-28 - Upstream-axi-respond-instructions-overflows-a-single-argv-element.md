---
id: TASK-28
title: 'Upstream: axi respond --instructions overflows a single argv element'
status: To Do
assignee: []
created_date: '2026-07-09 14:41'
labels:
  - gate
  - parallel-ok
  - hitl
dependencies: []
priority: medium
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reported from the meeting-reviewer session, 2026-07-09: 'no-mistakes axi respond --action fix --instructions <~4.5KB>' died with 'step review failed: agent fix: claude start: fork/exec /home/qqp/.local/bin/claude: argument list too long', killing run 01KX2H1KSW8PSNQZ3G5FP6GGC7 outright and forcing hand-applied fixes plus a fresh run. CORRECTED CAUSE: 4.5KB is not the limit and cannot itself be E2BIG. Reproduced: the whole-argv ARG_MAX is stack_rlimit/4 and therefore VARIES by environment (4194304 under a 16MiB stack, 2097152 under an 8MiB one) -- do not treat it as a constant. The cap that actually throws is per-argument and fixed: MAX_ARG_STRLEN = 131072 bytes (32 * 4096-byte page size); execing /bin/true with a 131071-byte argv element succeeds and 131072 fails. So no-mistakes must be composing --instructions INTO a single prompt argument alongside the diff and findings, and that composite crossed about 128 KiB. A fix framed as 'cap the instructions length' would treat the symptom; the bug is unbounded composition into one argv element. Upstream fix: pass the composed prompt on stdin or via a temp file. qq-side exposure: the methodology and finishing skill tell landing agents to answer ask-user fixes with --instructions "<owner guidance>", and this repo does not provide a file or stdin escape hatch for that argument.
<!-- SECTION:DESCRIPTION:END -->
