import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
const { default: register } = await import(pathToFileURL(join(root, "extensions/session-scrub.ts")));
const scratch = await mkdtemp(join(homedir(), "qq-session-scrub-test."));
const sessionsRoot = join(scratch, "sessions");
await mkdir(sessionsRoot, { recursive: true });
const sessionFile = (name) => join(sessionsRoot, name);
const ctx = (file, id) => ({
  sessionManager: { getSessionFile: () => file, getSessionId: () => id ?? "test-id" },
});

let stateCounter = 0;
async function makeHarness() {
  const tools = new Map();
  const events = new Map();
  const pi = {
    registerTool(value) { tools.set(value.name, value); },
    on(name, fn) { events.set(name, [...(events.get(name) ?? []), fn]); },
  };
  const stateRoot = join(scratch, `state-${stateCounter++}`);
  register(pi, { stateRoot, sessionsRoot });
  return {
    tools,
    events,
    stateRoot,
    markerPath: join(stateRoot, "marker.json"),
    ledgerPath: join(stateRoot, "ledger.jsonl"),
  };
}

async function writeMarker(h, sessionFileValue, sessionId) {
  await mkdir(h.stateRoot, { recursive: true });
  await writeFile(h.markerPath, `${JSON.stringify({
    sessionFile: sessionFileValue,
    sessionId,
    createdAt: new Date().toISOString(),
    mode: "full",
  })}\n`);
}

async function missing(path) {
  try {
    await lstat(path);
    return false;
  } catch {
    return true;
  }
}

try {
  {
    const h = await makeHarness();
    const tool = h.tools.get("mark_session_for_scrub");
    const res = await tool.execute("id", {}, undefined, undefined, ctx(sessionFile("a.jsonl"), "sess-a"));
    assert.match(res.content[0].text, /marked for durable scrub/);
    const marker = JSON.parse(await readFile(h.markerPath, "utf8"));
    assert.equal(marker.sessionFile, sessionFile("a.jsonl"));
    assert.equal(marker.sessionId, "sess-a");
  }

  {
    const h = await makeHarness();
    const prev = sessionFile("prev.jsonl");
    await writeFile(prev, '{"type":"session","id":"sess-prev"}\n{"type":"user","text":"sensitive"}\n');
    await writeMarker(h, prev, "sess-prev");
    await h.events.get("session_start")[0]({ reason: "new", previousSessionFile: prev }, ctx(sessionFile("current.jsonl"), "sess-cur"));
    assert.equal(await missing(prev), true);
    assert.match(await readFile(h.ledgerPath, "utf8"), /"sessionId":"sess-prev"/);
    assert.equal(await missing(h.markerPath), true);
  }

  {
    const h = await makeHarness();
    const prev = sessionFile("keep.jsonl");
    await writeFile(prev, "keep me\n");
    await writeMarker(h, prev, "sess-keep");
    const handler = h.events.get("session_start")[0];
    await handler({ reason: "startup", previousSessionFile: prev }, ctx(sessionFile("current.jsonl")));
    await handler({ reason: "reload", previousSessionFile: prev }, ctx(sessionFile("current.jsonl")));
    assert.equal(await missing(prev), false);
    assert.equal(await missing(h.markerPath), false);
  }

  {
    const h = await makeHarness();
    const prev = sessionFile("other.jsonl");
    await writeFile(prev, "other session\n");
    await writeMarker(h, sessionFile("vanished.jsonl"), "sess-gone");
    await h.events.get("session_start")[0]({ reason: "new", previousSessionFile: prev }, ctx(sessionFile("current.jsonl")));
    assert.equal(await missing(prev), false);
    assert.equal(await missing(h.markerPath), true);
  }

  {
    const h = await makeHarness();
    const prev = sessionFile("b.jsonl");
    const marked = sessionFile("a.jsonl");
    await writeFile(prev, "b\n");
    await writeFile(marked, "a\n");
    await writeMarker(h, marked, "sess-a");
    await h.events.get("session_start")[0]({ reason: "new", previousSessionFile: prev }, ctx(sessionFile("current.jsonl")));
    assert.equal(await missing(prev), false);
    assert.equal(await missing(h.markerPath), false);
  }

  {
    const h = await makeHarness();
    const real = sessionFile("real.jsonl");
    const link = sessionFile("link.jsonl");
    await writeFile(real, "real content\n");
    await symlink(real, link);
    await writeMarker(h, link, "sess-link");
    await h.events.get("session_start")[0]({ reason: "new", previousSessionFile: link }, ctx(sessionFile("current.jsonl")));
    assert.equal(await missing(link), false);
    assert.equal(await missing(real), false);
  }

  {
    const h = await makeHarness();
    const outside = join(scratch, "outside.jsonl");
    await writeFile(outside, "outside content\n");
    await writeMarker(h, outside, "sess-outside");
    await h.events.get("session_start")[0]({ reason: "new", previousSessionFile: outside }, ctx(sessionFile("current.jsonl")));
    assert.equal(await missing(outside), false);
  }

  {
    const h = await makeHarness();
    const live = sessionFile("live.jsonl");
    await writeFile(live, "live session\n");
    await writeMarker(h, live, "sess-live");
    await h.events.get("session_start")[0]({ reason: "new", previousSessionFile: live }, ctx(live, "sess-live"));
    assert.equal(await missing(live), false);
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}

console.log("test-session-scrub: pass");
