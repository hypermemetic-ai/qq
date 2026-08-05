// @ts-nocheck -- qq intentionally ships no TypeScript or Node type dependency.
// Dependency-free TypeScript client for the bounded qq Event Plane protocol.
import net from "node:net";

export const QQ_EVENT_PLANE_PROTOCOL = "qq-event-plane/v1";
const MAX_FRAME_BYTES = 128 * 1024;
const OPERATIONS = new Set([
  "send", "publish", "ensure_subscription", "next", "acknowledge", "retry", "block",
  "disposition", "status", "inspect", "backup", "restore", "shutdown",
]);

type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export class EventPlaneError extends Error {
  readonly code: string;

  constructor(message: string, code = "client_error") {
    super(message);
    this.name = "EventPlaneError";
    this.code = code;
  }
}

function validatedString(value: string): string {
  for (const character of value) {
    const point = character.codePointAt(0)!;
    if (point >= 0xd800 && point <= 0xdfff) {
      throw new EventPlaneError("operation body strings must contain only Unicode scalar values");
    }
  }
  return value;
}

function isJavaScriptArrayIndex(value: string): boolean {
  if (value === "0") return true;
  if (!/^[1-9][0-9]*$/.test(value)) return false;
  const maximum = "4294967294";
  return value.length < maximum.length || (value.length === maximum.length && value <= maximum);
}

function validatedObjectKey(value: string): string {
  validatedString(value);
  if (isJavaScriptArrayIndex(value)) {
    throw new EventPlaneError("operation body object keys cannot be JavaScript array indexes");
  }
  return value;
}

function compareUnicodeScalars(left: string, right: string): number {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0)!);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0)!);
  const shared = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < shared; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

function stableValue(value: unknown, stack: Set<object>): JsonValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return validatedString(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new EventPlaneError("operation body JSON numbers must be safe integers");
    }
    return value;
  }
  if (typeof value !== "object") throw new EventPlaneError("operation body is not finite JSON");
  if (stack.has(value)) throw new EventPlaneError("operation body is cyclic");
  stack.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => stableValue(item, stack));
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new EventPlaneError("operation body contains a non-JSON object");
    }
    const result: JsonObject = Object.create(null);
    for (const key of Object.keys(value).sort(compareUnicodeScalars)) {
      validatedObjectKey(key);
      result[key] = stableValue((value as Record<string, unknown>)[key], stack);
    }
    return result;
  } finally {
    stack.delete(value);
  }
}

export function canonicalEventPlaneJson(value: unknown): string {
  return JSON.stringify(stableValue(value, new Set()));
}

export class EventPlaneClient {
  readonly socketPath: string;
  readonly timeoutMs: number;

  constructor(socketPath: string, timeoutMs = 35_000) {
    if (typeof socketPath !== "string" || !socketPath.startsWith("/")) {
      throw new EventPlaneError("socket path must be absolute");
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
      throw new EventPlaneError("timeoutMs must be a positive integer at most 60000");
    }
    this.socketPath = socketPath;
    this.timeoutMs = timeoutMs;
  }

  private operation(name: string, body: JsonObject): Promise<JsonObject> {
    if (!OPERATIONS.has(name)) {
      return Promise.reject(new EventPlaneError("operation is not supported by the bounded client"));
    }
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return Promise.reject(new EventPlaneError("operation body must be a JSON object"));
    }
    let bytes: Buffer;
    try {
      bytes = Buffer.from(canonicalEventPlaneJson({
        body,
        operation: name,
        protocol: QQ_EVENT_PLANE_PROTOCOL,
      }), "utf8");
    } catch (error) {
      return Promise.reject(error);
    }
    if (bytes.length > MAX_FRAME_BYTES) {
      return Promise.reject(new EventPlaneError("request exceeds the bounded protocol frame", "frame_too_large"));
    }
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32BE(bytes.length);

