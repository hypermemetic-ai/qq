// Fresh qq's global Pi extension entry point.
import { createReadToolDefinition } from "@mariozechner/pi-coding-agent";
import registerExecutionProfiles, { createQqSessionContext } from "./execution-profiles.ts";
import registerRead from "./read.ts";
import registerAgentMessages from "./agent-messages.ts";
import registerOperatorStage from "./operator-stage.ts";
import registerContinue from "./continue.ts";
import registerSessionScrub from "./session-scrub.ts";
import registerBacklogGuard from "./backlog-guard.ts";
import registerGrokParaphraseGuard from "./grok-paraphrase-guard.ts";
import registerBoard from "./board.ts";
import registerReviewFlow from "./review-flow.ts";
import registerFrontendDesignLoop from "./frontend-design-loop.ts";

let detectFromPi;

async function detectImageMimeType(path) {
  if (!detectFromPi) {
    for (const specifier of ["@mariozechner/pi-coding-agent", "@earendil-works/pi-coding-agent"]) {
      try {
        const mime = await import(new URL("./utils/mime.js", import.meta.resolve(specifier)).href);
        detectFromPi = mime.detectSupportedImageMimeTypeFromFile;
        break;
      } catch {}
    }
    detectFromPi ??= async () => undefined;
  }
  return detectFromPi(path);
}

export default function registerQQ(pi) {
  const sessionContext = createQqSessionContext();
  registerExecutionProfiles(pi, { sessionContext });
  registerRead(pi, { createReadToolDefinition, detectImageMimeType });
  registerAgentMessages(pi);
  registerOperatorStage(pi);
  registerContinue(pi);
  registerSessionScrub(pi);
  registerBacklogGuard(pi);
  registerGrokParaphraseGuard(pi);
  registerBoard(pi, { sessionContext });
  registerReviewFlow(pi, { sessionContext });
  registerFrontendDesignLoop(pi);
}
