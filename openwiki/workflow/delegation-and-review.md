---
type: Workflow guide
title: Delegation and review lifecycle
description: End-to-end guide to qq task admission, operator approval, isolated runner execution, two-look QA, proposal landing, artifacts, invariants, failures, and focused validation.
tags: [workflow, delegation, qa, landing]
---

# Delegation and review lifecycle

qq turns one Backlog ticket into an isolated, operator-approved run. The architect owns admission and landing; the runner owns implementation; an isolated QA session owns the verdict and may add only test changes. For role activation, see [Profiles and activation](../runtime/profiles-and-activation.md); for pane behavior, see [Operator workflows](../herdr/operator-workflows.md); for durable outcome delivery, see [Agent messaging](../event-plane/agent-messaging.md) and [qq-relay integration](../event-plane/service.md).

## Entrypoints and ownership

| Entrypoint | Caller | Effect |
|---|---|---|
| `sketch({title,note?})` | architect Pi session | Creates a Backlog task; optional text is appended as a timestamped take. |
| `note({id,text})` | architect Pi session | Appends a timestamped implementation note. |
| `delegate({id})` | architect Pi session in Herdr | Serializes admission, claims a `To Do` task, creates the private brief, asks the operator, and hands an owner-only bootstrap request to a detached start worker. It returns while the runner is still starting. |
| `done({ref})` | delegated runner with `QQ_RUN_STATE` | Validates the committed ref, advances the QA look, starts `qq-review-worker.mjs`, then stops the runner. It never merges. |
| proposal picker | owning architect session | Offers `approve`, `discuss`, or `later`; only `approve` invokes the land worker. |
| `qa_verdict(...)` | isolated QA extension only | Writes exactly one structured pass/fail result and shuts QA down. |

`extensions/board.ts` registers the architect tools. `extensions/review-flow.ts` registers `done`, polls proposals, and consumes run outcomes. `extensions/qa-result.ts` is deliberately launched with `--no-extensions`; it is not part of the global extension bundle (`source`).

## End-to-end flow

```mermaid
sequenceDiagram
    participant A as Architect
    participant B as Board extension
    participant V as Admission vet
    participant O as Operator gate
    participant H as Herdr
    participant S as Start worker
    participant R as Runner
    participant Q as QA worker
    participant L as Land worker
    participant E as qq-relay

    A->>B: delegate task id
    B->>B: acquire qq-admit.lock
    B->>V: ticket, active tasks, briefs, live diffs
    V-->>B: clear or bounce
    B->>B: re-read and claim In Progress
    B->>B: write private ticket, transcript, note, gate
    B->>O: open focused right-side brief gate
    O-->>B: approve or cancel
    alt approved
        B->>S: hand off private bootstrap request
        S->>H: create worktree, runs pane, runner
        S->>R: submit private prompt through Herdr socket
        S->>S: verify marker in Pi session JSONL
        R->>B: done with committed ref
        B->>Q: detached review worker in same pane
        alt look 1 fails
            Q->>R: return pane with one fix prompt
            R->>B: done with updated ref
            B->>Q: final look
        end
        alt QA passes
            Q-->>A: proposal pack
            A->>L: approve
            L->>L: merge, push, clean up, mark Done
            L->>E: run.landed
        else look 2 fails
            Q->>B: return task to To Do
            Q->>E: run.blocked
        end
    else cancelled
        B->>B: return task to To Do and discard artifacts
    end
    opt detached bootstrap fails
        S->>B: return task to To Do
        S->>E: durable run.bootstrap-failed outcome
    end
```

*The sequence shows the source-backed admission, approval, runner, two-look QA, landing, and outcome path.*

### 1. Admit and claim

`delegate` is architect-only. `withAdmissionLock` creates `<git-common-dir>/qq-admit.lock` with mode `0600`, waits, removes a dead-owner lock, and deletes only its own token on exit (`source`). While holding it, admission gathers:

- the incoming full task plus every `To Do` and `In Progress` task;
- each live worktree's changed and untracked paths since its merge base with main `HEAD`;
- the newest prior `note.md` or `brief.md` for the same task, if present.

