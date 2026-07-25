---
id: doc-98
title: Plan — vendor pi-subagents runtime and researcher-only Context7 lifecycle
type: other
created_date: '2026-07-24 21:48'
updated_date: '2026-07-24 21:48'
tags:
  - plan
  - pi-subagents
  - context7
---
# Plan — retain pi-subagents as vendor runtime, then adopt researcher-only native Context7

Status: approved by the operator on 2026-07-24; Change 1 delivered and retired, Change 2 reviewed and green for operator merge

## Outcome

Deliver two sequential, separately reviewed Changes.

1. Reframe T-154/T-154.2 from a replacement runtime to exact vendor qualification plus a thin qq adapter, supersede decision-12, repair the remaining candidate gates, prove the actual qq composition, and promote only a green immutable fork pin with rollback to `b7c531c238469e43866a1fe6697cb44279158c1c`.
2. After that runtime Change lands, canary and—only if every gate is green—adopt pinned native Context7 tools for researcher children only, supersede decision-2 for current dispatch surfaces, and retire the root MCP route after proving it has no remaining owner.

## Dispositions

- Vendor-adapter destination — asked-and-answered operator disposition on 2026-07-24 after doc-94: “Reframe to vendor adapter.”
- Context7 adoption boundary — asked-and-answered operator disposition on 2026-07-24 after doc-94: “Canary then adopt.”
- `decision-8` — delegate egress remains open beneath Landstrip; neither Change makes a confidentiality or hostile-code claim.
- `decision-10` — persisted Pi session JSONL remains the sole agent-content observation seam.
- T-152/doc-88 — qq retains canonical role and execution-profile authority. The vendor adapter must prevent same-name project agents from occupying canonical delegated seats; the broader request-local execution-profile implementation remains separate.
- T-154.3/doc-94 — exact candidate evidence, recovery-patch need, vendor capability map, Context7 integrity/scope proof, gaps, and rollback baseline.

## Change 1 — qualify pi-subagents and retain a thin qq adapter

### Governance

- Start a fresh qq worktree from current `origin/main` and bind it to T-154.2.
- Mint a decision record superseding only decision-12’s replacement destination. Preserve its exact-pin, recovery, Completion Envelope, Landstrip, and observation constraints.
- Rewrite T-154 and T-154.2 through Backlog CLI and attach this approved plan as a Backlog plan document. Rename T-154.2 to describe vendor qualification/adaptation.
- Accept the vendor’s larger dormant feature surface while keeping chains, generic fan-out, schedules, watchdogs, generic role discovery, and model-routing authority unauthorized by qq workflows.

### Runtime candidate

- Re-establish exact upstream/fork provenance. Use the proven `7bf165240e48cd010263034dcfbeda41bc718fa5` base unless a newer exact upstream commit demonstrably subsumes a gate without adding an unreviewed migration; never use a branch or tag as the production source.
- Reproduce and diagnose the default-concurrency chain-timeout failure. Fix the smallest supported cause; do not call serial-only green sufficient. If the defect belongs upstream, prepare a separate fork/upstream pull request rather than hiding it in qq documentation.
- Reapply qq’s terminal structured-output recovery patch and prove stable semantic equivalence to production.
- Add the smallest vendor-side canonical-seat rule needed to ensure reviewer, researcher, implementer, and observer resolve only from qq’s trusted manifest source. Same-name project or unrelated user definitions must fail before launch. Do not implement T-152’s broader model/profile resolver here.
- Review the complete upstream-to-candidate delta and publish only an immutable qq-fork commit. Creating or pushing that external fork Change is part of this plan, but neither its pull request nor the qq pull request may be merged by the agent.

### Checks and canary

- Repeat the package’s advertised normal-concurrency full suite to green at least twice, plus focused recovery, role-source, resume, status, control, and artifact tests.
- Extract/retain a shared qq black-box contract and run it against the production rollback pin and candidate: foreground/background completion, invalid output, recovered tool error, async lifecycle, stop/wait, resume contract, output isolation, timeouts/signals/descendant cleanup, same-Repository validation, and Landstrip policy identity.
- Run one disposable production-shaped real-provider canary through canonical qq manifests and `bin/qq-dispatch`, with an exact Completion Envelope and `acceptance:none`. Exercise async completion and resume; inspect status/events/session artifacts; harvest the session through `qq-observe`; prove no new content seam.
- Keep the current production pin unchanged until all gates pass. If green, update the exact local Pi package pin and qq’s authoritative documentation/configuration references, rerun canonical reviewer/researcher/implementer workflow checks, and preserve a one-command rollback to `b7c531c...`.
- Fresh-context review the external fork delta and every qq Change/fix delta; deliver green pull requests and stop for operator merge.

