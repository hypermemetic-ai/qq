#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const homeModule = await import(pathToFileURL(join(root, "qq-models/src/home.mjs")));
const storeModule = await import(pathToFileURL(join(root, "qq-models/src/store.mjs")));
const connectorsModule = await import(pathToFileURL(join(root, "qq-models/src/connectors.mjs")));
const commandModule = await import(pathToFileURL(join(root, "qq-models/src/command.mjs")));
const qwenModule = await import(pathToFileURL(join(root, "qq-models/src/qwen.mjs")));
const loginModule = await import(pathToFileURL(join(root, "qq-models/src/login.mjs")));
const grokModule = await import(pathToFileURL(join(root, "qq-models/src/grok.mjs")));
const codexModule = await import(pathToFileURL(join(root, "qq-models/src/codex.mjs")));
const pluginModule = await import(pathToFileURL(join(root, "qq-models/src/plugin.mjs")));
const sessionModule = await import(pathToFileURL(join(root, "qq/src/session.mjs")));
const renderModule = await import(pathToFileURL(join(root, "qq-ui/src/render.mjs")));
const httpModule = await import(pathToFileURL(join(root, "qq-ui/src/http-app.mjs")));

const { resolveDshHome, authFilePath, AUTH_SCHEMA } = homeModule;
const { createAuthStore } = storeModule;
const { CONNECTORS, connectorIds, oauthConnectorIds } = connectorsModule;
const { parseLoginInput, parseLogoutInput } = commandModule;
const { qwenReady, qwenStatusText, qwenLogoutText } = qwenModule;
const { createLoginService } = loginModule;
const { createGrokAdapter, GROK_PROXY_URL, classifyGrokFailure, redact } = grokModule;
const { createCodexAdapter, CODEX_URL } = codexModule;
const { createQqService } = sessionModule;
const { renderLoginSheet, renderSessionContent } = renderModule;
const { createConsoleHandler } = httpModule;

const scratch = mkdtempSync(join(tmpdir(), "qq-models."));
const sessionId = "session-63a11000-0000-4000-8000-000000000084";

function tokens(connector, extra = {}) {
  return {
    access: extra.access ?? `access-${connector}`,
    refresh: extra.refresh ?? `refresh-${connector}`,
    expires: extra.expires ?? Date.now() + 3_600_000,
    ...extra.rest,
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "ERR",
    async text() { return typeof body === "string" ? body : JSON.stringify(body); },
    async json() { return typeof body === "string" ? JSON.parse(body) : body; },
  };
}

