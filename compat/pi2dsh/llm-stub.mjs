#!/usr/bin/env node
// Deterministic localhost DeepSeek-wire stub for the isolated receipt probe.
// It supplies no model semantics; it only lets DSH advance queued input into
// the next durable user/message boundary without reading a real credential.
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
    // Keep the message-driven turn open across qq-relay's real retry backoff.
    // This is timing control for the local model boundary, not relay tuning.
    const responseDelayMs = requestNumber === 1 ? 750 : 3_500;
    setTimeout(() => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      const base = {
        id: `chatcmpl-qq-pi2dsh-${requestNumber}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "deepseek-v4-flash",
      };
      response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: "receipt probe step complete" }, finish_reason: null }] })}\n\n`);
      response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`);
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
