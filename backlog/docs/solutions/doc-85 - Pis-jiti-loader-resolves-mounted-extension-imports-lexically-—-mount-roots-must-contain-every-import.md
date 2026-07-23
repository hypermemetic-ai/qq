---
id: doc-85
title: >-
  Pi's jiti loader resolves mounted extension imports lexically — mount roots
  must contain every import
type: guide
created_date: '2026-07-23 17:50'
updated_date: '2026-07-23 17:51'
tags:
  - solution
  - pi
  - extensions
  - loader
  - symlink
  - mount
---
# Pi's jiti loader resolves mounted extension imports lexically — mount roots must contain every import

## Symptom

A pi extension set mounted through one symlink in the global extensions dir
(`~/.pi/agent/extensions/<name> -> <dir>`) fails to load with
`Cannot find module '<relative-specifier>'` whenever the set's entry point
(`index.ts`) imports a file that lives OUTSIDE the symlink target — even
though the same import works when the entry point is loaded directly by path,
and even though node ESM realpaths symlinks by default. T-148's approved
design hit exactly this: `extensions/index.ts` importing
`../cockpit/pi/qq-backlog-guard.ts` through
`~/.pi/agent/extensions/qq -> <repo>/extensions` died with
`Cannot find module '../cockpit/pi/qq-backlog-guard.ts'` while every
node-harness test passed.

## Root cause

Pi loads extensions with jiti (`dist/core/extensions/loader.js`,
`createJiti` + `jiti.import(extensionPath)`), and jiti resolves relative
imports LEXICALLY against the path it was handed — it does not realpath the
symlinked directory first. `dirname(<agentDir>/extensions/qq/index.ts)` is
`<agentDir>/extensions/qq`, so `../cockpit/...` resolves to
`<agentDir>/extensions/cockpit/...`, a path that never traverses the symlink
and does not exist. Node-harness tests that import the entry point by its real
path (the qq extension test convention) exercise a different resolution
regime — node ESM realpaths by default — so they stay green while the mounted
load fails. Discovery (`entry.isSymbolicLink()` → `resolveExtensionEntries` →
`index.ts`) and dedup (lexical `path.resolve`, no realpath) follow the same
lexical rule throughout the loader.

## Resolution

Keep everything the mounted entry point imports INSIDE the mount root. For a
symlinked-dir mount, the entry point's relative imports must resolve within
the symlink target's own tree: co-locate the imported files (T-148 settled on
moving the backlog guard into `extensions/` — operator ruling, asked-and-
answered 2026-07-23) rather than reaching outside with `..`. Verify mount
designs against pi's real loader, not only a node harness: stage an agent dir
with the intended symlink and call `discoverAndLoadExtensions([], cwd,
stagedAgentDir)` from pi's installed `loader.js`; assert the set loads as
exactly one entry with zero errors. A load that works by direct path but must
also work through a symlink is a silent-failure class: test the resolution
regime that production actually uses.

## Verification

- Reproduced the failure natively against pi's installed loader
  (0.81.x): staged `<tmp>/agent/extensions/qq -> <worktree>/extensions`,
  `discoverAndLoadExtensions([], cwd, <tmp>/agent)` returned
  `Cannot find module '../cockpit/pi/qq-backlog-guard.ts'` with the
  require stack showing the symlinked path.
- Post-fix (guard co-located in `extensions/`): the same staged check loaded
  exactly one entry (`.../extensions/qq/index.ts`) with zero errors; after
  landing, the live check against the real `~/.pi/agent` repeated the result
  (exactly-once, no retired settings path loads, zero errors).
- Supporting contrast: the repo's node-harness extension tests imported the
  same `index.ts` by real path and passed throughout — evidence that harness
  and loader resolution regimes differ.
- Settled in T-148 (PRs #219, #220; decision ledger records the supersession
  of the original `cockpit/pi` relative-import design).