The pinned scribe model receives this evidence and must return only `clear` or `bounce` with a one-line reason. A bounce stays in chat and changes no status. On clear, qq re-reads the task under the lock; only a still-`To Do` task is moved to `In Progress`. This second read prevents stale claims (`source`).

### 2. Disclose context and gate the brief

The scribe receives the raw formatted ticket, the latest operator-turn transcript (up to 100 turns), assistant tool names, and file paths read or modified. The outbound transcript includes text and tool names, not tool arguments or file contents; paths modified are not also listed as read (`source`). The generated note is non-empty and records the current QA provider, model, and effort binding.

`prepareRun` creates an owner-only state directory under `$XDG_STATE_HOME/qq/runs/<project>/<task>-<nonce>/`; the directory must be non-symlink, owned by the current UID, and inaccessible to group/other. It writes `ticket.md`, `transcript.md`, `note.md`, and `gate.md` as `0600` files. The brief-gate plugin renders `gate.md` in Glow and atomically writes only `approved` or `cancelled` to `brief-gate-decision` (`source`). Calls sharing a git common directory are also serialized in-process so two Glow turns do not overlap.

Cancellation returns the ticket to `To Do` and deletes the prepared directory. Any exception before successful start attempts the same rollback; error text is scrubbed if it contains the private generated note.

### 3. Start the isolated runner

After approval, `delegate` writes an owner-only `qq.run-bootstrap/v1` request to `bootstrap.json` and spawns detached `bin/qq-start-worker.mjs`. The tool waits only for the worker's IPC acceptance and returns `status: starting`; the architect turn does not own or await the longer startup. If the worker rejects the private request or exits before accepting it, the tool still rolls the claim and prepared state back synchronously.

The worker creates branch `qq/<task-slug>-<nonce>` and a worktree below `${QQ_WORKTREE_ROOT:-~/.herdr/worktrees/<project>}` at the captured main `HEAD`. Generated OpenWiki materialization is frozen. qq creates or right-splits the literal `runs` tab without focus and injects:

- `QQ_AGENT_ROLE=runner`, `QQ_AGENT_PROJECT`, and `QQ_RUN_STATE`;
- `QQ_RUN_ID` and the owning `QQ_ARCHITECT_SESSION`.

After writing a `qq.run-handoff/v1` state with `status: starting`, the worker waits until the pane contains only an available shell and launches Pi with `--approve`. It sends the full private ticket and note through Herdr's Unix-socket `agent.prompt` API rather than placing them in CLI arguments. Startup is complete only after `agent.get` identifies the pane's Pi session and the session JSONL contains the exact per-run bootstrap marker as a user-message line. The handoff then becomes `running` and records `bootstrapProof` with the marker, safe absolute session path, and acceptance time.

A detached startup failure closes the owned pane, force-removes the worktree and branch, retries the Backlog transition to `To Do`, and removes private run state. Before cleanup it persists a sanitized owner-only failure record under `${XDG_STATE_HOME:-~/.local/state}/qq/bootstrap-failures/`; reasons redact private ticket/note text, sensitive environment values, control characters, and paths. It retries immediate `run.bootstrap-failed` delivery and also shows a Herdr notification. If qq-relay is unavailable, the owning architect's regular review poll retries only that session's outbox entry and removes it after delivery. This failure path is therefore separate from the synchronous `delegate` return.

### 4. Submit and review

`done` refuses unless it runs in the handoff's real worktree, state is `running` or `waiting_fix`, fewer than two looks were used, `ref` resolves to a commit descending from `baseRef`, and the worktree is completely clean. It records the SHA, increments `look`, sets `reviewing`, starts a detached review worker, and shuts down the runner (`source`).

QA takes over the same pane only after the old Herdr agent identity disappears and the shell is free. Every Pi re-entry launched by `takePane`—QA and the runner restarted after a failed first look—passes `--approve` before session-specific arguments. QA receives a private file-backed system prompt, a persistent QA session ID, only `read,bash,edit,write,qa_verdict`, and no normal extensions, skills, templates, or context files. Look 2 resumes look 1's QA session.

