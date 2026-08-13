// Fresh qq's global Pi extension entry point.
import registerExecutionProfiles from "./execution-profiles.ts";
import registerAgentMessages from "./agent-messages.ts";
import registerOperatorStage from "./operator-stage.ts";
import registerBacklogGuard from "./backlog-guard.ts";

export default function registerQQ(pi) {
  registerExecutionProfiles(pi);
  registerAgentMessages(pi);
  registerOperatorStage(pi);
  registerBacklogGuard(pi);
}
