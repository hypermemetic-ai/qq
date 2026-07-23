---
id: doc-1
title: Ideas
type: other
created_date: '2026-07-10 20:56'
updated_date: '2026-07-23 00:39'
tags:
  - ideas
---
# Ideas

## 2026-07-16 13:57

new idea, probably a skill. The idea here is that sometimes work needs operator input. This might mean going to websites or answering questions, copy-pasting some value from somewhere, updating a configuration. All of these should be made as easy as possible for the operator, even if it means doing a lot of work in the background to make that input step cheap.

## 2026-07-22 19:38

pi-lens ergonomics: "listing the files modified in a session could be interesting for an extension" — a compact operator-facing status surface. "but if pi-lens is only doing it to inform ME that there's warnings or errors that doesn't help. telling the agent, yes, sure." Diagnostics should route to the agent who can act on them; the operator surface should carry status, not warning spam. (Observed this session: 29 MD013 line-length warnings on .pi/plans scratch files never reached the agent's context; the operator saw them first.) Config bit: pi-lens injects a turn-end advisory into agent context when warnings are present (pi-lens docs/features.md) — verify it is on for this setup and turn it on if not.