QA may commit test-only changes. Enforcement is independent of its claim:

- a passing verdict with a dirty worktree is converted to failure;
- QA may only append descendants of the reviewed ref;
- every added path must satisfy `isTestPath`; production paths, rewritten history, or an empty commit convert the verdict to failure;
- a valid test-only commit becomes the proposal ref.

Look 1 failure sets `waiting_fix`, restarts the runner in the pane, and supplies the rejection for one fix. Look 2 failure sets `blocked`, returns the task to `To Do`, emits `run.blocked`, closes the pane, and notifies the operator. There is no third look (`source`).

### 5. Propose and land

A pass writes an operator pack containing the normalized QA summary and `git diff --numstat` files, sets `proposal`, closes the run pane, and notifies the operator. Only the architect session ID stored in the handoff may see the offer. `discuss` persists a comment and steers it into that session; `later` persists deferral. A QA-failed `blocked` state is not offered, while a QA-passed landing failure is offered for discussion but not silently re-landed.

`approve` runs `qq-land-worker.mjs` under `<git-common-dir>/qq-land.lock`. Landing requires a QA-passed proposal, the original named base branch, clean main and delegated worktrees, and no changed `openwiki/` paths. It freezes main OpenWiki output, verifies a clean merge with `merge-tree`, makes a `--no-ff` merge unless already merged, discovers the branch upstream, pushes `HEAD` to it, removes the worktree, deletes the merged branch, then records `landed`. Only afterward is Backlog moved to `Done` (`source`). A failure records `blockedReason` and leaves the board `In Progress`; cleanup is not falsely reported as success.

The land worker emits idempotent `run.landed`; final QA failure emits `run.blocked`. Recipients may be canonical Pi UUIDs or pinned DSH `session-<UUID>` identities. The owning architect receiver validates producer, recipient, schema, and session, injects a custom outcome, then acknowledges only when `sessionManager.getEntries()` exposes the matching Pi custom-message or exact DSH user-message projection. It has no session-file fallback, retries without reinjection until the durable entry is observable, and blocks unsupported outcomes. See [DSH compatibility](../runtime/dsh-compatibility.md).

## State machine

```mermaid
stateDiagram-v2
    [*] --> ToDo
    ToDo --> Bounced: admission conflict
    Bounced --> ToDo
    ToDo --> InProgress: clear and atomic claim
    InProgress --> ToDo: gate cancel or worker launch rejection
    InProgress --> Starting: bootstrap worker accepts request
    Starting --> Running: prompt marker recorded in Pi session
    Starting --> ToDo: detached bootstrap rollback
    Running --> Reviewing1: done with clean descendant
    Reviewing1 --> WaitingFix: QA look 1 fails
    WaitingFix --> Reviewing2: done with clean updated ref
    Reviewing1 --> Proposal: QA passes
    Reviewing2 --> Proposal: QA passes
    Reviewing2 --> BlockedQA: QA fails
    BlockedQA --> ToDo: board returned
    Proposal --> Commented: discuss
    Proposal --> Later: defer
    Commented --> Proposal: next offer
    Later --> Proposal: next offer
    Proposal --> Landing: approve under land lock
    Landing --> Landed: merge, push, cleanup
    Landing --> BlockedLand: invariant or command failure
    BlockedLand --> Commented: discuss only
    Landed --> Done: board update
```

*The state diagram distinguishes handoff state from Backlog state and preserves the two-look limit.*

## Artifact and invariant reference

