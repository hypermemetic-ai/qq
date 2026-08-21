#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import vm from "node:vm";
import { createConsoleHandler, createRootRedirectHandler, internals as httpInternals } from "../qq-ui/src/http-app.mjs";
import { attachObserve, createQqService } from "../qq/src/session.mjs";
import { renderMarkdownText, renderMessageText } from "../qq-ui/src/markdown.mjs";
import { renderLoginSheet, renderOfferPopup, renderOverlay, renderProgressChip, renderSessionContent } from "../qq-ui/src/render.mjs";
import { makeProjectsHome } from "./qq-projects-fixture.mjs";
import { runQqPwaBrowserProof } from "./qq-pwa-browser-proof.mjs";

const root = resolve(process.argv[2] ?? ".");
const projects = makeProjectsHome("qq");
const projectCwd = projects.cwd;
const projectName = projects.name;
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
  const nextTurn = [];
  const nextStep = [];
  const splice = (target, start, deleteCount, inserted, outcome) => {
    append(state, "agent/inbox/spliced", {
      target,
      start,
      ...(deleteCount ? { removedCount: deleteCount } : {}),
      inserted,
      ...(outcome ? { outcome } : {}),
    });
    return (target === "next-turn" ? nextTurn : nextStep).splice(start, deleteCount, ...inserted);
  };
  const inbox = {
    get nextTurn() { return nextTurn; },
    get nextStep() { return nextStep; },
    replace(id, replacement) {
      for (const [target, list] of [["next-turn", nextTurn], ["next-step", nextStep]]) {
        const at = list.findIndex((candidate) => candidate.id === id);
        if (at >= 0) { splice(target, at, 1, [replacement], "canceled"); return true; }
      }
      return false;
    },
    remove(id) {
      for (const [target, list] of [["next-turn", nextTurn], ["next-step", nextStep]]) {
        const at = list.findIndex((candidate) => candidate.id === id);
        if (at >= 0) { splice(target, at, 1, [], "canceled"); return true; }
      }
      return false;
    },
  };
  return {
    session: {
      id: state.id,
      events: state.events,
      header: { createdAt: state.createdAt, cwd: projectCwd },
    },
    inbox,
    get status() { return status; },
    followup(message) {
      assert.equal(status, "idle");
      state.turn += 1;
      status = "running";
      append(state, "turn/start", { turn: state.turn });
      append(state, "user/message", message, "append");
      activity = new Promise((resolveActivity) => {
        settle = resolveActivity;
        const turn = state.turn;
        const delay = message.content[0].text.includes("interrupt") ? 5_000 : 180;
        timer = setTimeout(() => {
          append(state, "assistant/message", {
            turn,
            step: 1,
            message: {
              id: `assistant-${state.id}-${turn}`,
              role: "assistant",
              source: { kind: "model", provider: "local", model: "proof" },
              content: [{ type: "text", text: `Durable reply ${turn}: ${message.content[0].text}` }],
            },
          }, "append");
          const steering = splice("next-step", 0, nextStep.length, []);
          for (const steered of steering) append(state, "user/message", steered, "append");
          append(state, "turn/end", { turn, reason: { kind: "completed" } });
          status = "idle";
          settle = undefined;
          resolveActivity();
        }, delay);
      });
    },
    steer(message) {
      assert.equal(status, "running");
      splice("next-step", nextStep.length, 0, [message]);
    },
    cancel(cause, options) {
      assert.deepEqual(cause, { kind: "user" });
      assert.deepEqual(options, { keepInbox: true });
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
      return {
        agent,
        async dispose() {
          liveAgents.delete(state.id);
        },
      };
    },
    async create(options) {
      creates += 1;
      modelSelections.push(options.agentOptions);
      assert.equal(options.meta?.cwd, projectCwd);
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
      return {
        agent,
        async dispose() {
          liveAgents.delete(state.id);
        },
      };
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
        cwd: projectCwd,
      }));
    },
  },
  loader: { async await() {} },
};
liveAgents.set(primaryId, fakeAgent(states.get(primaryId)));
liveAgents.set(secondaryId, fakeAgent(states.get(secondaryId)));
const backend = createQqService(
  { get: (name) => services[name] },
  {
    sessionId: primaryId,
    cwd: projectCwd,
    projectsRoot: projects.root,
    scratchRoot: join(projects.root, ".qq-scratch"),
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

function sessionPath(sessionId, action) {
  const base = `/qq/project/${projectName}/session/${sessionId}`;
  return action ? `${base}/${action}` : base;
}

async function follow(path, options = {}) {
  let current = path;
  for (let hop = 0; hop < 5; hop += 1) {
    const response = await request(current, options);
    if (response.status !== 303 && response.status !== 308) return response;
    current = response.headers.location;
    assert.ok(current, `redirect from ${path} is missing Location`);
  }
  throw new Error(`too many redirects from ${path}`);
}

function post(sessionId, action, fields = {}, extraHeaders = {}, htmx = true) {
  const body = new URLSearchParams(fields).toString();
  return request(sessionPath(sessionId, action), {
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

function openSse(sessionId, port = address.port, path = sessionPath(sessionId, "events")) {
  return new Promise((resolveOpen, rejectOpen) => {
    const messages = [];
    const waiters = new Set();
    let pending = "";
    let response;
    const req = httpRequest({
      host: "127.0.0.1",
      port,
      path,
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
  assert.match(markdown, /<pre><code class="language-js"><span class="hljs-keyword">const<\/span> answer = <span class="hljs-number">42<\/span>/);

  const started = Date.now();
  const emptyHeading = renderMarkdownText("# ");
  assert.ok(Date.now() - started < 250);
  assert.match(emptyHeading, /<h1><\/h1>/);
  for (const [line, level] of [["## ", 2], ["#\t", 1], ["   # ", 1]]) {
    const html = renderMarkdownText(line);
    assert.match(html, new RegExp(`<h${level}><\\/h${level}>`));
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
  assert.match(blocks, /<blockquote>\s*<p>quoted <em>text<\/em><\/p>\s*<\/blockquote>/);
  assert.match(blocks, /<ul>\s*<li>bullet<\/li>\s*<\/ul>/);
  assert.match(blocks, /<ol>\s*<li>numbered<\/li>\s*<\/ol>/);
  assert.match(blocks, /<hr>/);
}

{
  const liveId = "session-63a11000-0000-4000-8000-0000000000aa";
  const durableId = "session-63a11000-0000-4000-8000-0000000000bb";
  const paths = httpInternals.routes("/qq", liveId, "qq");
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
  assert.doesNotMatch(html, /<button type="submit">Open<\/button>/);
  assert.doesNotMatch(html, /<form id="close-session"[^>]*hidden/);
  assert.match(html, /class="close-arm"/);
  assert.match(html, /class="close-keep"/);
  assert.match(html, /history is kept/);
  assert.match(html, new RegExp(`hx-push-url="/qq/project/qq/session/${liveId}"`));
  assert.match(html, new RegExp(`data-session-id="${liveId}"`));

  const dated = renderSessionContent({
    id: liveId,
    events: [],
    sessions: [{ id: liveId, createdAt: Date.UTC(2026, 7, 16, 12) }],
  }, paths);
  assert.match(dated, /<code>2026-08-16<\/code>/);
  assert.match(dated, new RegExp(`<option value="${liveId}" selected>Current · 2026-08-16</option>`));
  assert.doesNotMatch(dated, new RegExp(`<code>${liveId}</code>`));
  assert.match(dated, new RegExp(`hx-push-url="/qq/project/qq/session/${liveId}"`));

  const undealt = renderSessionContent({ id: liveId, events: [] }, paths);
  assert.match(undealt, /<code>durable<\/code>/);
  assert.doesNotMatch(undealt, new RegExp(`<code>${liveId}</code>`));
  assert.doesNotMatch(undealt, /offer-popup/);
  assert.doesNotMatch(undealt, /workflows-popup/);
  assert.doesNotMatch(undealt, /download-chip/);
  assert.equal(renderProgressChip(null), "");
  assert.equal(renderProgressChip({}), "");
  const chip = renderProgressChip({ title: "Dune.2021.1080p", percent: "42%", rate: "2.5 MB/s", eta: "12m" });
  assert.match(chip, /download-chip/);
  assert.match(chip, /Dune\.2021\.1080p/);
  assert.match(chip, /42%/);
  const workflowList = renderSessionContent({ id: liveId, events: [] }, paths, "architect\niterate\nfind\nnone selected");
  assert.match(workflowList, /class="offer-popup workflows-popup"/);
  assert.match(workflowList, /id="workflows-heading">Pick a workflow/);
  assert.match(workflowList, /value="\/workflows architect"/);
  assert.match(workflowList, /value="\/workflows find"/);
  assert.match(workflowList, /value="\/workflows none"/);
  assert.match(workflowList, /class="offer-choice workflows-choice workflows-dismiss" type="button">Cancel/);
  const selectedFind = renderSessionContent({ id: liveId, events: [] }, paths, "architect\niterate\nfind \(selected\)");
  assert.match(selectedFind, /workflows-choice workflows-current" type="submit" name="prompt" value="\/workflows find">find/);
  const unboundWorkflow = renderSessionContent(
    { id: liveId, events: [] },
    paths,
    "architect\niterate\nfind\nmedia (selected, unbound)",
  );
  assert.match(unboundWorkflow, /class="offer-popup workflows-popup"/);
  assert.match(unboundWorkflow, /class="workflows-unbound" role="status">media \(selected, unbound\)/);
  assert.match(unboundWorkflow, /value="\/workflows none"/);
  assert.doesNotMatch(unboundWorkflow, /value="\/workflows media"/);
  const picked = renderSessionContent({ id: liveId, events: [] }, paths, "find selected");
  assert.match(picked, /class="notice-ok" role="status">find selected/);
  assert.doesNotMatch(picked, /workflows-popup/);
  const slashError = renderSessionContent({ id: liveId, events: [] }, paths, "unknown /workflows usage");
  assert.match(slashError, /class="notice" role="status">unknown \/workflows usage/);

  const grabbing = renderSessionContent({
    id: liveId,
    events: [],
    progress: { title: "Dune.2021.1080p", percent: "42%", rate: "2.5 MB/s", eta: "12m" },
  }, paths);
  assert.match(grabbing, /download-chip/);
  assert.match(grabbing, /Dune\.2021\.1080p · 42%/);

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
  assert.match(offered, new RegExp(`hx-post="/qq/project/qq/session/${liveId}/offer"`));
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

  const overlayCard = renderOverlay({
    id: "gelbooru:1",
    title: "score 88",
    chrome: true,
    media: { src: "/qq-find/media/gelbooru/1", alt: "still" },
    actions: [
      { id: "keep", label: "Keep" },
      { id: "good", label: "Good" },
      { id: "bad", label: "Bad" },
      { id: "never", label: "Never" },
    ],
  }, paths);
  assert.match(overlayCard, /class="overlay-popup"/);
  assert.doesNotMatch(overlayCard, /offer-popup/);
  assert.match(overlayCard, /data-overlay-id="gelbooru:1"/);
  assert.match(overlayCard, /src="\/qq-find\/media\/gelbooru\/1"/);
  assert.match(overlayCard, /name="choice" value="keep">Keep/);
  assert.match(overlayCard, /name="choice" value="good">Good/);
  assert.match(overlayCard, /name="choice" value="bad">Bad/);
  assert.match(overlayCard, /name="choice" value="never">Never/);
  assert.match(overlayCard, /name="choice" value="chrome">Hide buttons/);
  assert.match(overlayCard, /name="choice" value="dismiss" aria-label="Close"/);
  assert.match(overlayCard, new RegExp(`hx-post="/qq/project/qq/session/${liveId}/overlay"`));
  assert.doesNotMatch(overlayCard, /overlay-stage-hit/);
  assert.doesNotMatch(overlayCard, /data-fit/);
  assert.doesNotMatch(overlayCard, /data-overlay-keys/);
  const keyed = renderOverlay({
    id: "gelbooru:1",
    media: { src: "/qq-find/media/gelbooru/1", fit: "cover" },
    keys: { ArrowLeft: "skip", "Arrow-Left": "skip", h: "dismiss", q: "dismiss" },
    actions: [{ id: "skip", label: "Skip" }],
  }, paths);
  assert.doesNotMatch(keyed, /data-fit/);
  assert.match(keyed, /data-overlay-keys="/);
  assert.match(keyed, /ArrowLeft/);
  assert.doesNotMatch(keyed, /Arrow-Left/);
  assert.doesNotMatch(keyed, /"h"/);
  assert.doesNotMatch(keyed, /"q"/);
  const fitted = renderOverlay({
    id: "gelbooru:1",
    media: { src: "/qq-find/media/gelbooru/1", fit: "contain" },
    keys: { ArrowLeft: "skip", ArrowRight: "skip" },
    actions: [{ id: "skip", label: "Skip" }],
  }, paths);
  assert.match(fitted, /data-fit="contain"/);
  assert.match(fitted, /data-overlay-keys="/);
  assert.equal(renderOverlay(null, paths), "");
  assert.equal(renderOverlay({ id: "x" }, paths), "");
  const hiddenChrome = renderOverlay({
    id: "gelbooru:1",
    chrome: false,
    media: { src: "/qq-find/media/gelbooru/1" },
    actions: [{ id: "keep", label: "Keep" }],
  }, paths);
  assert.match(hiddenChrome, /overlay-chrome-hidden/);
  assert.match(hiddenChrome, /overlay-stage-hit/);
  assert.match(hiddenChrome, /aria-label="Show buttons"/);
  const overlaid = renderSessionContent({
    id: liveId,
    events: [],
    overlay: {
      id: "gelbooru:2",
      title: "score 12",
      media: { src: "/qq-find/media/gelbooru/2" },
      actions: [{ id: "keep", label: "Keep" }],
    },
  }, paths);
  assert.match(overlaid, /class="overlay-popup"/);
  assert.match(overlaid, /src="\/qq-find\/media\/gelbooru\/2"/);

  const idleChip = renderSessionContent({ id: liveId, events: [], sessionMode: "find" }, paths);
  assert.match(idleChip, /class="session-mode" data-mode="find">Find/);
  assert.doesNotMatch(idleChip, /id="interrupt-form"/);
  const siblingChip = renderSessionContent({ id: liveId, events: [], sessionMode: "media" }, paths);
  assert.match(siblingChip, /class="session-mode" data-mode="media">Media/);
  for (const mode of ["", "none", "Media", "-media", "media_box", "a".repeat(33), null]) {
    assert.doesNotMatch(
      renderSessionContent({ id: liveId, events: [], sessionMode: mode }, paths),
      /class="session-mode"/,
    );
  }
  const finding = renderSessionContent({
    id: liveId,
    events: [],
    agentStatus: "idle",
    sessionMode: "find",
    findWork: "compile",
  }, paths);
  assert.match(finding, /id="interrupt-form"/);
  assert.match(finding, />Finding…</);
  assert.match(finding, />Cancel</);
  assert.doesNotMatch(finding, /The current DSH turn is still running/);
  const saving = renderSessionContent({
    id: liveId,
    events: [],
    agentStatus: "idle",
    sessionMode: "find",
    findWork: "save",
    overlay: {
      id: "gelbooru:2",
      title: "score 12",
      media: { src: "/qq-find/media/gelbooru/2" },
      actions: [{ id: "keep", label: "Keep" }],
    },
  }, paths);
  assert.match(saving, />Saving…</);
  assert.match(saving, /class="overlay-saving"/);
  assert.match(saving, /class="overlay-cancel"/);
  assert.match(saving, new RegExp(`hx-post="/qq/project/qq/session/${liveId}/interrupt"`));
  assert.doesNotMatch(renderSessionContent({ id: liveId, events: [], sessionMode: "none" }, paths), /session-mode/);
  assert.equal(httpInternals.compilingFindPrompt("/find", liveId, () => true), false);
  assert.equal(httpInternals.compilingFindPrompt("/find tall rain", liveId, () => false), true);
  assert.equal(httpInternals.compilingFindPrompt("tall rain", liveId, () => true), true);
  assert.equal(httpInternals.compilingFindPrompt("tall rain", liveId, () => false), false);
  assert.equal(httpInternals.compilingFindPrompt("/workflows architect", liveId, () => true), false);
  const keepForm = new URLSearchParams({ choice: "keep" });
  const badForm = new URLSearchParams({ choice: "bad" });
  assert.equal(httpInternals.overlaySaveChoice(keepForm), true);
  assert.equal(httpInternals.overlaySaveChoice(badForm), false);
}

{
  const posts = [];
  const byClass = new Map();
  const byId = new Map();
  const listeners = [];
  const classListFor = (node) => {
    const names = new Set(String(node.className ?? "").split(/\s+/).filter(Boolean));
    const sync = () => { node.className = [...names].join(" "); };
    return {
      add(name) { names.add(name); sync(); },
      remove(name) { names.delete(name); sync(); },
      contains(name) { return names.has(name); },
    };
  };
  const makeNode = (tag, attrs = {}) => {
    const node = {
      tagName: tag.toUpperCase(),
      className: attrs.className ?? "",
      id: attrs.id ?? "",
      hidden: Boolean(attrs.hidden),
      value: attrs.value ?? "",
      focused: false,
      parent: null,
      children: [],
      dataset: {},
      closest(selector) {
        let current = this;
        while (current) {
          if (selector.startsWith(".") && String(current.className).split(/\s+/).includes(selector.slice(1))) return current;
          if (selector.startsWith("#") && current.id === selector.slice(1)) return current;
          current = current.parent;
        }
        return null;
      },
      focus() { node.focused = true; },
      click() {},
      requestSubmit() { posts.push(node.id || node.className); },
    };
    node.classList = classListFor(node);
    if (node.id) byId.set(node.id, node);
    for (const name of String(node.className).split(/\s+/).filter(Boolean)) {
      if (!byClass.has(name)) byClass.set(name, []);
      byClass.get(name).push(node);
    }
    return node;
  };
  const controls = makeNode("div", { className: "session-controls" });
  const arm = makeNode("button", { className: "close-arm" });
  const confirm = makeNode("div", { className: "close-confirm", hidden: true });
  const keep = makeNode("button", { className: "close-keep" });
  const form = makeNode("form", { id: "close-session", className: "close-session" });
  const submit = makeNode("button", { className: "close-confirm-submit" });
  const outside = makeNode("div", { className: "outside" });
  const menu = makeNode("details", { className: "session-menu" });
  menu.open = true;
  const newForm = makeNode("form", { className: "new-session" });
  const choice = makeNode("select", { id: "session-choice" });
  const optionIds = [primaryId, "session-63a11000-0000-4000-8000-0000000000ff"];
  const options = optionIds.map((id) => makeNode("option", { value: id }));
  for (const option of options) {
    option.parent = choice;
    choice.children.push(option);
  }
  for (const [parent, child] of [[controls, arm], [controls, confirm], [controls, newForm], [controls, choice], [confirm, keep], [confirm, form], [form, submit], [menu, controls]]) {
    child.parent = parent;
    parent.children.push(child);
  }
  class FakeElement {}
  class FakeHTMLElement extends FakeElement {}
  class FakeHTMLFormElement extends FakeHTMLElement {}
  class FakeHTMLSelectElement extends FakeHTMLElement {}
  class FakeHTMLTextAreaElement extends FakeHTMLElement {}
  class FakeHTMLDetailsElement extends FakeHTMLElement {}
  for (const node of [controls, arm, confirm, keep, form, submit, outside, menu, newForm, choice]) {
    Object.setPrototypeOf(node, FakeHTMLElement.prototype);
  }
  Object.setPrototypeOf(form, FakeHTMLFormElement.prototype);
  Object.setPrototypeOf(newForm, FakeHTMLFormElement.prototype);
  Object.setPrototypeOf(choice, FakeHTMLSelectElement.prototype);
  Object.setPrototypeOf(menu, FakeHTMLDetailsElement.prototype);
  const document = {
    readyState: "complete",
    currentScript: null,
    querySelector(selector) {
      if (selector.startsWith("#")) return byId.get(selector.slice(1)) ?? null;
      if (selector === ".session-controls.close-confirming") {
        return controls.classList.contains("close-confirming") ? controls : null;
      }
      if (selector.startsWith(".")) return (byClass.get(selector.slice(1)) ?? [])[0] ?? null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "#session-choice option") return options;
      return [];
    },
    addEventListener(type, fn, opts) { listeners.push({ type, fn, capture: opts === true || opts?.capture === true }); },
  };
  const windowObj = {
    matchMedia() { return { matches: true }; },
    addEventListener() {},
    requestAnimationFrame(fn) { fn(); },
  };
  const assigned = [];
  const location = {
    pathname: `/qq/project/qq/session/${primaryId}`,
    assign(path) { assigned.push(path); location.pathname = path; },
  };
  const sandbox = {
    document,
    window: windowObj,
    location,
    navigator: {},
    requestAnimationFrame(fn) { fn(); },
    Element: FakeElement,
    HTMLElement: FakeHTMLElement,
    HTMLFormElement: FakeHTMLFormElement,
    HTMLSelectElement: FakeHTMLSelectElement,
    HTMLTextAreaElement: FakeHTMLTextAreaElement,
    HTMLDetailsElement: FakeHTMLDetailsElement,
    JSON,
    console,
  };
  sandbox.window.matchMedia = windowObj.matchMedia;
  const source = await readFile(join(root, "qq-ui/assets/browser-v5.js"), "utf8");
  vm.runInNewContext(source, sandbox, { filename: "browser-v5.js" });
  const click = listeners.find((entry) => entry.type === "click").fn;
  const keydown = listeners.find((entry) => entry.type === "keydown").fn;
  const toggle = listeners.find((entry) => entry.type === "toggle").fn;
  click({ target: arm, preventDefault() {} });
  assert.equal(controls.classList.contains("close-confirming"), true);
  assert.equal(confirm.hidden, false);
  assert.equal(posts.length, 0, "first close tap must not POST");
  click({ target: arm, preventDefault() {} });
  assert.equal(posts.length, 0, "second close tap must not POST");
  click({ target: keep, preventDefault() {} });
  assert.equal(controls.classList.contains("close-confirming"), false);
  assert.equal(confirm.hidden, true);
  click({ target: arm, preventDefault() {} });
  click({ target: outside, preventDefault() {} });
  assert.equal(controls.classList.contains("close-confirming"), false);
  click({ target: arm, preventDefault() {} });
  keydown({ key: "Escape", defaultPrevented: false, isComposing: false, target: outside, preventDefault() {} });
  assert.equal(controls.classList.contains("close-confirming"), false);
  click({ target: arm, preventDefault() {} });
  menu.open = false;
  toggle({ target: menu });
  assert.equal(controls.classList.contains("close-confirming"), false);
  click({ target: arm, preventDefault() {} });
  form.requestSubmit();
  assert.deepEqual(posts, ["close-session"]);
  posts.length = 0;
  keydown({ key: "q", defaultPrevented: false, isComposing: false, target: outside, preventDefault() {} });
  assert.equal(posts.length, 0, "q arms close without POSTing");
  keydown({ key: "x", defaultPrevented: false, isComposing: false, target: outside, preventDefault() {} });
  assert.deepEqual(posts, ["close-session"], "desktop q-then-x submits close directly");
  posts.length = 0;
  keydown({ key: "n", defaultPrevented: false, isComposing: false, target: outside, preventDefault() {} });
  assert.deepEqual(posts, ["new-session"], "desktop n submits the parallel New session form");
  keydown({ key: "ArrowRight", defaultPrevented: false, isComposing: false, target: outside, preventDefault() {} });
  assert.deepEqual(assigned, [`/qq/project/qq/session/${optionIds[1]}`]);
  keydown({ key: "ArrowLeft", defaultPrevented: false, isComposing: false, target: outside, preventDefault() {} });
  assert.deepEqual(assigned, [
    `/qq/project/qq/session/${optionIds[1]}`,
    `/qq/project/qq/session/${primaryId}`,
  ], "desktop left/right cycle stays in the selected project");
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
        path: sessionPath(primaryId),
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
          path: sessionPath(primaryId, "offer"),
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
          path: sessionPath(primaryId, "offer"),
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

{
  const pending = {
    id: "gelbooru:1",
    title: "score 88",
    chrome: true,
    media: { src: "/qq-find/media/gelbooru/1", alt: "still" },
    actions: [
      { id: "keep", label: "Keep" },
      { id: "good", label: "Good" },
    ],
  };
  let lastChoice = "";
  const overlayServer = createServer(createConsoleHandler(backend, {
    ssePollMs: 20,
    overlayFor: async (id) => (id === primaryId && pending.id ? pending : null),
    chooseOverlay: async (_id, form) => {
      lastChoice = String(form.get("choice") ?? "");
      if (lastChoice === "keep") {
        return { status: "refused", reason: "collection write failed" };
      }
      if (lastChoice === "dismiss") {
        pending.id = "";
        return { status: "ok", action: "dismiss" };
      }
      if (lastChoice === "chrome") {
        pending.chrome = pending.chrome === false;
        return { status: "ok", action: "chrome" };
      }
      pending.id = "gelbooru:2";
      pending.media = { src: "/qq-find/media/gelbooru/2", alt: "still" };
      pending.title = "score 12";
      return { status: "ok", action: lastChoice };
    },
  }));
  await new Promise((resolveListen) => overlayServer.listen(0, "127.0.0.1", resolveListen));
  const overlayPort = overlayServer.address().port;
  try {
    const page = await new Promise((resolveRequest, reject) => {
      const req = httpRequest({
        host: "127.0.0.1",
        port: overlayPort,
        path: sessionPath(primaryId),
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
    assert.match(page.body, /class="overlay-popup"/);
    assert.match(page.body, /name="choice" value="keep">Keep/);
    assert.match(page.body, /src="\/qq-find\/media\/gelbooru\/1"/);
    const stream = await openSse(primaryId, overlayPort);
    try {
      const appeared = await stream.waitFor(/overlay-popup/);
      assert.match(appeared, /name="choice" value="keep"/);
      const keepBody = new URLSearchParams({ choice: "keep" }).toString();
      const refused = await new Promise((resolveRequest, reject) => {
        const req = httpRequest({
          host: "127.0.0.1",
          port: overlayPort,
          path: sessionPath(primaryId, "overlay"),
          method: "POST",
          agent: false,
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "content-length": Buffer.byteLength(keepBody),
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
        req.end(keepBody);
      });
      assert.equal(refused.status, 200);
      assert.equal(lastChoice, "keep");
      assert.match(refused.body, /class="overlay-popup"[\s\S]*class="notice" role="alert">collection write failed<\/p>/);
      assert.match(refused.body, /name="choice" value="keep">Keep/);
      const mark = stream.checkpoint();
      const body = new URLSearchParams({ choice: "dismiss" }).toString();
      const dismissed = await new Promise((resolveRequest, reject) => {
        const req = httpRequest({
          host: "127.0.0.1",
          port: overlayPort,
          path: sessionPath(primaryId, "overlay"),
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
      assert.equal(dismissed.status, 200);
      assert.equal(lastChoice, "dismiss");
      assert.doesNotMatch(dismissed.body, /overlay-popup/);
      const cleared = await stream.waitFor(/<form id="composer"/, mark);
      assert.doesNotMatch(cleared, /overlay-popup/);
    } finally {
      stream.close();
    }
  } finally {
    overlayServer.closeAllConnections?.();
    await new Promise((resolveClose) => overlayServer.close(resolveClose));
  }
}

{
  let grab = null;
  const chipServer = createServer(createConsoleHandler(backend, {
    ssePollMs: 20,
    progressFor: async () => grab,
  }));
  await new Promise((resolveListen) => chipServer.listen(0, "127.0.0.1", resolveListen));
  const chipPort = chipServer.address().port;
  try {
    const idle = await new Promise((resolveRequest, reject) => {
      const req = httpRequest({
        host: "127.0.0.1",
        port: chipPort,
        path: sessionPath(primaryId),
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
    assert.equal(idle.status, 200);
    assert.doesNotMatch(idle.body, /download-chip/);
    const stream = await openSse(primaryId, chipPort);
    try {
      grab = { title: "Dune.2021.1080p", percent: "42%", rate: "2.5 MB/s", eta: "12m" };
      const appeared = await stream.waitFor(/download-chip/);
      assert.match(appeared, /Dune\.2021\.1080p/);
      assert.match(appeared, /42%/);
      const mark = stream.checkpoint();
      grab = { title: "Dune.2021.1080p", percent: "80%", rate: "2.5 MB/s", eta: "4m" };
      const ticked = await stream.waitFor(/80%/, mark);
      assert.match(ticked, /download-chip/);
      assert.match(ticked, /80%/);
    } finally {
      stream.close();
    }
  } finally {
    chipServer.closeAllConnections?.();
    await new Promise((resolveClose) => chipServer.close(resolveClose));
  }
}

{
  let settle;
  const delayed = new Promise((resolve) => { settle = resolve; });
  let interrupted = 0;
  const findBackend = attachObserve({
    defaultSessionId: primaryId,
    async list() { return [{ id: primaryId, createdAt: 1 }]; },
    async read(id) { return { id, events: [], agentStatus: "idle" }; },
    async create() { return { id: primaryId }; },
    async prompt() { await delayed; },
    async interrupt() { interrupted += 1; settle(); return true; },
    async close() { return { id: primaryId }; },
  }, { intervalMs: 20 });
  const findServer = createServer(createConsoleHandler(findBackend, {
    ssePollMs: 20,
    inFindMode: (id) => id === primaryId,
    sessionModeFor: () => "find",
  }));
  await new Promise((resolveListen) => findServer.listen(0, "127.0.0.1", resolveListen));
  const findPort = findServer.address().port;
  try {
    const page = await new Promise((resolveRequest, reject) => {
      const req = httpRequest({
        host: "127.0.0.1",
        port: findPort,
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
    assert.match(page.body, /class="session-mode" data-mode="find">Find/);
    assert.doesNotMatch(page.body, /id="interrupt-form"/);
    const stream = await openSse(primaryId, findPort, `/qq/session/${primaryId}/events`);
    try {
      await stream.waitFor(/class="session-mode" data-mode="find">Find/);
      const mark = stream.checkpoint();
      const promptBody = new URLSearchParams({ prompt: "tall woman rain" }).toString();
      const promptPromise = new Promise((resolveRequest, reject) => {
        const req = httpRequest({
          host: "127.0.0.1",
          port: findPort,
          path: `/qq/session/${primaryId}/prompt`,
          method: "POST",
          agent: false,
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "content-length": Buffer.byteLength(promptBody),
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
        req.end(promptBody);
      });
      const finding = await stream.waitFor(/id="interrupt-form"/, mark);
      assert.match(finding, />Finding…</);
      assert.match(finding, />Cancel</);
      assert.doesNotMatch(finding, /The current DSH turn is still running/);
      const cancelled = await new Promise((resolveRequest, reject) => {
        const req = httpRequest({
          host: "127.0.0.1",
          port: findPort,
          path: `/qq/session/${primaryId}/interrupt`,
          method: "POST",
          agent: false,
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "content-length": "0",
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
        req.end();
      });
      assert.equal(cancelled.status, 200);
      assert.equal(interrupted, 1);
      assert.match(cancelled.body, /id="composer"/);
      assert.doesNotMatch(cancelled.body, /id="interrupt-form"/);
      const prompted = await promptPromise;
      assert.equal(prompted.status, 200);
    } finally {
      stream.close();
    }
  } finally {
    findServer.closeAllConnections?.();
    await new Promise((resolveClose) => findServer.close(resolveClose));
  }
}

const streams = [];
try {
  // Stable htmx/SSE lifecycle: the owner and target wrap inner-only fragments.
  const shortcut = await request("/qq", { headers: { cookie: "proof-client=home" } });
  assert.equal(shortcut.status, 308);
  assert.equal(shortcut.headers.location, "/qq/");
  const rootServer = createServer(createRootRedirectHandler("/qq"));
  await new Promise((resolveListen) => rootServer.listen(0, "127.0.0.1", resolveListen));
  try {
    const rootAddress = rootServer.address();
    assert.ok(rootAddress && typeof rootAddress !== "string");
    const rootRequest = (path, options = {}) => new Promise((resolveRequest, reject) => {
      const req = httpRequest({
        host: "127.0.0.1",
        port: rootAddress.port,
        path,
        method: options.method ?? "GET",
        agent: false,
      }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolveRequest({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        }));
      });
      req.on("error", reject);
      req.end();
    });
    const root = await rootRequest("/");
    assert.equal(root.status, 308);
    assert.equal(root.headers.location, "/qq/");
    const withQuery = await rootRequest("/?client=phone");
    assert.equal(withQuery.status, 308);
    assert.equal(withQuery.headers.location, "/qq/?client=phone");
    const posted = await rootRequest("/", { method: "POST" });
    assert.equal(posted.status, 405);
  } finally {
    rootServer.closeAllConnections?.();
    await new Promise((resolveClose) => rootServer.close(resolveClose));
  }
  const home = await follow(shortcut.headers.location, { headers: { cookie: "proof-client=home" } });
  assert.equal(home.status, 200);
  assert.match(home.headers["cache-control"], /no-store/);
  assert.match(home.headers["content-security-policy"], /font-src 'self'/);
  assert.match(home.headers["content-security-policy"], /manifest-src 'self'/);
  assert.match(home.body, /^<!doctype html>/);
  assert.match(home.body, /interactive-widget=resizes-content/);
  assert.match(home.body, new RegExp(`id="console-stream"[^>]*hx-ext="sse"[^>]*sse-connect="/qq/project/${projectName}/session/${primaryId}/events"`));
  assert.match(home.body, /id="session-panel"[^>]*hx-ext="sse"[^>]*sse-swap="session"[^>]*hx-swap="innerHTML"/);
  assert.match(home.body, /htmx-2\.0\.10\.min\.js/);
  assert.match(home.body, /htmx-ext-sse-2\.2\.4\.js/);
  assert.match(home.body, /rel="manifest"/);
  assert.match(home.body, /console-v18\.css/);
  assert.doesNotMatch(home.body, /console-v17\.css/);
  assert.match(home.body, /browser-v9\.js/);
  assert.doesNotMatch(home.body, /browser-v8\.js/);
  assert.match(home.body, /data-service-worker="\/qq\/sw\.js"/);
  assert.match(home.body, /<code>\d+<\/code>/);
  assert.doesNotMatch(home.body, new RegExp(`<code>${primaryId}</code>`));
  assert.match(home.body, new RegExp(`<option value="${primaryId}" selected>Current · \\d+</option>`));
  assert.match(home.body, new RegExp(`<option value="${secondaryId}">\\d+</option>`));
  assert.match(home.body, new RegExp(`<option value="${secondaryId}"`));
  assert.match(home.body, new RegExp(`hx-push-url="/qq/project/${projectName}/session/${primaryId}"`));
  assert.match(home.body, /This DSH session has no transcript yet/);
  assert.doesNotMatch(home.body, /download-chip/);
  assert.match(home.body, /<details class="session-menu">[\s\S]*<summary aria-label="Show session controls">/);
  assert.doesNotMatch(home.body, /<details class="session-menu" open/);
  assert.match(home.body, /aria-label="Session controls"/);
  assert.match(home.body, /<select id="session-choice"[^>]*>[\s\S]*Current/);
  assert.match(home.body, /aria-label="New session"/);
  assert.match(home.body, /class="close-arm"/);
  assert.match(home.body, />\+<\/button>/);
  assert.match(home.body, /<textarea id="prompt"[^>]*rows="1"[^>]*enterkeyhint="send"/);
  assert.match(home.body, /id="composer-dictate"/);

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
  assert.match(running, /<form id="composer" class="composer composer-running"/);
  assert.match(running, /id="composer-submit"[^>]*>Send/);
  assert.match(running, /id="interrupt-submit"[^>]*>Interrupt/);
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
  const steerOne = await post(primaryId, "prompt", { prompt: "pending steer one" });
  const steerTwo = await post(primaryId, "prompt", { prompt: "pending steer two" });
  assert.match(steerOne.body, /id="pending-queue"/);
  assert.match(steerTwo.body, /pending steer one/);
  assert.match(steerTwo.body, /pending steer two/);
  const pendingIds = [...steerTwo.body.matchAll(/<li class="queue-item" data-message-id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(pendingIds.length, 2);
  const editedPending = await post(primaryId, "queue", {
    operation: "edit",
    itemId: pendingIds[0],
    text: "pending steer one edited",
  });
  assert.match(editedPending.body, /pending steer one edited/);
  assert.doesNotMatch(editedPending.body, />pending steer one</);
  const removedPending = await post(primaryId, "queue", { operation: "remove", itemId: pendingIds[1] });
  assert.match(removedPending.body, /pending steer one edited/);
  assert.doesNotMatch(removedPending.body, /pending steer two/);
  const interrupted = await post(primaryId, "interrupt");
  assert.equal(interrupted.status, 200);
  assert.match(interrupted.body, /Interrupt requested for the running DSH turn/);
  assert.match(interrupted.body, /Last turn interrupted/);
  assert.match(interrupted.body, /pending steer one edited/, "interrupt keeps pending DSH inbox rows");
  const clearedPending = await post(primaryId, "queue", { operation: "remove", itemId: pendingIds[0] });
  assert.doesNotMatch(clearedPending.body, /pending steer one edited/);
  const longPost = await longPostPromise;
  assert.equal(longPost.status, 200);

  // Laptop and phone are sequential new requests over one canonical durable id.
  const laptop = await follow(`/qq/session/${primaryId}`, { headers: { cookie: "proof-client=laptop" } });
  assert.match(laptop.body, /home handoff/);
  assert.match(laptop.body, /please interrupt this turn/);
  const laptopPost = await post(primaryId, "prompt", { prompt: "laptop handoff" }, {}, false);
  assert.equal(laptopPost.status, 303);
  assert.equal(laptopPost.headers.location, sessionPath(primaryId));
  const phone = await follow(`/qq/session/${primaryId}`, {
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
  const localAgain = await follow(`/qq/session/${primaryId}`);
  for (const text of ["home handoff", "laptop handoff", "phone handoff"]) {
    assert.match(localAgain.body, new RegExp(text));
  }

  // The visible switcher validates a choice and opens its canonical identity.
  const switched = await request(`/qq/sessions/open?session=${encodeURIComponent(secondaryId)}`);
  assert.equal(switched.status, 303);
  assert.equal(switched.headers.location, sessionPath(secondaryId));
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
  assert.match(createdResponse.headers.location, new RegExp(`^/qq/project/${projectName}/session/session-[0-9a-f-]{36}$`));
  const freshId = createdResponse.headers.location.split("/").at(-1);
  const fresh = await request(createdResponse.headers.location);
  assert.equal(fresh.status, 200);
  assert.match(fresh.body, new RegExp(`<option value="${freshId}" selected>Current`));
  assert.match(fresh.body, /This DSH session has no transcript yet/);
  assert.match(fresh.body, /id="close-session"/);
  assert.match(fresh.body, /class="close-arm"/);

  const closedResponse = await request(sessionPath(freshId, "close"), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "content-length": "0",
    },
    body: "",
  });
  assert.equal(closedResponse.status, 303);
  assert.match(closedResponse.headers.location, new RegExp(`^/qq/project/${projectName}/session/session-[0-9a-f-]{36}$`));
  assert.notEqual(closedResponse.headers.location, sessionPath(freshId));
  const closedGone = await request(`/qq/session/${freshId}`);
  assert.equal(closedGone.status, 404);

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
  const compactFailure = await follow(`/qq/session/${primaryId}`);
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
  const markdownPage = await follow(`/qq/session/${primaryId}`);
  assert.match(markdownPage.body, /<article class="message message-user"[^>]*>\s*<div class="message-text">\*\*Working directory\*\* &lt;b&gt;raw&lt;\/b&gt;<\/div>/);
  assert.match(markdownPage.body, /<article class="message message-assistant"[^>]*>\s*<div class="message-text message-markdown">/);
  assert.match(markdownPage.body, /<strong>Working directory<\/strong>/);
  assert.match(markdownPage.body, /<a href="https:\/\/example.com" target="_blank" rel="noopener noreferrer">docs<\/a>/);
  assert.match(markdownPage.body, /See <a href="https:\/\/example.com" target="_blank" rel="noopener noreferrer">docs<\/a> and bad\./);
  assert.match(markdownPage.body, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(markdownPage.body, /<img src=x|<script>|javascript:alert/);

  assert.equal(resumes, 0, "live agents are not silently resumed");
  assert.equal(creates, 1, "only the explicit New session action creates an identity");
  assert.ok(flushes >= 6, "creation, accepted prompts, and interruption cross DSH flush boundaries");
  assert.deepEqual(
    registrations,
    ["system-prompt/assemble", "agent/request"],
  );
  assert.deepEqual(modelSelections, [
    { provider: "qwen-token-plan", model: "deepseek-v4-pro-0813" },
  ]);

  // qq owns the close capability, not the Agent lifetime. A replacement qq
  // fiber recovers the handle from the live DSH Agent and can still close it.
  const reloadOwned = await backend.create();
  const replacementBackend = createQqService(
    { get: (name) => services[name] },
    {
      sessionId: primaryId,
      cwd: projectCwd,
      projectsRoot: projects.root,
      scratchRoot: join(projects.root, ".qq-scratch"),
      provider: "qwen-token-plan",
      model: "deepseek-v4-pro-0813",
      reasoningEffort: "max",
    },
  );
  const reloadClosed = await replacementBackend.close(reloadOwned.id);
  assert.equal(reloadClosed.closed, reloadOwned.id);
  assert.equal(liveAgents.has(reloadOwned.id), false);

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

  const worker = await request("/qq/sw.js");
  assert.equal(worker.status, 200);
  assert.equal(worker.headers["service-worker-allowed"], "/qq/");
  assert.match(worker.headers["cache-control"], /no-store/);
  assert.match(worker.body, /request\.method !== "GET"/);
  assert.match(worker.body, /request\.mode === "navigate"/);
  assert.match(worker.body, /response\.type === "opaqueredirect"/);
  assert.match(worker.body, /responseUrl\.origin === self\.location\.origin/);
  assert.match(worker.body, /livePathSet/);
  assert.match(worker.body, /livePathSet\.has\(url\.pathname\)\) return/);
  assert.match(worker.body, /console-v8\.css/);
  assert.match(worker.body, /console-v9\.css/);
  assert.match(worker.body, /console-v10\.css/);
  assert.match(worker.body, /console-v11\.css/);
  assert.match(worker.body, /console-v13\.css/);
  assert.match(worker.body, /console-v14\.css/);
  assert.match(worker.body, /console-v15\.css/);
  assert.match(worker.body, /console-v16\.css/);
  assert.match(worker.body, /console-v17\.css/);
  assert.match(worker.body, /console-v18\.css/);
  assert.match(worker.body, /browser-v5\.js/);
  assert.match(worker.body, /browser-v6\.js/);
  assert.match(worker.body, /browser-v7\.js/);
  assert.match(worker.body, /browser-v8\.js/);
  assert.match(worker.body, /browser-v9\.js/);
  assert.match(worker.body, /reconnect-v1\.js/);
  assert.match(worker.body, /geist-latin-wght-normal-5\.3\.0\.woff2/);
  assert.match(worker.body, /geist-latin-wght-italic-5\.3\.0\.woff2/);
  assert.match(worker.body, /offline-v8\.html/);
  assert.match(worker.body, /self\.skipWaiting\(\)/);
  assert.match(worker.body, /CACHE_PREFIX = "qq-static-"/);
  assert.match(worker.body, /LEGACY_CACHE_PREFIX = "qq-dsh-console-static-"/);
  assert.match(worker.body, /name\.startsWith\(CACHE_PREFIX\) \|\| name\.startsWith\(LEGACY_CACHE_PREFIX\)/);
  assert.doesNotMatch(worker.body, /session\/|\/prompt|\/events|\/interrupt|backgroundsync|indexedDB|localStorage/i);
  for (const legacyName of httpInternals.SERVICE_WORKER_NAMES.filter((name) => name !== "sw.js")) {
    const compatibilityWorker = await request(`/qq/${legacyName}`);
    assert.equal(compatibilityWorker.status, 200, legacyName);
    assert.match(compatibilityWorker.headers["cache-control"], /no-store/, legacyName);
    assert.equal(compatibilityWorker.headers["service-worker-allowed"], "/qq/", legacyName);
    assert.equal(compatibilityWorker.body, worker.body, legacyName);
  }
  const offline = await request("/qq/assets/offline-v8.html");
  assert.match(offline.body, /No transcript is cached and no message can be sent offline/);
  assert.match(offline.body, /console-v8\.css/);
  assert.match(offline.body, /reconnect-v1\.js/);
  const staticCss = await request("/qq/assets/console-v18.css");
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
  assert.match(staticCss.body, /min\(90ch/);
  assert.match(staticCss.body, /visibility: hidden/);
  assert.match(staticCss.body, /\.offer-handoff/);
  assert.match(staticCss.body, /\.overlay-popup/);
  assert.match(staticCss.body, /\.overlay-keep/);
  assert.match(staticCss.body, /\.session-mode/);
  assert.match(staticCss.body, /\.notice-ok/);
  assert.match(staticCss.body, /\.workflows-current/);
  assert.match(staticCss.body, /\.session-picker \{[\s\S]*grid-template-columns: auto minmax\(0, 1fr\);/);
  assert.match(staticCss.body, /\.close-confirm\[hidden\] \{ display: none; \}/);
  assert.match(staticCss.body, /\.session-controls\.close-confirming \.close-arm \{ display: none; \}/);
  assert.match(staticCss.body, /\.close-arm \{/);
  assert.match(staticCss.body, /\.project-drawer \{/);
  assert.match(staticCss.body, /width: min\(15\.5rem, calc\(100vw - 8rem\)\)/);
  assert.match(staticCss.body, /\.drawer-name \{[\s\S]*text-overflow: ellipsis/);
  assert.match(staticCss.body, /\.document-viewer \{/);
  assert.match(staticCss.body, /\.document-viewer-content \{/);
  assert.doesNotMatch(staticCss.body, /\.file-document \{/);
  assert.doesNotMatch(staticCss.body, /\.drawer-edge/);
  assert.match(staticCss.body, /\.hljs-keyword/);
  assert.match(staticCss.body, /#composer-submit \{[\s\S]*clip-path: none/);
  assert.match(staticCss.body, /\.overlay-saving/);
  assert.match(staticCss.body, /\.overlay-cancel/);
  assert.match(staticCss.body, /\.overlay-stage img \{[\s\S]*max-width: 100%;[\s\S]*max-height: 100%/);
  assert.match(staticCss.body, /\.overlay-stage img\[data-fit="contain"\] \{[\s\S]*width: 100%;[\s\S]*height: 100%;[\s\S]*object-fit: contain/);
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
    readFile(join(root, "qq-ui/assets/browser-v9.js"), "utf8"),
    readFile(join(root, "qq-ui/assets/sw.js"), "utf8"),
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
  assert.match(patch, /id: hmr[\s\S]*disabled: false/);
  assert.match(patch, /id: hmr[\s\S]*root: !!js[\s\S]*QQ_DSH_HMR_ROOTS/);
  assert.doesNotMatch(patch, /QQ_FIND_ROOT|QQ_MEDIA_ROOT/);
  assert.match(launcher, /QQ_DSH_HMR_ROOTS/);
  assert.match(launcher, /hmr_roots=\("\$root"/);
  assert.match(patch, /name: '@hypermemetic-ai\/qq-ui'[\s\S]*liveAssets: true/);
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
  assert.equal(uiPkg.dependencies["markdown-it"], "15.0.0");
  assert.equal(uiPkg.dependencies["highlight.js"], "11.12.0");
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
  assert.match(launcher, /QQ_MEDIA_ROOT/);
  assert.match(launcher, /@hypermemetic-ai\/media-box/);
  assert.doesNotMatch(launcher, /QQ_DSH_HAVE_MEDIA/);
  assert.doesNotMatch(patch, /@hypermemetic-ai\/media-box/);
  assert.doesNotMatch(patch, /QQ_DSH_HAVE_MEDIA/);
  assert.match(uiPlugin, /progressFor/);
  assert.match(patch, /QQ_PORT \?\? 3082/);
  assert.doesNotMatch(patch, /QQ_DSH_CONSOLE_PORT|QQ_UI_PORT|QQ_WEBSERVER_PORT/);
  assert.match(patch, /QQ_DSH_HAVE_UI/);
  assert.match(patch, /QQ_DSH_HAVE_RELAY/);
  assert.match(patch, /QQ_DSH_HAVE_WORKFLOWS/);
  assert.equal(qqPkg.files?.includes("host.patch.yml"), false);
  assert.match(relayPlugin, /ctx\.provide\("qq-relay", service\)/);
  assert.match(workflowsPlugin, /ctx\.provide\("qq-workflows", service\)/);
  assert.doesNotMatch(workflowsPlugin, /from "\.\.\/qq"|run_workflow|dsh-tool-workflow|ctx\.compaction/);
  assert.match(workflowsPlugin, /workflows\.set\("find"/);
  assert.doesNotMatch(workflowsPlugin, /syncFind/);
  assert.doesNotMatch(relayPlugin, /from "\.\.\/qq"|qq-relay-install-root|qq-relay-client/);
  assert.doesNotMatch(relaySession, /node:(child_process|net)|createServer|qq-relay-install-root|qq-relay-client/);
  assert.match(patch, /inject: \[qq, webServer\]/);
  assert.match(uiPlugin, /refusing a non-loopback web server/);
  assert.match(uiPlugin, /inject = \["qq", "webServer"\]/);
  assert.match(uiPlugin, /kind: "exact"/);
  assert.match(uiPlugin, /createRootRedirectHandler/);
  assert.match(uiPlugin, /path: "\/"/);
  assert.match(qqPlugin, /provide = "qq"/);
  assert.match(qqPlugin, /inject = \["agents", "sessions", "sessionPersistence"\]/);
  assert.match(qqPlugin, /attachSkillToolVisibility/);
  assert.match(qqPlugin, /inject\(\["tools", "skills"\]/);
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
  assert.match(browser, /desktopChair/);
  assert.match(browser, /pendingClose/);
  assert.match(browser, /#close-session/);
  assert.match(browser, /armClose/);
  assert.match(browser, /disarmClose/);
  assert.match(browser, /close-arm/);
  assert.match(browser, /close-keep/);
  assert.match(browser, /dataset\.overlayKeys/);
  assert.match(browser, /overlay-dismiss button\[value="dismiss"\]/);
  assert.match(browser, /\.overlay-\$\{action\}/);
  assert.match(browser, /pendingClose[\s\S]*overlay-popup[\s\S]*#close-session/);
  assert.match(browser, /session-choice[\s\S]*openSession/);
  assert.match(browser, /\/project\\\/\[\^\/\]\+/);
  assert.match(browser, /location\.assign\(`\$\{base\}\/session\/\$\{sessionId\}`\)/);
  assert.match(browser, /workflows-dismiss/);
  assert.match(browser, /workflows-popup/);
  assert.match(browser, /openDrawer/);
  assert.match(browser, /closeDrawer/);
  assert.match(browser, /openDocumentViewer/);
  assert.match(browser, /documentViewerPriorInert/);
  assert.match(browser, /data-document-viewer-open/);
  assert.match(browser, /qq-file-return/);
  assert.match(browser, /history\.back/);
  assert.match(browser, /touchstart/);
  assert.doesNotMatch(browser, /drawer-edge|dx >= 56/);
  assert.match(browser, /trapDrawerFocus/);
  assert.match(browser, /url\.searchParams\.set\("drawer"/);
  assert.match(browser, /updateViaCache: "none"/);
  assert.doesNotMatch(browser, /localStorage|sessionStorage|indexedDB|document\.cookie|EventSource|WebSocket|htmx\.process/);
  assert.match(renderSource, /data-file-path/);
  assert.match(renderSource, /document-viewer-close/);
  assert.match(renderSource, /Back to console/);
  assert.doesNotMatch(renderSource, /outerHTML|controller|observer|lease|take control/i);
  assert.doesNotMatch(workerSource, /addEventListener\("(?:sync|periodicsync|push|notificationclick)"|indexedDB|localStorage/i);

  await runQqPwaBrowserProof();

  const [hostUnit, hostActivate] = await Promise.all([
    readFile(join(root, "systemd/user/qq.service"), "utf8"),
    readFile(join(root, "bin/qq-host-activate"), "utf8"),
  ]);
  assert.match(hostUnit, /ExecStart=%h\/projects\/qq\/bin\/qq/);
  assert.match(hostUnit, /QQ_DSH_PROVIDER=xai-auth/);
  assert.match(hostUnit, /QQ_DSH_MODEL=grok-4.6/);
  assert.match(hostUnit, /%h\/\.local\/state\/qq\/host\.log/);
  assert.match(hostUnit, /WantedBy=default\.target/);
  assert.doesNotMatch(hostUnit, /qq-dictation|QQ_DSH_HAVE_DICTATION|herdr pane|op-stage/);
  assert.match(hostActivate, /systemctl --user daemon-reload/);
  assert.match(hostActivate, /systemctl --user enable qq\.service/);
  assert.match(hostActivate, /systemctl --user restart qq\.service/);
  assert.doesNotMatch(hostActivate, /herdr pane add|operator_stage/);
} finally {
  for (const stream of streams) stream.close();
  server.closeAllConnections?.();
  await new Promise((resolveClose) => server.close(resolveClose));
  projects.remove();
}

console.log("test-qq-host: pass");
