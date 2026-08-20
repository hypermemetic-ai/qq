#!/usr/bin/env node
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(new URL(".", import.meta.url)));
const serviceModuleUrl = pathToFileURL(join(root, "qq-dictation/src/service.mjs"));
const serviceModule = await import(serviceModuleUrl);
const reloadedServiceModule = await import(`${serviceModuleUrl.href}?hmr-test=1`);
const httpModule = await import(pathToFileURL(join(root, "qq-dictation/src/http.mjs")));
const pluginModule = await import(pathToFileURL(join(root, "qq-dictation/src/plugin.mjs")));
const recognizerModule = await import(pathToFileURL(join(root, "qq-dictation/src/recognizer.mjs")));
const renderModule = await import(pathToFileURL(join(root, "qq-ui/src/render.mjs")));
const qqPlugin = await import(pathToFileURL(join(root, "qq/src/plugin.mjs")));

const {
  SESSION_ID,
  CAPTURE_LEASE_ID,
  asUserSpeech,
  parseSessionId,
  parseCaptureLeaseId,
  resumeSessionId,
  createCaptureLeaseAuthority,
  createDictationService,
} = serviceModule;
const { createDictateHandler, internals } = httpModule;
const { createHandyRecognizer, defaultHandyBin, encodePcm16MonoWav, asWavBytes } = recognizerModule;
const { renderSessionContent, renderPage } = renderModule;

const scratch = mkdtempSync(join(tmpdir(), "qq-dictation."));
const sessionId = (marker) =>
  `session-63a11000-0000-4000-8000-${String(marker).padStart(12, "0")}`;
const alphaId = sessionId("00000000000a");
const betaId = sessionId("00000000000b");
const goneId = sessionId("00000000000c");
const captureLeaseId = (marker) =>
  `73a11000-0000-4000-8000-${String(marker).padStart(12, "0")}`;
const alphaLease = captureLeaseId("00000000000a");
const betaLease = captureLeaseId("00000000000b");
let clientLeaseSerial = 100;

