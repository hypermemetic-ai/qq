// @ts-nocheck
import { dirname, join } from "node:path";

import { createQaVerdict, QA_VERDICT_ARGUMENT_SCHEMA, writeQaVerdict } from "../bin/lib/qa-verdict.mjs";
import { readHandoff } from "../bin/lib/run.mjs";

export default function registerQaResult(pi, deps = {}) {
  const env = deps.env ?? process.env;
  let submitted = false;
  pi.registerTool({
    name: "qa_verdict", label: "QA verdict",
    description: "Submit the one final qa verdict. Call exactly once, after reviewing code and tests.",
    parameters: QA_VERDICT_ARGUMENT_SCHEMA,
    async execute(_id, params, _signal, _update, ctx) {
      if (submitted) return { content: [{ type: "text", text: "qa_verdict was already submitted." }], details: { status: "refused" } };
      let resultPath = env.QQ_QA_RESULT;
      if (!resultPath && env.QQ_RUN_STATE) {
        try {
          const state = await readHandoff(env.QQ_RUN_STATE);
          if (state.look === 1 || state.look === 2) resultPath = join(dirname(env.QQ_RUN_STATE), `qa-look-${state.look}.json`);
        } catch {}
      }
      if (!resultPath) return { content: [{ type: "text", text: "qa result path is unavailable." }], details: { status: "refused" } };
      submitted = true;
      const value = createQaVerdict(params);
      await (deps.write ?? writeQaVerdict)(resultPath, value);
      setTimeout(() => { try { ctx?.shutdown?.(); } catch {} }, 25).unref?.();
      return { content: [{ type: "text", text: `qa verdict recorded: ${params.verdict}` }], details: value };
    },
  });
}
