#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-service-class-extension"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
EXTENSION="$ROOT/delegation/extensions/qq-service-class.ts"
FAST_EXTENSION="$ROOT/extensions/qq-codex-fast.ts"

[ -f "$EXTENSION" ] || fail "missing delegate service-class extension: $EXTENSION"
[ -f "$FAST_EXTENSION" ] || fail "missing ordinary Pi Fast-mode extension: $FAST_EXTENSION"
command -v node >/dev/null 2>&1 || fail 'node is required to test the service-class extension'

node --experimental-strip-types --input-type=module - "$EXTENSION" <<'JS'
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const [extensionPath] = process.argv.slice(2);
const { default: register } = await import(pathToFileURL(extensionPath));

function handlerFor(env) {
  let handler;
  register({
    on(name, candidate) {
      assert.equal(name, "before_provider_request");
      assert.equal(handler, undefined);
      handler = candidate;
    },
  }, env);
  assert.equal(typeof handler, "function");
  return handler;
}

const responsesPayload = {
  model: "gpt-5.6-sol",
  input: [{ role: "user", content: "test" }],
  stream: true,
  store: false,
};
for (const serviceClass of ["auto", "default", "flex", "priority"]) {
  const original = structuredClone(responsesPayload);
  const result = handlerFor({ QQ_DELEGATE_SERVICE_CLASS: serviceClass })(
    { type: "before_provider_request", payload: original },
    {},
  );
  assert.deepEqual(result, { ...responsesPayload, service_tier: serviceClass });
  assert.deepEqual(original, responsesPayload, `${serviceClass} mutated the stock payload`);
}

const anthropicPayload = {
  model: "claude-test",
  messages: [{ role: "user", content: "test" }],
  max_tokens: 1024,
  stream: true,
};
const messagesWithInput = { ...anthropicPayload, input: [] };
const unsupportedPayloads = [
  anthropicPayload,
  messagesWithInput,
  { model: "gpt-test", input: "text", stream: true },
  { model: "gpt-test", input: [], stream: false },
  null,
  ["not", "a", "payload"],
];
for (const payload of unsupportedPayloads) {
  const result = handlerFor({ QQ_DELEGATE_SERVICE_CLASS: "priority" })(
    { type: "before_provider_request", payload },
    {},
  );
  assert.equal(result, undefined, `unsupported payload was replaced: ${JSON.stringify(payload)}`);
}

for (const env of [
  {},
  { QQ_DELEGATE_SERVICE_CLASS: "provider-default" },
  { QQ_DELEGATE_SERVICE_CLASS: "invalid" },
  { OPENAI_SERVICE_TIER: "priority" },
]) {
  const result = handlerFor(env)({ type: "before_provider_request", payload: responsesPayload }, {});
  assert.equal(result, undefined, `default or unrelated environment changed payload: ${JSON.stringify(env)}`);
}

console.log("test-qq-service-class-extension: pass");
JS

node --experimental-strip-types --input-type=module - "$FAST_EXTENSION" <<'JS'
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const [extensionPath] = process.argv.slice(2);
const { default: register } = await import(pathToFileURL(extensionPath));
let handler;
register({
  on(name, candidate) {
    assert.equal(name, "before_provider_request");
    handler = candidate;
  },
});

const payload = {
  model: "gpt-5.6-sol",
  input: [{ role: "user", content: "test" }],
  stream: true,
};
assert.deepEqual(
  handler({ type: "before_provider_request", payload }, {}),
  { ...payload, service_tier: "priority" },
);
assert.equal(
  handler({ type: "before_provider_request", payload: { ...payload, model: "gpt-5.5" } }, {}),
  undefined,
);
assert.equal(
  handler({ type: "before_provider_request", payload: { ...payload, service_tier: "default" } }, {}),
  undefined,
);
assert.equal(
  handler({ type: "before_provider_request", payload: { model: "gpt-5.6-sol", messages: [], stream: true } }, {}),
  undefined,
);

console.log("test-qq-codex-fast-extension: pass");
JS
