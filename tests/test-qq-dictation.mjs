#!/usr/bin/env node
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(fileURLToPath(new URL(".", import.meta.url)));
const serviceModule = await import(pathToFileURL(join(root, "qq-dictation/src/service.mjs")));
const httpModule = await import(pathToFileURL(join(root, "qq-dictation/src/http.mjs")));
const pluginModule = await import(pathToFileURL(join(root, "qq-dictation/src/plugin.mjs")));
const recognizerModule = await import(pathToFileURL(join(root, "qq-dictation/src/recognizer.mjs")));
const renderModule = await import(pathToFileURL(join(root, "qq-ui/src/render.mjs")));
const qqPlugin = await import(pathToFileURL(join(root, "qq/src/plugin.mjs")));

const {
  SESSION_ID,
  asUserSpeech,
  parseSessionId,
  resumeSessionId,
  createDictationService,
} = serviceModule;
const { createDictateHandler, internals } = httpModule;
const { createHandyRecognizer, defaultHandyBin } = recognizerModule;
const { renderSessionContent, renderPage } = renderModule;

const scratch = mkdtempSync(join(tmpdir(), "qq-dictation."));
const sessionId = (marker) =>
  `session-63a11000-0000-4000-8000-${String(marker).padStart(12, "0")}`;
const alphaId = sessionId("00000000000a");
const betaId = sessionId("00000000000b");
const goneId = sessionId("00000000000c");

const clientJs = readFileSync(join(root, "qq-dictation/src/client.js"), "utf8");
const pluginSource = readFileSync(join(root, "qq-dictation/src/plugin.mjs"), "utf8");
const serviceSource = readFileSync(join(root, "qq-dictation/src/service.mjs"), "utf8");
const httpSource = readFileSync(join(root, "qq-dictation/src/http.mjs"), "utf8");
const recognizerSource = readFileSync(join(root, "qq-dictation/src/recognizer.mjs"), "utf8");

function fakeQq(options = {}) {
  const present = new Set(options.sessions ?? [alphaId, betaId]);
  const prompts = [];
  const missing = new Set(options.gone ?? []);
  return {
    defaultSessionId: options.defaultSessionId ?? alphaId,
    prompts,
    present,
    async list() {
      return [...present].map((id) => ({ id, createdAt: 1 }));
    },
    async read(id) {
      if (!present.has(id) || missing.has(id)) {
        const error = new Error("DSH session not found");
        error.status = 404;
        throw error;
      }
      return { id, events: [], agentStatus: "idle" };
    },
    async prompt(id, text) {
      if (!present.has(id) || missing.has(id)) {
        const error = new Error("DSH session not found");
        error.status = 404;
        throw error;
      }
      prompts.push({ id, text });
    },
    async interrupt() {
      return false;
    },
    create() {
      throw new Error("unused");
    },
  };
}

