import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
const module = await import(pathToFileURL(join(root, "extensions/agent-messages.ts")));

const first = "019ff7b9-2fcd-78cd-bc16-c770a9ccff11";
const second = "019ff7ad-2cba-75a9-adc2-c15a0a92d6a9";
assert.equal(module.planeAgentId(first), `agents/${first}`);

const now = Date.now();
const valid = {
  schema: "qq.agent-presence/v2", version: 2, session_id: first,
  project: "deciq", role: "runner", tasks: ["A-90", "T-12"], pane: "w1:p2",
  updated_at: now, expires_at: now + 30_000,
};
assert.deepEqual(module.validPresence(valid, now)?.tasks, ["A-90", "T-12"]);
assert.deepEqual(module.normalizeTasks("T-12, T-18, T-12"), ["T-12", "T-18"]);
assert.equal(module.validPresence({ ...valid, expires_at: now }, now), undefined);
assert.equal(module.validPresence({ ...valid, role: "architect" }, now)?.role, "architect");
assert.equal(module.validPresence({ ...valid, role: "observer" }, now), undefined, "an unreal role was accepted");

const directory = await mkdtemp(join(homedir(), "agent-presence-test."));
try {
  await mkdir(join(directory, "presence"), { mode: 0o700 });
  await writeFile(join(directory, "presence", "one.json"), JSON.stringify(valid), { mode: 0o600 });
  await writeFile(join(directory, "presence", "two.json"), JSON.stringify({ ...valid, session_id: second, tasks: [], pane: null }), { mode: 0o600 });
  await writeFile(join(directory, "presence", "expired.json"), JSON.stringify({ ...valid, session_id: "019ff733-8c3b-78a9-a37f-db33d42bddb9", project: "qq", role: "runner", expires_at: now - 1 }), { mode: 0o600 });
  assert.equal((await module.listPresence(join(directory, "presence"), {}, now)).length, 2);
  assert.equal((await module.listPresence(join(directory, "presence"), { task: "A-90" }, now)).length, 1);
} finally { await rm(directory, { recursive: true, force: true }); }

const record = {
  event_id: "evt_test", accepted_at: now, recipient_id: module.planeAgentId(first),
  envelope: { payload: { schema: "qq.agent-message/v2", message: {
    from: second, project: "deciq", role: "runner", tasks: [], pane: null,
    content: "hello", delivery: "immediate",
  } } },
};
assert.equal(module.parseMessage(record)?.delivery, "immediate");
assert.equal(module.parseMessage({ ...record, envelope: { payload: { ...record.envelope.payload, message: { ...record.envelope.payload.message, role: "observer" } } } }), undefined);
assert.equal(module.parseMessage({ ...record, envelope: { payload: { ...record.envelope.payload, message: { ...record.envelope.payload.message, delivery: "urgent" } } } }), undefined);
assert.equal(module.statusName({ obligations: [{ status: "pending" }] }), "queued");
assert.equal(module.statusName({ obligations: [{ status: "in_flight" }] }), "delivering");
assert.equal(module.statusName({ obligations: [{ status: "acknowledged" }] }), "delivered");
assert.equal(module.statusName({ obligations: [{ status: "blocked" }] }), "blocked");
assert.equal(module.statusName({ obligations: [{ status: "expired" }] }), "expired");
assert.equal(module.statusName({ obligations: [{ status: "abandoned" }] }), "failed");

console.log("test-agent-messages: pass");
