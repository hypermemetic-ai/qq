// Load-only qq-relay boundary for the isolated DSH mount probe.
// No relay operation is exercised or reported as compatible by this harness.
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
  next() { return this.unavailable(); }
  acknowledge() { return this.unavailable(); }
  retry() { return this.unavailable(); }
  block() { return this.unavailable(); }
}
export function canonicalRelayJson(value) {
  return JSON.stringify(value);
}