try {
  assert.equal(pluginModule.name, "qq-models");
  assert.deepEqual(pluginModule.inject, []);
  assert.equal(pluginModule.provide, "qq-models");
  assert.deepEqual(connectorIds(), ["grok", "codex", "qwen"]);
  assert.deepEqual(oauthConnectorIds(), ["grok", "codex"]);
  assert.equal(CONNECTORS.grok.route, "xai-auth");
  assert.equal(CONNECTORS.codex.route, "openai-codex");
  assert.equal(CONNECTORS.qwen.route, "qwen-token-plan");
  assert.equal(CONNECTORS.grok.firstModel, "grok-4.6");
  assert.equal(CONNECTORS.codex.firstModel, "gpt-5.6-sol");
  assert.equal(AUTH_SCHEMA, "qq.models-auth/v1");

  {
    const headers = grokModule.internals.proxyHeaders("tok", "grok-4.6", sessionId);
    assert.equal(headers["x-grok-client-identifier"], "@hypermemetic-ai/qq-models");
    assert.equal(headers["x-grok-client-version"], "1.0.3");
    assert.notEqual(headers["x-grok-client-version"], "0.0.0");
    assert.match(headers["User-Agent"], /@hypermemetic-ai\/qq-models\/0\.0\.0 /);
    assert.doesNotMatch(headers["User-Agent"], /xai-grok-cli|Grok CLI/i);
    assert.doesNotMatch(headers["x-grok-client-identifier"], /grok-shell/);
  }

  {
    const launcher = readFileSync(join(root, "bin/qq"), "utf8");
    const patch = readFileSync(join(root, "qq/host.patch.yml"), "utf8");
    const uiPlugin = readFileSync(join(root, "qq-ui/src/plugin.mjs"), "utf8");
    const pkg = JSON.parse(readFileSync(join(root, "qq-models/package.json"), "utf8"));
    const cordis = readFileSync(join(root, "qq-models/cordis.patch.yml"), "utf8");
    assert.doesNotMatch(patch, /qq-models|QQ_DSH_HAVE_MODELS/);
    assert.doesNotMatch(launcher, /QQ_DSH_HAVE_MODELS/);
    assert.match(launcher, /qq-\*\/package\.json/);
    assert.match(uiPlugin, /loginSheetFor/);
    assert.match(uiPlugin, /qq-models/);
    assert.equal(pkg.name, "@hypermemetic-ai/qq-models");
    assert.equal(pkg.dsh?.bundle?.patch, "./cordis.patch.yml");
    assert.match(cordis, /id: qq-models/);
    assert.match(cordis, /name: '@hypermemetic-ai\/qq-models'/);
    assert.doesNotMatch(launcher, /Grok is not usable/);
  }

  assert.equal(
    resolveDshHome({ QQ_DSH_HOME: "/state/qq", DSH_HOME: "/other", HOME: "/home/u" }),
    "/state/qq",
  );
  assert.equal(resolveDshHome({ DSH_HOME: "/state/qq", HOME: "/home/u" }), "/state/qq");
  assert.equal(
    resolveDshHome({ XDG_STATE_HOME: "/xdg", HOME: "/home/u" }),
    "/xdg/qq",
  );
  assert.equal(authFilePath("grok", { DSH_HOME: "/state/qq" }), "/state/qq/.qq-grok-auth.json");
  assert.equal(authFilePath("codex", { DSH_HOME: "/state/qq" }), "/state/qq/.qq-codex-auth.json");

  assert.deepEqual(parseLoginInput(""), { action: "sheet" });
  assert.deepEqual(parseLoginInput("grok"), { action: "login", connector: "grok" });
  assert.equal(parseLoginInput("mystery").action, "error");
  assert.deepEqual(parseLogoutInput("codex"), { action: "logout", connector: "codex" });

  {
    const home = join(scratch, "qwen-home");
    mkdirSync(home, { recursive: true });
    assert.equal(qwenReady({ HOME: "/home/u", DSH_HOME: home }), false);
    assert.match(qwenStatusText({ HOME: "/home/u", DSH_HOME: home }), /\.credentials\.yaml/);
    writeFileSync(join(home, ".credentials.yaml"), "QWEN_TOKEN_PLAN_API_KEY: leftover\n", { mode: 0o600 });
    assert.equal(qwenReady({ HOME: "/home/u", DSH_HOME: home }), true);
    assert.match(qwenStatusText({ HOME: "/home/u", DSH_HOME: home }), /ready/);
    assert.match(qwenLogoutText({ HOME: "/home/u", DSH_HOME: home }), /host-owned/);
  }

  {
    const home = join(scratch, "store-home");
    const store = createAuthStore({ env: { HOME: "/home/u", DSH_HOME: home } });
    const written = await store.write("grok", tokens("grok"));
    const file = store.pathFor("grok");
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(store.present("grok"), true);
    assert.equal(store.read("grok").access, "access-grok");
    assert.equal(written.schema, AUTH_SCHEMA);
    await store.rotate("grok", async (current) => ({
      ...current,
      access: "rotated",
      refresh: "new-refresh",
      expires: current.expires + 1,
    }));
    assert.equal(store.read("grok").access, "rotated");
    assert.equal(store.read("grok").refresh, "new-refresh");
    await store.remove("grok");
    assert.equal(store.present("grok"), false);
    assert.equal(existsSync(file), false);
  }

  {
    const home = join(scratch, "login-home");
    const store = createAuthStore({ env: { HOME: "/home/u", DSH_HOME: home } });
    let polls = 0;
    const login = createLoginService({
      store,
      env: { HOME: "/home/u", DSH_HOME: home },
      startDeviceFn: async (id) => ({
        connector: id,
        deviceCode: "dev",
        userCode: "ABCD-EFGH",
        verificationUri: "https://auth.x.ai/connect/device",
        intervalSeconds: 0,
        expiresInSeconds: 60,
      }),
      pollDeviceFn: async () => {
        polls += 1;
        return tokens("grok", { rest: { tokenEndpoint: "https://auth.x.ai/oauth2/token" } });
      },
    });
    const notices = [];
    const agent = {
      session: {
        id: sessionId,
        append(_type, message) { notices.push(message); },
      },
    };
    const started = await login.handleLogin({ agent, rawInput: "grok" });
    assert.equal(started.kind, "success");
    assert.match(started.text, /https:\/\/auth\.x\.ai\/connect\/device/);
    assert.match(started.text, /ABCD-EFGH/);
    await login.polls.get("grok").work;
    assert.equal(polls, 1);
    const file = store.pathFor("grok");
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(store.read("grok").access, "access-grok");
    assert.equal(notices.at(-1)?.source.plugin, "qq-models");
    assert.match(notices.at(-1)?.content[0].text, /Grok logged in/);
    assert.doesNotMatch(JSON.stringify(notices), /access-grok|refresh-grok/);
    assert.equal(existsSync(join(home, ".openai-codex-auth.json")), false);
    assert.equal(existsSync(join(home, ".qq-codex-auth.json")), false);
  }

  {
    const home = join(scratch, "qwen-login");
    mkdirSync(home, { recursive: true });
    const store = createAuthStore({ env: { HOME: "/home/u", DSH_HOME: home } });
    const login = createLoginService({
      store,
      env: { HOME: "/home/u", DSH_HOME: home },
      startDeviceFn: async () => { throw new Error("qwen must not start oauth"); },
    });
    const result = await login.handleLogin({ agent: { session: { id: sessionId } }, rawInput: "qwen" });
    assert.match(result.text, /\.credentials\.yaml/);
    assert.equal(store.present("grok"), false);
    assert.equal(store.present("codex"), false);
  }

  {
    const home = join(scratch, "logout-home");
    const store = createAuthStore({ env: { HOME: "/home/u", DSH_HOME: home } });
    await store.write("grok", tokens("grok"));
    await store.write("codex", tokens("codex", { rest: { accountId: "acct" } }));
    let started;
    let release;
    const hang = new Promise((resolve) => { release = resolve; });
    const login = createLoginService({
      store,
      env: { HOME: "/home/u", DSH_HOME: home },
      startDeviceFn: async (id) => ({
        connector: id,
        deviceCode: "dev",
        userCode: "ZZ",
        verificationUri: "https://auth.x.ai/connect/device",
        intervalSeconds: 0,
        expiresInSeconds: 60,
      }),
      pollDeviceFn: async (_device, { signal }) => {
        started = true;
        await hang;
        if (signal?.aborted) throw new Error("Login cancelled");
        return tokens("grok");
      },
    });
    await login.handleLogin({ agent: { session: { id: sessionId } }, rawInput: "grok" });
    assert.equal(started, true);
    const out = await login.handleLogout({ agent: { session: { id: sessionId } }, rawInput: "grok" });
    assert.match(out.text, /logged out/);
    release();
    await login.polls.get("grok")?.work.catch(() => {});
    assert.equal(store.present("grok"), false);
    assert.equal(store.present("codex"), true);
    const qwenOut = await login.handleLogout({ agent: { session: { id: sessionId } }, rawInput: "qwen" });
    assert.match(qwenOut.text, /host-owned/);
    assert.equal(store.present("codex"), true);
  }

  {
    const home = join(scratch, "dispose-login-home");
    const store = createAuthStore({ env: { HOME: "/home/u", DSH_HOME: home } });
    let aborted = false;
    const login = createLoginService({
      store,
      env: { HOME: "/home/u", DSH_HOME: home },
      startDeviceFn: async (id) => ({
        connector: id,
        deviceCode: "dev",
        userCode: "ZZ",
        verificationUri: "https://auth.x.ai/connect/device",
        intervalSeconds: 0,
        expiresInSeconds: 60,
      }),
      pollDeviceFn: async (_device, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => {
          aborted = true;
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        }, { once: true });
      }),
    });
    await login.handleLogin({ agent: { session: { id: sessionId } }, rawInput: "grok" });
    assert.equal(login.polls.size, 1);
    await login.dispose();
    assert.equal(aborted, true);
    assert.equal(login.polls.size, 0);
  }

  {
    const operatorHome = join(scratch, "operator-home");
    mkdirSync(join(operatorHome, ".pi", "agent"), { recursive: true });
    mkdirSync(join(operatorHome, ".codex"), { recursive: true });
    mkdirSync(join(operatorHome, ".grok"), { recursive: true });
    const forbidden = [
      join(operatorHome, ".pi/agent/auth.json"),
      join(operatorHome, ".codex/auth.json"),
      join(operatorHome, ".grok/auth.json"),
    ];
    const marker = "foreign-token-do-not-copy\n";
    for (const file of forbidden) writeFileSync(file, marker, { mode: 0o600 });
    const stamps = Object.fromEntries(forbidden.map((file) => [file, statSync(file).mtimeMs]));
    const home = join(scratch, "isolation");
    const store = createAuthStore({ env: { HOME: operatorHome, DSH_HOME: home } });
    const login = createLoginService({
      store,
      env: { HOME: operatorHome, DSH_HOME: home },
      startDeviceFn: async (id) => ({
        connector: id,
        deviceCode: "dev",
        userCode: "ISOL",
        verificationUri: "https://auth.x.ai/connect/device",
        intervalSeconds: 0,
        expiresInSeconds: 60,
      }),
      pollDeviceFn: async () => tokens("grok"),
    });
    await login.handleLogin({ agent: { session: { id: sessionId } }, rawInput: "grok" });
    await login.polls.get("grok").work;
    assert.equal(store.present("grok"), true);
    assert.match(store.pathFor("grok"), /\/\.qq-grok-auth\.json$/);
    assert.equal(existsSync(join(operatorHome, ".qq-grok-auth.json")), false);
    for (const file of forbidden) {
      assert.equal(readFileSync(file, "utf8"), marker);
      assert.equal(statSync(file).mtimeMs, stamps[file]);
    }
  }

  {
    const home = join(scratch, "refresh-401");
    const store = createAuthStore({ env: { HOME: "/home/u", DSH_HOME: home }, now: () => 1_000 });
    await store.write("grok", tokens("grok", { expires: 10_000_000 }));
    const calls = [];
    let refreshes = 0;
    const adapter = createGrokAdapter({
      store,
      now: () => 1_000,
      sleepFn: async () => {},
      fetchImpl: async (url, init) => {
        const target = String(url);
        calls.push({ url: target, auth: init.headers?.Authorization, ua: init.headers?.["User-Agent"] ?? init.headers?.["user-agent"] });
        if (target.includes("oauth2/token")) {
          refreshes += 1;
          return jsonResponse({
            access_token: "after-refresh",
            refresh_token: "rotated",
            expires_in: 3600,
          });
        }
        if (init.headers?.Authorization === "Bearer access-grok") return jsonResponse("nope", 401);
        return { ok: true, status: 200, async text() { return "data: {\"text\":\"ok\"}\n\n"; } };
      },
    });
    const streamed = [];
    for await (const chunk of adapter.stream({
      provider: "xai-auth",
      model: "grok-4.6",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    })) streamed.push(chunk);
    assert.ok(calls.some((call) => call.auth === "Bearer access-grok"));
    assert.ok(calls.some((call) => call.auth === "Bearer after-refresh"));
    assert.equal(refreshes, 1);
    assert.equal(store.read("grok").access, "after-refresh");
    assert.ok(streamed.some((chunk) => chunk.type === "text-delta"));
    assert.equal(adapter.lastRequest.url, GROK_PROXY_URL);
    assert.doesNotMatch(adapter.lastRequest.url, /api\.x\.ai/);
    assert.ok(calls.some((call) => /@hypermemetic-ai\/qq-models\/0\.0\.0 \(\+https:\/\/github.com\/hypermemetic-ai\/qq\)/.test(call.ua ?? "")));
    assert.ok(calls.every((call) => !/xai-grok-cli|Grok CLI/i.test(call.ua ?? "")));
    assert.equal(adapter.lastRequest.hasAuthorization, true);
    assert.doesNotMatch(JSON.stringify(adapter.lastRequest), /access-grok|after-refresh|rotated/);
  }

  {
    const home = join(scratch, "transport");
    const store = createAuthStore({ env: { HOME: "/home/u", DSH_HOME: home } });
    await store.write("grok", tokens("grok"));
    let calls = 0;
    const urls = [];
    const adapter = createGrokAdapter({
      store,
      sleepFn: async () => {},
      fetchImpl: async (url) => {
        urls.push(String(url));
        calls += 1;
        if (calls === 1) throw new Error("Responses failed");
        return { ok: true, status: 200, async text() { return "data: {\"text\":\"recovered\"}\n\n"; } };
      },
    });
    const streamed = [];
    for await (const chunk of adapter.stream({
      provider: "xai-auth",
      model: "grok-4.6",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    })) streamed.push(chunk);
    assert.equal(store.read("grok").access, "access-grok");
    assert.ok(urls.every((url) => url === GROK_PROXY_URL));
    assert.ok(streamed.some((chunk) => chunk.text === "recovered"));
  }

  {
    const home = join(scratch, "transport-503");
    const store = createAuthStore({ env: { HOME: "/home/u", DSH_HOME: home } });
    await store.write("grok", tokens("grok"));
    let calls = 0;
    const adapter = createGrokAdapter({
      store,
      sleepFn: async () => {},
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) return jsonResponse("overloaded", 503);
        return { ok: true, status: 200, async text() { return "data: {\"text\":\"recovered-503\"}\n\n"; } };
      },
    });
    const streamed = [];
    for await (const chunk of adapter.stream({
      provider: "xai-auth",
      model: "grok-4.6",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    })) streamed.push(chunk);
    assert.equal(calls, 2);
    assert.ok(streamed.some((chunk) => chunk.text === "recovered-503"));
  }

  {
    const home = join(scratch, "reject");
    const store = createAuthStore({ env: { HOME: "/home/u", DSH_HOME: home } });
    await store.write("grok", tokens("grok"));
    const urls = [];
    const adapter = createGrokAdapter({
      store,
      sleepFn: async () => {},
      fetchImpl: async (url) => {
        urls.push(String(url));
        return jsonResponse("context too large", 400);
      },
    });
    await assert.rejects(
      () => adapter.stream({
        provider: "xai-auth",
        model: "grok-4.6",
        messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      }).next(),
      /400/,
    );
    assert.ok(urls.every((url) => url === GROK_PROXY_URL));
    assert.equal(store.read("grok").access, "access-grok");
    assert.equal(classifyGrokFailure({ status: 400 }), "reject");
    assert.equal(classifyGrokFailure({ message: "Responses failed" }), "transport");
    assert.equal(classifyGrokFailure({ status: 401 }), "auth");
    assert.equal(classifyGrokFailure({ status: 503 }), "transport");
    assert.equal(classifyGrokFailure({ status: 429 }), "transport");
    const provider = new grokModule.GrokLlmError("Responses failed (503)", "PROVIDER", { status: 503 });
    assert.deepEqual(provider.failure, { message: "Responses failed (503)", code: "PROVIDER", status: 503 });
    assert.doesNotMatch(redact("Authorization Bearer super-secret-token"), /super-secret-token/);
  }

  {
    const home = join(scratch, "codex-stream");
    const store = createAuthStore({ env: { HOME: "/home/u", DSH_HOME: home } });
    await store.write("codex", tokens("codex", { rest: { accountId: "acct-1" } }));
    let seen;
    const adapter = createCodexAdapter({
      store,
      fetchImpl: async (url, init) => {
        seen = { url: String(url), account: init.headers["chatgpt-account-id"] };
        return { ok: true, status: 200, async text() { return JSON.stringify({ output_text: "sol" }); } };
      },
    });
    const streamed = [];
    for await (const chunk of adapter.stream({
      provider: "openai-codex",
      model: "gpt-5.6-sol",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    })) streamed.push(chunk);
    assert.equal(seen.url, CODEX_URL);
    assert.match(seen.url, /chatgpt\.com\/backend-api/);
    assert.equal(seen.account, "acct-1");
    assert.ok(streamed.some((chunk) => chunk.text === "sol"));
  }

  {
    const registered = [];
    const commands = [];
    const ctx = {
      get(name) {
        if (name === "llm") {
          return {
            registerAdapter(providers) { registered.push(...providers); return () => {}; },
          };
        }
        if (name === "commands") {
          return {
            register(definition) { commands.push(definition.name); return () => {}; },
          };
        }
        return undefined;
      },
      inject(deps, fn) { fn(ctx); },
      effect(fn) { return fn(); },
      provide() {},
    };
    pluginModule.apply(ctx, { env: { HOME: "/home/u", DSH_HOME: join(scratch, "plugin-home") } });
    assert.deepEqual(registered, ["xai-auth", "openai-codex"]);
    assert.deepEqual(commands, ["login", "logout"]);
  }

  {
    const sheet = renderLoginSheet({
      action: "login",
      connectors: [
        { id: "grok", label: "Grok" },
        { id: "codex", label: "Codex" },
        { id: "qwen", label: "Qwen", hostOwned: true },
      ],
    }, { prompt: "/qq/session/x/prompt" });
    assert.match(sheet, /class="offer-popup login-popup"/);
    assert.match(sheet, /data-connector="grok"/);
    assert.match(sheet, /data-connector="codex"/);
    assert.match(sheet, /data-connector="qwen"/);
    assert.match(sheet, /value="\/login grok"/);
    assert.doesNotMatch(sheet, /Hand off|Ready leftover|offer-handoff/);
    assert.doesNotMatch(sheet, /access-|refresh-|eyJ/);
    const html = renderSessionContent({
      id: sessionId,
      events: [],
      loginSheet: {
        action: "login",
        connectors: [{ id: "grok", label: "Grok" }, { id: "codex", label: "Codex" }, { id: "qwen", label: "Qwen" }],
      },
    }, { prompt: "/qq/session/x/prompt", interrupt: "/i", canonical: "/c", switchSession: "/s", createSession: "/n" });
    assert.match(html, /login-popup/);
    assert.doesNotMatch(html, /Ready leftover/);
  }

  {
    const executed = [];
    const events = [];
    const agent = {
      session: { id: sessionId, events },
      status: "idle",
      followup() { throw new Error("slash must not talk"); },
      whenIdle: async () => {},
    };
    const commands = {
      parseCommand(line) {
        const match = /^\/([a-z][a-z0-9_-]*)(?=$|[\t\n\r ])/u.exec(line);
        return match ? { name: match[1], rawInput: line.slice(match[0].length) } : undefined;
      },
      async execute(_target, line) {
        executed.push(line);
        if (line.startsWith("/login")) {
          return { commandId: "c1", result: { kind: "success", text: "Approve Grok at https://auth.x.ai/connect\nCode: ABCD" } };
        }
        return undefined;
      },
    };
    const qq = createQqService(
      {
        get(name) {
          if (name === "agents") return { get: () => agent, list: () => [agent] };
          if (name === "sessions") return { async flush() {} };
          if (name === "sessionPersistence") return { async list() { return [{ id: sessionId, createdAt: 1 }]; } };
          if (name === "commands") return commands;
          return undefined;
        },
      },
      { sessionId, cwd: "/work", provider: "qwen-token-plan", model: "deepseek-v4-pro-0813" },
    );
    const text = await qq.prompt(sessionId, "/login grok");
    assert.equal(text, "Approve Grok at https://auth.x.ai/connect\nCode: ABCD");
    await assert.rejects(() => qq.prompt(sessionId, "/mystery"), /unknown slash command \/mystery/);
    const missing = createQqService(
      {
        get(name) {
          if (name === "agents") return { get: () => agent, list: () => [agent] };
          if (name === "sessions") return { async flush() {} };
          if (name === "sessionPersistence") return { async list() { return [{ id: sessionId, createdAt: 1 }]; } };
          if (name === "commands") {
            return {
              parseCommand(line) {
                const match = /^\/([a-z][a-z0-9_-]*)(?=$|[\t\n\r ])/u.exec(line);
                return match ? { name: match[1] } : undefined;
              },
              async execute() { return undefined; },
            };
          }
          return undefined;
        },
      },
      { sessionId, cwd: "/work", provider: "qwen-token-plan", model: "deepseek-v4-pro-0813" },
    );
    await assert.rejects(() => missing.prompt(sessionId, "/login"), /unknown slash command \/login/);
    await assert.rejects(() => missing.prompt(sessionId, "/logout"), /unknown slash command \/logout/);
  }

  {
    const home = join(scratch, "http-sheet");
    const store = createAuthStore({ env: { HOME: "/home/u", DSH_HOME: home } });
    const login = createLoginService({
      store,
      env: { HOME: "/home/u", DSH_HOME: home },
      startDeviceFn: async () => ({
        connector: "grok",
        userCode: "WXYZ",
        verificationUri: "https://auth.x.ai/connect/device",
        deviceCode: "dev",
        intervalSeconds: 1,
        expiresInSeconds: 30,
      }),
      pollDeviceFn: async () => new Promise(() => {}),
    });
    const events = [];
    const agent = {
      session: { id: sessionId, events },
      status: "idle",
      followup() {},
      whenIdle: async () => {},
    };
    const commands = {
      parseCommand(line) {
        const match = /^\/([a-z][a-z0-9_-]*)(?=$|[\t\n\r ])/u.exec(line);
        return match ? { name: match[1], rawInput: line.slice(match[0].length) } : undefined;
      },
      async execute(target, line) {
        const parsed = commands.parseCommand(line);
        if (parsed.name === "login") return { commandId: "c", result: await login.handleLogin({ agent: target, rawInput: parsed.rawInput }) };
        if (parsed.name === "logout") return { commandId: "c", result: await login.handleLogout({ agent: target, rawInput: parsed.rawInput }) };
        return undefined;
      },
    };
    const qq = createQqService(
      {
        get(name) {
          if (name === "agents") return { get: () => agent, list: () => [agent] };
          if (name === "sessions") return { async flush() {} };
          if (name === "sessionPersistence") return { async list() { return [{ id: sessionId, createdAt: 1 }]; } };
          if (name === "commands") return commands;
          return undefined;
        },
      },
      { sessionId, cwd: "/work", provider: "qwen-token-plan", model: "deepseek-v4-pro-0813" },
    );
    const server = createServer(createConsoleHandler(qq, {
      ssePollMs: 20,
      loginSheetFor: (id) => login.sheetFor(id),
    }));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const post = (prompt) => new Promise((resolve, reject) => {
      const body = new URLSearchParams({ prompt }).toString();
      const req = httpRequest({
        host: "127.0.0.1",
        port,
        path: `/qq/session/${sessionId}/prompt`,
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "content-length": Buffer.byteLength(body),
          "hx-request": "true",
          origin: `http://127.0.0.1:${port}`,
        },
      }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      });
      req.on("error", reject);
      req.end(body);
    });
    const sheet = await post("/login");
    assert.equal(sheet.status, 200);
    assert.match(sheet.body, /login-popup/);
    assert.match(sheet.body, /data-connector="grok"/);
    assert.match(sheet.body, /data-connector="codex"/);
    assert.match(sheet.body, /data-connector="qwen"/);
    assert.doesNotMatch(sheet.body, /Ready leftover|Hand off/);
    const named = await post("/login grok");
    assert.equal(named.status, 200);
    assert.match(named.body, /class="notice" role="status">[\s\S]*https:\/\/auth\.x\.ai\/connect\/device/);
    assert.match(named.body, /WXYZ/);
    assert.doesNotMatch(named.body, /login-popup/);
    const unknown = await post("/mystery");
    assert.equal(unknown.status, 400);
    assert.match(unknown.body, /unknown slash command \/mystery/);
    server.close();
  }

  {
    const script = join(root, "bin/qq");
    const missing = spawnSync("bash", [script], {
      env: {
        ...process.env,
        HOME: join(scratch, "gate-home"),
        DSH_HOME: join(scratch, "gate-state"),
        QQ_DSH_PROVIDER: "xai-auth",
        QQ_DSH_MODEL: "grok-4.6",
      },
      encoding: "utf8",
    });
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /xai-auth requires a Grok login/);
    assert.doesNotMatch(missing.stderr, /QWEN_TOKEN_PLAN_API_KEY/);
    const launcher = readFileSync(script, "utf8");
    assert.doesNotMatch(launcher, /Grok is not usable|xai-auth OAuth refresh\/proxy/);
    assert.match(launcher, /xai-auth requires a Grok login/);
    const xaiArm = launcher.match(/xai-auth\)\s*([\s\S]*?);;/)?.[1] ?? "";
    assert.match(xaiArm, /\.qq-grok-auth\.\$\{auth_ext\}/);
    assert.doesNotMatch(xaiArm, /QWEN_TOKEN_PLAN_API_KEY/);
    const qwenArm = launcher.match(/qwen-token-plan\)\s*([\s\S]*?);;/)?.[1] ?? "";
    assert.match(qwenArm, /QWEN_TOKEN_PLAN_API_KEY/);
  }

  {
    const login = createLoginService({
      store: createAuthStore({ env: { HOME: "/home/u", DSH_HOME: join(scratch, "sheet") } }),
      env: { HOME: "/home/u", DSH_HOME: join(scratch, "sheet") },
    });
    await login.handleLogin({ agent: { session: { id: sessionId } }, rawInput: "" });
    const sheet = login.sheetFor(sessionId);
    assert.equal(sheet.action, "login");
    assert.deepEqual(sheet.connectors.map((row) => row.id), ["grok", "codex", "qwen"]);
    await login.handleLogout({ agent: { session: { id: sessionId } }, rawInput: "" });
    const logout = login.sheetFor(sessionId);
    assert.equal(logout.action, "logout");
    assert.equal(logout.connectors.find((row) => row.id === "qwen").hostOwned, true);
  }

  console.log("test-qq-models: pass");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