    return new Promise((resolve, reject) => {
      const connection = net.createConnection({ path: this.socketPath });
      const chunks: Buffer[] = [];
      let received = 0;
      let expected: number | null = null;
      let settled = false;

      const fail = (error: EventPlaneError) => {
        if (settled) return;
        settled = true;
        connection.destroy();
        reject(error);
      };
      connection.setTimeout(this.timeoutMs, () => fail(new EventPlaneError(
        "Event Plane transport timed out", "transport_error",
      )));
      connection.once("connect", () => connection.end(Buffer.concat([header, bytes])));
      connection.once("error", (error: NodeJS.ErrnoException) => {
        const unavailable = error.code === "ENOENT" || error.code === "ECONNREFUSED";
        fail(new EventPlaneError(
          unavailable ? "Event Plane service is unavailable" : `Event Plane transport failed: ${error.message}`,
          unavailable ? "unavailable" : "transport_error",
        ));
      });
      connection.on("data", (chunk: Buffer) => {
        if (settled) return;
        chunks.push(chunk);
        received += chunk.length;
        const all = Buffer.concat(chunks, received);
        if (expected === null && all.length >= 4) {
          expected = all.readUInt32BE(0);
          if (expected < 2 || expected > MAX_FRAME_BYTES) {
            fail(new EventPlaneError("service returned an invalid bounded frame"));
            return;
          }
        }
        if (expected !== null && all.length > expected + 4) {
          fail(new EventPlaneError("service returned trailing bytes outside its frame"));
        }
      });
      connection.once("end", () => {
        if (settled) return;
        const all = Buffer.concat(chunks, received);
        if (expected === null || all.length !== expected + 4) {
          fail(new EventPlaneError("service closed an incomplete response"));
          return;
        }
        let document: unknown;
        try {
          document = JSON.parse(all.subarray(4).toString("utf8"));
          stableValue(document, new Set());
        } catch {
          fail(new EventPlaneError("service returned malformed or unsupported JSON"));
          return;
        }
        if (
          document === null || typeof document !== "object" || Array.isArray(document)
          || (document as Record<string, unknown>).protocol !== QQ_EVENT_PLANE_PROTOCOL
          || typeof (document as Record<string, unknown>).ok !== "boolean"
        ) {
          fail(new EventPlaneError("service returned a malformed protocol response"));
          return;
        }
        const response = document as Record<string, unknown>;
        if (!response.ok) {
          const refusal = response.error;
          if (
            refusal === null || typeof refusal !== "object" || Array.isArray(refusal)
            || typeof (refusal as Record<string, unknown>).code !== "string"
            || typeof (refusal as Record<string, unknown>).message !== "string"
          ) {
            fail(new EventPlaneError("service returned a malformed refusal"));
            return;
          }
          const detail = refusal as Record<string, string>;
          fail(new EventPlaneError(detail.message, detail.code));
          return;
        }
        if (response.result === null || typeof response.result !== "object" || Array.isArray(response.result)) {
          fail(new EventPlaneError("service returned a non-object result"));
          return;
        }
        settled = true;
        resolve(response.result as JsonObject);
      });
    });
  }

  send(body: JsonObject) { return this.operation("send", body); }
  publish(body: JsonObject) { return this.operation("publish", body); }
  ensureSubscription(body: JsonObject) { return this.operation("ensure_subscription", body); }
  next(body: JsonObject) { return this.operation("next", body); }
  wait(body: JsonObject) {
    if (!("wait_ms" in body)) return Promise.reject(new EventPlaneError("wait requires an explicit wait_ms"));
    return this.operation("next", body);
  }
  acknowledge(body: JsonObject) { return this.operation("acknowledge", body); }
  retry(body: JsonObject) { return this.operation("retry", body); }
  block(body: JsonObject) { return this.operation("block", body); }
  disposition(body: JsonObject) { return this.operation("disposition", body); }
  status(body: JsonObject) { return this.operation("status", body); }
  inspect(body: JsonObject) { return this.operation("inspect", body); }
  backup(body: JsonObject) { return this.operation("backup", body); }
  restore(body: JsonObject) { return this.operation("restore", body); }
  shutdown(body: JsonObject) { return this.operation("shutdown", body); }
}
