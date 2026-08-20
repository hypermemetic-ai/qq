import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createServer as createHttpsServer } from "node:https";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { constants as fsConstants } from "node:fs";
import { createConsoleHandler } from "../qq-ui/src/http-app.mjs";

const SESSION_ID = "session-63a11000-0000-4000-8000-000000000031";
const CANONICAL_PATH = `/qq/project/proof/session/${SESSION_ID}`;
const LEGACY_WORKER = `"use strict";
const CACHE_NAME = "qq-static-v10-browser-proof";
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE_NAME).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).then((response) => response.ok ? response : Promise.reject(new Error("redirect"))));
});\n`;

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result ?? {});
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error("Chrome DevTools WebSocket failed")), { once: true });
    });
    return new CdpClient(socket);
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const message = { id, method, params, ...(sessionId ? { sessionId } : {}) };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.socket.send(JSON.stringify(message));
    });
  }

  close() {
    this.socket.close();
  }
}

async function executableChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const base of [
    join(homedir(), ".agent-browser/browsers"),
    join(homedir(), ".cache/ms-playwright"),
  ]) {
    try {
      const versions = (await readdir(base, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
        .reverse();
      for (const version of versions) {
        candidates.push(join(base, version, "chrome"));
        candidates.push(join(base, version, "chrome-linux64/chrome"));
        candidates.push(join(base, version, "chrome-linux/chrome"));
      }
    } catch {
      /* Try the next conventional installation root. */
    }
  }
  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      /* Try the next candidate. */
    }
  }
  throw new Error("test-qq-host: Chrome is required for the PWA browser regression");
}

async function testCertificate(directory) {
  const keyPath = join(directory, "key.pem");
  const certPath = join(directory, "cert.pem");
  await new Promise((resolve, reject) => {
    const child = spawn("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "2",
      "-subj", "/CN=localhost", "-keyout", keyPath, "-out", certPath,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    let diagnostics = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { diagnostics = `${diagnostics}${chunk}`.slice(-2_000); });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`openssl could not create the PWA test certificate (${code}): ${diagnostics}`));
    });
  });
  return Promise.all([readFile(keyPath), readFile(certPath)]).then(([key, cert]) => ({ key, cert }));
}

async function launchChrome(profile) {
  const chrome = await executableChrome();
  const child = spawn(chrome, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-component-update",
    "--ignore-certificate-errors",
    "--allow-insecure-localhost",
    "--no-first-run",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  child.stderr.setEncoding("utf8");
  let diagnostics = "";
  const websocketUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Chrome DevTools endpoint timed out: ${diagnostics}`)), 15_000);
    child.stderr.on("data", (chunk) => {
      diagnostics = `${diagnostics}${chunk}`.slice(-4_000);
      const match = diagnostics.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolve(match[1]);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chrome exited before DevTools was ready (${code}): ${diagnostics}`));
    });
  });
  return { child, client: await CdpClient.connect(websocketUrl) };
}

async function createPage(client, options = {}) {
  const { browserContextId } = await client.send("Target.createBrowserContext");
  const { targetId } = await client.send("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await client.send("Target.attachToTarget", { targetId, flatten: true });
  await client.send("Page.enable", {}, sessionId);
  await client.send("Runtime.enable", {}, sessionId);
  if (options.mobile) {
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 412,
      height: 915,
      screenWidth: 412,
      screenHeight: 915,
      deviceScaleFactor: 2.625,
      mobile: true,
      screenOrientation: { type: "portraitPrimary", angle: 0 },
    }, sessionId);
    await client.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, sessionId);
    await client.send("Emulation.setUserAgentOverride", {
      userAgent: "Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36",
      platform: "Android",
    }, sessionId);
  }
  return { browserContextId, sessionId };
}

async function evaluate(client, page, expression) {
  const response = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, page.sessionId);
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  }
  return response.result?.value;
}

