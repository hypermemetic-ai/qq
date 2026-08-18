#!/usr/bin/env node
// Deterministic localhost OpenAI-compatible stub for isolated DSH workbench
// proofs. It supplies no model semantics; one explicit workbench prompt drives
// the pinned DSH base bundle's native coding tools.
import { createServer } from "node:http";
import { appendFileSync, writeFileSync } from "node:fs";

const [endpointPath, requestsPath] = process.argv.slice(2);
if (!requestsPath) throw new Error("usage: llm-stub.mjs <endpoint.txt> <requests.jsonl>");

let requestNumber = 0;
const server = createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    requestNumber += 1;
    const body = Buffer.concat(chunks).toString("utf8");
    appendFileSync(requestsPath, `${JSON.stringify({ request: requestNumber, url: request.url, body: JSON.parse(body) })}\n`, { mode: 0o600 });
    const parsed = JSON.parse(body);
    if (
      process.env.QQ_LLM_STUB_REJECT_DEVELOPER === "1" &&
      parsed.messages?.some((message) => message?.role === "developer")
    ) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({
        error: { code: "invalid_request_error", message: "developer role is unsupported" },
      }));
      return;
    }
    const textOf = (content) => Array.isArray(content)
      ? content.map((part) => part?.text ?? "").join("\n")
      : String(content ?? "");
    const workbenchProbe = parsed.messages?.some(
      (message) => message?.role === "user" && textOf(message.content).includes("QQ_DSH_NATIVE_TOOL_PROBE"),
    ) === true;
    const completedWorkbenchCalls = parsed.messages?.filter(
      (message) => message?.role === "tool" && String(message?.tool_call_id).startsWith("call_qq_workbench_"),
    ) ?? [];
    const responseDelayMs = workbenchProbe ? 20 : requestNumber === 1 ? 750 : 3_500;
    setTimeout(() => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      const base = {
        id: `chatcmpl-qq-dsh-${requestNumber}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: parsed.model ?? "deepseek-v4-pro-0813",
      };
      if (workbenchProbe && completedWorkbenchCalls.length < 5) {
        const calls = [
          ["write", { file_path: ".qq-dsh-workbench-tool-proof", content: "alpha\n" }],
          ["read", { file_path: ".qq-dsh-workbench-tool-proof" }],
          ["edit", { file_path: ".qq-dsh-workbench-tool-proof", old_string: "alpha", new_string: "beta" }],
          ["grep", { pattern: "beta", path: ".qq-dsh-workbench-tool-proof" }],
          ["bash", { command: "test \"$(cat .qq-dsh-workbench-tool-proof)\" = beta && pwd", description: "Verify edited file and repository directory" }],
        ];
        const index = completedWorkbenchCalls.length;
        const [toolName, args] = calls[index];
        response.write(`data: ${JSON.stringify({
          ...base,
          choices: [{
            index: 0,
            delta: {
              role: "assistant",
              tool_calls: [{
                index: 0,
                id: `call_qq_workbench_${index}`,
                type: "function",
                function: { name: toolName, arguments: JSON.stringify(args) },
              }],
            },
            finish_reason: null,
          }],
        })}\n\n`);
        response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`);
      } else {
        const content = workbenchProbe
          ? "QQ_DSH_NATIVE_TOOL_PROBE_COMPLETE"
          : "receipt probe step complete";
        response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: null }] })}\n\n`);
        response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`);
      }
      response.end("data: [DONE]\n\n");
    }, responseDelayMs);
  });
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("localhost LLM stub has no TCP address");
  writeFileSync(endpointPath, `http://127.0.0.1:${address.port}\n`, { mode: 0o600 });
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
