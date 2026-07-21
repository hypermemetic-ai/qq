// @ts-nocheck

// Request priority processing ("fast mode") for GPT-5.6 Codex payloads.
//
// Loaded into every qq delegate child by bin/qq-dispatch. pi exposes no
// service-tier setting; the only seam is the before_provider_request hook,
// which fires after the openai-codex Responses payload is built and before it
// is sent over SSE or WebSocket. The payload's `model` field carries the model
// id, so gating on the gpt-5.6 prefix keeps the injection scoped to the
// delegate model family this extension is loaded for. An explicit
// caller-supplied service_tier always wins.
//
// Cost note: pi attributes the 2x priority multiplier from the response's
// service_tier field; if the backend honors priority silently, displayed cost
// undercounts. Request behavior is unaffected either way.

const PRIORITY_MODEL_PREFIX = "gpt-5.6";

export default function (pi) {
  pi.on("before_provider_request", (event) => {
    const payload = event.payload;
    if (
      payload &&
      typeof payload === "object" &&
      typeof payload.model === "string" &&
      payload.model.startsWith(PRIORITY_MODEL_PREFIX) &&
      payload.service_tier === undefined
    ) {
      return { ...payload, service_tier: "priority" };
    }
  });
}