function request(server, path, options = {}) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      host: "127.0.0.1",
      port: address.port,
      path,
      method: options.method ?? "GET",
      agent: false,
      headers: options.headers,
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.on("error", reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

async function withServer(handler, run) {
  const server = createServer((req, res) => {
    void handler(req, res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await run(server);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

try {
  assert.deepEqual(pluginModule.inject, ["qq", "webServer"]);
  assert.equal(pluginModule.provide, "qq-dictation");
  assert.equal(pluginModule.name, "qq-dictation");
  assert.match(SESSION_ID.source, /session-/);
  assert.equal(parseSessionId(alphaId), alphaId);
  assert.equal(parseSessionId("nope"), "");
  assert.equal(asUserSpeech("  hello world  "), "hello world");
  assert.equal(asUserSpeech(""), "");
  assert.equal(asUserSpeech("   "), "");
  assert.equal(asUserSpeech("/workflows list"), "workflows list");
  assert.equal(asUserSpeech("///secret"), "secret");
  assert.equal(asUserSpeech("\\tasks"), "tasks");
  assert.ok(!pluginSource.includes("HERDR_PANE_ID"));
  assert.ok(!serviceSource.includes("HERDR_PANE_ID"));
  assert.ok(!httpSource.includes("HERDR_PANE_ID"));
  assert.ok(!recognizerSource.includes("HERDR_PANE_ID"));
  assert.ok(!clientJs.includes("HERDR_PANE_ID"));
  assert.match(clientJs, /AltRight/);
  assert.match(clientJs, /Delete/);
  assert.match(clientJs, /#composer-dictate/);
  assert.match(clientJs, /#composer-submit/);
  assert.match(clientJs, /\/chunk/);
  assert.doesNotMatch(String(qqPlugin.apply), /dictate/);
  assert.match(defaultHandyBin({ HOME: "/home/op" }), /\/\.local\/bin\/handy$/);
  assert.equal(internals.routeOf("/qq/dictate", "/qq/dictate/start"), "start");

  writeFileSync(join(scratch, "qq.session"), `${alphaId}\n`);
  assert.equal(resumeSessionId({ DSH_HOME: scratch }), alphaId);
  writeFileSync(join(scratch, "qq.session"), "not-a-session\n");
  writeFileSync(join(scratch, "qq-console.session"), `${betaId}\n`);
  assert.equal(resumeSessionId({ DSH_HOME: scratch }), betaId);
  assert.equal(resumeSessionId({}), "");

  {
    const qq = fakeQq();
    const recognized = [];
    const service = createDictationService(
      { get: () => qq },
      {
        recognize: async (audio) => {
          recognized.push(audio);
          return " spoken line ";
        },
      },
    );
    assert.deepEqual(service.snapshot(), { state: "idle", boundSessionId: null, lastFocus: null });
    await assert.rejects(() => service.end(), /not recording/);
    const started = await service.start({ sessionId: alphaId });
    assert.equal(started.state, "recording");
    assert.equal(started.boundSessionId, alphaId);
    await assert.rejects(() => service.start({ sessionId: betaId }), /already recording/);
    service.appendAudio(Buffer.from("wa"));
    const sent = await service.end();
    assert.equal(sent.sent, true);
    assert.equal(sent.text, "spoken line");
    assert.deepEqual(qq.prompts, [{ id: alphaId, text: "spoken line" }]);
    assert.equal(Buffer.from(recognized[0]).toString(), "wa");
  }

  {
    const qq = fakeQq();
    const service = createDictationService({ get: () => qq }, {
      recognize: async () => "should not run",
    });
    service.noteFocus(alphaId);
    await service.start({ sessionId: alphaId });
    const cancelled = await service.cancel();
    assert.equal(cancelled.state, "idle");
    assert.equal(qq.prompts.length, 0);
  }

  {
    const qq = fakeQq();
    const service = createDictationService({ get: () => qq }, {
      recognize: async () => "   ",
    });
    await service.start({ sessionId: alphaId });
    const empty = await service.end({ audio: Buffer.from("x") });
    assert.equal(empty.sent, false);
    assert.equal(empty.reason, "empty");
    assert.equal(qq.prompts.length, 0);
  }

  {
    const qq = fakeQq();
    const service = createDictationService({ get: () => qq }, {
      recognize: async () => "/workflows now",
    });
    await service.start({ sessionId: alphaId });
    const sent = await service.end({ audio: Buffer.from("x") });
    assert.equal(sent.text, "workflows now");
    assert.deepEqual(qq.prompts, [{ id: alphaId, text: "workflows now" }]);
  }

  {
    const qq = fakeQq();
    const service = createDictationService({ get: () => qq }, {
      recognize: async () => "later",
    });
    service.noteFocus(alphaId);
    await service.start();
    service.noteFocus(betaId);
    const sent = await service.end({ audio: Buffer.from("x") });
    assert.equal(sent.boundSessionId, alphaId);
    assert.deepEqual(qq.prompts, [{ id: alphaId, text: "later" }]);
  }

  {
    const qq = fakeQq();
    qq.present.delete(alphaId);
    const service = createDictationService({ get: () => qq }, {
      recognize: async () => "orphan",
    });
    await service.start({ sessionId: alphaId });
    const dropped = await service.end({ audio: Buffer.from("x") });
    assert.equal(dropped.sent, false);
    assert.equal(dropped.reason, "gone");
    assert.match(dropped.message, /gone/i);
    assert.equal(qq.prompts.length, 0);
  }

  {
    const qq = fakeQq({ sessions: [betaId], defaultSessionId: betaId });
    writeFileSync(join(scratch, "qq.session"), `${betaId}\n`);
    const service = createDictationService({ get: () => qq }, {
      env: { DSH_HOME: scratch },
      recognize: async () => "resume",
    });
    await service.start();
    const sent = await service.end({ text: "resume" });
    assert.equal(sent.boundSessionId, betaId);
    assert.deepEqual(qq.prompts, [{ id: betaId, text: "resume" }]);
  }

  {
    const qq = fakeQq();
    const service = createDictationService({ get: () => qq }, {
      recognize: async () => "desktop",
    });
    service.noteFocus(betaId);
    await service.start();
    const sent = await service.end({ text: "desktop" });
    assert.equal(sent.boundSessionId, betaId);
    assert.deepEqual(qq.prompts, [{ id: betaId, text: "desktop" }]);
  }

  {
    const qq = fakeQq();
    const handler = createDictateHandler(
      createDictationService({ get: () => qq }, {
        recognize: async () => "from phone",
      }),
    );
    await withServer(handler, async (server) => {
      const page = renderSessionContent(
        { id: alphaId, events: [], agentStatus: "idle" },
        {
          canonical: `/qq/session/${alphaId}`,
          events: `/qq/session/${alphaId}/events`,
          interrupt: `/qq/session/${alphaId}/interrupt`,
          prompt: `/qq/session/${alphaId}/prompt`,
          createSession: "/qq/sessions",
          switchSession: "/qq/sessions/open",
        },
      );
      assert.match(page, /id="composer-dictate"/);
      assert.match(page, new RegExp(`data-session-id="${alphaId}"`));
      assert.match(page, /id="composer-submit"/);
      const full = renderPage(
        { id: alphaId, events: [], agentStatus: "idle" },
        {
          canonical: `/qq/session/${alphaId}`,
          events: `/qq/session/${alphaId}/events`,
          interrupt: `/qq/session/${alphaId}/interrupt`,
          prompt: `/qq/session/${alphaId}/prompt`,
          createSession: "/qq/sessions",
          switchSession: "/qq/sessions/open",
        },
        {
          manifest: "/qq/assets/manifest-v3.webmanifest",
          icon192: "/qq/assets/icon-v2-192.png",
          css: "/qq/assets/console-v8.css",
          htmx: "/qq/assets/htmx-2.0.10.min.js",
          sse: "/qq/assets/htmx-ext-sse-2.2.4.js",
          browser: "/qq/assets/browser-v4.js",
          serviceWorker: "/qq/sw-v9.js",
        },
      );
      assert.match(full, /\/qq\/dictate\/client\.js/);

      const client = await request(server, "/qq/dictate/client.js");
      assert.equal(client.status, 200);
      assert.match(client.body, /AltRight/);

      const focus = await request(server, "/qq/dictate/focus", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ sessionId: alphaId }),
      });
      assert.equal(focus.status, 200);
      assert.match(focus.body, /"lastFocus":"session-63a11000-0000-4000-8000-00000000000a"/);

      const started = await request(server, "/qq/dictate/start", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ sessionId: alphaId }),
      });
      assert.equal(started.status, 200);
      assert.match(started.body, /"state":"recording"/);

      const chunked = await request(server, "/qq/dictate/chunk", {
        method: "POST",
        headers: { "content-type": "application/octet-stream", "sec-fetch-site": "same-origin" },
        body: Buffer.from("fake-wav"),
      });
      assert.equal(chunked.status, 200);
      const ended = await request(server, "/qq/dictate/end", {
        method: "POST",
        headers: { "content-type": "application/octet-stream", "sec-fetch-site": "same-origin" },
        body: Buffer.alloc(0),
      });
      assert.equal(ended.status, 200);
      assert.match(ended.body, /"sent":true/);
      assert.deepEqual(qq.prompts, [{ id: alphaId, text: "from phone" }]);
    });
  }

  {
    const qq = fakeQq();
    const handler = createDictateHandler(
      createDictationService({ get: () => qq }, { recognize: async () => "nope" }),
    );
    await withServer(handler, async (server) => {
      await request(server, "/qq/dictate/start", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ sessionId: alphaId }),
      });
      const cancelled = await request(server, "/qq/dictate/cancel", {
        method: "POST",
        headers: { "sec-fetch-site": "same-origin" },
        body: "",
      });
      assert.equal(cancelled.status, 200);
      assert.match(cancelled.body, /"state":"idle"/);
      assert.equal(qq.prompts.length, 0);
    });
  }

  {
    const qq = fakeQq();
    const handler = createDictateHandler(
      createDictationService({ get: () => qq }, { recognize: async () => "desktop end" }),
    );
    await withServer(handler, async (server) => {
      await request(server, "/qq/dictate/focus", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ sessionId: betaId }),
      });
      const started = await request(server, "/qq/dictate/start", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: "{}",
      });
      assert.match(started.body, new RegExp(`"boundSessionId":"${betaId}"`));
      const ended = await request(server, "/qq/dictate/end", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ text: "desktop end" }),
      });
      assert.equal(ended.status, 200);
      assert.deepEqual(qq.prompts, [{ id: betaId, text: "desktop end" }]);
    });
  }

  {
    const qq = fakeQq();
    const handler = createDictateHandler(
      createDictationService({ get: () => qq }, { recognize: async () => "" }),
    );
    await withServer(handler, async (server) => {
      await request(server, "/qq/dictate/start", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ sessionId: alphaId }),
      });
      const ended = await request(server, "/qq/dictate/end", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ text: "   " }),
      });
      assert.match(ended.body, /"sent":false/);
      assert.equal(qq.prompts.length, 0);
    });
  }

  {
    const qq = fakeQq();
    const handler = createDictateHandler(
      createDictationService({ get: () => qq }, { recognize: async () => "x" }),
    );
    await withServer(handler, async (server) => {
      const blocked = await request(server, "/qq/dictate/start", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.example" },
        body: JSON.stringify({ sessionId: alphaId }),
      });
      assert.equal(blocked.status, 403);
    });
  }

  {
    let spawned = null;
    const recognizer = createHandyRecognizer({
      handyBin: "/tmp/fake-handy",
      spawn(bin, args) {
        spawned = { bin, args };
        const listeners = { data: [], close: [] };
        queueMicrotask(() => {
          for (const fn of listeners.data) fn(Buffer.from('{"text":"hello from handy"}'));
          for (const fn of listeners.close) fn(0, null);
        });
        return {
          stdout: {
            on(name, fn) {
              if (name === "data") listeners.data.push(fn);
            },
          },
          stderr: { on() {} },
          on(name, fn) {
            if (name === "close") listeners.close.push(fn);
          },
          kill() {},
        };
      },
    });
    const text = await recognizer.recognize(Buffer.from("RIFF"));
    assert.equal(text, "hello from handy");
    assert.equal(spawned.bin, "/tmp/fake-handy");
    assert.deepEqual(spawned.args.slice(0, 3), ["--transcribe-file", spawned.args[1], "--json"]);
    assert.doesNotMatch(spawned.args.join(" "), /HERDR_PANE_ID|herdr-pane/);


  }

  {
    const qq = fakeQq();
    const routes = [];
    const provided = {};
    const ctx = {
      webServer: {
        host: "127.0.0.1",
        register(route) {
          routes.push(route);
          return () => {
            const at = routes.indexOf(route);
            if (at >= 0) routes.splice(at, 1);
          };
        },
      },
      get(name) {
        if (name === "qq") return qq;
        return provided[name];
      },
      provide(name, value) {
        provided[name] = value;
      },
      effect(factory) {
        return factory();
      },
    };
    pluginModule.apply(ctx, { recognize: async () => "via apply" });
    assert.equal(provided["qq-dictation"], ctx.get("qq-dictation"));
    assert.equal(routes.length, 1);
    assert.equal(routes[0].kind, "prefix");
    assert.equal(routes[0].path, "/qq/dictate");
    await withServer(routes[0].handler, async (server) => {
      const started = await request(server, "/qq/dictate/start", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ sessionId: alphaId }),
      });
      assert.equal(started.status, 200);
      const ended = await request(server, "/qq/dictate/end", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ text: "via apply" }),
      });
      assert.equal(ended.status, 200);
      assert.deepEqual(qq.prompts, [{ id: alphaId, text: "via apply" }]);
    });
    assert.throws(
      () => pluginModule.apply({
        ...ctx,
        webServer: { ...ctx.webServer, host: "0.0.0.0" },
      }, { recognize: async () => "" }),
      /loopback/,
    );
  }

  assert.equal(qqPlugin.provide, "qq");
  assert.doesNotMatch(String(qqPlugin.apply), /qq-dictation/);
  assert.ok(!goneId.includes("HERDR"));

  const css = readFileSync(join(root, "qq-ui/assets/console.css"), "utf8");
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) auto auto/);
  assert.match(css, /#composer-dictate/);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log("test-qq-dictation: pass");
