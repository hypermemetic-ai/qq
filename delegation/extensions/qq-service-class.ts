// @ts-nocheck

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const SERVICE_CLASS_ENV = "QQ_DELEGATE_SERVICE_CLASS";
const SERVICE_CLASSES = new Set(["auto", "default", "flex", "priority"]);

function isOpenAIResponsesPayload(payload: unknown): payload is Record<string, unknown> {
  return (
    payload !== null &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    typeof (payload as Record<string, unknown>).model === "string" &&
    Array.isArray((payload as Record<string, unknown>).input) &&
    (payload as Record<string, unknown>).stream === true &&
    !Object.hasOwn(payload, "messages")
  );
}

export default function register(
  pi: ExtensionAPI,
  env: NodeJS.ProcessEnv = process.env,
): void {
  pi.on("before_provider_request", (event) => {
    const serviceClass = env[SERVICE_CLASS_ENV];
    if (!SERVICE_CLASSES.has(serviceClass) || !isOpenAIResponsesPayload(event.payload)) return;
    return { ...event.payload, service_tier: serviceClass };
  });
}
