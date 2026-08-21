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

async function dispatchTouchSwipe(client, page, { x = 8, y = 420, endX, endY, steps = 5 }) {
  const point = (clientX, clientY) => [{ x: clientX, y: clientY, radiusX: 6, radiusY: 6, force: 1, id: 0 }];
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(x, y) }, page.sessionId);
  for (let step = 1; step <= steps; step += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: point(x + ((endX - x) * step) / steps, y + ((endY - y) * step) / steps),
    }, page.sessionId);
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }, page.sessionId);
}

async function dispatchKey(client, page, key, code, windowsVirtualKeyCode) {
  const text = key === "Enter" ? "\r" : undefined;
  const keyEvent = { key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode, ...(text ? { text, unmodifiedText: text } : {}) };
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", ...keyEvent }, page.sessionId);
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", ...keyEvent }, page.sessionId);
}

async function waitForDrawerSurface(client, page, pathname) {
  return waitFor(
    () => evaluate(client, page, `(() => ({
      ready: document.readyState === "complete" && Boolean(document.querySelector("#project-drawer")) && Boolean(document.querySelector(".drawer-edge")),
      pathname: location.pathname,
    }))()`).then((state) => state?.ready && state.pathname === pathname && state),
    `drawer surface ${pathname} did not load`,
  );
}

async function openDrawerWithTouch(client, page, { x = 40, y = 420 } = {}) {
  const before = await evaluate(client, page, `(() => {
    const edges = document.querySelectorAll(".drawer-edge");
    const rect = edges[0]?.getBoundingClientRect();
    window.__qqEdgeCaptured = 0;
    window.__qqDrawerOpenedAt = null;
    window.__qqDrawerOpenObserver?.disconnect();
    window.__qqDrawerOpenObserver = new MutationObserver(() => {
      if (!document.body.classList.contains("drawer-open")) return;
      window.__qqDrawerOpenedAt = performance.now();
      window.__qqDrawerOpenObserver.disconnect();
    });
    window.__qqDrawerOpenObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    for (const edge of edges) edge.addEventListener("gotpointercapture", () => { window.__qqEdgeCaptured += 1; }, { once: true });
    return { timeOrigin: performance.timeOrigin, pathname: location.pathname, edgeLeft: rect?.left, edgeRight: rect?.right };
  })()`);
  assert.ok(x > 24, `touch proof must start away from the extreme edge (x=${x})`);
  assert.ok(x >= before.edgeLeft && x < before.edgeRight, `touch x=${x} missed the ${before.edgeLeft}–${before.edgeRight}px drawer rail`);
  await dispatchTouchSwipe(client, page, { x, y, endX: x + 96, endY: y + 4 });
  const opened = await waitFor(
    () => evaluate(client, page, `(() => ({
      open: document.body.classList.contains("drawer-open"),
      hidden: document.querySelector("#project-drawer")?.getAttribute("aria-hidden"),
      captured: window.__qqEdgeCaptured,
      openedAt: window.__qqDrawerOpenedAt,
      timeOrigin: performance.timeOrigin,
      pathname: location.pathname,
      drawer: new URL(location.href).searchParams.get("drawer"),
    }))()`).then((state) => state?.open && Number.isFinite(state.openedAt) && state),
    `edge swipe did not open the drawer on ${before.pathname}`,
  );
  assert.equal(opened.hidden, "false");
  assert.ok(opened.captured >= 1, "edge gesture did not capture its touch pointer");
  assert.equal(opened.timeOrigin, before.timeOrigin, "edge swipe reloaded the document");
  assert.equal(opened.pathname, before.pathname);
  return opened;
}