| Artifact or invariant | Contract |
|---|---|
| `bootstrap.json` | Atomic owner-only `qq.run-bootstrap/v1`; detached-worker request containing task identity, prepared paths, QA binding, architect session, and a non-secret prompt marker. Removed after successful startup. |
| `handoff.json` | Atomic `0600` `qq.run-handoff/v1`; canonical owner of paths, refs, pane, architect session, QA binding, look, status, verdict, pack, failures, and prompt-acceptance proof. |
| `qq/bootstrap-failures/*.json` | Owner-only `qq.bootstrap-failure-outbox/v1`; session-scoped sanitized startup failures retained only until qq-relay delivery succeeds. |
| `qa-look-1.json`, `qa-look-2.json` | Atomic `0600` `qq.qa-verdict/v1`; one call per QA process with pass/fail, summary, feedback, and `tests_modified`. |
| `qa-session/` | Private resumed QA context across the two looks. |
| `qq-admit.lock` | Serializes conflict evidence and claim across worktrees; stale PID cleanup is guarded. |
| `qq-land.lock` | Serializes landing with other qq publishers that share the git common directory. |
| base/ref relation | Submitted and QA-added refs descend from the captured base; runner and main worktrees must be clean at their boundaries. |
| board order | `To Do` → `In Progress` at claim; `Done` only after merge, push, and cleanup; final QA failure returns to `To Do`; landing failure remains `In Progress`. |
| ownership | Only the stored architect session gets proposal UI and durable outcomes; runners and QA never merge. |

## Failure handling

- Malformed Backlog JSON, admission output, Herdr JSON, handoff, verdict, or gate decision fails closed.
- Missing Herdr pane/workspace, unsafe private paths or session JSONL, detached main, unavailable model, unavailable shell, socket/API failure, absent prompt marker at the bounded deadline, or unclean refs prevents progression.
- Detached bootstrap failure retries board rollback and immediate outcome delivery once. Its durable outbox prevents qq-relay downtime from losing the failure, but a failure to persist that outbox is surfaced explicitly and never blocks private-state deletion.
- Review infrastructure failure records `blocked` with `qa infrastructure failed`; unless QA had already passed, it returns the task to `To Do` and sends a Herdr notification.
- Landing failure preserves the worktree and branch when cleanup cannot complete, records the exact reason, and is re-offered only for discussion. If thaw/remove fails, OpenWiki protection is restored or an aggregate failure exposes both faults.
- Landing and QA-blocked outcome delivery depends on a running qq-relay service and its installed client; send failure makes those workers fail rather than pretending the architect was informed. Bootstrap failures additionally use the local outbox described above.

## Validation

Run focused checks from the repository root. The direct delegation and review imports require `QQ_RELAY_INSTALL_ROOT` to name a valid installed artifact; `tests/test-qq-relay.sh` creates that fixture and runs both automatically.

```bash
node --experimental-strip-types tests/test-delegation.mjs "$PWD"
node --experimental-strip-types tests/test-review-flow.mjs "$PWD"
node tests/test-brief-gate.mjs "$PWD"
# Use this instead when validating the installed relay boundary
tests/test-qq-relay.sh
```

These cover role refusal, transcript disclosure, admission locking/evidence and bounce paths, private artifacts, gate approval/cancellation, detached worker acceptance, socket prompt transport, session-marker proof and timeout, sanitized startup rollback/outbox delivery, `--approve` launch arguments, `done` ancestry/cleanliness, same-pane takeover, two-look continuity, test-only QA commits, proposal ownership/actions, landing order/locks/failures, board transitions, generated-path refusal, and run-event receipts. Use `npm test` for the sequential repository suite; see [Validation](../testing/validation.md).

## Source anchors

- Architect tools and orchestration: `extensions/board.ts`
- Runner submission, proposal UI, and outcome receiver: `extensions/review-flow.ts`
- Admission lock and evidence: `bin/lib/admission.mjs`
- Private artifacts, bootstrap request, Herdr socket transport, prompt proof, worktree, and runner start: `bin/lib/run.mjs`
- Detached startup rollback and failure outbox: `bin/lib/bootstrap.mjs`, `bin/qq-start-worker.mjs`
- QA and landing: `bin/lib/review.mjs`
- Workers and outcomes: `bin/qq-start-worker.mjs`, `bin/qq-review-worker.mjs`, `bin/qq-land-worker.mjs`, `bin/lib/run-events.mjs`
- Tests: `tests/test-delegation.mjs`, `tests/test-review-flow.mjs`, `tests/test-brief-gate.mjs`
