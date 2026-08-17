#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createConsoleHandler } from "../dsh-console/src/http-app.mjs";
import { createDshSessionBackend } from "../dsh-console/src/session-backend.mjs";

const root = resolve(process.argv[2] ?? ".");
const primaryId = "session-63a11000-0000-4000-8000-000000000001";
const secondaryId = "session-63a11000-0000-4000-8000-000000000002";
const states = new Map([
  [primaryId, { id: primaryId, events: [], createdAt: Date.UTC(2026, 7, 16, 12), turn: 0 }],
  [secondaryId, { id: secondaryId, events: [], createdAt: Date.UTC(2026, 7, 15, 12), turn: 0 }],
]);
const liveAgents = new Map();
const registrations = [];
const modelSelections = [];
let flushes = 0;
let resumes = 0;
let creates = 0;

function append(state, type, data, surfaceOp) {
  state.events.push({
    type,
    seq: state.events.length,
    time: Date.UTC(2026, 7, 16, 12, state.turn, state.events.length),
    data,
    ...(surfaceOp ? { surfaceOp } : {}),
  });
}

function fakeAgent(state) {
  let status = "idle";
  let timer;
  let settle;
  let activity = Promise.resolve();
  return {
    session: { id: state.id, events: state.events },
    get status() { return status; },
    followup(message) {
      assert.equal(status, "idle");
      state.turn += 1;
      status = "running";
      append(state, "turn/start", { turn: state.turn });
      append(state, "user/message", message, "append");
      activity = new Promise((resolveActivity) => {
        settle = resolveActivity;
        const delay = message.content[0].text.includes("interrupt") ? 5_000 : 180;
        timer = setTimeout(() => {
          append(state, "assistant/message", {
            turn: state.turn,
            step: 1,
            message: {
              id: `assistant-${state.id}-${state.turn}`,
              role: "assistant",
              source: { kind: "model", provider: "local", model: "proof" },
              content: [{ type: "text", text: `Durable reply ${state.turn}: ${message.content[0].text}` }],
            },
          }, "append");
          append(state, "turn/end", { turn: state.turn, reason: { kind: "completed" } });
          status = "idle";
          settle = undefined;
          resolveActivity();
        }, delay);
      });
    },
    cancel(cause) {
      assert.deepEqual(cause, { kind: "user" });
      if (status !== "running") return;
      clearTimeout(timer);
      append(state, "turn/end", { turn: state.turn, reason: { kind: "aborted", reason: cause } });
      status = "idle";
      const resolveActivity = settle;
      settle = undefined;
      resolveActivity?.();
    },
    whenIdle() { return activity; },
  };
}

const fakeAgentContext = {
  on(name) {
    registrations.push(name);
    return () => {};
  },
};
const services = {
  agents: {
    get: (id) => liveAgents.get(id),
    list: () => [...liveAgents.values()],
    async resume(options) {
      resumes += 1;
      modelSelections.push(options.agentOptions);
      const state = states.get(options.resumeSessionId);
      assert.ok(state, "only a persisted DSH identity may resume");
      assert.equal(options.setup(fakeAgentContext), undefined);
      const agent = fakeAgent(state);
      liveAgents.set(state.id, agent);
      return { agent };
    },
    async create(options) {
      creates += 1;
      modelSelections.push(options.agentOptions);
      let state = states.get(options.sessionId);
      if (!state) {
        state = {
          id: options.sessionId,
          events: [],
          createdAt: Date.UTC(2026, 7, 16, 13),
          turn: 0,
        };
        states.set(options.sessionId, state);
      }
      assert.equal(options.setup(fakeAgentContext), undefined);
      const agent = fakeAgent(state);
      liveAgents.set(state.id, agent);
      return { agent };
    },
  },
  sessions: {
    async flush(session) {
      assert.ok(states.has(session.id));
      flushes += 1;
    },
  },
  sessionPersistence: {
    async list() {
      return [...states.values()].map((state) => ({
        id: state.id,
        version: 0,
        createdAt: state.createdAt,
        cwd: root,
      }));
    },
  },
  loader: { async await() {} },
};
const backend = createDshSessionBackend(
  { get: (name) => services[name] },
  {
    sessionId: primaryId,
    cwd: root,
    provider: "qwen-token-plan",
    model: "deepseek-v4-pro-0813",
    reasoningEffort: "max",
  },
);
const server = createServer(createConsoleHandler(backend, { ssePollMs: 20 }));
await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const address = server.address();
assert.ok(address && typeof address !== "string");

