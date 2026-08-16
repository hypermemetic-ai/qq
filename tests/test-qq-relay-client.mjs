import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [root, source] = process.argv.slice(2);
const linked = await import(pathToFileURL(join(root, "bin/lib/qq-relay-client.mjs")));
const upstream = await import(pathToFileURL(join(source, "client.mjs")));

for (const name of ["QQ_RELAY_PROTOCOL", "RelayClient", "RelayError", "canonicalRelayJson"]) {
  assert.equal(linked[name], upstream[name], `${name} was not loaded from the configured qq-relay source`);
}
assert.equal(linked.QQ_RELAY_PROTOCOL, "qq-relay/v1");
assert.equal(linked.canonicalRelayJson({ z: 1, a: 2 }), '{"a":2,"z":1}');
assert.throws(() => new linked.RelayClient("relative.sock"), linked.RelayError);

console.log("test-qq-relay-client: pass");
