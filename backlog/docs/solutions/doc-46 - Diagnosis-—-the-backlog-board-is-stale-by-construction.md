---
id: doc-46
title: Diagnosis — the backlog board is stale by construction
type: other
created_date: '2026-07-16 17:08'
updated_date: '2026-07-17 01:33'
---
# Diagnosis — "backlog board is always stale"

Owning Task: T-59. Diagnostician: fresh read-only claude delegate,
2026-07-16. All observations read-only.

## Surface identification

No web board exists (port 6420 refused; no listener). The surface is the
terminal TUI `backlog board`: two long-lived instances were running — PID
1772105 since Jul 15 23:41 cwd /home/qqp/projects/deciq, and PID 3788469
since Jul 16 11:34 cwd /home/qqp/projects/qq. The complaint (Jul 15 23:43)
came two minutes after the deciq board started.

## Causes

1. **CONFIRMED — structural, the "always": no checkout a board can read ever
   contains the present.** A board reads its own checkout's backlog/ files
   plus a load-time git cross-branch scan. Demonstrated in three layers:
   (a) newly minted Tasks exist only as untracked files in the primary
   checkout — untracked files are invisible to git-based cross-branch
   discovery; (b) in-flight status truth rides exactly one working tree
   (Task files move into Change worktrees and are invisible elsewhere);
   (c) merge-to-pull lag — deciq went ~10.8 h between pulls (23:30 → 10:18);
   T-14's sync covers only merges with a live session. With many
   worktrees perpetually in flight, every board glance shows the last
   merged-and-pulled past.
2. **CONFIRMED (instance):** the only board running at complaint time was
   another project's (deciq), still alive 12+ h later; the cross-branch scan
   runs at board load only, so a long-lived board's cross-branch view is
   frozen at start (plausible→likely; no periodic git children observed).
3. **REFUTED (version):** the historical "TUI renders a preloaded snapshot"
   bug (backlog.md back-274) is fixed in the installed v1.48.0; both
   processes hold live inotify watches on backlog/tasks. Only the on-screen
   repaint is unverifiable read-only.

**Zero-write operator check:** the qq board started 11:34; T-56..61 were
born 11:43–11:49. If the board window shows them, live repaint works and
causes 1–2 are the whole story; if not, a repaint defect is an additional
confirmed cause.

## Proposed bounded fixes (operator disposition required)

1. Convention paragraph (AGENTS.md or cockpit doc): boards show only the
   checkout they run in; run one board per project, in the primary checkout,
   treat as disposable, restart after merges/pulls.
2. Convention decision on where in-flight Task-file status lives. Options in
   tension: (a) diagnostician's proposal — Task-file status edits happen in
   the primary checkout at dispatch/completion, worktrees never edit Task
   files (primary board + inotify then shows live truth; but Task birth and
   Done flips no longer ride their Change's PR); (b) current precedent
   (T-45, and this batch) — Task files ride their Change worktree and PR,
   accepting board staleness for in-flight work. Owner recommendation:
   decide (a) vs (b) explicitly; a middle path is birth+status in primary
   with finalization mirrored at merge, but it doubles write sites.
3. Residual (only if it bites): a guarded `git pull --ff-only` timer for
   clean primary mains when merges land with no live session (extends
   T-14; touches cockpit/herdr config).
## Disposition (2026-07-16)

The operator adopted the **hybrid convention** (recorded in doc-48): Task
records are born and status-flipped in the primary checkout — the board
shows live in-flight truth — and move into their Change at finalization,
so Done records still ride their code pull request. The
primary-checkout-only option was declined for its recurring merge-time
reconcile discipline and decoupled provenance.

The open repaint question was settled the same day under T-66: the TUI
consumes removal-class inotify events without evicting from its
upsert-only store, so boards go permanently stale after sweeps —
deterministic, reproduced under strace in a hermetic PTY harness. The
upstream fix (BACK-547, PR #788) is merged but unreleased as of v1.48.0;
interim rule: restart boards after sweeps.
