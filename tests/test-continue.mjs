import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
const { default: register } = await import(pathToFileURL(join(root, "extensions/continue.ts")));

let shortcut;
const sent = [];
register({
  registerShortcut(key, options) {
    assert.equal(shortcut, undefined, "extension registered more than one shortcut");
    shortcut = { key, ...options };
  },
  sendUserMessage(message) {
    sent.push(message);
  },
});

assert.equal(shortcut?.key, "shift+alt+enter");
assert.equal(shortcut?.description, 'Send "continue" when the agent is stopped');
shortcut.handler({ isIdle: () => false });
assert.deepEqual(sent, []);
shortcut.handler({ isIdle: () => true });
assert.deepEqual(sent, ["continue"]);

console.log("test-continue: pass");
