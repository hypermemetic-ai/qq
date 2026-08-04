// @ts-nocheck

// Request Fast mode for every GPT-5.6 Responses request from ordinary Pi.
// Delegated Pi sessions load the service-class extension explicitly instead.

const FAST_MODEL_PREFIX = "gpt-5.6";

export default function register(pi) {
  pi.on("before_provider_request", (event) => {
    const payload = event.payload;
    if (
      payload !== null &&
      typeof payload === "object" &&
      !Array.isArray(payload) &&
      typeof payload.model === "string" &&
      payload.model.startsWith(FAST_MODEL_PREFIX) &&
      Array.isArray(payload.input) &&
      payload.stream === true &&
      !Object.hasOwn(payload, "messages") &&
      payload.service_tier === undefined
    ) {
      return { ...payload, service_tier: "priority" };
    }
  });
}