async function waitFor(check, message, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${message}${lastError ? `: ${lastError.message}` : ""}`);
}

async function navigate(client, page, url) {
  await client.send("Page.navigate", { url }, page.sessionId);
}

async function waitForLive(client, page, origin) {
  const readState = () => evaluate(client, page, `(() => ({
    ready: document.readyState === "complete" && Boolean(document.querySelector("#prompt")),
    path: location.pathname,
    title: document.title,
    text: document.body?.textContent ?? ""
  }))()`);
  try {
    return await waitFor(
      () => readState().then((state) => state?.ready && state.path === CANONICAL_PATH && !state.text.includes("No transcript is cached") && state),
      `live canonical console did not load from ${origin}`,
    );
  } catch (error) {
    const state = await readState().catch(() => undefined);
    throw new Error(`${error.message}; final state ${JSON.stringify(state)}`);
  }
}

async function waitForWorker(client, page, scriptPattern = /\/qq\/sw\.js$/) {
  return waitFor(async () => {
    const state = await evaluate(client, page, `(async () => {
      const registration = await navigator.serviceWorker.getRegistration("/qq/");
      const names = await caches.keys();
      return {
        active: registration?.active?.scriptURL ?? "",
        controller: navigator.serviceWorker.controller?.scriptURL ?? "",
        names,
      };
    })()`);
    return scriptPattern.test(state.active) && scriptPattern.test(state.controller) && state.names.includes("qq-static-v18") && state;
  }, `service worker ${scriptPattern} did not activate and control the page`, 15_000);
}

export async function runQqPwaBrowserProof() {
  const backend = {
    defaultSessionId: SESSION_ID,
    defaultProject: "proof",
    listProjects: () => [{ name: "proof", cwd: "/proof" }],
    async list() { return [{ id: SESSION_ID, createdAt: 1, project: "proof" }]; },
    async read(id) {
      assert.equal(id, SESSION_ID);
      return { id, project: "proof", events: [], agentStatus: "idle" };
    },
    observe(id, listener) {
      void this.read(id).then((snapshot) => listener(null, snapshot), listener);
      return () => {};
    },
    async create() { return { id: SESSION_ID, project: "proof" }; },
    async prompt() {},
    async interrupt() { return false; },
    async close() { return { id: SESSION_ID, project: "proof" }; },
  };
  const consoleHandler = createConsoleHandler(backend, { ssePollMs: 50 });
  let networkAvailable = true;
  let serveOldLegacyWorker = true;
  const requests = [];
  const temporary = await mkdtemp(join(tmpdir(), "qq-pwa-browser-"));
  const certificate = await testCertificate(temporary);
  const server = createHttpsServer(certificate, (req, res) => {
    requests.push(req.url ?? "");
    if (req.url === "/__legacy") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end("<!doctype html><title>legacy worker migration</title>");
      return;
    }
    if (req.url === "/qq/sw-v10.js" && serveOldLegacyWorker) {
      res.writeHead(200, {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-store",
        "service-worker-allowed": "/qq/",
      });
      res.end(LEGACY_WORKER);
      return;
    }
    if (!networkAvailable && req.url?.startsWith("/qq/")) {
      req.socket.destroy();
      return;
    }
    void consoleHandler(req, res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `https://127.0.0.1:${address.port}`;
  let chrome;
  try {
    chrome = await launchChrome(join(temporary, "chrome"));
    const { client } = chrome;

    // Desktop installed-app path: fresh root, active worker, controlled root
    // reopen, direct canonical navigation, true network failure, and repeats.
    const desktop = await createPage(client);
    await navigate(client, desktop, `${origin}/qq/`);
    await waitForLive(client, desktop, origin);
    await waitForWorker(client, desktop);
    const cachedPaths = await evaluate(client, desktop, `(async () => {
      const cache = await caches.open("qq-static-v18");
      return (await cache.keys()).map((request) => new URL(request.url).pathname);
    })()`);
    assert.ok(cachedPaths.length > 0);
    assert.equal(cachedPaths.every((path) => path.startsWith("/qq/assets/")), true);
    assert.doesNotMatch(cachedPaths.join("\n"), /session\/|\/prompt|\/events|\/interrupt|\/file\/|credential/i);
    await navigate(client, desktop, `${origin}/qq/`);
    await waitForLive(client, desktop, origin);
    await navigate(client, desktop, `${origin}${CANONICAL_PATH}`);
    await waitForLive(client, desktop, origin);

    networkAvailable = false;
    await navigate(client, desktop, `${origin}/qq/`);
    await waitFor(
      () => evaluate(client, desktop, `document.body?.textContent?.includes("No transcript is cached and no message can be sent offline")`),
      "genuine network failure did not render the offline fallback",
      10_000,
    );
    networkAvailable = true;
    for (let reopen = 0; reopen < 2; reopen += 1) {
      await navigate(client, desktop, `${origin}/qq/`);
      await waitForLive(client, desktop, origin);
    }

    // A stranded registration updates in place from its legacy script URL.
    const legacy = await createPage(client);
    await navigate(client, legacy, `${origin}/__legacy`);
    await waitFor(() => evaluate(client, legacy, "document.readyState === 'complete'"), "legacy bootstrap did not load");
    const oldScript = await evaluate(client, legacy, `(async () => {
      const registration = await navigator.serviceWorker.register("/qq/sw-v10.js", { scope: "/qq/", updateViaCache: "none" });
      while (!registration.active) await new Promise((resolve) => setTimeout(resolve, 20));
      return registration.active.scriptURL;
    })()`);
    assert.match(oldScript, /\/qq\/sw-v10\.js$/);
    assert.equal((await evaluate(client, legacy, "caches.keys()" )).includes("qq-static-v10-browser-proof"), true);
    serveOldLegacyWorker = false;
    await evaluate(client, legacy, `(async () => {
      const registration = await navigator.serviceWorker.getRegistration("/qq/");
      await registration.update();
      return true;
    })()`);
    await waitFor(
      () => evaluate(client, legacy, "caches.keys()").then((names) => names.includes("qq-static-v18") && !names.includes("qq-static-v10-browser-proof")),
      "legacy registration did not activate the compatibility worker",
      15_000,
    );
    const migratedScript = await evaluate(client, legacy, `(async () => (await navigator.serviceWorker.getRegistration("/qq/")).active.scriptURL)()`);
    assert.match(migratedScript, /\/qq\/sw-v10\.js$/);
    await navigate(client, legacy, `${origin}/qq/`);
    await waitForLive(client, legacy, origin);

    // Pixel 10 public-style HTTPS/PWA path gets the same controlled recovery.
    const pixel = await createPage(client, { mobile: true });
    await navigate(client, pixel, `${origin}/qq/`);
    await waitForLive(client, pixel, origin);
    await waitForWorker(client, pixel);
    await navigate(client, pixel, `${origin}/qq/`);
    await waitForLive(client, pixel, origin);
    const device = await evaluate(client, pixel, `({ width: innerWidth, height: innerHeight, userAgent: navigator.userAgent, protocol: location.protocol })`);
    assert.equal(device.width, 412);
    assert.equal(device.height, 915);
    assert.match(device.userAgent, /Pixel 10/);
    assert.equal(device.protocol, "https:");

    assert.ok(requests.filter((path) => path === "/qq/").length >= 7, "controlled installed start URL was not repeatedly fetched");
    assert.ok(requests.filter((path) => path === "/qq/sw-v10.js").length >= 2, "legacy worker URL was not checked for migration");
  } finally {
    consoleHandler.dispose?.();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    chrome?.client.close();
    if (chrome?.child.exitCode === null) {
      chrome.child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 5_000);
        chrome.child.once("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
    await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