const clientJs = readFileSync(join(root, "qq-dictation/src/client.js"), "utf8");
const browserJs = readFileSync(join(root, "qq-ui/assets/browser-v8.js"), "utf8");
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
    async close() {
      throw new Error("unused");
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

class Element {
  constructor(tagName = "DIV") {
    this.id = "";
    this.tagName = tagName;
    this.type = "";
    this.dataset = {};
    this.attributes = {};
    this.textContent = "";
    this.parentElement = null;
    this.hidden = false;
    this.inert = false;
    this.style = {};
    this.scrollHeight = 0;
    this.scrollTop = 0;
    this.offsetHeight = 0;
    this.clientHeight = 0;
    this.classList = {
      names: new Set(),
      add(...names) {
        for (const name of names) this.names.add(name);
      },
      remove(...names) {
        for (const name of names) this.names.delete(name);
      },
      toggle(name, force) {
        if (force === true) this.names.add(name);
        else if (force === false) this.names.delete(name);
        else if (this.names.has(name)) this.names.delete(name);
        else this.names.add(name);
        return this.names.has(name);
      },
      contains(name) {
        return this.names.has(name);
      },
    };
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
  replaceChildren(...children) {
    this.textContent = children.join("");
  }
  focus() {}
  closest(selector) {
    let node = this;
    while (node) {
      if (selector.startsWith("#") && node.id === selector.slice(1)) return node;
      node = node.parentElement;
    }
    return null;
  }
}

class HTMLTextAreaElement extends Element {
  constructor() {
    super("TEXTAREA");
    this.value = "";
    this.selectionStart = 0;
    this.selectionEnd = 0;
  }
  setSelectionRange(start, end) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }
}
class HTMLFormElement extends Element {
  constructor() {
    super("FORM");
  }
}
class HTMLSelectElement extends Element {
  constructor() {
    super("SELECT");
  }
}
class HTMLDetailsElement extends Element {
  constructor() {
    super("DETAILS");
  }
}

class CustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

function makeSharedClientTransport() {
  let state = "idle";
  let ownerLease = "";
  const calls = [];

  return {
    calls,
    get state() { return state; },
    get ownerLease() { return ownerLease; },
    revokeOwner() {
      ownerLease = "";
      state = "idle";
    },
    async fetch(path, init = {}) {
      const headers = init.headers ?? {};
      const presented = headers["x-qq-dictation-lease"] ?? "";
      let body = {};
      if (typeof init.body === "string" && init.body) body = JSON.parse(init.body);
      calls.push({ path, presented, body, keepalive: init.keepalive === true });
      if (path === "/qq/dictate/" || path === "/qq/dictate") {
        const capture = ownerLease ? (presented === ownerLease ? "local" : "foreign") : null;
        return {
          ok: true,
          status: 200,
          json: async () => ({ state, capture, resumable: capture === "local" && state === "idle" }),
        };
      }
      if (path.endsWith("/focus")) {
        return { ok: true, status: 200, json: async () => ({ lastFocus: alphaId }) };
      }
      if (path.endsWith("/start")) {
        if (!body.leaseId || ownerLease) {
          return { ok: false, status: body.leaseId ? 409 : 400, json: async () => ({ error: "busy" }) };
        }
        ownerLease = body.leaseId;
        state = "recording";
        return { ok: true, status: 200, json: async () => ({ state, capture: "local" }) };
      }
      if (path.endsWith("/resume")) {
        if (!ownerLease || body.leaseId !== ownerLease) {
          return { ok: false, status: 409, json: async () => ({ error: "revoked" }) };
        }
        state = "recording";
        return { ok: true, status: 200, json: async () => ({ state, capture: "local" }) };
      }
      if (path.endsWith("/cancel")) {
        if (!ownerLease || body.leaseId !== ownerLease) {
          return { ok: false, status: 409, json: async () => ({ error: "not owner" }) };
        }
        ownerLease = "";
        state = "idle";
        return { ok: true, status: 200, json: async () => ({ state, capture: null }) };
      }
      if (path.endsWith("/end")) {
        if (!ownerLease || presented !== ownerLease) {
          return { ok: false, status: 409, json: async () => ({ error: "not owner", sent: false }) };
        }
        ownerLease = "";
        state = "idle";
        return { ok: true, status: 200, json: async () => ({ state, capture: null, sent: true }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    },
  };
}

function makeClientHarness(options = {}) {
  const fetches = [];
  let serverState = "idle";
  let serverLease = "";
  let endFailures = options.end409Once ? 1 : 0;
  let processor = null;
  let mediaStarts = 0;
  let stoppedTracks = 0;
  let timerId = 10;
  const timers = new Map();
  const intervals = new Map();
  const byId = new Map();
  const listeners = [];
  const windowListeners = [];
  const outside = new Element();
  let nodes = null;

  const installComposer = (nextSessionId = options.sessionId ?? alphaId) => {
    const composer = new HTMLFormElement();
    composer.id = "composer";
    composer.dataset.sessionId = options.omitComposerSession ? "" : nextSessionId;
    const dictate = new Element("BUTTON");
    dictate.id = "composer-dictate";
    dictate.type = "button";
    dictate.dataset.state = "idle";
    dictate.parentElement = composer;
    const submit = new Element("BUTTON");
    submit.id = "composer-submit";
    submit.type = "submit";
    submit.parentElement = composer;
    const prompt = new HTMLTextAreaElement();
    prompt.id = "prompt";
    prompt.parentElement = composer;
    prompt.form = composer;
    const status = new Element("SPAN");
    status.id = "dictation-status";
    status.dataset.state = "idle";
    status.hidden = true;
    status.parentElement = composer;
    for (const node of [composer, dictate, submit, prompt, status]) byId.set(node.id, node);
    nodes = { composer, dictate, submit, prompt, status };
    return nodes;
  };
  installComposer();

  class FakeAudioContext {
    constructor() {
      this.sampleRate = 16_000;
      this.state = "running";
      this.destination = {};
    }
    async resume() {
      this.state = "running";
    }
    async close() {
      this.state = "closed";
    }
    createMediaStreamSource() {
      return { connect() {}, disconnect() {} };
    }
    createGain() {
      return { gain: { value: 0 }, connect() {}, disconnect() {} };
    }
    createScriptProcessor() {
      processor = { onaudioprocess: null, connect() {}, disconnect() {} };
      return processor;
    }
  }

  let releaseMicGate = null;
  const micGate = options.deferMic
    ? new Promise((resolve) => { releaseMicGate = resolve; })
    : null;
  const mediaDevices = options.noMic
    ? undefined
    : {
        async getUserMedia() {
          mediaStarts += 1;
          if (options.micError) throw new Error("denied");
          if (micGate) await micGate;
          return { getTracks: () => [{ stop() { stoppedTracks += 1; } }] };
        },
      };

  function dispatch(type, event, capture = false) {
    for (const listener of [...listeners]) {
      if (listener.type !== type || listener.capture !== capture) continue;
      listener.fn(event);
      if (listener.once) {
        const at = listeners.indexOf(listener);
        if (at >= 0) listeners.splice(at, 1);
      }
    }
  }

  const body = new Element("BODY");
  body.children = [];
  const document = {
    readyState: "complete",
    activeElement: null,
    currentScript: { dataset: {} },
    body,
    querySelector(selector) {
      if (/^#[A-Za-z0-9_-]+$/.test(selector)) return byId.get(selector.slice(1)) ?? null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "#dictation-status") {
        const status = byId.get("dictation-status");
        return status ? [status] : [];
      }
      return [];
    },
    addEventListener(type, fn, opts) {
      listeners.push({
        type,
        fn,
        capture: opts === true || opts?.capture === true,
        once: opts?.once === true,
      });
    },
    dispatchEvent(event) {
      dispatch(event.type, event, false);
      return true;
    },
  };

  const windowObj = {
    AudioContext: FakeAudioContext,
    webkitAudioContext: FakeAudioContext,
    matchMedia() {
      return { matches: options.desktop === true };
    },
    setInterval(fn) {
      intervals.set(1, fn);
      return 1;
    },
    setTimeout(fn) {
      const id = timerId++;
      timers.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    addEventListener(type, fn, opts) {
      windowListeners.push({ type, fn, once: opts?.once === true });
    },
  };

  let releaseEndGate = null;
  const endGate = options.deferEnd
    ? new Promise((resolve) => { releaseEndGate = resolve; })
    : null;
  const pathname = options.pathname ?? `/qq/session/${options.sessionId ?? alphaId}`;
  const assigned = [];
  const location = {
    pathname,
    href: `http://127.0.0.1${pathname}`,
    assign(value) {
      assigned.push(String(value));
    },
  };
  const sandbox = {
    ArrayBuffer,
    DataView,
    Uint8Array,
    Int16Array,
    Float32Array,
    Blob,
    Error,
    Math,
    JSON,
    Object,
    Promise,
    URL,
    Element,
    HTMLElement: Element,
    HTMLTextAreaElement,
    HTMLFormElement,
    HTMLSelectElement,
    HTMLDetailsElement,
    CustomEvent,
    document,
    history: { state: null, replaceState() {} },
    location,
    navigator: { mediaDevices },
    crypto: {
      randomUUID() {
        const id = captureLeaseId(clientLeaseSerial);
        clientLeaseSerial += 1;
        return id;
      },
    },
    performance: { now: () => 1 },
    requestAnimationFrame(fn) {
      fn();
      return 1;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    window: windowObj,
    fetch: async (url, init = {}) => {
      const path = String(url);
      const headers = init.headers ?? {};
      const body = init.body;
      fetches.push({ path, method: init.method ?? "GET", headers, body, keepalive: init.keepalive === true });
      if (typeof options.fetch === "function") return options.fetch(path, init);
      const ownerLease = headers["x-qq-dictation-lease"] ?? "";
      if (path === "/qq/dictate/" || path === "/qq/dictate") {
        const capture = serverLease ? (ownerLease === serverLease ? "local" : "foreign") : null;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            state: serverState,
            capture,
            resumable: capture === "local" && serverState === "idle",
          }),
        };
      }
      if (path.endsWith("/start")) {
        const parsed = JSON.parse(String(body || "{}"));
        if (!parsed.leaseId || (serverLease && serverLease !== parsed.leaseId)) {
          return { ok: false, status: parsed.leaseId ? 409 : 400, json: async () => ({ error: "not owner" }) };
        }
        serverLease = parsed.leaseId;
        serverState = "recording";
        return {
          ok: true,
          status: 200,
          json: async () => ({ state: "recording", capture: "local", resumable: false }),
        };
      }
      if (path.endsWith("/resume")) {
        const parsed = JSON.parse(String(body || "{}"));
        if (!serverLease || serverLease !== parsed.leaseId) {
          return { ok: false, status: 409, json: async () => ({ error: "lease revoked" }) };
        }
        serverState = "recording";
        return {
          ok: true,
          status: 200,
          json: async () => ({ state: "recording", capture: "local", resumable: false }),
        };
      }
      if (path.endsWith("/end") && (ownerLease !== serverLease || !serverLease)) {
        return { ok: false, status: 409, json: async () => ({ error: "not recording", sent: false }) };
      }
      if (path.endsWith("/end") && endFailures > 0) {
        endFailures -= 1;
        serverState = "idle";
        return {
          ok: false,
          status: 409,
          json: async () => ({ error: "not recording", sent: false }),
        };
      }
      if (path.endsWith("/end")) {
        serverState = "idle";
        serverLease = "";
        const deferred = endGate ? await endGate : null;
        const sent = deferred?.sent ?? options.endSent ?? true;
        const ok = deferred?.ok ?? !options.endHttpError;
        const status = ok ? 200 : 500;
        return {
          ok,
          status,
          json: async () => ok
            ? { state: "idle", capture: null, sent, reason: sent ? undefined : "empty" }
            : { error: "recognizer failed", sent: false },
        };
      }
      if (path.endsWith("/cancel")) {
        const parsed = JSON.parse(String(body || "{}"));
        if (!serverLease || serverLease !== parsed.leaseId) {
          return { ok: false, status: 409, json: async () => ({ error: "not owner" }) };
        }
        serverState = "idle";
        serverLease = "";
        return { ok: true, status: 200, json: async () => ({ state: "idle", capture: null, sent: false }) };
      }
      if (path.endsWith("/focus")) {
        return { ok: true, status: 200, json: async () => ({ lastFocus: options.sessionId ?? alphaId }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  if (options.browser) {
    vm.runInContext(browserJs, sandbox, { filename: "browser-v8.js" });
    document.currentScript = null;
  }
  vm.runInContext(clientJs, sandbox, { filename: "qq-dictation-client.js" });

  return {
    fetches,
    assigned,
    get dictate() { return nodes.dictate; },
    get composer() { return nodes.composer; },
    get prompt() { return nodes.prompt; },
    get status() { return nodes.status; },
    get submit() { return nodes.submit; },
    get mediaStarts() { return mediaStarts; },
    get stoppedTracks() { return stoppedTracks; },
    pump() {
      const samples = new Float32Array(160);
      for (let i = 0; i < samples.length; i += 1) samples[i] = 0.2;
      processor?.onaudioprocess?.({ inputBuffer: { getChannelData: () => samples } });
    },
    click(target) {
      const event = {
        target,
        preventDefault() {},
        stopPropagation() {},
      };
      dispatch("click", event, true);
    },
    keydown(partial) {
      const event = {
        key: "",
        code: "",
        target: outside,
        defaultPrevented: false,
        isComposing: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() {},
        ...partial,
      };
      dispatch("keydown", event, false);
      return event;
    },
    space(target = outside) {
      return this.keydown({ key: " ", code: "Space", target });
    },
    focusPrompt() {
      document.activeElement = nodes.prompt;
      dispatch("focusin", { target: nodes.prompt }, false);
    },
    swapComposer(nextSessionId = options.sessionId ?? alphaId, eventName = "htmx:sseMessage") {
      installComposer(nextSessionId);
      dispatch(eventName, { target: nodes.composer, detail: { target: nodes.composer } }, false);
    },
    listenerCount(type) {
      return listeners.filter((listener) => listener.type === type).length;
    },
    releaseMic() {
      releaseMicGate?.();
    },
    releaseEnd(result = { sent: true }) {
      releaseEndGate?.(result);
    },
    poll() {
      intervals.get(1)?.();
    },
    pagehide() {
      for (const listener of [...windowListeners]) {
        if (listener.type === "pagehide") listener.fn({ type: "pagehide" });
      }
    },
    runTimeouts() {
      const pending = [...timers.values()];
      timers.clear();
      for (const fn of pending) fn();
    },
  };
}

async function settle() {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

try {
  assert.deepEqual(pluginModule.inject, ["qq", "webServer"]);
  assert.equal(pluginModule.provide, "qq-dictation");
  assert.equal(pluginModule.name, "qq-dictation");
  assert.equal(
    serviceModule.defaultCaptureLeaseAuthority,
    reloadedServiceModule.defaultCaptureLeaseAuthority,
    "capture authority must survive module reevaluation",
  );
  {
    const launcher = readFileSync(join(root, "bin/qq"), "utf8");
    const patch = readFileSync(join(root, "qq/host.patch.yml"), "utf8");
    const pkg = JSON.parse(readFileSync(join(root, "qq-dictation/package.json"), "utf8"));
    const cordis = readFileSync(join(root, "qq-dictation/cordis.patch.yml"), "utf8");
    assert.doesNotMatch(launcher, /qq-dictation|QQ_DSH_HAVE_DICTATION/);
    assert.doesNotMatch(patch, /qq-dictation|QQ_DSH_HAVE_DICTATION/);
    assert.match(launcher, /qq-\*\/package\.json/);
    assert.equal(pkg.name, "@hypermemetic-ai/qq-dictation");
    assert.equal(pkg.dsh?.bundle?.patch, "./cordis.patch.yml");
    assert.match(cordis, /id: qq-dictation/);
    assert.match(cordis, /name: '@hypermemetic-ai\/qq-dictation'/);
  }
  assert.doesNotMatch(clientJs, /textContent/);
  assert.match(SESSION_ID.source, /session-/);
  assert.match(CAPTURE_LEASE_ID.source, /0-9a-f/);
  assert.equal(parseSessionId(alphaId), alphaId);
  assert.equal(parseSessionId("nope"), "");
  assert.equal(parseCaptureLeaseId(alphaLease.toUpperCase()), alphaLease);
  assert.equal(parseCaptureLeaseId("not-a-lease"), "");
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
  assert.match(clientJs, /AudioContext/);
  assert.match(clientJs, /RIFF/);
  assert.match(clientJs, /audio\/wav/);
  assert.match(clientJs, /microphone is unavailable/);
  assert.match(clientJs, /qq:desktop-dictation-toggle/);
  assert.match(clientJs, /Recording · Space to send/);
  assert.match(clientJs, /Dictation failed · Space to retry/);
  assert.match(clientJs, /Dictation active on another device/);
  assert.match(clientJs, /x-qq-dictation-lease/);
  assert.match(clientJs, /postJson\("\/resume", \{ leaseId: ownerLease \}\)/);
  assert.match(clientJs, /keepalive: true/);
  assert.doesNotMatch(clientJs, /restarting/);
  assert.doesNotMatch(clientJs, /const poll[\s\S]*postJson\("\/start"/);
  assert.match(browserJs, /document\.dispatchEvent\(new CustomEvent\("qq:desktop-dictation-toggle"\)\)/);
  assert.doesNotMatch(browserJs, /if \(key === " " \|\| key === "Spacebar"\) \{[\s\S]{0,160}clickButton\("#composer-dictate"\)/);
  assert.doesNotMatch(clientJs, /MediaRecorder/);
  assert.doesNotMatch(clientJs, /\/chunk/);

  {
    const pcm = Buffer.from([0x00, 0x10, 0xff, 0x7f]);
    const wav = encodePcm16MonoWav(pcm, 16_000);
    assert.equal(wav.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(wav.subarray(8, 12).toString("ascii"), "WAVE");
    assert.equal(wav.readUInt32LE(24), 16_000);
    assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.subarray(44).equals(pcm), true);
    assert.equal(asWavBytes(wav), wav);
    const wrapped = asWavBytes(pcm);
    assert.equal(wrapped.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(wrapped.subarray(44).equals(pcm), true);
  }
  assert.doesNotMatch(String(qqPlugin.apply), /dictate/);
  assert.match(defaultHandyBin({ HOME: "/home/op" }), /\/\.local\/bin\/handy$/);
  assert.equal(internals.routeOf("/qq/dictate", "/qq/dictate/start"), "start");
  assert.equal(internals.routeOf("/qq/dictate", "/qq/dictate/resume"), "resume");

  writeFileSync(join(scratch, "qq.session"), `${alphaId}\n`);
  assert.equal(resumeSessionId({ DSH_HOME: scratch }), alphaId);
  writeFileSync(join(scratch, "qq.session"), "not-a-session\n");
  writeFileSync(join(scratch, "qq-console.session"), `${betaId}\n`);
  assert.equal(resumeSessionId({ DSH_HOME: scratch }), "");
  assert.equal(resumeSessionId({}), "");

  {
    let clock = 0;
    const leases = createCaptureLeaseAuthority({ now: () => clock, ttlMs: 100 });
    const qq = fakeQq();
    const service = createDictationService({ get: () => qq }, {
      now: () => clock,
      leaseAuthority: leases,
      recognize: async () => "expired capture must not send",
    });
    await service.start({ sessionId: alphaId, leaseId: alphaLease });
    clock = 90;
    assert.equal(service.snapshot({ leaseId: alphaLease, renew: true }).capture, "local");
    clock = 150;
    assert.equal(service.snapshot().capture, "foreign", "foreign status must not renew the owner lease");
    clock = 191;
    assert.equal(service.snapshot().state, "idle", "crashed owner lease must expire within its bound");
    await assert.rejects(
      () => service.resume({ leaseId: alphaLease }),
      /cannot resume/,
    );
    const recovered = await service.start({ sessionId: betaId, leaseId: betaLease });
    assert.equal(recovered.capture, "local");
    assert.equal(recovered.boundSessionId, betaId);
  }

  {
    const qq = fakeQq();
    const leases = createCaptureLeaseAuthority({ ttlMs: 10_000 });
    const beforeReload = createDictationService({ get: () => qq }, {
      leaseAuthority: leases,
      recognize: async () => "unused old recognizer",
    });
    await beforeReload.start({ sessionId: alphaId, leaseId: alphaLease });
    await beforeReload.release();

    const afterReload = createDictationService({ get: () => qq }, {
      leaseAuthority: leases,
      recognize: async () => "hmr recovery",
    });
    const detached = afterReload.snapshot({ leaseId: alphaLease, renew: true });
    assert.equal(detached.state, "idle");
    assert.equal(detached.capture, "local");
    assert.equal(detached.resumable, true);
    assert.equal(detached.boundSessionId, alphaId);
    assert.doesNotMatch(JSON.stringify(afterReload.snapshot()), new RegExp(alphaLease));
    await afterReload.resume({ leaseId: alphaLease });
    const sent = await afterReload.end({ audio: Buffer.from("wav"), leaseId: alphaLease });
    assert.equal(sent.sent, true);
    assert.deepEqual(qq.prompts, [{ id: alphaId, text: "hmr recovery" }]);
  }

  {
    const qq = fakeQq();
    const leases = createCaptureLeaseAuthority({ ttlMs: 10_000 });
    const beforeReload = createDictationService({ get: () => qq }, {
      leaseAuthority: leases,
      recognize: async () => "must not send",
    });
    await beforeReload.start({ sessionId: alphaId, leaseId: alphaLease });
    await beforeReload.release();
    const replacement = createDictationService({ get: () => qq }, {
      leaseAuthority: leases,
      recognize: async () => "must not send",
    });
    await assert.rejects(
      () => replacement.cancel({ leaseId: betaLease }),
      /another browser/,
    );
    await replacement.cancel({ leaseId: alphaLease });
    await assert.rejects(() => replacement.resume({ leaseId: alphaLease }), /cannot resume/);
    await assert.rejects(
      () => replacement.start({ sessionId: alphaId, leaseId: alphaLease }),
      /no longer valid/,
    );
    assert.equal(replacement.snapshot().state, "idle");
    assert.equal(qq.prompts.length, 0);
  }

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
    assert.deepEqual(service.snapshot(), {
      state: "idle",
      capture: null,
      resumable: false,
      boundSessionId: null,
      lastFocus: null,
    });
    await assert.rejects(() => service.end(), /capture lease is required/);
    await assert.rejects(() => service.end({ leaseId: alphaLease }), /not recording/);
    const started = await service.start({ sessionId: alphaId, leaseId: alphaLease });
    assert.equal(started.state, "recording");
    assert.equal(started.capture, "local");
    assert.equal(started.boundSessionId, alphaId);
    assert.equal(service.snapshot().capture, "foreign");
    assert.equal(service.snapshot().boundSessionId, null);
    await assert.rejects(
      () => service.start({ sessionId: betaId, leaseId: betaLease }),
      /another browser owns/,
    );
    service.appendAudio(Buffer.from("wa"), { leaseId: alphaLease });
    const sent = await service.end({ leaseId: alphaLease });
    assert.equal(sent.sent, true);
    assert.equal(sent.text, "spoken line");
    assert.deepEqual(qq.prompts, [{ id: alphaId, text: "spoken line" }]);
    assert.equal(Buffer.from(recognized[0]).toString(), "wa");
  }

  {
    const fixture = encodePcm16MonoWav(Buffer.alloc(320, 0), 16_000);
    assert.equal(fixture.subarray(0, 4).toString("ascii"), "RIFF");
    const qq = fakeQq();
    const recognized = [];
    const service = createDictationService(
      { get: () => qq },
      {
        recognize: async (audio) => {
          recognized.push(Buffer.from(audio));
          return "fixture line";
        },
      },
    );
    await service.start({ sessionId: alphaId, leaseId: alphaLease });
    const sent = await service.end({ audio: fixture, leaseId: alphaLease });
    assert.equal(sent.sent, true);
    assert.equal(sent.text, "fixture line");
    assert.deepEqual(qq.prompts, [{ id: alphaId, text: "fixture line" }]);
    assert.equal(recognized[0].subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(recognized[0].equals(fixture), true);
  }

  {
    const qq = fakeQq();
    const service = createDictationService({ get: () => qq }, {
      recognize: async () => "should not run",
    });
    service.noteFocus(alphaId);
    await service.start({ sessionId: alphaId, leaseId: alphaLease });
    const cancelled = await service.cancel({ leaseId: alphaLease });
    assert.equal(cancelled.state, "idle");
    assert.equal(qq.prompts.length, 0);
  }

  {
    const qq = fakeQq();
    const service = createDictationService({ get: () => qq }, {
      recognize: async () => "   ",
    });
    await service.start({ sessionId: alphaId, leaseId: alphaLease });
    const empty = await service.end({ audio: Buffer.from("x"), leaseId: alphaLease });
    assert.equal(empty.sent, false);
    assert.equal(empty.reason, "empty");
    assert.equal(qq.prompts.length, 0);
  }

  {
    const qq = fakeQq();
    const service = createDictationService({ get: () => qq }, {
      recognize: async () => "/workflows now",
    });
    await service.start({ sessionId: alphaId, leaseId: alphaLease });
    const sent = await service.end({ audio: Buffer.from("x"), leaseId: alphaLease });
    assert.equal(sent.text, "workflows now");
    assert.deepEqual(qq.prompts, [{ id: alphaId, text: "workflows now" }]);
  }

  {
    const qq = fakeQq();
    const service = createDictationService({ get: () => qq }, {
      recognize: async () => "later",
    });
    service.noteFocus(alphaId);
    await service.start({ leaseId: alphaLease });
    service.noteFocus(betaId);
    const sent = await service.end({ audio: Buffer.from("x"), leaseId: alphaLease });
    assert.equal(sent.boundSessionId, alphaId);
    assert.deepEqual(qq.prompts, [{ id: alphaId, text: "later" }]);
  }

  {
    const qq = fakeQq();
    qq.present.delete(alphaId);
    const service = createDictationService({ get: () => qq }, {
      recognize: async () => "orphan",
    });
    await service.start({ sessionId: alphaId, leaseId: alphaLease });
    const dropped = await service.end({ audio: Buffer.from("x"), leaseId: alphaLease });
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
    await service.start({ leaseId: alphaLease });
    const sent = await service.end({ text: "resume", leaseId: alphaLease });
    assert.equal(sent.boundSessionId, betaId);
    assert.deepEqual(qq.prompts, [{ id: betaId, text: "resume" }]);
  }

  {
    const qq = fakeQq();
    const service = createDictationService({ get: () => qq }, {
      recognize: async () => "desktop",
    });
    service.noteFocus(betaId);
    await service.start({ leaseId: alphaLease });
    const sent = await service.end({ text: "desktop", leaseId: alphaLease });
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
      assert.match(page, /aria-label="Dictate"/);
      assert.match(page, /class="dictate-mic"/);
      assert.match(page, /class="dictate-cancel"/);
      assert.match(page, /id="composer-submit"/);
      assert.match(page, /id="dictation-status"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"[^>]*hidden/);
      assert.equal(page.match(/id="dictation-status"/g)?.length, 1);
      assert.doesNotMatch(page, />Mic</);
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

      const status = await request(server, "/qq/dictate/");
      assert.equal(status.status, 200);
      assert.match(status.body, /"state":"idle"/);
      const client = await request(server, "/qq/dictate/client.js");
      assert.equal(client.status, 200);
      assert.match(client.body, /AltRight/);
      assert.doesNotMatch(client.body, /textContent/);

      const focus = await request(server, "/qq/dictate/focus", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ sessionId: alphaId }),
      });
      assert.equal(focus.status, 200);
      assert.match(focus.body, /"lastFocus":"session-63a11000-0000-4000-8000-00000000000a"/);

      const tokenless = await request(server, "/qq/dictate/start", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ sessionId: alphaId }),
      });
      assert.equal(tokenless.status, 400, "pre-lease clients must not start capture");

      const started = await request(server, "/qq/dictate/start", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ sessionId: alphaId, leaseId: alphaLease }),
      });
      assert.equal(started.status, 200);
      assert.match(started.body, /"state":"recording"/);
      assert.match(started.body, /"capture":"local"/);

      const foreign = await request(server, "/qq/dictate/");
      assert.match(foreign.body, /"capture":"foreign"/);
      assert.doesNotMatch(foreign.body, new RegExp(alphaLease));

      const chunked = await request(server, "/qq/dictate/chunk", {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "sec-fetch-site": "same-origin",
          "x-qq-dictation-lease": alphaLease,
        },
        body: Buffer.from("fake-wav"),
      });
      assert.equal(chunked.status, 200);
      const ended = await request(server, "/qq/dictate/end", {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "sec-fetch-site": "same-origin",
          "x-qq-dictation-lease": alphaLease,
        },
        body: Buffer.alloc(0),
      });
      assert.equal(ended.status, 200);
      assert.match(ended.body, /"sent":true/);
      assert.deepEqual(qq.prompts, [{ id: alphaId, text: "from phone" }]);
    });
  }

  {
    const fixture = encodePcm16MonoWav(Buffer.alloc(320, 0), 16_000);
    const qq = fakeQq();
    const recognized = [];
    const handler = createDictateHandler(
      createDictationService({ get: () => qq }, {
        recognize: async (audio) => {
          recognized.push(Buffer.from(audio));
          return "wav fixture";
        },
      }),
    );
    await withServer(handler, async (server) => {
      const started = await request(server, "/qq/dictate/start", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ sessionId: alphaId, leaseId: alphaLease }),
      });
      assert.equal(started.status, 200);
      const ended = await request(server, "/qq/dictate/end", {
        method: "POST",
        headers: {
          "content-type": "audio/wav",
          "sec-fetch-site": "same-origin",
          "x-qq-dictation-lease": alphaLease,
        },
        body: fixture,
      });
      assert.equal(ended.status, 200);
      assert.match(ended.body, /"sent":true/);
      assert.deepEqual(qq.prompts, [{ id: alphaId, text: "wav fixture" }]);
      assert.equal(recognized[0].subarray(0, 4).toString("ascii"), "RIFF");
      assert.equal(recognized[0].equals(fixture), true);
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
        body: JSON.stringify({ sessionId: alphaId, leaseId: alphaLease }),
      });
      const foreignCancel = await request(server, "/qq/dictate/cancel", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ leaseId: betaLease }),
      });
      assert.equal(foreignCancel.status, 409);
      const cancelled = await request(server, "/qq/dictate/cancel", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ leaseId: alphaLease }),
      });
      assert.equal(cancelled.status, 200);
      assert.match(cancelled.body, /"state":"idle"/);
      assert.equal(qq.prompts.length, 0);
    });
  }

  {
    const qq = fakeQq();
    const handler = createDictateHandler(
      createDictationService({ get: () => qq }, { recognize: async () => "two client" }),
    );
    await withServer(handler, async (server) => {
      const ownerStart = await request(server, "/qq/dictate/start", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ sessionId: alphaId, leaseId: alphaLease }),
      });
      assert.equal(ownerStart.status, 200);

      const phoneStatus = await request(server, "/qq/dictate/");
      assert.match(phoneStatus.body, /"capture":"foreign"/);
      assert.doesNotMatch(phoneStatus.body, new RegExp(alphaLease));
      const foreignEnd = await request(server, "/qq/dictate/end", {
        method: "POST",
        headers: {
          "content-type": "audio/wav",
          "sec-fetch-site": "same-origin",
          "x-qq-dictation-lease": betaLease,
        },
        body: Buffer.from("foreign"),
      });
      assert.equal(foreignEnd.status, 409);
      const foreignCancel = await request(server, "/qq/dictate/cancel", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ leaseId: betaLease }),
      });
      assert.equal(foreignCancel.status, 409);

      const ownerCancel = await request(server, "/qq/dictate/cancel", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ leaseId: alphaLease }),
      });
      assert.equal(ownerCancel.status, 200);
      const stalePoll = await request(server, "/qq/dictate/", {
        headers: { "x-qq-dictation-lease": alphaLease },
      });
      assert.match(stalePoll.body, /"state":"idle"/);
      assert.match(stalePoll.body, /"capture":null/);

      const staleStart = await request(server, "/qq/dictate/start", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ sessionId: alphaId, leaseId: alphaLease }),
      });
      assert.equal(staleStart.status, 409, "a cancelled owner must not reassert start");
      const staleResume = await request(server, "/qq/dictate/resume", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ leaseId: alphaLease }),
      });
      assert.equal(staleResume.status, 409);
      const tokenlessStart = await request(server, "/qq/dictate/start", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ sessionId: alphaId }),
      });
      assert.equal(tokenlessStart.status, 400);
      const stillIdle = await request(server, "/qq/dictate/");
      assert.match(stillIdle.body, /"state":"idle"/);

      const phoneRecovery = await request(server, "/qq/dictate/start", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ sessionId: betaId, leaseId: betaLease }),
      });
      assert.equal(phoneRecovery.status, 200);
      assert.match(phoneRecovery.body, new RegExp(`"boundSessionId":"${betaId}"`));
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
        body: JSON.stringify({ leaseId: alphaLease }),
      });
      assert.match(started.body, new RegExp(`"boundSessionId":"${betaId}"`));
      const ended = await request(server, "/qq/dictate/end", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ text: "desktop end", leaseId: alphaLease }),
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
        body: JSON.stringify({ sessionId: alphaId, leaseId: alphaLease }),
      });
      const ended = await request(server, "/qq/dictate/end", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ text: "   ", leaseId: alphaLease }),
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
        body: JSON.stringify({ sessionId: alphaId, leaseId: alphaLease }),
      });
      assert.equal(blocked.status, 403);
    });
  }

  {
    let spawned = null;
    const recognizer = createHandyRecognizer({
      handyBin: "/tmp/fake-handy",
      spawn(bin, args) {
        spawned = { bin, args, file: readFileSync(args[1]) };
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
    const fixture = encodePcm16MonoWav(Buffer.alloc(320, 0), 16_000);
    const text = await recognizer.recognize(fixture);
    assert.equal(text, "hello from handy");
    assert.equal(spawned.bin, "/tmp/fake-handy");
    assert.deepEqual(spawned.args.slice(0, 3), ["--transcribe-file", spawned.args[1], "--json"]);
    assert.doesNotMatch(spawned.args.join(" "), /HERDR_PANE_ID|herdr-pane/);
    assert.equal(spawned.file.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(spawned.file.subarray(8, 12).toString("ascii"), "WAVE");
    assert.equal(spawned.file.equals(fixture), true);

    spawned = null;
    const wrappedText = await recognizer.recognize(Buffer.from([0x00, 0x10, 0xff, 0x7f]));
    assert.equal(wrappedText, "hello from handy");
    assert.equal(spawned.file.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(spawned.file.subarray(8, 12).toString("ascii"), "WAVE");
    assert.equal(spawned.file.readUInt32LE(24), 16_000);
    assert.equal(spawned.file.subarray(44).equals(Buffer.from([0x00, 0x10, 0xff, 0x7f])), true);
  }

  {
    const qq = fakeQq();
    const routes = [];
    const provided = {};
    let cleanup;
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
        cleanup = factory();
        return cleanup;
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
        body: JSON.stringify({ sessionId: alphaId, leaseId: alphaLease }),
      });
      assert.equal(started.status, 200);
      const ended = await request(server, "/qq/dictate/end", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ text: "via apply", leaseId: alphaLease }),
      });
      assert.equal(ended.status, 200);
      assert.deepEqual(qq.prompts, [{ id: alphaId, text: "via apply" }]);
    });
    await provided["qq-dictation"].start({ sessionId: alphaId, leaseId: betaLease });
    await cleanup();
    assert.equal(routes.length, 0);
    assert.equal(provided["qq-dictation"].snapshot().state, "idle");
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

  {
    const transport = makeSharedClientTransport();
    const desktopOwner = makeClientHarness({ fetch: transport.fetch.bind(transport) });
    await settle();
    desktopOwner.click(desktopOwner.dictate);
    await settle();
    assert.equal(desktopOwner.dictate.dataset.state, "recording");
    assert.equal(transport.calls.filter((call) => call.path.endsWith("/start")).length, 1);

    const phone = makeClientHarness({ fetch: transport.fetch.bind(transport) });
    await settle();
    assert.equal(phone.dictate.dataset.state, "busy");
    assert.equal(phone.dictate.getAttribute("aria-label"), "Dictation active on another device");
    assert.equal(phone.dictate.getAttribute("aria-disabled"), "true");
    assert.notEqual(phone.dictate.dataset.state, "recording", "foreign capture must never show the local X");
    phone.click(phone.dictate);
    await settle();
    assert.equal(phone.mediaStarts, 0);
    assert.equal(transport.calls.filter((call) => call.path.endsWith("/cancel")).length, 0);
    assert.equal(transport.calls.filter((call) => call.path.endsWith("/end")).length, 0);

    // Reproduce the live failure: the server is cancelled while the old owner
    // still has local capture. Its next poll must stop tracks, never POST start.
    transport.revokeOwner();
    desktopOwner.poll();
    await settle();
    assert.equal(desktopOwner.dictate.dataset.state, "idle");
    assert.equal(desktopOwner.stoppedTracks, 1);
    assert.equal(transport.calls.filter((call) => call.path.endsWith("/start")).length, 1);

    phone.poll();
    await settle();
    assert.equal(phone.dictate.dataset.state, "idle");
    phone.click(phone.dictate);
    await settle();
    assert.equal(phone.dictate.dataset.state, "recording");
    assert.equal(transport.calls.filter((call) => call.path.endsWith("/start")).length, 2);
  }

  {
    const harness = makeClientHarness();
    await settle();
    harness.click(harness.dictate);
    await settle();
    assert.equal(harness.dictate.dataset.state, "recording");
    harness.pagehide();
    await settle();
    assert.equal(harness.stoppedTracks, 1);
    const pageCancel = harness.fetches.find((call) => String(call.path).endsWith("/cancel"));
    assert.ok(pageCancel);
    assert.equal(pageCancel.keepalive, true);
    assert.match(String(pageCancel.body), /"leaseId":"[0-9a-f-]+"/);
    const startsBefore = harness.fetches.filter((call) => String(call.path).endsWith("/start")).length;
    harness.poll();
    await settle();
    assert.equal(harness.fetches.filter((call) => String(call.path).endsWith("/start")).length, startsBefore);
  }

  {
    const harness = makeClientHarness({ browser: true, desktop: true, deferMic: true, deferEnd: true });
    await settle();
    assert.equal(harness.listenerCount("qq:desktop-dictation-toggle"), 1);

    const firstSpace = harness.space();
    assert.equal(firstSpace.defaultPrevented, true);
    await settle();
    assert.equal(harness.mediaStarts, 1);
    assert.equal(harness.status.dataset.state, "starting");
    assert.equal(harness.status.textContent, "Starting dictation…");
    assert.equal(harness.status.hidden, false);

    harness.space();
    assert.equal(harness.mediaStarts, 1, "repeat Space while starting must not start twice");
    harness.swapComposer(betaId, "htmx:sseMessage");
    assert.equal(harness.status.dataset.state, "starting");
    assert.equal(harness.status.textContent, "Starting dictation…");
    assert.equal(harness.listenerCount("qq:desktop-dictation-toggle"), 1);

    harness.releaseMic();
    await settle();
    const starts = harness.fetches.filter((call) => String(call.path).endsWith("/start"));
    assert.equal(starts.length, 1);
    assert.match(String(starts[0].body), new RegExp(`"sessionId":"${alphaId}"`));
    assert.equal(harness.status.dataset.state, "recording");
    assert.equal(harness.status.textContent, "Recording · Space to send");
    assert.equal(harness.composer.classList.contains("is-dictating"), true);

    harness.swapComposer(alphaId, "htmx:afterSwap");
    assert.equal(harness.status.dataset.state, "recording");
    assert.equal(harness.status.textContent, "Recording · Space to send");
    assert.equal(harness.listenerCount("qq:desktop-dictation-toggle"), 1);

    const literalSpace = harness.space(harness.prompt);
    assert.equal(literalSpace.defaultPrevented, false);
    assert.equal(harness.fetches.filter((call) => String(call.path).endsWith("/end")).length, 0);

    harness.pump();
    harness.space();
    assert.equal(harness.status.dataset.state, "transcribing");
    assert.equal(harness.status.textContent, "Transcribing…");
    await settle();
    assert.equal(harness.fetches.filter((call) => String(call.path).endsWith("/end")).length, 1);
    harness.space();
    await settle();
    assert.equal(harness.fetches.filter((call) => String(call.path).endsWith("/end")).length, 1);

    harness.releaseEnd({ sent: true });
    await settle();
    assert.equal(harness.status.dataset.state, "idle");
    assert.equal(harness.status.hidden, true);
    assert.equal(harness.dictate.dataset.state, "idle");
  }

  {
    const harness = makeClientHarness({ browser: true, desktop: true, endSent: false });
    await settle();
    harness.space();
    await settle();
    harness.space();
    await settle();
    assert.equal(harness.status.dataset.state, "failure");
    assert.equal(harness.status.textContent, "Dictation failed · Space to retry");
    assert.equal(harness.status.hidden, false);
    harness.runTimeouts();
    assert.equal(harness.status.dataset.state, "idle");
    assert.equal(harness.status.hidden, true);
  }

  {
    const harness = makeClientHarness({ browser: true, desktop: false });
    await settle();
    const phoneSpace = harness.space();
    assert.equal(phoneSpace.defaultPrevented, false);
    assert.equal(harness.mediaStarts, 0);
    harness.click(harness.dictate);
    await settle();
    assert.equal(harness.dictate.dataset.state, "recording");
    harness.click(harness.dictate);
    await settle();
    assert.equal(harness.fetches.filter((call) => String(call.path).endsWith("/cancel")).length, 1);
    assert.equal(harness.fetches.filter((call) => String(call.path).endsWith("/end")).length, 0);
    harness.click(harness.dictate);
    await settle();
    harness.click(harness.submit);
    await settle();
    assert.equal(harness.fetches.filter((call) => String(call.path).endsWith("/end")).length, 1);
  }

  {
    const harness = makeClientHarness();
    await settle();
    harness.focusPrompt();
    await settle();
    assert.ok(harness.fetches.some((call) => String(call.path).endsWith("/focus")));
    harness.click(harness.dictate);
    await settle();
    assert.equal(harness.dictate.dataset.state, "recording");
    assert.equal(harness.dictate.getAttribute("aria-label"), "Cancel dictation");
    assert.equal(harness.prompt.required, false);
    assert.ok(harness.fetches.some((call) => String(call.path).endsWith("/start")));
    harness.pump();
    harness.click(harness.submit);
    await settle();
    const ended = harness.fetches.find((call) => String(call.path).endsWith("/end"));
    assert.ok(ended);
    assert.equal(ended.headers["content-type"], "audio/wav");
    const wavBytes = Buffer.from(await ended.body.arrayBuffer());
    assert.equal(wavBytes.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(wavBytes.subarray(8, 12).toString("ascii"), "WAVE");
    assert.ok(wavBytes.length > 44);
    assert.equal(harness.dictate.dataset.state, "idle");
    assert.equal(harness.dictate.getAttribute("aria-label"), "Dictate");
    assert.equal(harness.prompt.required, true);
  }

  {
    const harness = makeClientHarness({
      pathname: `/qq/project/qq/session/${alphaId}`,
      omitComposerSession: true,
    });
    await settle();
    harness.focusPrompt();
    await settle();
    const focus = harness.fetches.find((call) => String(call.path).endsWith("/focus"));
    assert.ok(focus);
    assert.match(String(focus.body), new RegExp(`"sessionId":"${alphaId}"`));
  }

  {
    const harness = makeClientHarness({ end409Once: true });
    await settle();
    harness.click(harness.dictate);
    await settle();
    harness.pump();
    harness.click(harness.submit);
    await settle();
    const startCall = harness.fetches.find((call) => String(call.path).endsWith("/start"));
    const resumeCall = harness.fetches.find((call) => String(call.path).endsWith("/resume"));
    const endCalls = harness.fetches.filter((call) => String(call.path).endsWith("/end"));
    assert.ok(startCall);
    assert.ok(resumeCall);
    assert.equal(endCalls.length, 2);
    const lease = JSON.parse(String(startCall.body)).leaseId;
    assert.equal(JSON.parse(String(resumeCall.body)).leaseId, lease);
    assert.equal(endCalls[0].headers["x-qq-dictation-lease"], lease);
    assert.equal(endCalls[1].headers["x-qq-dictation-lease"], lease);
    assert.equal(harness.dictate.dataset.state, "idle");
  }

  {
    const harness = makeClientHarness();
    await settle();
    harness.click(harness.dictate);
    await settle();
    assert.equal(harness.dictate.dataset.state, "recording");
    harness.click(harness.dictate);
    await settle();
    assert.ok(harness.fetches.some((call) => String(call.path).endsWith("/cancel")));
    assert.ok(!harness.fetches.some((call) => String(call.path).endsWith("/end")));
    assert.equal(harness.dictate.dataset.state, "idle");
  }

  {
    const harness = makeClientHarness({ browser: true, desktop: true });
    await settle();
    harness.keydown({ code: "AltRight", key: "Alt", altKey: true });
    await settle();
    assert.equal(harness.dictate.dataset.state, "recording");
    assert.ok(harness.fetches.some((call) => String(call.path).endsWith("/start")));
    harness.pump();
    harness.keydown({ code: "AltRight", key: "Alt", altKey: true });
    await settle();
    const ended = harness.fetches.find((call) => String(call.path).endsWith("/end"));
    assert.ok(ended);
    const wavBytes = Buffer.from(await ended.body.arrayBuffer());
    assert.equal(wavBytes.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(harness.dictate.dataset.state, "idle");
  }

  {
    const harness = makeClientHarness();
    await settle();
    harness.keydown({ code: "AltRight", key: "Alt" });
    await settle();
    assert.equal(harness.dictate.dataset.state, "recording");
    harness.keydown({ code: "Delete", key: "Delete" });
    await settle();
    assert.ok(harness.fetches.some((call) => String(call.path).endsWith("/cancel")));
    assert.ok(!harness.fetches.some((call) => String(call.path).endsWith("/end")));
    assert.equal(harness.dictate.dataset.state, "idle");
  }

  {
    const harness = makeClientHarness({ noMic: true });
    await settle();
    harness.click(harness.dictate);
    await settle();
    assert.equal(harness.dictate.dataset.state, "failure");
    assert.equal(harness.status.textContent, "Dictation failed · Space to retry");
    assert.ok(!harness.fetches.some((call) => String(call.path).endsWith("/start")));
    harness.runTimeouts();
    assert.equal(harness.dictate.dataset.state, "idle");
  }

  {
    const harness = makeClientHarness({ micError: true });
    await settle();
    harness.click(harness.dictate);
    await settle();
    assert.equal(harness.dictate.dataset.state, "failure");
    assert.ok(!harness.fetches.some((call) => String(call.path).endsWith("/start")));
    harness.runTimeouts();
    assert.equal(harness.dictate.dataset.state, "idle");
  }

  const css = readFileSync(join(root, "qq-ui/assets/console.css"), "utf8");
  assert.match(css, /\.composer-row \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto auto;/);
  assert.match(css, /#composer-dictate/);
  assert.match(css, /#composer-dictate svg \{[\s\S]*grid-area: 1 \/ 1/);
  assert.match(css, /#composer-dictate \.dictate-cancel[\s\S]*visibility: hidden/);
  assert.match(css, /#composer-submit \{[\s\S]*clip-path: inset\(50%\)/);
  assert.match(css, /@media \(min-width: 42\.01rem\) and \(pointer: fine\) \{[\s\S]*#composer-dictate \{ display: none; \}/);
  assert.match(css, /\.dictation-status \{ display: none; \}/);
  assert.match(css, /\.dictation-status:not\(\[hidden\]\) \{[\s\S]*display: inline-flex/);
  assert.match(css, /\.dictation-status\[data-state="recording"\]/);
  assert.match(css, /\.dictation-status\[data-state="transcribing"\]/);
  assert.match(css, /\.dictation-status\[data-state="busy"\]/);
  assert.match(css, /#composer-dictate\[data-state="busy"\]/);
  assert.match(css, /\.dictation-status\[data-state="failure"\]/);
  assert.match(css, /\.composer\.is-dictating textarea/);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log("test-qq-dictation: pass");
