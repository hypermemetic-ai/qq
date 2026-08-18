#!/usr/bin/env node
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
const lib = await import(pathToFileURL(join(root, "bin/lib/frontend-design-loop.mjs")));
const httpApp = await import(pathToFileURL(join(root, "qq-ui/src/http-app.mjs")));
const qqSession = await import(pathToFileURL(join(root, "qq/src/session.mjs")));
const extension = await import(pathToFileURL(join(root, "extensions/frontend-design-loop.ts")));
const indexSource = await readFile(join(root, "extensions/index.ts"), "utf8");
const template = await readFile(join(root, ".pi/prompts/frontend-design-loop.md"), "utf8");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

assert.deepEqual(pkg.pi, { extensions: ["extensions/index.ts"] });
assert.equal(pkg.skills, undefined);
assert.match(indexSource, /registerFrontendDesignLoop\(pi\)/);
assert.match(template, /^---\ndescription: /m);
assert.match(template, /argument-hint: "\[defect\]"/);
assert.match(template, /design_loop_start/);
assert.match(template, /Patch only these/);
assert.match(template, /\/frontend-design-loop/);
assert.doesNotMatch(template, /this skill/i);

assert.equal(lib.parseLiveFlag(["--live"], {}), true);
assert.equal(lib.parseLiveFlag([], { QQ_DESIGN_LOOP_LIVE: "1" }), true);
assert.equal(lib.parseLiveFlag([], {}), false);
assert.equal(lib.sanitizeLabel("before"), "before");
assert.equal(lib.sanitizeLabel("  ", "current"), "current");
assert.throws(() => lib.sanitizeLabel("../etc"), /1-64 characters/);
assert.equal(lib.BROWSER_SESSION, "frontend-design-loop");
assert.deepEqual(lib.VIEWPORTS.desktop, { width: 1280, height: 800 });
assert.deepEqual(lib.VIEWPORTS.phone, { width: 412, height: 915 });
assert.deepEqual(lib.VIEWPORTS.short, { width: 412, height: 520 });

const liveCss = httpApp.resolveAsset("console-v8.css", true);
assert.equal(liveCss.live, true);
assert.match(liveCss.body.toString("utf8"), /@font-face/);
const bakedCss = httpApp.resolveAsset("console-v8.css", false);
assert.equal(bakedCss.live, false);
assert.equal(httpApp.resolveAsset("sw-v10.js", true).live, false);
assert.equal(httpApp.internals.LIVE_ASSET_FILES["console-v8.css"], "assets/console.css");

const backend = {
  defaultSessionId: "session-63a11000-0000-4000-8000-000000000021",
  async list() { return [{ id: this.defaultSessionId, createdAt: 1 }]; },
  async read(id) { return { id, events: [], agentStatus: "idle" }; },
  async create() { return { id: this.defaultSessionId }; },
  async prompt() {},
  async interrupt() { return false; },
};

const observed = qqSession.attachObserve(backend, { intervalMs: 20 });
const liveServer = createServer(httpApp.createConsoleHandler(observed, { liveAssets: true, ssePollMs: 20 }));
await new Promise((resolveListen) => liveServer.listen(0, "127.0.0.1", resolveListen));
const livePort = liveServer.address().port;
const cssPath = join(root, "qq-ui/assets/console.css");
const originalCss = await readFile(cssPath);
try {
  const first = await fetch(`http://127.0.0.1:${livePort}/qq/assets/console-v8.css`);
  assert.equal(first.status, 200);
  assert.match(first.headers.get("cache-control"), /no-store/);
  assert.match(await first.text(), /@font-face/);
  await writeFile(cssPath, `${originalCss}\n/* design-loop-live-proof */\n`);
  const second = await fetch(`http://127.0.0.1:${livePort}/qq/assets/console-v8.css`);
  assert.match(await second.text(), /design-loop-live-proof/);
} finally {
  await writeFile(cssPath, originalCss);
  liveServer.closeAllConnections?.();
  await new Promise((resolveClose) => liveServer.close(resolveClose));
}

const bakedServer = createServer(httpApp.createConsoleHandler(observed, { ssePollMs: 20 }));
await new Promise((resolveListen) => bakedServer.listen(0, "127.0.0.1", resolveListen));
try {
  const baked = await fetch(`http://127.0.0.1:${bakedServer.address().port}/qq/assets/console-v8.css`);
  assert.match(baked.headers.get("cache-control"), /immutable/);
} finally {
  bakedServer.closeAllConnections?.();
  await new Promise((resolveClose) => bakedServer.close(resolveClose));
}

const temporary = await mkdtemp(join(tmpdir(), "qq-design-loop-"));
const env = { HOME: temporary, XDG_STATE_HOME: join(temporary, "state") };
try {
  assert.equal(lib.stateRoot(env), join(temporary, "state", "qq", "frontend-design-loop"));
  assert.equal(lib.shotsDir("before", env), join(temporary, "state", "qq", "frontend-design-loop", "shots", "before"));

  const registrations = [];
  const started = { pid: 4242, origin: "http://127.0.0.1:9", sessionId: lib.PRIMARY_SESSION_ID, sessionUrl: "http://127.0.0.1:9/qq/session/x", live: true };
  const calls = [];
  extension.default({
    registerTool(tool) { registrations.push(tool); },
  }, {
    env,
    async startFixture(options) {
      calls.push(["start", options.live]);
      return started;
    },
    async captureShots(options) {
      calls.push(["capture", options.label, options.short]);
      return { label: options.label ?? "current", shots: { desktop: "/tmp/d.png", phone: "/tmp/p.png" } };
    },
    async measureBoxes(options) {
      calls.push(["measure", options.selectors]);
      return { boxes: { "#composer": "1x1" }, styles: { "#composer": "display:flex" } };
    },
    async seedPrompt(options) {
      calls.push(["seed", options.prompt]);
      return { sessionId: started.sessionId, status: 200 };
    },
    async stopLoop() {
      calls.push(["stop"]);
      return { fixture: "signaled", browser: "closed", origin: started.origin };
    },
  });
  assert.deepEqual(registrations.map((tool) => tool.name), [
    "design_loop_start",
    "design_loop_capture",
    "design_loop_measure",
    "design_loop_seed",
    "design_loop_stop",
  ]);

  const byName = Object.fromEntries(registrations.map((tool) => [tool.name, tool]));
  const startedOut = await byName.design_loop_start.execute("x", {}, undefined, undefined, { cwd: root });
  assert.match(startedOut.content[0].text, /listening at http:\/\/127.0.0.1:9/);
  const captured = await byName.design_loop_capture.execute("x", { label: "before", short: true });
  assert.match(captured.content[0].text, /Captured before/);
  const measured = await byName.design_loop_measure.execute("x", { selectors: ["#composer"] });
  assert.equal(measured.details.boxes["#composer"], "1x1");
  const seeded = await byName.design_loop_seed.execute("x", { prompt: "hello" });
  assert.match(seeded.content[0].text, /Seeded /);
  const stopped = await byName.design_loop_stop.execute();
  assert.match(stopped.content[0].text, /fixture signaled/);
  assert.deepEqual(calls, [
    ["start", true],
    ["capture", "before", true],
    ["measure", ["#composer"]],
    ["seed", "hello"],
    ["stop"],
  ]);
} finally {
  await rm(temporary, { recursive: true, force: true });
}

console.log("test-frontend-design-loop: pass");
