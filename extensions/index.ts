// Fresh qq's global Pi extension entry point.
import registerExecutionProfiles from "./execution-profiles.ts";
import registerRead from "./read.ts";
import registerAgentMessages from "./agent-messages.ts";
import registerOperatorStage from "./operator-stage.ts";
import registerContinue from "./continue.ts";
import registerSessionScrub from "./session-scrub.ts";
import registerBacklogGuard from "./backlog-guard.ts";
import registerGrokParaphraseGuard from "./grok-paraphrase-guard.ts";
import registerBoard from "./board.ts";
import registerReviewFlow from "./review-flow.ts";

export default function registerQQ(pi) {
  registerExecutionProfiles(pi);
  registerRead(pi);
  registerAgentMessages(pi);
  registerOperatorStage(pi);
  registerContinue(pi);
  registerSessionScrub(pi);
  registerBacklogGuard(pi);
  registerGrokParaphraseGuard(pi);
  registerBoard(pi);
  registerReviewFlow(pi);
}
