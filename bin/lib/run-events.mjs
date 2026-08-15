import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";

import { EventPlaneClient, canonicalEventPlaneJson } from "./event-plane-client.ts";
import { stateHome } from "./run.mjs";

export const RUN_EVENT_PRODUCT = "qq";
export const RUN_LANDED_KIND = "run.landed";
export const RUN_BLOCKED_KIND = "run.blocked";
export const RUN_BOOTSTRAP_FAILED_KIND = "run.bootstrap-failed";
export const RUN_LANDED_SCHEMA = "qq.run-landed/v1";
export const RUN_BLOCKED_SCHEMA = "qq.run-blocked/v1";
export const RUN_BOOTSTRAP_FAILED_SCHEMA = "qq.run-bootstrap-failed/v1";

const SESSION_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export function runEventRecipient(sessionId) {
  if (!SESSION_ID.test(sessionId ?? "")) throw new Error("run outcome requires a canonical architect session ID");
  return `${RUN_EVENT_PRODUCT}/review-flow/${sessionId}`;
}

function filesFor(state) {
  return (state.pack?.files ?? []).map((file) => ({
    path: file.path,
    added: file.added ?? null,
    deleted: file.deleted ?? null,
  }));
}

export function runEventPayload(state, kind) {
  const common = {
    run_id: state.id,
    architect_session: state.architectSession,
    task: { id: state.task.id, title: state.task.title },
  };
  if (kind === RUN_LANDED_KIND) {
    return {
      schema: RUN_LANDED_SCHEMA,
      ...common,
      landing: {
        ref: state.ref,
        target_branch: state.baseBranch,
        landed_at: state.landedAt,
        summary: state.pack?.summary ?? "landed",
        files: filesFor(state),
      },
    };
  }
  if (kind === RUN_BLOCKED_KIND) {
    return {
      schema: RUN_BLOCKED_SCHEMA,
      ...common,
      review: {
        ref: state.ref,
        look: state.look,
        blocked_at: state.updatedAt,
        reason: state.blockedReason,
        summary: state.pack?.summary ?? state.blockedReason,
        files: filesFor(state),
      },
    };
  }
  if (kind === RUN_BOOTSTRAP_FAILED_KIND) {
    return {
      schema: RUN_BOOTSTRAP_FAILED_SCHEMA,
      ...common,
      bootstrap: {
        failed_at: state.bootstrapFailedAt,
        reason: state.bootstrapFailureReason,
        task_returned: state.bootstrapTaskReturned === true,
      },
    };
  }
  throw new Error(`unsupported run outcome kind: ${kind}`);
}

export async function sendRunEvent(state, kind, options = {}) {
  const payload = runEventPayload(state, kind);
  const producerId = kind === RUN_LANDED_KIND ? "qq/land-worker"
    : kind === RUN_BOOTSTRAP_FAILED_KIND ? "qq/start-worker"
    : "qq/review-worker";
  const requestHash = createHash("sha256").update(canonicalEventPlaneJson({ kind, payload })).digest("hex");
  const client = options.client ?? new EventPlaneClient(join(stateHome(options.env), "qq", "event-plane", "event-plane.sock"));
  return client.send({
    producer_id: producerId,
    request_id: `run_${requestHash}`,
    origin_id: producerId,
    recipient_id: runEventRecipient(state.architectSession),
    product_id: RUN_EVENT_PRODUCT,
    kind,
    schema_version: 1,
    payload,
  });
}

export function parseRunEvent(delivery, sessionId) {
  const record = delivery?.record;
  const payload = record?.envelope?.payload;
  if (record?.product_id !== RUN_EVENT_PRODUCT || record?.recipient_id !== runEventRecipient(sessionId)) return undefined;
  if (!payload || typeof payload !== "object" || payload.architect_session !== sessionId) return undefined;
  if (record.kind === RUN_LANDED_KIND && record.producer_id === "qq/land-worker" && record.origin_id === "qq/land-worker" && payload.schema === RUN_LANDED_SCHEMA) {
    return { kind: RUN_LANDED_KIND, payload, eventId: record.event_id };
  }
  if (record.kind === RUN_BLOCKED_KIND && record.producer_id === "qq/review-worker" && record.origin_id === "qq/review-worker" && payload.schema === RUN_BLOCKED_SCHEMA) {
    return { kind: RUN_BLOCKED_KIND, payload, eventId: record.event_id };
  }
  if (record.kind === RUN_BOOTSTRAP_FAILED_KIND && record.producer_id === "qq/start-worker" && record.origin_id === "qq/start-worker" && payload.schema === RUN_BOOTSTRAP_FAILED_SCHEMA) {
    return { kind: RUN_BOOTSTRAP_FAILED_KIND, payload, eventId: record.event_id };
  }
  return undefined;
}

export function runEventDeliveryGuard(delivery) {
  return {
    obligation_id: delivery.obligation.obligation_id,
    event_id: delivery.record.event_id,
    consumer_type: delivery.obligation.consumer_type,
    consumer_id: delivery.obligation.consumer_id,
    generation: delivery.obligation.generation,
    attempt_token: delivery.attempt_token,
    endpoint_token: delivery.endpoint_token,
    expected_high_water: delivery.guard.expected_high_water,
    expected_gap_token: delivery.guard.expected_gap_token,
  };
}

export function runEventEndpoint() {
  return `review-flow/${randomUUID()}`;
}
