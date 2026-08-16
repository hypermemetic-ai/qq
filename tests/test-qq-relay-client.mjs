import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [root, installRoot] = process.argv.slice(2);
const linked = await import(pathToFileURL(join(root, "bin/lib/qq-relay-client.mjs")));
const installed = await import(pathToFileURL(join(installRoot, "client.mjs")));
const resolution = await import(pathToFileURL(join(root, "bin/lib/qq-relay-install-root.mjs")));

for (const name of ["QQ_RELAY_PROTOCOL", "RelayClient", "RelayError", "canonicalRelayJson"]) {
  assert.equal(linked[name], installed[name], `${name} was not loaded from the installed qq-relay artifact`);
}
assert.equal(resolution.qqRelayInstallRoot({ QQ_RELAY_INSTALL_ROOT: installRoot }), installRoot);
assert.equal(
  resolution.qqRelayInstallRoot({ HOME: "/private/home" }),
  "/private/home/.local/lib/qq/relay",
);
assert.throws(
  () => resolution.qqRelayInstallRoot({ QQ_RELAY_INSTALL_ROOT: "relative" }),
  /QQ_RELAY_INSTALL_ROOT must be an absolute path/,
);
assert.equal(linked.QQ_RELAY_PROTOCOL, "qq-relay/v1");
assert.equal(linked.canonicalRelayJson({ z: 1, a: 2 }), '{"a":2,"z":1}');
assert.throws(() => new linked.RelayClient("relative.sock"), linked.RelayError);

console.log("test-qq-relay-client: pass");
