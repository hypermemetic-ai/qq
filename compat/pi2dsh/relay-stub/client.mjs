// Capture-only qq-relay boundary for the isolated DSH mount probe.
// It records the receiver address but reports no relay operation as compatible.
import { writeFileSync } from "node:fs";

export const QQ_RELAY_PROTOCOL = "qq-relay-stub/v0";
export class RelayError extends Error {}
export class RelayClient {
  constructor() {}
  unavailable() {
    throw new RelayError("qq-relay is outside the pi2dsh mount probe");
  }
  publish() { return this.unavailable(); }
  send() { return this.unavailable(); }
  status() { return this.unavailable(); }
  next(request) {
    if (process.env.QQ_PI2DSH_RELAY_PROBE) {
      writeFileSync(process.env.QQ_PI2DSH_RELAY_PROBE, `${JSON.stringify(request)}\n`, { mode: 0o600 });
    }
    return this.unavailable();
  }
  acknowledge() { return this.unavailable(); }
  retry() { return this.unavailable(); }
  block() { return this.unavailable(); }
}
export function canonicalRelayJson(value) {
  return JSON.stringify(value);
}
