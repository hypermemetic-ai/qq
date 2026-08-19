#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createConsoleHandler } from "../qq-ui/src/http-app.mjs";
import { createQqService } from "../qq/src/session.mjs";
import { renderMarkdownText, renderMessageText } from "../qq-ui/src/markdown.mjs";
import { renderLoginSheet, renderOfferPopup, renderSessionContent } from "../qq-ui/src/render.mjs";

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
const backend = createQqService(
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

function openSse(sessionId, port = address.port) {
  return new Promise((resolveOpen, rejectOpen) => {
    const messages = [];
    const waiters = new Set();
    let pending = "";
    let response;
    const req = httpRequest({
      host: "127.0.0.1",
      port,
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

{
  const literal = renderMessageText("# line1\n`line2`");
  assert.match(literal, /class="message-text"/);
  assert.doesNotMatch(literal, /message-markdown|<h1>|<code>/);
  assert.match(literal, /# line1\n`line2`/);

  const markdown = renderMarkdownText([
    "**Working directory**",
    "",
    "Paragraph with *emphasis*, ~~deleted~~, `inline`, and [safe](https://example.com).",
    "",
    "<script>alert(1)</script>",
    "",
    "[script](javascript:alert(1)) [relative](/settings) [mail](mailto:dev@example.com)",
    "",
    "![diagram](https://example.com/secure.png)",
    "",
    "```js",
    "const answer = 42",
    "```",
  ].join("\n"));
  assert.match(markdown, /class="message-text message-markdown"/);
  assert.match(markdown, /<strong>Working directory<\/strong>/);
  assert.match(markdown, /<em>emphasis<\/em>/);
  assert.match(markdown, /<del>deleted<\/del>/);
  assert.match(markdown, /<code>inline<\/code>/);
  assert.match(markdown, /<a href="https:\/\/example.com" target="_blank" rel="noopener noreferrer">safe<\/a>/);
  assert.match(markdown, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(markdown, /<script>/);
  assert.match(markdown, /<p>script relative <a href="mailto:dev@example.com">mail<\/a><\/p>/);
  assert.doesNotMatch(markdown, /javascript:alert|<img |href="\/settings"/);
  assert.match(markdown, /<p>diagram<\/p>/);
  assert.match(markdown, /<pre><code class="language-js">const answer = 42<\/code><\/pre>/);

  const started = Date.now();
  const emptyHeading = renderMarkdownText("# ");
  assert.ok(Date.now() - started < 250);
  assert.match(emptyHeading, /<p># <\/p>/);
  assert.doesNotMatch(emptyHeading, /<h1>/);
  for (const line of ["## ", "#\t", "   # "]) {
    const html = renderMarkdownText(line);
    assert.match(html, /<p>/);
    assert.doesNotMatch(html, /<h[1-6]>/);
  }

  const blocks = renderMarkdownText([
    "# Heading",
    "",
    "> quoted *text*",
    "",
    "- bullet",
    "1. numbered",
    "",
    "---",
  ].join("\n"));
  assert.match(blocks, /<h1>Heading<\/h1>/);
  assert.match(blocks, /<blockquote><p>quoted <em>text<\/em><\/p><\/blockquote>/);
  assert.match(blocks, /<ul><li>bullet<\/li><\/ul>/);
  assert.match(blocks, /<ol><li>numbered<\/li><\/ol>/);
  assert.match(blocks, /<hr>/);
}

{
  const liveId = "session-63a11000-0000-4000-8000-0000000000aa";
  const durableId = "session-63a11000-0000-4000-8000-0000000000bb";
  const paths = {
    canonical: `/qq/session/${liveId}`,
    events: `/qq/session/${liveId}/events`,
    interrupt: `/qq/session/${liveId}/interrupt`,
    prompt: `/qq/session/${liveId}/prompt`,
    offer: `/qq/session/${liveId}/offer`,
    createSession: "/qq/sessions",
    switchSession: "/qq/sessions/open",
  };
  const html = renderSessionContent({
    id: liveId,
    alias: "12",
    events: [],
    agentStatus: "idle",
    sessions: [
      { id: liveId, alias: "12", createdAt: Date.UTC(2026, 7, 16, 12) },
      { id: durableId, createdAt: Date.UTC(2026, 7, 15, 12) },
    ],
  }, paths);
  assert.match(html, /<code>12<\/code>/);
  assert.doesNotMatch(html, new RegExp(`<code>${liveId}</code>`));
  assert.match(html, new RegExp(`<option value="${liveId}" selected>Current · 12</option>`));
  assert.match(html, new RegExp(`<option value="${durableId}">2026-08-15</option>`));
  const durableLabel = html.match(new RegExp(`<option value="${durableId}">([^<]*)</option>`))[1];
  assert.doesNotMatch(durableLabel, /session-/);
  assert.match(html, new RegExp(`hx-push-url="/qq/session/${liveId}"`));
  assert.match(html, new RegExp(`data-session-id="${liveId}"`));

  const dated = renderSessionContent({
    id: liveId,
    events: [],
    sessions: [{ id: liveId, createdAt: Date.UTC(2026, 7, 16, 12) }],
  }, paths);
  assert.match(dated, /<code>2026-08-16<\/code>/);
  assert.match(dated, new RegExp(`<option value="${liveId}" selected>Current · 2026-08-16</option>`));
  assert.doesNotMatch(dated, new RegExp(`<code>${liveId}</code>`));
  assert.match(dated, new RegExp(`hx-push-url="/qq/session/${liveId}"`));

  const undealt = renderSessionContent({ id: liveId, events: [] }, paths);
  assert.match(undealt, /<code>durable<\/code>/);
  assert.doesNotMatch(undealt, new RegExp(`<code>${liveId}</code>`));
  assert.doesNotMatch(undealt, /offer-popup/);

  const offered = renderSessionContent({
    id: liveId,
    events: [],
    offer: {
      id: "offer-1",
      title: "Ship leftover",
      brief: "Compile the leftover and start run.",
      runnerBrief: "Return address: session parent",
    },
  }, paths);
  assert.match(offered, /class="offer-popup"/);
  assert.match(offered, /role="dialog"/);
  assert.match(offered, /Ship leftover/);
  assert.match(offered, /Compile the leftover and start run/);
  assert.match(offered, /For the runner/);
  assert.match(offered, /Return address: session parent/);
  assert.match(offered, /name="choice" value="handoff">Hand off/);
  assert.match(offered, /name="choice" value="bank">Bank/);
  assert.match(offered, /name="choice" value="ignore">Ignore/);
  assert.match(offered, new RegExp(`hx-post="/qq/session/${liveId}/offer"`));
  const popup = renderOfferPopup({
    id: "offer-1",
    title: "Ship leftover",
    brief: "Compile the leftover and start run.",
  }, paths);
  assert.match(popup, /class="offer-popup"/);
  assert.doesNotMatch(popup, /For the runner/);
  assert.doesNotMatch(popup, /class="notice"/);
  assert.equal(renderOfferPopup(null, paths), "");
  const loginSheet = renderLoginSheet({
    action: "login",
    connectors: [
      { id: "grok", label: "Grok" },
      { id: "codex", label: "Codex" },
      { id: "qwen", label: "Qwen", hostOwned: true },
    ],
  }, { prompt: `/qq/session/${liveId}/prompt` });
  assert.match(loginSheet, /class="offer-popup login-popup"/);
  assert.match(loginSheet, /data-connector="grok"/);
  assert.match(loginSheet, /data-connector="codex"/);
  assert.match(loginSheet, /data-connector="qwen"/);
  assert.match(loginSheet, /value="\/login grok"/);
  assert.doesNotMatch(loginSheet, /Hand off|Ready leftover|offer-handoff/);
  assert.equal(renderLoginSheet({ connectors: [] }, paths), "");
  const refusedPopup = renderOfferPopup({
    id: "offer-1",
    title: "Ship leftover",
    brief: "Compile the leftover and start run.",
  }, paths, "bank requires qq-tasks");
  assert.match(refusedPopup, /class="notice" role="alert">bank requires qq-tasks/);
  assert.match(refusedPopup, /name="choice" value="handoff">Hand off/);
  assert.match(refusedPopup, /name="choice" value="bank">Bank/);
  assert.match(refusedPopup, /name="choice" value="ignore">Ignore/);
  const noticeAt = refusedPopup.indexOf('class="notice"');
  const actionsAt = refusedPopup.indexOf('class="offer-actions"');
  assert.ok(noticeAt >= 0 && actionsAt > noticeAt);
  const refusedOffer = renderSessionContent({
    id: liveId,
    events: [],
    offer: {
      id: "offer-1",
      title: "Ship leftover",
      brief: "Compile the leftover and start run.",
    },
  }, paths, "bank requires qq-tasks");
  assert.match(refusedOffer, /class="offer-popup"[\s\S]*class="notice" role="alert">bank requires qq-tasks<\/p>[\s\S]*class="offer-actions"/);
  assert.equal([...refusedOffer.matchAll(/class="notice"/g)].length, 2);
}

{
  const pending = {
    id: "offer-http",
    title: "Ship leftover",
    brief: "Operator brief for the leftover.",
    runnerBrief: "Return address: session parent",
  };
  let lastChoice = "";
  const offerServer = createServer(createConsoleHandler(backend, {
    ssePollMs: 20,
    offerFor: async (id) => (id === primaryId ? pending : null),
    chooseOffer: async (_id, choice) => {
      lastChoice = choice;
      if (choice === "bank") {
        return { status: "refused", reason: "bank requires qq-tasks" };
      }
      pending.id = "";
      pending.brief = "";
      return { status: "ok", action: choice };
    },
  }));
  await new Promise((resolveListen) => offerServer.listen(0, "127.0.0.1", resolveListen));
  const offerPort = offerServer.address().port;
  try {
    const page = await new Promise((resolveRequest, reject) => {
      const req = httpRequest({
        host: "127.0.0.1",
        port: offerPort,
        path: `/qq/session/${primaryId}`,
        method: "GET",
        agent: false,
      }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolveRequest({
          status: res.statusCode,
          body: Buffer.concat(chunks).toString("utf8"),
        }));
      });
      req.on("error", reject);
      req.end();
    });
    assert.equal(page.status, 200);
    assert.match(page.body, /class="offer-popup"/);
    assert.match(page.body, /Hand off/);
    assert.match(page.body, /Bank/);
    assert.match(page.body, /Ignore/);
    const stream = await openSse(primaryId, offerPort);
    try {
      // The production console always reads offers; its SSE shows them as they appear.
      const appeared = await stream.waitFor(/offer-popup/);
      assert.match(appeared, /<form class="offer-actions"/);
      assert.match(appeared, /name="choice" value="handoff"/);
      const bankBody = new URLSearchParams({ choice: "bank" }).toString();
      const refused = await new Promise((resolveRequest, reject) => {
        const req = httpRequest({
          host: "127.0.0.1",
          port: offerPort,
          path: `/qq/session/${primaryId}/offer`,
          method: "POST",
          agent: false,
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "content-length": Buffer.byteLength(bankBody),
            "hx-request": "true",
            "sec-fetch-site": "same-origin",
          },
        }, (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => resolveRequest({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
          }));
        });
        req.on("error", reject);
        req.end(bankBody);
      });
      assert.equal(refused.status, 200);
      assert.equal(lastChoice, "bank");
      assert.match(refused.body, /class="offer-popup"[\s\S]*class="notice" role="alert">bank requires qq-tasks<\/p>[\s\S]*class="offer-actions"/);
      assert.match(refused.body, /name="choice" value="handoff">Hand off/);
      assert.match(refused.body, /name="choice" value="bank">Bank/);
      assert.match(refused.body, /name="choice" value="ignore">Ignore/);
      const mark = stream.checkpoint();
      const body = new URLSearchParams({ choice: "ignore" }).toString();
      const ignored = await new Promise((resolveRequest, reject) => {
        const req = httpRequest({
          host: "127.0.0.1",
          port: offerPort,
          path: `/qq/session/${primaryId}/offer`,
          method: "POST",
          agent: false,
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "content-length": Buffer.byteLength(body),
            "hx-request": "true",
            "sec-fetch-site": "same-origin",
          },
        }, (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => resolveRequest({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
          }));
        });
        req.on("error", reject);
        req.end(body);
      });
      assert.equal(ignored.status, 200);
      assert.equal(lastChoice, "ignore");
      assert.doesNotMatch(ignored.body, /offer-popup/);
      const cleared = await stream.waitFor(/<form id="composer"/, mark);
      assert.doesNotMatch(cleared, /offer-popup/);
    } finally {
      stream.close();
    }
  } finally {
    offerServer.closeAllConnections?.();
    await new Promise((resolveClose) => offerServer.close(resolveClose));
  }
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
  assert.match(home.body, /console-v10\.css/);
  assert.doesNotMatch(home.body, /console-v9\.css/);
  assert.match(home.body, /browser-v4\.js/);
  assert.match(home.body, /data-service-worker="\/qq\/sw-v10\.js"/);
  assert.match(home.body, /<code>\d+<\/code>/);
  assert.doesNotMatch(home.body, new RegExp(`<code>${primaryId}</code>`));
  assert.match(home.body, new RegExp(`<option value="${primaryId}" selected>Current · \\d+</option>`));
  assert.match(home.body, new RegExp(`<option value="${secondaryId}">2026-08-15</option>`));
  assert.match(home.body, new RegExp(`<option value="${secondaryId}"`));
  assert.match(home.body, new RegExp(`hx-push-url="/qq/session/${primaryId}"`));
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
  assert.match(completed, /<article class="message message-user"[^>]*>\s*<div class="message-text">home handoff/);
  assert.match(completed, /class="message message-assistant"[^>]*aria-label="Assistant message at /);
  assert.match(completed, /<article class="message message-assistant"[^>]*>\s*<div class="message-text message-markdown">/);
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
  assert.match(selected.body, /<code>\d+<\/code>/);
  assert.doesNotMatch(selected.body, new RegExp(`<code>${secondaryId}</code>`));
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

  append(states.get(primaryId), "user/message", {
    id: "user-markdown-literal",
    role: "user",
    source: { kind: "user" },
    content: [{ type: "text", text: "**Working directory** <b>raw</b>" }],
  }, "append");
  append(states.get(primaryId), "assistant/message", {
    turn: states.get(primaryId).turn,
    step: 2,
    message: {
      id: "assistant-markdown-safe",
      role: "assistant",
      source: { kind: "model", provider: "local", model: "proof" },
      content: [{
        type: "text",
        text: [
          "**Working directory**",
          "",
          "See [docs](https://example.com) and [bad](javascript:alert(1)).",
          "",
          "<img src=x onerror=alert(1)>",
        ].join("\n"),
      }],
    },
  }, "append");
  const markdownPage = await request(`/qq/session/${primaryId}`);
  assert.match(markdownPage.body, /<article class="message message-user"[^>]*>\s*<div class="message-text">\*\*Working directory\*\* &lt;b&gt;raw&lt;\/b&gt;<\/div>/);
  assert.match(markdownPage.body, /<article class="message message-assistant"[^>]*>\s*<div class="message-text message-markdown">/);
  assert.match(markdownPage.body, /<strong>Working directory<\/strong>/);
  assert.match(markdownPage.body, /<a href="https:\/\/example.com" target="_blank" rel="noopener noreferrer">docs<\/a>/);
  assert.match(markdownPage.body, /See <a href="https:\/\/example.com" target="_blank" rel="noopener noreferrer">docs<\/a> and bad\./);
  assert.match(markdownPage.body, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(markdownPage.body, /<img src=x|<script>|javascript:alert/);

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

  const worker = await request("/qq/sw-v10.js");
  assert.equal(worker.status, 200);
  assert.equal(worker.headers["service-worker-allowed"], "/qq/");
  assert.match(worker.body, /request\.method !== "GET"/);
  assert.match(worker.body, /request\.mode === "navigate"/);
  assert.match(worker.body, /console-v8\.css/);
  assert.match(worker.body, /console-v9\.css/);
  assert.match(worker.body, /console-v10\.css/);
  assert.match(worker.body, /browser-v4\.js/);
  assert.match(worker.body, /reconnect-v1\.js/);
  assert.match(worker.body, /geist-latin-wght-normal-5\.3\.0\.woff2/);
  assert.match(worker.body, /geist-latin-wght-italic-5\.3\.0\.woff2/);
  assert.match(worker.body, /offline-v8\.html/);
  assert.match(worker.body, /self\.skipWaiting\(\)/);
  assert.match(worker.body, /CACHE_PREFIX = "qq-static-"/);
  assert.match(worker.body, /LEGACY_CACHE_PREFIX = "qq-dsh-console-static-"/);
  assert.match(worker.body, /name\.startsWith\(CACHE_PREFIX\) \|\| name\.startsWith\(LEGACY_CACHE_PREFIX\)/);
  assert.doesNotMatch(worker.body, /session\/|\/prompt|\/events|\/interrupt|backgroundsync|indexedDB|localStorage/i);
  const offline = await request("/qq/assets/offline-v8.html");
  assert.match(offline.body, /No transcript is cached and no message can be sent offline/);
  assert.match(offline.body, /console-v8\.css/);
  assert.match(offline.body, /reconnect-v1\.js/);
  const staticCss = await request("/qq/assets/console-v10.css");
  assert.match(staticCss.headers["cache-control"], /immutable/);
  assert.match(staticCss.body, /@font-face/);
  assert.match(staticCss.body, /font-family: "Geist UI"/);
  assert.match(staticCss.body, /geist-latin-wght-normal-5\.3\.0\.woff2/);
  assert.match(staticCss.body, /geist-latin-wght-italic-5\.3\.0\.woff2/);
  assert.match(staticCss.body, /\.message \{\s*width: 100%;/);
  assert.match(staticCss.body, /\.message-markdown/);
  assert.match(staticCss.body, /\.message-markdown a \{/);
  assert.match(staticCss.body, /\.composer textarea \{[\s\S]*max-height: 12rem;[\s\S]*overflow-y: auto;[\s\S]*resize: none;/);
  assert.match(staticCss.body, /\.offer-popup/);
  assert.match(staticCss.body, /\.offer-handoff/);
  assert.doesNotMatch(staticCss.body, /align-self:\s*flex-end/);
  assert.doesNotMatch(staticCss.body, /min\(88%/);
  const normalFont = await request("/qq/assets/geist-latin-wght-normal-5.3.0.woff2");
  assert.equal(normalFont.headers["content-type"], "font/woff2");
  assert.match(normalFont.headers["cache-control"], /immutable/);
  const italicFont = await request("/qq/assets/geist-latin-wght-italic-5.3.0.woff2");
  assert.equal(italicFont.headers["content-type"], "font/woff2");
  assert.match(italicFont.headers["cache-control"], /immutable/);

  // Vendored pins and negative architecture constraints are machine checked.
  const [pins, hostEvidence, dshPins, dshPkg, dshLock, qqPlugin, uiPlugin, relayPlugin, relaySession, workflowsPlugin, qqSession, qqPkg, uiPkg, relayPkg, workflowsPkg, patch, launcher, modelCompat, browser, workerSource, renderSource] = await Promise.all([
    readFile(join(root, "qq-ui/vendor-pins.json"), "utf8").then(JSON.parse),
    readFile(join(root, "qq/evidence.json"), "utf8").then(JSON.parse),
    readFile(join(root, "dsh/pins.json"), "utf8").then(JSON.parse),
    readFile(join(root, "dsh/package.json"), "utf8").then(JSON.parse),
    readFile(join(root, "dsh/package-lock.json"), "utf8").then(JSON.parse),
    readFile(join(root, "qq/src/plugin.mjs"), "utf8"),
    readFile(join(root, "qq-ui/src/plugin.mjs"), "utf8"),
    readFile(join(root, "qq-relay/src/plugin.mjs"), "utf8"),
    readFile(join(root, "qq-relay/src/relay.mjs"), "utf8"),
    readFile(join(root, "qq-workflows/src/plugin.mjs"), "utf8"),
    readFile(join(root, "qq/src/session.mjs"), "utf8"),
    readFile(join(root, "qq/package.json"), "utf8").then(JSON.parse),
    readFile(join(root, "qq-ui/package.json"), "utf8").then(JSON.parse),
    readFile(join(root, "qq-relay/package.json"), "utf8").then(JSON.parse),
    readFile(join(root, "qq-workflows/package.json"), "utf8").then(JSON.parse),
    readFile(join(root, "qq/host.patch.yml"), "utf8"),
    readFile(join(root, "bin/qq"), "utf8"),
    readFile(join(root, "dsh/qq-dsh-model-compat.mjs"), "utf8"),
    readFile(join(root, "qq-ui/assets/browser-v4.js"), "utf8"),
    readFile(join(root, "qq-ui/assets/sw-v10.js"), "utf8"),
    readFile(join(root, "qq-ui/src/render.mjs"), "utf8"),
  ]);
  assert.equal(pins.schema, "qq.dsh-console-vendor-pins/v1");
  assert.equal(hostEvidence.schema, "qq.host-evidence/v1");
  assert.equal(dshPins.schema, "qq.dsh-pins/v1");
  assert.equal(dshPins.dsh.package, "@deepseek-ai/dsh");
  assert.equal(dshPins.dsh.version, "0.1.0-rc.7");
  assert.equal(dshPkg.dependencies["@deepseek-ai/dsh"], dshPins.dsh.version);
  assert.equal(dshLock.packages["node_modules/@deepseek-ai/dsh"]?.version, dshPins.dsh.version);
  assert.equal(dshLock.packages["node_modules/@deepseek-ai/dsh"]?.integrity, dshPins.dsh.integrity);
  assert.deepEqual(hostEvidence.dsh_pin, {
    package: dshPins.dsh.package,
    version: dshPins.dsh.version,
    revision: dshPins.dsh.revision,
  });
  assert.equal(hostEvidence.scope.model, "sequential-single-page-handoff");
  assert.equal(hostEvidence.scope.controller_lease, false);
  assert.equal(hostEvidence.hypermedia.sse_activated, true);
  assert.equal(hostEvidence.pwa.network_only.includes("SSE"), true);
  assert.equal(hostEvidence.cutover_or_runtime_replacement_performed, false);
  for (const artifact of pins.artifacts) {
    const content = await readFile(join(root, "qq-ui", artifact.file));
    assert.equal(createHash("sha256").update(content).digest("hex"), artifact.sha256);
    assert.match(artifact.npmIntegrity, /^sha512-/);
  }
  assert.match(patch, /host: 127\.0\.0\.1/);
  assert.match(patch, /provider:.*qwen-token-plan/);
  assert.match(patch, /model:.*deepseek-v4-pro-0813/);
  assert.match(patch, /id: deepseek-v4-pro-0813[\s\S]*supportsDeveloperRole: false/);
  assert.match(patch, /apiKeyEnv: QWEN_TOKEN_PLAN_API_KEY/);
  assert.match(launcher, /--import.*qq-dsh-model-compat\.mjs/);
  assert.match(modelCompat, /QWEN_TOKEN_PLAN_MODELS\[model\][\s\S]*supportsDeveloperRole: false/);
  assert.equal(qqPkg.name, "@hypermemetic-ai/qq");
  assert.equal(uiPkg.name, "@hypermemetic-ai/qq-ui");
  assert.equal(relayPkg.name, "@hypermemetic-ai/qq-relay");
  assert.equal(workflowsPkg.name, "@hypermemetic-ai/qq-workflows");
  assert.equal(uiPkg.dependencies["@hypermemetic-ai/qq"], "file:../qq");
  assert.equal(qqPkg.dependencies?.["@hypermemetic-ai/qq-ui"], undefined);
  assert.equal(relayPkg.dependencies?.["@hypermemetic-ai/qq"], undefined);
  assert.equal(qqPkg.dependencies?.["@hypermemetic-ai/qq-relay"], undefined);
  assert.equal(workflowsPkg.dependencies?.["@hypermemetic-ai/qq"], undefined);
  assert.match(patch, /name: '@hypermemetic-ai\/qq'/);
  assert.match(patch, /name: '@hypermemetic-ai\/qq-ui'/);
  assert.match(patch, /name: '@hypermemetic-ai\/qq-relay'[\s\S]*inject: \[agents, sessions\]/);
  assert.match(patch, /name: '@hypermemetic-ai\/qq-workflows'[\s\S]*inject: \[agents, sessions\]/);
  assert.match(patch, /id: compaction-basic[\s\S]*auto: false/);
  assert.match(launcher, /qq-\*\/package\.json/);
  assert.match(launcher, /QQ_PORT=\$\{QQ_PORT:-3082\}/);
  assert.doesNotMatch(launcher, /QQ_DSH_CONSOLE_PORT|QQ_UI_PORT|QQ_WEBSERVER_PORT|qq-dictation/);
  assert.match(launcher, /QQ_DSH_HAVE_UI/);
  assert.match(launcher, /QQ_DSH_HAVE_RELAY/);
  assert.match(launcher, /QQ_DSH_HAVE_WORKFLOWS/);
  assert.match(patch, /QQ_PORT \?\? 3082/);
  assert.doesNotMatch(patch, /QQ_DSH_CONSOLE_PORT|QQ_UI_PORT|QQ_WEBSERVER_PORT/);
  assert.match(patch, /QQ_DSH_HAVE_UI/);
  assert.match(patch, /QQ_DSH_HAVE_RELAY/);
  assert.match(patch, /QQ_DSH_HAVE_WORKFLOWS/);
  assert.equal(qqPkg.files?.includes("host.patch.yml"), false);
  assert.match(relayPlugin, /ctx\.provide\("qq-relay", service\)/);
  assert.match(workflowsPlugin, /ctx\.provide\("qq-workflows", service\)/);
  assert.doesNotMatch(workflowsPlugin, /from "\.\.\/qq"|run_workflow|dsh-tool-workflow|ctx\.compaction/);
  assert.doesNotMatch(relayPlugin, /from "\.\.\/qq"|qq-relay-install-root|qq-relay-client/);
  assert.doesNotMatch(relaySession, /node:(child_process|net)|createServer|qq-relay-install-root|qq-relay-client/);
  assert.match(patch, /inject: \[qq, webServer\]/);
  assert.match(uiPlugin, /refusing a non-loopback web server/);
  assert.match(uiPlugin, /inject = \["qq", "webServer"\]/);
  assert.match(qqPlugin, /provide = "qq"/);
  assert.match(qqPlugin, /inject = \["agents", "sessions", "sessionPersistence"\]/);
  assert.doesNotMatch(qqSession, /<!doctype html>|htmx|text\/css|EventSource/);
  assert.doesNotMatch(uiPlugin, /agents\.create|sessionPersistence|followup|Agent\.cancel/);
  assert.match(launcher, /QQ_DSH_HOME:-\$\{DSH_HOME:-"\$state_root\/qq"\}/);
  assert.match(launcher, /\$\{HOME:\?qq: HOME is required\}/);
  assert.match(launcher, /profiles\/qq\/package\.json/);
  assert.match(launcher, /--profile qq --patch "\$root\/qq\/host\.patch\.yml"/);
  assert.match(launcher, /state_root\/qq/);
  assert.match(launcher, /qq\.session/);
  assert.doesNotMatch(`${patch}\n${launcher}`, /qq-dsh-workbench|qq-console|dsh-console|workbench/);
  assert.doesNotMatch(patch, /qq-models|QQ_DSH_HAVE_MODELS/);
  assert.doesNotMatch(launcher, /QQ_DSH_HAVE_MODELS/);
  assert.doesNotMatch(`${qqPlugin}\n${uiPlugin}\n${patch}\n${launcher}`, /qq\.patch\.yml|name:.*pi2dsh|plugin.*pi2dsh|auth\.json/);
  assert.doesNotMatch(`${qqPlugin}\n${uiPlugin}\n${patch}`, /name:.*(?:dsh-web-app|api-proxy|client-connection)/);
  assert.match(browser, /transcript\.scrollTop = transcript\.scrollHeight/);
  assert.match(browser, /input\.style\.height = `\$\{input\.scrollHeight \+ input\.offsetHeight - input\.clientHeight\}px`/);
  assert.doesNotMatch(browser, /localStorage|sessionStorage|indexedDB|document\.cookie|EventSource|WebSocket|htmx\.process/);
  assert.doesNotMatch(renderSource, /outerHTML|controller|observer|lease|take control/i);
  assert.doesNotMatch(workerSource, /addEventListener\("(?:sync|periodicsync|push|notificationclick)"|indexedDB|localStorage/i);
} finally {
  for (const stream of streams) stream.close();
  server.closeAllConnections?.();
  await new Promise((resolveClose) => server.close(resolveClose));
}

console.log("test-qq-host: pass");