async function closeDrawerWithImmediateBackdropTouch(client, page, { x = 330, y = 420 } = {}) {
  const before = await evaluate(client, page, `(() => {
    const drawer = document.querySelector("#project-drawer");
    const probe = document.createElement("button");
    probe.id = "qq-click-through-probe";
    probe.type = "button";
    probe.tabIndex = -1;
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:fixed;z-index:1;left:${x - 35}px;top:${y - 35}px;width:70px;height:70px";
    window.__qqClickThroughs = 0;
    probe.addEventListener("click", () => { window.__qqClickThroughs += 1; });
    document.body.append(probe);
    return {
      timeOrigin: performance.timeOrigin,
      pathname: location.pathname,
      openedAt: window.__qqDrawerOpenedAt,
      transitionMs: parseFloat(getComputedStyle(drawer).transitionDuration) * 1000,
      target: document.elementFromPoint(${x}, ${y})?.id,
    };
  })()`);
  assert.equal(before.target, "project-drawer-backdrop", "touch proof did not start on the exposed backdrop");
  const point = [{ x, y, radiusX: 6, radiusY: 6, force: 1, id: 0 }];
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point }, page.sessionId);
  const onPointerDown = await evaluate(client, page, `(() => ({
    open: document.body.classList.contains("drawer-open"),
    hidden: document.querySelector("#project-drawer")?.getAttribute("aria-hidden"),
    elapsed: performance.now() - window.__qqDrawerOpenedAt,
    clicks: window.__qqClickThroughs,
  }))()`);
  assert.equal(onPointerDown.open, false, "backdrop touch waited for click/pointerup before closing");
  assert.equal(onPointerDown.hidden, "true");
  assert.ok(onPointerDown.elapsed < before.transitionMs, `backdrop closed after the ${before.transitionMs}ms opening transition (${onPointerDown.elapsed}ms)`);
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }, page.sessionId);
  await new Promise((resolve) => setTimeout(resolve, 350));
  const closed = await evaluate(client, page, `(() => {
    const probe = document.querySelector("#qq-click-through-probe");
    const state = {
      clicks: window.__qqClickThroughs,
      timeOrigin: performance.timeOrigin,
      pathname: location.pathname,
      hasDrawerQuery: new URL(location.href).searchParams.has("drawer"),
    };
    probe?.remove();
    return state;
  })()`);
  assert.equal(closed.clicks, 0, "backdrop touch clicked through to an underlying control");
  assert.equal(closed.timeOrigin, before.timeOrigin, "backdrop dismissal reloaded the document");
  assert.equal(closed.pathname, before.pathname);
  assert.equal(closed.hasDrawerQuery, false);
}

async function closeDrawerWithKeyboard(client, page) {
  const before = await evaluate(client, page, `({ timeOrigin: performance.timeOrigin, pathname: location.pathname })`);
  await dispatchKey(client, page, "Tab", "Tab", 9);
  const focused = await waitFor(
    () => evaluate(client, page, `(() => {
      const close = document.querySelector(".drawer-close");
      const rect = close.getBoundingClientRect();
      return {
        focused: document.activeElement === close,
        focusVisible: close.matches(":focus-visible"),
        width: rect.width,
        height: rect.height,
      };
    })()`).then((state) => state?.focused && state),
    "mobile nonvisual close did not receive keyboard focus",
  );
  assert.equal(focused.focusVisible, true);
  assert.ok(focused.width >= 40 && focused.height >= 40, "mobile close did not become visible on keyboard focus");
  await dispatchKey(client, page, "Enter", "Enter", 13);
  const closed = await waitFor(
    () => evaluate(client, page, `({
      open: document.body.classList.contains("drawer-open"),
      timeOrigin: performance.timeOrigin,
      pathname: location.pathname,
      hasDrawerQuery: new URL(location.href).searchParams.has("drawer"),
    })`).then((state) => !state?.open && state),
    "keyboard close did not dismiss the mobile drawer",
  );
  assert.equal(closed.timeOrigin, before.timeOrigin);
  assert.equal(closed.pathname, before.pathname);
  assert.equal(closed.hasDrawerQuery, false);
}

