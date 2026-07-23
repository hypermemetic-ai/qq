// @ts-nocheck
// This file is the mount point for qq's pi extension set: one global symlink
// (~/.pi/agent/extensions/qq -> <repo>/extensions) makes the whole set live by
// construction (mount, don't mirror). Adding or removing an extension is a
// repo-only change: change the file and one import line here.
// qq-codex-fast.ts is intentionally absent because bin/qq-dispatch loads it
// only for delegate children; it is not a global extension.

import registerPrWatch from "./qq-pr-watch.ts";
import registerContinue from "./qq-continue.ts";
import registerSplitFork from "./qq-split-fork.ts";
import registerOperatorStage from "./qq-operator-stage.ts";
import registerBacklogGuard from "./qq-backlog-guard.ts";
import registerQqFooter from "./qq-footer.ts";

export default function register(pi) {
  registerPrWatch(pi);
  registerContinue(pi);
  registerSplitFork(pi);
  registerOperatorStage(pi);
  registerBacklogGuard(pi);
  registerQqFooter(pi);
}
