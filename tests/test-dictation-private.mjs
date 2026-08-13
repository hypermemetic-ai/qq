import assert from "node:assert/strict";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  rename as fsRename,
  symlink,
  writeFile,
  mkdtemp,
  rm,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
const scratch = await mkdtemp(join(homedir(), "qq-dictation-private-test."));
const { default: register } = await import(pathToFileURL(join(root, "extensions/dictation-private.ts")));
const savedEnvironment = new Map(
  ["HERDR_PANE_ID", "XDG_STATE_HOME", "HOME"].map((name) => [name, process.env[name]]),
);

function setEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function restoreEnvironment() {
  for (const [name, value] of savedEnvironment) setEnvironment(name, value);
}

function context(sessionId = "test-session") {
  return { sessionManager: { getSessionId: () => sessionId } };
}

function resultText(result) {
  assert.equal(result.content?.length, 1, "tool returns one content item");
  assert.equal(result.content[0].type, "text", "tool returns text content");
  return result.content[0].text;
}

async function missing(path) {
  try {
    await lstat(path);
    return false;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
}

async function fileMode(path) {
  return (await lstat(path)).mode & 0o777;
}

let harnessCounter = 0;
async function makeHarness(options = {}) {
  const tools = [];
  const events = new Map();
  const pi = {
    registerTool(tool) { tools.push(tool); },
    on(name, handler) { events.set(name, [...(events.get(name) ?? []), handler]); },
  };
  const stateRoot = options.stateRoot ?? join(scratch, `state-${harnessCounter++}`);
  const deps = { ...(options.deps ?? {}) };
  if (options.useDefaultRoot !== true) deps.stateRoot = stateRoot;
  await register(pi, deps);
  assert.equal(tools.length, 1, "extension registers exactly one tool");
  assert.equal(events.get("session_start")?.length, 1, "extension registers one session_start handler");
  return {
    tool: tools[0],
    sessionStart: events.get("session_start")[0],
    stateRoot,
  };
}

async function invoke(tool, action, ctx = context()) {
  return tool.execute("call-id", { action }, undefined, undefined, ctx);
}

function validMark(paneId, sessionId, createdAt = "2026-08-10T12:34:56.000Z") {
  return { version: 1, paneId, sessionId, createdAt };
}

async function putMark(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const text = typeof value === "string" ? value : `${JSON.stringify(value)}\n`;
  await writeFile(path, text, { mode: 0o600 });
  return text;
}

try {
  // Registration, strict schema, atomic happy path, permissions, and transitions.
  {
    const paneId = "wA0:pZ9";
    setEnvironment("HERDR_PANE_ID", paneId);
    const root = join(scratch, "happy-state");
    await mkdir(root, { recursive: true, mode: 0o777 });
    await chmod(root, 0o777);
    const observed = {};
    const h = await makeHarness({
      stateRoot: root,
      deps: {
        async rename(from, to) {
          observed.from = from;
          observed.to = to;
          observed.mode = await fileMode(from);
          observed.payload = await readFile(from, "utf8");
          await fsRename(from, to);
        },
      },
    });
    const tool = h.tool;
    assert.equal(tool.name, "mark_session_dictation_private");
    assert.match(tool.description, /privacy keyword/i, "description maps the privacy keyword");
    assert.match(tool.description, /mark_session_dictation_private/, "description names the tool to call");
    assert.match(tool.description, /mark_session_for_scrub/, "description preserves the scrub mental model");
    assert.deepEqual(tool.parameters, {
      type: "object",
      additionalProperties: false,
      properties: { action: { type: "string", enum: ["mark", "unmark", "status"] } },
      required: ["action"],
    });

    const malformedArgs = await tool.execute(
      "call-id",
      { action: "mark", extra: true },
      undefined,
      undefined,
      context("must-not-write"),
    );
    assert.match(resultText(malformedArgs), /refused/i, "runtime also refuses extra arguments");
    assert.deepEqual(await readdir(root), [], "invalid direct invocation writes nothing");

    const marked = await invoke(tool, "mark", context("session-alpha"));
    assert.match(resultText(marked), /private and local-only until \/new/i);
    const expectedPath = join(root, `${paneId}.json`);
    assert.equal(observed.to, expectedPath, "atomic rename targets the exact pane filename");
    assert.equal(dirname(observed.from), root, "temporary file is inside the injected mark directory");
    assert.match(observed.from, /\.tmp$/, "atomic rename starts from a temporary file");
    assert.notEqual(observed.from, expectedPath, "temporary and final paths differ");
    assert.equal(observed.mode, 0o600, "temporary file is private before rename");
    assert.equal(await missing(observed.from), true, "temporary name is absent after successful rename");
    assert.equal(await fileMode(root), 0o700, "pre-existing broad mark directory was tightened");
    assert.equal(await fileMode(expectedPath), 0o600, "final mark is mode 0600");
    assert.deepEqual(await readdir(root), [`${paneId}.json`], "success leaves only the exact mark filename");

    const raw = await readFile(expectedPath, "utf8");
    assert.equal(raw, observed.payload, "final mark is the exact atomically-renamed payload");
    const payload = JSON.parse(raw);
    assert.deepEqual(
      Object.keys(payload),
      ["version", "paneId", "sessionId", "createdAt"],
      "mark has exactly the four contract fields",
    );
    assert.equal(payload.version, 1);
    assert.equal(typeof payload.version, "number");
    assert.equal(payload.paneId, paneId);
    assert.equal(payload.sessionId, "session-alpha");
    assert.equal(typeof payload.createdAt, "string");
    assert.equal(Number.isNaN(Date.parse(payload.createdAt)), false, "createdAt is parseable");

    const statusMarked = resultText(await invoke(tool, "status"));
    assert.match(statusMarked, /is marked/);
    assert.match(statusMarked, /session-alpha/);
    assert.match(statusMarked, new RegExp(payload.createdAt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    assert.match(resultText(await invoke(tool, "unmark")), /mark removed/i);
    assert.equal(await missing(expectedPath), true, "unmark removes the own-pane mark");
    assert.match(resultText(await invoke(tool, "status")), /is unmarked/);
    assert.match(resultText(await invoke(tool, "unmark")), /already absent/i, "unmark is idempotent");
  }

  // Only reason=new cleans this pane: matching is kept, mismatched/malformed is
  // cleared, and a foreign pane's mark is never touched.
  {
    const paneId = "w3:p4";
    const otherPane = "w3:p5";
    setEnvironment("HERDR_PANE_ID", paneId);
    const h = await makeHarness();
    const ownPath = join(h.stateRoot, `${paneId}.json`);
    const otherPath = join(h.stateRoot, `${otherPane}.json`);
    const otherRaw = await putMark(otherPath, validMark(otherPane, "foreign-session"));

    await putMark(ownPath, validMark(paneId, "old-session"));
    for (const reason of ["startup", "reload", "resume", "fork"]) {
      await h.sessionStart({ reason }, context("new-session"));
      assert.equal(await missing(ownPath), false, `${reason} does nothing`);
    }

    await putMark(ownPath, validMark(paneId, "new-session"));
    await h.sessionStart({ reason: "new" }, context("new-session"));
    assert.equal(await missing(ownPath), false, "matching current session mark is kept");

    await putMark(ownPath, validMark(paneId, "old-session"));
    await h.sessionStart({ reason: "new" }, context("new-session"));
    assert.equal(await missing(ownPath), true, "different session id clears own-pane mark");
    assert.equal(await readFile(otherPath, "utf8"), otherRaw, "foreign-pane mark remains byte-for-byte untouched");

    await putMark(ownPath, "{malformed\n");
    await h.sessionStart({ reason: "new" }, context("new-session"));
    assert.equal(await missing(ownPath), true, "malformed own-pane mark is cleared on new");
    assert.equal(await readFile(otherPath, "utf8"), otherRaw, "foreign mark remains after malformed cleanup");
  }

  // A symlinked injected root is refused, proving the root itself cannot redirect
  // any operation outside the configured confinement boundary.
  {
    const paneId = "w5:p7";
    setEnvironment("HERDR_PANE_ID", paneId);
    const outsideRoot = join(scratch, "outside-root");
    const linkedRoot = join(scratch, "linked-root");
    await mkdir(outsideRoot, { recursive: true });
    const outsideMark = join(outsideRoot, `${paneId}.json`);
    const outsideRaw = await putMark(outsideMark, validMark(paneId, "outside-session"));
    await symlink(outsideRoot, linkedRoot, "dir");
    const h = await makeHarness({ stateRoot: linkedRoot });

    assert.match(resultText(await invoke(h.tool, "status")), /refused.*directory is a symbolic link/i);
    assert.match(resultText(await invoke(h.tool, "mark", context("new-session"))), /refused.*directory is a symbolic link/i);
    assert.match(resultText(await invoke(h.tool, "unmark")), /refused.*directory is a symbolic link/i);
    await h.sessionStart({ reason: "new" }, context("new-session"));
    assert.equal(await readFile(outsideMark, "utf8"), outsideRaw, "symlinked root never mutates outside mark");
    assert.equal((await lstat(linkedRoot)).isSymbolicLink(), true, "root link itself remains untouched");
  }

  // An atomic rename failure is reported, leaves no successful-looking mark,
  // and cleans the already-created private temporary file.
  {
    const paneId = "w6:p8";
    setEnvironment("HERDR_PANE_ID", paneId);
    let observedTemporary;
    const h = await makeHarness({
      deps: {
        async rename(from, to) {
          observedTemporary = { from, to, mode: await fileMode(from) };
          throw new Error("injected rename failure");
        },
      },
    });
    const result = resultText(await invoke(h.tool, "mark", context("session-fail")));
    assert.match(result, /refused.*injected rename failure/i);
    assert.equal(observedTemporary.mode, 0o600, "failed atomic write used a private temporary file");
    assert.equal(observedTemporary.to, join(h.stateRoot, `${paneId}.json`));
    assert.equal(await missing(observedTemporary.from), true, "failed write removes temporary file");
    assert.equal(await missing(observedTemporary.to), true, "failed write leaves no final mark");
    assert.deepEqual(await readdir(h.stateRoot), [], "failed write leaves no stray state file");
  }

  // Same-mark operations are serialized: an unmark started during the atomic
  // mark window runs afterwards, rather than racing and leaving a late mark.
  {
    const paneId = "w7:p9";
    setEnvironment("HERDR_PANE_ID", paneId);
    let releaseRename;
    let announceRename;
    const renameGate = new Promise((resolveGate) => { releaseRename = resolveGate; });
    const renameEntered = new Promise((resolveEntered) => { announceRename = resolveEntered; });
    const h = await makeHarness({
      deps: {
        async rename(from, to) {
          announceRename();
          await renameGate;
          await fsRename(from, to);
        },
      },
    });
    const marking = invoke(h.tool, "mark", context("session-race"));
    await renameEntered;
    const unmarking = invoke(h.tool, "unmark");
    releaseRename();
    assert.match(resultText(await marking), /local-only/i);
    assert.match(resultText(await unmarking), /mark removed/i);
    assert.equal(await missing(join(h.stateRoot, `${paneId}.json`)), true, "serialized unmark wins after mark");
    assert.deepEqual(await readdir(h.stateRoot), [], "interleaving leaves no temporary file");
  }

  console.log("test-dictation-private: pass");
} finally {
  restoreEnvironment();
  await rm(scratch, { recursive: true, force: true });
}
