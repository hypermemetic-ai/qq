import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
const module = await import(pathToFileURL(join(root, "extensions/agent-messages.ts")));

const first = module.sessionAgentId("deciq", "architect", "session-one");
const second = module.sessionAgentId("deciq", "architect", "session-two");
assert.match(first, /^agents\/deciq\/architect-[a-f0-9]{10}$/);
assert.notEqual(first, second);
assert.equal(first, module.sessionAgentId("deciq", "architect", "session-one"));

const now = Date.now();
const valid = {
  schema: "qq.agent-presence/v1", version: 1, agent_id: first,
  project: "deciq", role: "architect", ticket: "A-90", pane: "w1:p2",
  updated_at: now, expires_at: now + 30_000,
};
assert.equal(module.validPresence(valid, now)?.ticket, "A-90");
assert.equal(module.validPresence({ ...valid, expires_at: now }, now), undefined);

const directory = await mkdtemp(join(homedir(), "agent-presence-test."));
try {
  await mkdir(join(directory, "presence"), { mode: 0o700 });
  await writeFile(join(directory, "presence", "one.json"), JSON.stringify(valid), { mode: 0o600 });
  await writeFile(join(directory, "presence", "two.json"), JSON.stringify({ ...valid, agent_id: second, ticket: null, pane: null }), { mode: 0o600 });
  await writeFile(join(directory, "presence", "expired.json"), JSON.stringify({ ...valid, agent_id: module.sessionAgentId("qq", "runner", "old"), project: "qq", role: "runner", expires_at: now - 1 }), { mode: 0o600 });
  assert.equal((await module.listPresence(join(directory, "presence"), {}, now)).length, 2);
  assert.equal((await module.listPresence(join(directory, "presence"), { ticket: "A-90" }, now)).length, 1);
} finally { await rm(directory, { recursive: true, force: true }); }

const record = {
  event_id: "evt_test", accepted_at: now, recipient_id: first,
  envelope: { payload: { schema: "qq.agent-message/v1", message: {
    from: second, project: "deciq", role: "architect", ticket: null, pane: null,
    content: "hello", delivery: "immediate",
  } } },
};
assert.equal(module.parseMessage(record)?.delivery, "immediate");
assert.equal(module.parseMessage({ ...record, envelope: { payload: { ...record.envelope.payload, message: { ...record.envelope.payload.message, delivery: "urgent" } } } }), undefined);
assert.equal(module.statusName({ obligations: [{ status: "pending" }] }), "queued");
assert.equal(module.statusName({ obligations: [{ status: "in_flight" }] }), "delivering");
assert.equal(module.statusName({ obligations: [{ status: "acknowledged" }] }), "delivered");
assert.equal(module.statusName({ obligations: [{ status: "blocked" }] }), "blocked");
assert.equal(module.statusName({ obligations: [{ status: "expired" }] }), "expired");
assert.equal(module.statusName({ obligations: [{ status: "abandoned" }] }), "failed");

console.log("test-agent-messages: pass");
