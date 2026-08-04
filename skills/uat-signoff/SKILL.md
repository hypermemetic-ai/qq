---
name: uat-signoff
description: Guides operator-owned or requested acceptance after autonomous proof.
---

# Human acceptance

Agents first perform available live compatibility and observable-behavior proof.
UAT is never mandatory; reserve it for genuinely operator-owned judgment,
access, experience, or explicit request. Count setup, navigation, waiting, and
staging machinery honestly as operator effort. Prepare without changing focus;
say where to navigate.

1. Derive the smallest useful user-observable outcomes from the request, diff,
   and verification.
2. Present one check at a time. State expected behavior, then ask the owner
   to try it and report what happens.
3. Wait for an explicit observation. Record a mismatch in the owner's words;
   record an unperformed check as skipped.
4. When a check exposes a gap, withhold the acceptance claim. After a fix, repeat
   the affected check.
5. Close with a short result: accepted, skipped, or the observed gaps. Acceptance
   requires the owner's explicit confirmation.

Treat authorization for destructive, irreversible, monetary, or outbound actions
as a separate decision. Obtain it explicitly at the moment of action.