function request(path, options = {}) {
  return new Promise((resolveRequest, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port: address.port,
        path,
        method: options.method ?? "GET",
        agent: false,
        headers: options.headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolveRequest({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        }));
      },
    );
    req.on("error", reject);
    req.end(options.body);
  });
}

function post(sessionId, action, fields = {}, extraHeaders = {}, htmx = true) {
  const body = new URLSearchParams(fields).toString();
  return request(`/qq/session/${sessionId}/${action}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "content-length": Buffer.byteLength(body),
      ...(htmx ? { "hx-request": "true" } : {}),
      ...extraHeaders,
    },
    body,
  });
}

function openSse(sessionId) {
  return new Promise((resolveOpen, rejectOpen) => {
    const messages = [];
    const waiters = new Set();
    let pending = "";
    let response;
    const req = httpRequest({
      host: "127.0.0.1",
      port: address.port,
      path: `/qq/session/${sessionId}/events`,
      method: "GET",
      agent: false,
      headers: { accept: "text/event-stream" },
    }, (res) => {
      response = res;
      assert.equal(res.statusCode, 200);
      assert.match(String(res.headers["content-type"]), /^text\/event-stream/);
      const notify = () => {
        for (const waiter of [...waiters]) {
          const found = messages.slice(waiter.after).find((message) => waiter.pattern.test(message));
          if (!found) continue;
          clearTimeout(waiter.timer);
          waiters.delete(waiter);
          waiter.resolve(found);
        }
      };
      res.on("data", (chunk) => {
        pending += chunk.toString("utf8").replaceAll("\r", "");
        let boundary;
        while ((boundary = pending.indexOf("\n\n")) >= 0) {
          const block = pending.slice(0, boundary);
          pending = pending.slice(boundary + 2);
          if (!block.startsWith("event: session\n")) continue;
          messages.push(block.split("\n").filter((line) => line.startsWith("data: ")).map((line) => line.slice(6)).join("\n"));
          notify();
        }
      });
      res.on("error", () => {});
      resolveOpen({
        checkpoint: () => messages.length,
        waitFor(pattern, after = 0, timeoutMs = 2_000) {
          const found = messages.slice(after).find((message) => pattern.test(message));
          if (found) return Promise.resolve(found);
          return new Promise((resolveWait, rejectWait) => {
            const waiter = { pattern, after, resolve: resolveWait };
            waiter.timer = setTimeout(() => {
              waiters.delete(waiter);
              rejectWait(new Error(`timed out waiting for SSE ${pattern}`));
            }, timeoutMs);
            waiters.add(waiter);
          });
        },
        close() {
          req.destroy();
          response?.destroy();
        },
      });
    });
    req.on("error", (error) => {
      if (error.code !== "ECONNRESET") rejectOpen(error);
    });
    req.end();
  });
}

const streams = [];
try {
  // Stable htmx/SSE lifecycle: the owner and target wrap inner-only fragments.
  const shortcut = await request("/qq", { headers: { cookie: "proof-client=home" } });
  assert.equal(shortcut.status, 308);
  assert.equal(shortcut.headers.location, "/qq/");
  const home = await request(shortcut.headers.location, { headers: { cookie: "proof-client=home" } });
  assert.equal(home.status, 200);
  assert.match(home.headers["cache-control"], /no-store/);
  assert.match(home.headers["content-security-policy"], /font-src 'self'/);
  assert.match(home.headers["content-security-policy"], /manifest-src 'self'/);
  assert.match(home.body, /^<!doctype html>/);
  assert.match(home.body, /interactive-widget=resizes-content/);
  assert.match(home.body, new RegExp(`id="console-stream"[^>]*hx-ext="sse"[^>]*sse-connect="/qq/session/${primaryId}/events"`));
  assert.match(home.body, /id="session-panel"[^>]*hx-ext="sse"[^>]*sse-swap="session"[^>]*hx-swap="innerHTML"/);
  assert.match(home.body, /htmx-2\.0\.10\.min\.js/);
  assert.match(home.body, /htmx-ext-sse-2\.2\.4\.js/);
  assert.match(home.body, /rel="manifest"/);
  assert.match(home.body, /console-v6\.css/);
  assert.match(home.body, /data-service-worker="\/qq\/sw-v7\.js"/);
  assert.match(home.body, new RegExp(`<option value="${secondaryId}"`));
  assert.match(home.body, /This DSH session has no transcript yet/);
  assert.match(home.body, /<details class="session-menu">[\s\S]*<summary aria-label="Show session controls">/);
  assert.doesNotMatch(home.body, /<details class="session-menu" open/);
  assert.match(home.body, /aria-label="Session controls"/);
  assert.match(home.body, /<select id="session-choice"[^>]*>[\s\S]*Current/);
  assert.match(home.body, /aria-label="Start a new durable DSH session"/);
  assert.match(home.body, /<textarea id="prompt"[^>]*rows="1"[^>]*enterkeyhint="send"/);
  assert.match(home.body, /<button id="composer-submit"[^>]*>Send<\/button>/);

  const stream = await openSse(primaryId);
  streams.push(stream);
  const initial = await stream.waitFor(/<form id="composer"/);
  assert.doesNotMatch(initial, /<section id="session-panel"/);

  // One browser receives two SSE inner swaps while its htmx send remains open.
  let mark = stream.checkpoint();
  const firstPostPromise = post(primaryId, "prompt", {
    prompt: "home handoff <script>alert(1)</script>",
  });
  const running = await stream.waitFor(/<form id="interrupt-form"/, mark);
  assert.match(running, /Running turn 1/);
  assert.doesNotMatch(running, /<form id="composer"/);
  mark = stream.checkpoint();
  const completed = await stream.waitFor(/Durable reply 1/, mark);
  assert.match(completed, /home handoff &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(completed, /<script>alert\(1\)<\/script>/);
  assert.match(completed, /class="message message-user"[^>]*aria-label="Your message at /);
  assert.match(completed, /class="message message-assistant"[^>]*aria-label="Assistant message at /);
  assert.doesNotMatch(completed, /<header>/);
  assert.match(completed, /<form id="composer"/);
  const firstPost = await firstPostPromise;
  assert.equal(firstPost.status, 200);
  assert.doesNotMatch(firstPost.body, /<!doctype html>|<section id="session-panel"/);

  // The interrupt form is inserted by SSE and invokes DSH Agent.cancel({kind:user}).
  mark = stream.checkpoint();
  const longPostPromise = post(primaryId, "prompt", { prompt: "please interrupt this turn" });
  await stream.waitFor(/<form id="interrupt-form"/, mark);
  const interrupted = await post(primaryId, "interrupt");
  assert.equal(interrupted.status, 200);
  assert.match(interrupted.body, /Interrupt requested for the running DSH turn/);
  assert.match(interrupted.body, /Last turn interrupted/);
  const longPost = await longPostPromise;
  assert.equal(longPost.status, 200);

  // Laptop and phone are sequential new requests over one canonical durable id.
  const laptop = await request(`/qq/session/${primaryId}`, { headers: { cookie: "proof-client=laptop" } });
  assert.match(laptop.body, /home handoff/);
  assert.match(laptop.body, /please interrupt this turn/);
  const laptopPost = await post(primaryId, "prompt", { prompt: "laptop handoff" }, {}, false);
  assert.equal(laptopPost.status, 303);
  assert.equal(laptopPost.headers.location, `/qq/session/${primaryId}`);
  const phone = await request(`/qq/session/${primaryId}`, {
    headers: { cookie: "proof-client=phone", "user-agent": "proof-phone/390x844" },
  });
  assert.match(phone.body, /home handoff/);
  assert.match(phone.body, /laptop handoff/);
  const phonePost = await post(
    primaryId,
    "prompt",
    { prompt: "phone handoff" },
    { origin: "null", "sec-fetch-site": "same-origin" },
  );
  assert.equal(phonePost.status, 200);
  const localAgain = await request(`/qq/session/${primaryId}`);
  for (const text of ["home handoff", "laptop handoff", "phone handoff"]) {
    assert.match(localAgain.body, new RegExp(text));
  }

  // The visible switcher validates a choice and opens its canonical identity.
  const switched = await request(`/qq/sessions/open?session=${encodeURIComponent(secondaryId)}`);
  assert.equal(switched.status, 303);
  assert.equal(switched.headers.location, `/qq/session/${secondaryId}`);
  const selected = await request(switched.headers.location);
  assert.equal(selected.status, 200);
  assert.match(selected.body, new RegExp(`<code>${secondaryId}</code>`));
  assert.match(selected.body, new RegExp(`<option value="${secondaryId}" selected>Current`));
  const secondaryPost = await post(secondaryId, "prompt", { prompt: "selected durable session" });
  assert.equal(secondaryPost.status, 200);
  assert.match(secondaryPost.body, /selected durable session/);
  const unknown = await request("/qq/session/session-63a11000-0000-4000-8000-000000000099");
  assert.equal(unknown.status, 404);

  // New session crosses DSH creation and flush before canonical navigation.
  const createdResponse = await request("/qq/sessions", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "content-length": "0",
    },
    body: "",
  });
  assert.equal(createdResponse.status, 303);
  assert.match(createdResponse.headers.location, /^\/qq\/session\/session-[0-9a-f-]{36}$/);
  const freshId = createdResponse.headers.location.split("/").at(-1);
  const fresh = await request(createdResponse.headers.location);
  assert.equal(fresh.status, 200);
  assert.match(fresh.body, new RegExp(`<option value="${freshId}" selected>Current`));
  assert.match(fresh.body, /This DSH session has no transcript yet/);

  // Mutations fail same-origin checks on the server; there is no browser lease.
  const rejected = await post(primaryId, "prompt", { prompt: "rejected" }, {
    origin: "https://attacker.invalid",
    host: `127.0.0.1:${address.port}`,
  });
  assert.equal(rejected.status, 200, "htmx errors are safely rendered into the stable target");
  assert.match(rejected.body, /Cross-origin form submission refused/);
  assert.doesNotMatch(localAgain.body, /rejected/);

  // Verbose runtime context and tool rows disclose on demand rather than
  // displacing the live conversation and composer. Durable provider failures
  // get an actionable, escaped summary without exposing raw diagnostics.
  append(states.get(primaryId), "user/message", {
    id: "context-mobile-proof",
    role: "user",
    source: { kind: "plugin", plugin: "agent-instructions" },
    content: [{ type: "text", text: "A very long instruction snapshot" }],
  }, "append");
  append(states.get(primaryId), "turn/end", {
    turn: states.get(primaryId).turn,
    reason: {
      kind: "error",
      error: { code: "INVALID_REQUEST", message: "provider secret <unsafe>" },
    },
  });
  const compactFailure = await request(`/qq/session/${primaryId}`);
  assert.match(compactFailure.body, /<details class="message message-context"[^>]*>[\s\S]*<summary>/);
  assert.doesNotMatch(compactFailure.body, /<details class="message message-context"[^>]* open/);
  assert.match(compactFailure.body, /The selected model route rejected this request/);
  assert.match(compactFailure.body, /<code>INVALID_REQUEST<\/code>/);
  assert.doesNotMatch(compactFailure.body, /provider secret|&lt;unsafe&gt;/);

  assert.equal(resumes, 2, "each selected persisted DSH session resumes once");
  assert.equal(creates, 1, "only the explicit New session action creates an identity");
  assert.ok(flushes >= 7, "creation, accepted prompts, and interruption cross DSH flush boundaries");
  assert.deepEqual(
    registrations,
    [
      "system-prompt/assemble", "agent/request",
      "system-prompt/assemble", "agent/request",
      "system-prompt/assemble", "agent/request",
    ],
  );
  assert.deepEqual(modelSelections, [
    { provider: "qwen-token-plan", model: "deepseek-v4-pro-0813" },
    { provider: "qwen-token-plan", model: "deepseek-v4-pro-0813" },
    { provider: "qwen-token-plan", model: "deepseek-v4-pro-0813" },
  ]);

  // Installable PWA boundary caches presentation only and leaves data network-only.
  const manifestResponse = await request("/qq/assets/manifest-v3.webmanifest");
  assert.equal(manifestResponse.status, 200);
  assert.match(manifestResponse.headers["cache-control"], /no-store/);
  const manifest = JSON.parse(manifestResponse.body);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.name, "qq");
  assert.equal(manifest.short_name, "qq");
  assert.equal(manifest.id, "/qq/");
  assert.equal(manifest.start_url, "/qq/");
  assert.equal(manifest.scope, "/qq/");
  assert.deepEqual(manifest.icons.map((icon) => icon.sizes), ["192x192", "512x512"]);

  const worker = await request("/qq/sw-v7.js");
  assert.equal(worker.status, 200);
  assert.equal(worker.headers["service-worker-allowed"], "/qq/");
  assert.match(worker.body, /request\.method !== "GET"/);
  assert.match(worker.body, /request\.mode === "navigate"/);
  assert.match(worker.body, /console-v6\.css/);
  assert.match(worker.body, /reconnect-v1\.js/);
  assert.match(worker.body, /geist-latin-wght-normal-5\.3\.0\.woff2/);
  assert.match(worker.body, /geist-latin-wght-italic-5\.3\.0\.woff2/);
  assert.match(worker.body, /offline-v6\.html/);
  assert.match(worker.body, /self\.skipWaiting\(\)/);
  assert.match(worker.body, /name\.startsWith\(CACHE_PREFIX\) && name !== CACHE_NAME/);
  assert.doesNotMatch(worker.body, /session\/|\/prompt|\/events|\/interrupt|backgroundsync|indexedDB|localStorage/i);
  const offline = await request("/qq/assets/offline-v6.html");
  assert.match(offline.body, /No transcript is cached and no message can be sent offline/);
  assert.match(offline.body, /console-v6\.css/);
  assert.match(offline.body, /reconnect-v1\.js/);
  const staticCss = await request("/qq/assets/console-v6.css");
  assert.match(staticCss.headers["cache-control"], /immutable/);
  assert.match(staticCss.body, /@font-face/);
  assert.match(staticCss.body, /font-family: "Geist UI"/);
  assert.match(staticCss.body, /geist-latin-wght-normal-5\.3\.0\.woff2/);
  assert.match(staticCss.body, /geist-latin-wght-italic-5\.3\.0\.woff2/);
  const normalFont = await request("/qq/assets/geist-latin-wght-normal-5.3.0.woff2");
  assert.equal(normalFont.headers["content-type"], "font/woff2");
  assert.match(normalFont.headers["cache-control"], /immutable/);
  const italicFont = await request("/qq/assets/geist-latin-wght-italic-5.3.0.woff2");
  assert.equal(italicFont.headers["content-type"], "font/woff2");
  assert.match(italicFont.headers["cache-control"], /immutable/);

  // Vendored pins and negative architecture constraints are machine checked.
  const [pins, consoleEvidence, dshPins, plugin, patch, workbench, modelCompat, browser, workerSource, renderSource] = await Promise.all([
    readFile(join(root, "dsh-console/vendor-pins.json"), "utf8").then(JSON.parse),
    readFile(join(root, "dsh-console/evidence.json"), "utf8").then(JSON.parse),
    readFile(join(root, "compat/pi2dsh/pins.json"), "utf8").then(JSON.parse),
    readFile(join(root, "dsh-console/src/plugin.mjs"), "utf8"),
    readFile(join(root, "dsh-console/cordis.patch.yml"), "utf8"),
    readFile(join(root, "bin/qq-dsh-workbench"), "utf8"),
    readFile(join(root, "compat/pi2dsh/toolchain/qq-dsh-model-compat.mjs"), "utf8"),
    readFile(join(root, "dsh-console/assets/browser-v3.js"), "utf8"),
    readFile(join(root, "dsh-console/assets/sw-v7.js"), "utf8"),
    readFile(join(root, "dsh-console/src/render.mjs"), "utf8"),
  ]);
  assert.equal(pins.schema, "qq.dsh-console-vendor-pins/v1");
  assert.equal(consoleEvidence.schema, "qq.dsh-console-evidence/v2");
  assert.deepEqual(consoleEvidence.dsh_pin, {
    package: dshPins.dsh.package,
    version: dshPins.dsh.version,
    revision: dshPins.dsh.revision,
  });
  assert.equal(consoleEvidence.scope.model, "sequential-single-page-handoff");
  assert.equal(consoleEvidence.scope.controller_lease, false);
  assert.equal(consoleEvidence.hypermedia.sse_activated, true);
  assert.equal(consoleEvidence.pwa.network_only.includes("SSE"), true);
  assert.equal(consoleEvidence.cutover_or_runtime_replacement_performed, false);
  for (const artifact of pins.artifacts) {
    const content = await readFile(join(root, "dsh-console", artifact.file));
    assert.equal(createHash("sha256").update(content).digest("hex"), artifact.sha256);
    assert.match(artifact.npmIntegrity, /^sha512-/);
  }
  assert.match(patch, /host: 127\.0\.0\.1/);
  assert.match(patch, /provider:.*qwen-token-plan/);
  assert.match(patch, /model:.*deepseek-v4-pro-0813/);
  assert.match(patch, /id: deepseek-v4-pro-0813[\s\S]*supportsDeveloperRole: false/);
  assert.match(patch, /apiKeyEnv: QWEN_TOKEN_PLAN_API_KEY/);
  assert.match(workbench, /--import.*qq-dsh-model-compat\.mjs/);
  assert.match(modelCompat, /QWEN_TOKEN_PLAN_MODELS\[model\][\s\S]*supportsDeveloperRole: false/);
  assert.match(plugin, /refusing a non-loopback web server/);
  assert.match(workbench, /state_root.*qq\/dsh-workbench/);
  assert.match(workbench, /qq-console\.session/);
  assert.doesNotMatch(`${plugin}\n${patch}\n${workbench}`, /qq\.patch\.yml|name:.*pi2dsh|plugin.*pi2dsh|auth\.json/);
  assert.doesNotMatch(`${plugin}\n${patch}`, /name:.*(?:dsh-web-app|api-proxy|client-connection)/);
  assert.match(browser, /transcript\.scrollTop = transcript\.scrollHeight/);
  assert.doesNotMatch(browser, /localStorage|sessionStorage|indexedDB|document\.cookie|EventSource|WebSocket|htmx\.process/);
  assert.doesNotMatch(renderSource, /outerHTML|controller|observer|lease|take control/i);
  assert.doesNotMatch(workerSource, /addEventListener\("(?:sync|periodicsync|push|notificationclick)"|indexedDB|localStorage/i);
} finally {
  for (const stream of streams) stream.close();
  server.closeAllConnections?.();
  await new Promise((resolveClose) => server.close(resolveClose));
}

console.log("test-dsh-console: pass");