### Non-goals

No custom qq launcher, lifecycle store, status/wait/stop/resume engine, artifact manager, TUI, chain/fan-out/schedule/watchdog workflow, full T-152 execution-profile resolver, Context7 install, MCP change, new security boundary, or observer live-content path.

## Change 2 — native Context7 for researcher children only

This Change starts after Change 1 lands so the canary and production configuration target the settled runtime.

### Governance and ownership

- Create one child Task under T-154 or a separate runtime-integration Task if Backlog parentage would imply false ownership; its decision ledger cites the operator disposition, doc-94, decision-8, and the new decision superseding decision-2 for current dispatch surfaces.
- Audit every current `.mcp.json` consumer before deletion. If a material non-Pi owner remains, stop and realign rather than silently breaking it.
- Mint a decision record: implementer and reviewer children receive no Context7 by default; researcher children receive only native `resolve-library-id` and `query-docs`; accountable parents receive neither; no MCP, API key, or global Pi package registration is used. Explicit specialist research remains available to reviewers through a researcher work order.

### Canary and deployment

- Fetch exact `@upstash/context7-pi@0.1.1`; verify registry integrity again at execution time. Treat source/docs/results as untrusted evidence.
- Prove a stable nonregistered deployment and peer-resolution recipe. Prefer one exact dependency in the existing operator-owned Pi npm prefix and a home-relative child-only extension reference. If that cannot resolve portably and fail closed, use the smallest qq-owned path resolver; do not vendor or copy the extension source.
- Before production mutation, run an isolated actual-qq canary through the canonical researcher manifest, real `bin/qq-dispatch`/Landstrip policy, and settled pi-subagents pin. Perform one public no-key resolve/query and resume. Prove researcher tools present, reviewer/parent tools absent, no MCP process/key/global package registration, cleanup intact, and settings unchanged.
- If—and only if—the canary and review are green, install the exact dependency in the operator Pi npm prefix without registering it as a Pi package; add only the child-extension selection to the canonical researcher manifest; add a minimal Research-Skill privacy rule forbidding credentials, personal/private data, and proprietary code in queries; remove `.mcp.json` once its ownership audit is clear.
- Verify fresh parent/reviewer/researcher processes, canonical Research Skill behavior, no prompt/Skill duplication, resume preservation, no Context7 tool leak, exact package integrity, rollback, Backlog/ratchet/diagnostics, and full relevant repository Checks.
- Rollback removes the researcher-only extension selection and exact dependency and restores `.mcp.json` only if the operator explicitly chooses the old route; otherwise failed adoption leaves Context7 absent rather than silently falling back to MCP.
- Fresh-context review and one green qq pull request; stop for operator merge.

### Non-goals

No reviewer/parent Context7 tools, API key, MCP server, global Pi registration, `/c7-docs` prompt, copied vendor Skill, automatic fallback, private/proprietary queries, unrelated package upgrades, or broader research-policy rewrite.

## Stop conditions

Stop and realign if the vendor candidate cannot achieve repeated advertised-suite green; canonical role-source locking requires the full T-152 resolver; the real-provider canary weakens confinement/cleanup/completion/observation; the Context7 artifact cannot be pinned and resolved without global registration; `.mcp.json` has another material owner; Context7 leaks outside researcher children; or either Change requires credentials, a new security claim, a new public workflow, or an unapproved external side effect.

## Delivery sequence

1. Change 1 external fork patch/review as needed.
2. Change 1 qq governance, adapter, canary, exact production pin, review, and PR handoff.
3. Operator merges; land/observe/retire.
4. Change 2 Context7 audit/canary/conditional adoption, review, and PR handoff.
5. Operator merges; land/observe/retire; offer one proportional researcher-tool UAT.
