// Capture-only qq-relay boundary for the isolated DSH mount probe.
// It can drive one synthetic delivery and record receiver calls, but it does
// not exercise or report the separately installed qq-relay transport.
import { appendFileSync, writeFileSync } from "node:fs";

const EVENT_ID = "evt_pi2dsh_durable_receipt";
const FROM = "019ff7b9-2fcd-78cd-bc16-c770a9ccff11";

function capture(operation, request) {
  const path = process.env.QQ_PI2DSH_RECEIPT_PROBE;
  if (!path) return;
  appendFileSync(path, `${JSON.stringify({ operation, observed_at: Date.now(), request })}\n`, { mode: 0o600 });
}

export const QQ_RELAY_PROTOCOL = "qq-relay-stub/v0";
export class RelayError extends Error {}
export class RelayClient {
  constructor() {
    this.acknowledged = false;
    this.attempts = 0;
  }
  unavailable() {
    throw new RelayError("qq-relay is outside the pi2dsh mount probe");
  }
  publish() { return this.unavailable(); }
  send() { return this.unavailable(); }
  status() { return this.unavailable(); }
  async next(request) {
    if (process.env.QQ_PI2DSH_RELAY_PROBE) {
      writeFileSync(process.env.QQ_PI2DSH_RELAY_PROBE, `${JSON.stringify(request)}\n`, { mode: 0o600 });
    }
    if (!process.env.QQ_PI2DSH_RECEIPT_PROBE || this.acknowledged) return this.unavailable();
    this.attempts += 1;
    if (this.attempts > 1) await new Promise((resolve) => setTimeout(resolve, 20));
    return {
      delivery: {
        obligation: {
          obligation_id: "obl_pi2dsh_durable_receipt",
          consumer_type: request.consumer_type,
          consumer_id: request.consumer_id,
          generation: request.generation,
        },
        record: {
          event_id: EVENT_ID,
          accepted_at: Date.now(),
          recipient_id: request.consumer_id,
          envelope: { payload: { schema: "qq.agent-message/v2", message: {
            from: FROM, project: "qq", role: "architect", tasks: ["T-63.3"], pane: null,
            content: "pi2dsh durable receipt probe", delivery: "default",
          } } },
        },
        attempt_token: "attempt_pi2dsh_durable_receipt",
        endpoint_token: request.endpoint_token,
        guard: { expected_high_water: 0, expected_gap_token: "gap_pi2dsh_durable_receipt" },
      },
    };
  }
  acknowledge(request) {
    capture("acknowledge", request);
    this.acknowledged = true;
    return {};
  }
  retry(request) {
    capture("retry", request);
    return {};
  }
  block(request) {
    capture("block", request);
    return {};
  }
}
export function canonicalRelayJson(value) {
  return JSON.stringify(value);
}
