---
name: uat-signoff
description: Walks the owner through brief hands-on acceptance checks after a verified user-facing change. Use when user-facing behavior or UI changes, acceptance is subjective or externally observable, or the owner asks for review or sign-off.
---

# Human acceptance

Autonomous verification establishes that the implementation behaves as claimed.
Human acceptance establishes that the result matches what the owner wants in
actual use.

After verification, offer the owner a hands-on check for user-facing changes.
Keep it proportional: a small change may need one check; a larger flow may need
several. Internal-only work ends with autonomous verification.

1. Derive the smallest useful set of user-observable outcomes from the request,
   diff, and verification evidence.
2. Present one check at a time. State the expected behavior, then ask the owner
   to try it and report what happens.
3. Wait for an explicit observation. Record a mismatch in the owner's words;
   record an unperformed check as skipped.
4. When a check exposes a gap, withhold the acceptance claim. After a fix, repeat
   the affected check.
5. Close with a short result: accepted, skipped, or the observed gaps. Acceptance
   requires the owner's explicit confirmation.

Treat authorization for destructive, irreversible, monetary, or outbound actions
as a separate decision. Obtain it explicitly at the moment of action.