async function closeDrawerInPlace(client, page) {
  const before = await evaluate(client, page, "performance.timeOrigin");
  await evaluate(client, page, `document.querySelector(".drawer-close").click()`);
  const closed = await waitFor(
    () => evaluate(client, page, `({
      open: document.body.classList.contains("drawer-open"),
      hidden: document.querySelector("#project-drawer")?.getAttribute("aria-hidden"),
      timeOrigin: performance.timeOrigin,
      hasDrawerQuery: new URL(location.href).searchParams.has("drawer"),
    })`).then((state) => !state?.open && state),
    "drawer did not close in place",
  );
  assert.equal(closed.hidden, "true");
  assert.equal(closed.timeOrigin, before, "closing the drawer reloaded the document");
  assert.equal(closed.hasDrawerQuery, false);
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
  const observers = new Set();
  const longReadme = `# Project proof\n\n${Array.from({ length: 120 }, (_, index) => `Scrollable proof line ${index + 1}.`).join("\n\n")}\n`;
  const wideCode = `export const fixture = "${"wide-code-proof-".repeat(80)}";\n`;
  const backend = {
    defaultSessionId: SESSION_ID,
    defaultProject: "proof",
    listProjects: () => [{ name: "proof", cwd: "/proof" }, { name: "empty", cwd: "/empty" }],
    listProjectFiles(project, path = "") {
      if (!project) {
        return {
          scope: "projects", project: null, path: "", parent: null,
          breadcrumbs: [{ type: "projects", name: "projects", path: null }],
          entries: this.listProjects().map(({ name }) => ({ type: "project", project: name, name })),
        };
      }
      if (path === "src") {
        return {
          scope: "project", project, path, parent: "",
          breadcrumbs: [
            { type: "projects", name: "projects", path: null },
            { type: "project", name: project, path: "" },
            { type: "directory", name: "src", path: "src" },
          ],
          entries: [{ type: "file", name: "fixture.js", path: "src/fixture.js", kind: "code" }],
        };
      }
      return {
        scope: "project", project, path: "", parent: null,
        breadcrumbs: [
          { type: "projects", name: "projects", path: null },
          { type: "project", name: project, path: "" },
        ],
        entries: project === "proof" ? [
          { type: "directory", name: "src", path: "src" },
          { type: "file", name: "README.md", path: "README.md", kind: "markdown" },
        ] : [],
      };
    },
    readProjectFile(project, path) {
      if (project === "proof" && path === "README.md") {
        return { project, path, name: "README.md", kind: "markdown", size: longReadme.length, text: longReadme };
      }
      if (project === "proof" && path === "src/fixture.js") {
        return { project, path, name: "fixture.js", kind: "code", language: "javascript", size: wideCode.length, text: wideCode };
      }
      const error = new Error("qq: file not found");
      error.status = 404;
      throw error;
    },
    openProjectFile() {
      const error = new Error("qq: file not found");
      error.status = 404;
      throw error;
    },
    async list(project) { return project === "empty" ? [] : [{ id: SESSION_ID, createdAt: 1, project: "proof" }]; },
    async read(id) {
      assert.equal(id, SESSION_ID);
      return { id, project: "proof", events: [], agentStatus: "idle" };
    },
    observe(id, listener) {
      observers.add(listener);
      void this.read(id).then((snapshot) => listener(null, snapshot), listener);
      return () => observers.delete(listener);
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
    assert.equal(await evaluate(client, desktop, `getComputedStyle(document.querySelector(".drawer-edge")).display`), "none");
    const desktopDrawerStart = await evaluate(client, desktop, `({ timeOrigin: performance.timeOrigin, pathname: location.pathname })`);
    await evaluate(client, desktop, `document.querySelector("#project-drawer-toggle").click()`);
    await waitFor(() => evaluate(client, desktop, `document.body.classList.contains("drawer-open")`), "desktop Files button did not open the drawer");
    const desktopClose = await evaluate(client, desktop, `(() => {
      const close = document.querySelector(".drawer-close");
      const rect = close.getBoundingClientRect();
      return { width: rect.width, height: rect.height, label: close.getAttribute("aria-label") };
    })()`);
    assert.ok(desktopClose.width >= 40 && desktopClose.height >= 40, "desktop X was not visible");
    assert.equal(desktopClose.label, "Close files");
    await evaluate(client, desktop, `document.querySelector(".drawer-close").click()`);
    await waitFor(() => evaluate(client, desktop, `!document.body.classList.contains("drawer-open")`), "desktop X did not close the drawer");
    await evaluate(client, desktop, `document.querySelector("#project-drawer-toggle").click()`);
    await waitFor(() => evaluate(client, desktop, `document.body.classList.contains("drawer-open")`), "desktop drawer did not reopen");
    await dispatchKey(client, desktop, "Escape", "Escape", 27);
    const desktopDrawerEnd = await waitFor(
      () => evaluate(client, desktop, `({
        open: document.body.classList.contains("drawer-open"),
        timeOrigin: performance.timeOrigin,
        pathname: location.pathname,
        hasDrawerQuery: new URL(location.href).searchParams.has("drawer"),
      })`).then((state) => !state?.open && state),
      "desktop Escape did not close the drawer",
    );
    assert.equal(desktopDrawerEnd.timeOrigin, desktopDrawerStart.timeOrigin);
    assert.equal(desktopDrawerEnd.pathname, desktopDrawerStart.pathname);
    assert.equal(desktopDrawerEnd.hasDrawerQuery, false);

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

    const mobileChrome = await evaluate(client, pixel, `(() => {
      const toggle = document.querySelector("#project-drawer-toggle");
      const edge = document.querySelector(".drawer-edge");
      const edgeStyle = getComputedStyle(edge);
      const edgeRect = edge.getBoundingClientRect();
      const backdrop = document.querySelector("#project-drawer-backdrop");
      const close = document.querySelector(".drawer-close");
      const closeRect = close.getBoundingClientRect();
      const transcript = document.querySelector("#transcript");
      transcript.scrollTop = 0;
      const probe = document.createElement("span");
      probe.style.cssText = "display:block;flex:none;height:1px;margin:0;padding:0";
      edge.after(probe);
      const expectedProbeTop = transcript.getBoundingClientRect().top + parseFloat(getComputedStyle(transcript).paddingTop);
      const probeTop = probe.getBoundingClientRect().top;
      probe.remove();
      return {
        toggleDisplay: getComputedStyle(toggle).display,
        toggleWidth: toggle.getBoundingClientRect().width,
        edgeParent: edge.parentElement?.tagName,
        edgeWidth: edgeRect.width,
        edgeHeight: edgeRect.height,
        edgePointerEvents: edgeStyle.pointerEvents,
        edgeTouchAction: edgeStyle.touchAction,
        backdropTouchAction: getComputedStyle(backdrop).touchAction,
        closeLabel: close.getAttribute("aria-label"),
        closeWidth: closeRect.width,
        closeHeight: closeRect.height,
        closeClipPath: getComputedStyle(close).clipPath,
        closeTabIndex: close.tabIndex,
        railLayoutShift: Math.abs(probeTop - expectedProbeTop),
      };
    })()`);
    assert.equal(mobileChrome.toggleDisplay, "none", "the Files trigger remained painted on mobile");
    assert.equal(mobileChrome.toggleWidth, 0);
    assert.equal(mobileChrome.edgeParent, "DIV", "the session gesture edge must belong to its scrolling transcript");
    assert.ok(mobileChrome.edgeWidth >= 48 && mobileChrome.edgeWidth <= 56, `mobile drawer rail was ${mobileChrome.edgeWidth}px wide`);
    assert.equal(mobileChrome.edgeHeight, 915);
    assert.equal(mobileChrome.edgePointerEvents, "auto");
    assert.equal(mobileChrome.edgeTouchAction, "pan-y");
    assert.equal(mobileChrome.backdropTouchAction, "manipulation");
    assert.equal(mobileChrome.closeLabel, "Close files");
    assert.ok(mobileChrome.closeWidth <= 1 && mobileChrome.closeHeight <= 1, "mobile X remained visibly painted");
    assert.equal(mobileChrome.closeClipPath, "inset(50%)");
    assert.equal(mobileChrome.closeTabIndex, 0, "mobile nonvisual close left the keyboard order");
    assert.ok(mobileChrome.railLayoutShift < 1, `gesture rail shifted transcript content by ${mobileChrome.railLayoutShift}px`);

    // A real SSE innerHTML swap must supply a fresh edge target with the new transcript.
    await evaluate(client, pixel, `(() => {
      window.__qqEdgeBeforeSse = document.querySelector(".drawer-edge");
      window.__qqHeadingBeforeSse = document.querySelector(".session-heading");
      return true;
    })()`);
    const published = await backend.read(SESSION_ID);
    for (const listener of observers) listener(null, published);
    await waitFor(
      () => evaluate(client, pixel, `document.querySelector(".session-heading") !== window.__qqHeadingBeforeSse`),
      "session SSE did not replace the panel content",
    );
    assert.equal(await evaluate(client, pixel, `(() => {
      const edge = document.querySelector(".drawer-edge");
      return edge !== window.__qqEdgeBeforeSse && edge?.parentElement?.id === "transcript";
    })()`), true);
    await openDrawerWithTouch(client, pixel);
    await closeDrawerWithImmediateBackdropTouch(client, pixel);
    await openDrawerWithTouch(client, pixel);
    await closeDrawerWithKeyboard(client, pixel);

    // Closing and reopening a nested folder is an in-place state change.
    await navigate(client, pixel, `${origin}${CANONICAL_PATH}?drawer=src`);
    await waitForDrawerSurface(client, pixel, CANONICAL_PATH);
    assert.equal(await evaluate(client, pixel, `document.querySelector("#project-drawer")?.dataset.drawerPath`), "src");
    await closeDrawerInPlace(client, pixel);
    const nested = await openDrawerWithTouch(client, pixel);
    assert.equal(nested.drawer, "src");
    assert.equal(await evaluate(client, pixel, `document.querySelector("#project-drawer")?.dataset.drawerPath`), "src");
    await closeDrawerInPlace(client, pixel);

    // Swipe remains the only mobile opener on an empty project surface and with reduced motion.
    await client.send("Emulation.setEmulatedMedia", {
      media: "",
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    }, pixel.sessionId);
    const emptyProjectPath = "/qq/project/empty";
    await navigate(client, pixel, `${origin}${emptyProjectPath}`);
    await waitForDrawerSurface(client, pixel, emptyProjectPath);
    assert.equal(await evaluate(client, pixel, `getComputedStyle(document.querySelector("#project-drawer")).transitionDuration`), "0s");
    await openDrawerWithTouch(client, pixel, { y: 300 });
    await closeDrawerInPlace(client, pixel);

    // A vertical touch starting in the edge zone scrolls instead of opening the drawer.
    const filePath = "/qq/project/proof/file/README.md";
    await navigate(client, pixel, `${origin}${filePath}`);
    await waitForDrawerSurface(client, pixel, filePath);
    await evaluate(client, pixel, `(() => {
      const edge = document.querySelector(".drawer-edge");
      window.__qqVerticalEvents = [];
      for (const name of ["pointerdown", "pointermove", "pointercancel", "pointerup"]) {
        edge.addEventListener(name, () => window.__qqVerticalEvents.push(name));
      }
    })()`);
    await dispatchTouchSwipe(client, pixel, { x: 40, y: 760, endX: 42, endY: 220, steps: 8 });
    // Headless dispatchTouchEvent does not execute compositor scrolling, so
    // pointercancel is the observable proof that pan-y yielded to the browser.
    const vertical = await waitFor(
      () => evaluate(client, pixel, `(() => {
        const scroller = document.querySelector(".file-document");
        const edge = document.querySelector(".drawer-edge");
        return {
          events: window.__qqVerticalEvents,
          drawerOpen: document.body.classList.contains("drawer-open"),
          edgeOwner: edge?.parentElement === scroller,
          scrollable: scroller.scrollHeight > scroller.clientHeight,
        };
      })()`).then((state) => state?.events.includes("pointercancel") && state),
      "vertical touch in the edge zone was not yielded to the browser",
    );
    assert.equal(vertical.edgeOwner, true);
    assert.equal(vertical.scrollable, true);
    assert.equal(vertical.drawerOpen, false, "vertical edge scrolling opened the drawer");
    await openDrawerWithTouch(client, pixel, { y: 420 });
    await closeDrawerInPlace(client, pixel);

    // Horizontal file/code panning starts outside the rail and remains native.
    const codePath = "/qq/project/proof/file/src%2Ffixture.js";
    await navigate(client, pixel, `${origin}${codePath}`);
    await waitForDrawerSurface(client, pixel, codePath);
    const horizontalStart = await evaluate(client, pixel, `(() => {
      const rail = document.querySelector(".drawer-edge").getBoundingClientRect();
      const code = document.querySelector(".file-code");
      const rect = code.getBoundingClientRect();
      const x = Math.min(rect.right - 24, Math.max(180, rail.right + 80));
      const y = rect.top + Math.min(40, rect.height / 2);
      window.__qqHorizontalEvents = [];
      window.__qqHorizontalTarget = null;
      document.addEventListener("pointerdown", (event) => {
        window.__qqHorizontalTarget = {
          edge: Boolean(event.target.closest?.(".drawer-edge")),
          code: Boolean(event.target.closest?.(".file-code")),
        };
      }, { capture: true, once: true });
      for (const name of ["pointerdown", "pointermove", "pointercancel", "pointerup"]) {
        code.addEventListener(name, () => window.__qqHorizontalEvents.push(name));
      }
      return {
        x, y, railRight: rail.right,
        touchAction: getComputedStyle(code).touchAction,
        scrollable: code.scrollWidth > code.clientWidth,
      };
    })()`);
    assert.ok(horizontalStart.x > horizontalStart.railRight, "horizontal code touch began inside the drawer rail");
    assert.equal(horizontalStart.touchAction, "auto");
    assert.equal(horizontalStart.scrollable, true);
    await dispatchTouchSwipe(client, pixel, {
      x: horizontalStart.x,
      y: horizontalStart.y,
      endX: Math.max(horizontalStart.railRight + 20, horizontalStart.x - 120),
      endY: horizontalStart.y + 2,
      steps: 8,
    });
    const horizontal = await waitFor(
      () => evaluate(client, pixel, `({
        events: window.__qqHorizontalEvents,
        target: window.__qqHorizontalTarget,
        drawerOpen: document.body.classList.contains("drawer-open"),
      })`).then((state) => state?.events.includes("pointercancel") && state),
      "horizontal code touch was not yielded to the native scroller",
    );
    assert.deepEqual(horizontal.target, { edge: false, code: true });
    assert.equal(horizontal.drawerOpen, false);

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
