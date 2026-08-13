// Fresh qq's global Pi extension entry point.
import registerExecutionProfiles from "./execution-profiles.ts";
import registerAgentMessages from "./agent-messages.ts";
import registerOperatorStage from "./operator-stage.ts";
import registerContinue from "./continue.ts";
import registerSessionScrub from "./session-scrub.ts";
import registerDictationPrivate from "./dictation-private.ts";
import registerBacklogGuard from "./backlog-guard.ts";
import registerLoopGuard from "./loop-guard.ts";
import registerWorkshop from "./workshop.ts";
import registerReviewFlow from "./review-flow.ts";

export default function registerQQ(pi) {
  registerExecutionProfiles(pi);
  registerAgentMessages(pi);
  registerOperatorStage(pi);
  registerContinue(pi);
  registerSessionScrub(pi);
  registerDictationPrivate(pi);
  registerBacklogGuard(pi);
  registerLoopGuard(pi);
  registerWorkshop(pi);
  registerReviewFlow(pi);
}
